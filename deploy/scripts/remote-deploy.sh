#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 9 ]] || die "Usage: remote-deploy.sh <env> <sha> <run> <base> <incoming> <runtime-env> <archive> <checksum> <expected-host>"
REQUESTED_ENV="$1"; REQUESTED_SHA="$2"; REQUESTED_RUN="$3"; BASE_DIR="$4"; INCOMING_DIR="$5"; RUNTIME_ENV_INCOMING="$6"; ARCHIVE="$7"; ARCHIVE_SHA256="$8"; EXPECTED_HOST="$9"
[[ "${REQUESTED_ENV}" =~ ^(staging|production)$ ]] || die "Invalid environment."
require_environment_base "${REQUESTED_ENV}" "${BASE_DIR}"
require_sha "${REQUESTED_SHA}"; [[ "${REQUESTED_RUN}" =~ ^[1-9][0-9]*$ ]] || die "Run number must be positive."
for path in "${INCOMING_DIR}" "${RUNTIME_ENV_INCOMING}" "${ARCHIVE}"; do require_safe_path "${path}" "${BASE_DIR}"; done
cleanup_incoming() {
  rm -f -- "${ARCHIVE}" "${RUNTIME_ENV_INCOMING}"
  [[ ! -d "${INCOMING_DIR}" ]] || rm -rf -- "${INCOMING_DIR}"
}
trap cleanup_incoming EXIT
if [[ "${DEPLOY_LOCK_HELD:-false}" != true ]]; then exec 9>"${BASE_DIR}/deploy.lock"; flock -n 9 || die "Another deploy or rollback is already running."; fi

HIGH_WATER_FILE="${BASE_DIR}/shared/deployment-state/highest_seen_run"
highest_run=0; highest_sha=''
if [[ -f "${HIGH_WATER_FILE}" ]]; then read -r highest_run highest_sha <"${HIGH_WATER_FILE}"; [[ "${highest_run}" =~ ^[0-9]+$ ]] || die "High-water state is invalid."; [[ -z "${highest_sha}" ]] || require_sha "${highest_sha}"; fi
if [[ "${DEPLOY_REHEARSAL:-false}" != true ]]; then
  (( REQUESTED_RUN >= highest_run )) || die "Stale deployment run was rejected."
  if (( REQUESTED_RUN == highest_run )) && [[ -n "${highest_sha}" && "${highest_sha}" != "${REQUESTED_SHA}" ]]; then die "Equal run number cannot deploy a different SHA."; fi
  printf '%s %s\n' "${REQUESTED_RUN}" "${REQUESTED_SHA}" >"${HIGH_WATER_FILE}.tmp"; mv "${HIGH_WATER_FILE}.tmp" "${HIGH_WATER_FILE}"
fi

"${INCOMING_DIR}/deploy/scripts/remote-preflight.sh" "${INCOMING_DIR}" "${RUNTIME_ENV_INCOMING}" "${BASE_DIR}" "${ARCHIVE}" "${ARCHIVE_SHA256}" "${EXPECTED_HOST}"
[[ "$(require_env_value "${RUNTIME_ENV_INCOMING}" APP_ENV)" == "${REQUESTED_ENV}" ]] || die "Runtime environment mismatch."
[[ "$(require_env_value "${RUNTIME_ENV_INCOMING}" RELEASE_SHA)" == "${REQUESTED_SHA}" ]] || die "Runtime SHA mismatch."
[[ "$(require_env_value "${RUNTIME_ENV_INCOMING}" DEPLOY_RUN_NUMBER)" == "${REQUESTED_RUN}" ]] || die "Runtime run mismatch."

RELEASE_DIR="${BASE_DIR}/releases/${REQUESTED_SHA}"
if [[ -d "${RELEASE_DIR}" ]]; then
  [[ -f "${RELEASE_DIR}/.source.sha" && "$(<"${RELEASE_DIR}/.source.sha")" == "${REQUESTED_SHA}" ]] || die "Existing release identity invalid."
  rm -rf -- "${INCOMING_DIR}"
else
  install -m 600 "${RUNTIME_ENV_INCOMING}" "${INCOMING_DIR}/.runtime.env"
  printf '%s\n' "${REQUESTED_SHA}" >"${INCOMING_DIR}/.source.sha"
  mv "${INCOMING_DIR}" "${RELEASE_DIR}"
fi
RUNTIME_ENV="${RELEASE_DIR}/.runtime.env"
previous_release=''; [[ ! -f "${BASE_DIR}/current_release" ]] || previous_release="$(<"${BASE_DIR}/current_release")"
[[ -z "${previous_release}" ]] || require_sha "${previous_release}"

record_provider_smoke_state() {
  local status="$1" timestamp_utc="$2" runtime_env="$3" sha="$4" shared_dir state_file
  shared_dir="$(require_env_value "${runtime_env}" SHARED_DIR)"
  state_file="${shared_dir}/deployment-state/live-provider-smoke.result"
  umask 077
  mkdir -p "$(dirname "${state_file}")"
  printf 'status=%s timestamp=%s releaseSha=%s\n' "${status}" "${timestamp_utc}" "${sha}" >"${state_file}.tmp"
  mv "${state_file}.tmp" "${state_file}"
}

candidate_deploy() {
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" build --pull postgres api workforce-web admin-web caddy || return 1
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps postgres || return 1
  wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" postgres 180 || return 1
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" --profile operations run --rm migrate || return 1
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" --profile operations run --rm bootstrap-admin || return 1
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps api || return 1
  wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" api 240 || return 1
  # Live OpenAI-compatible provider smoke is advisory, not a deploy gate: a
  # failed provider is a degraded dependency (Manual Fallback keeps
  # classification available per PRD §13.5/§28.3) and must not roll back an
  # otherwise healthy candidate. The outcome is recorded for audit and still
  # appears in the deployment log. See docs/adr/0015-non-blocking-provider-smoke.md.
  if ! compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" --profile operations run --rm live-provider-smoke; then
    record_provider_smoke_state failed "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${RUNTIME_ENV}" "${REQUESTED_SHA}"
    echo "Live OpenAI-compatible provider smoke FAILED; release continues with Manual Fallback active." >&2
  else
    record_provider_smoke_state passed "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${RUNTIME_ENV}" "${REQUESTED_SHA}"
  fi
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps workforce-web admin-web || return 1
  wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" workforce-web 180 || return 1
  wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" admin-web 180 || return 1
  compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps caddy --remove-orphans || return 1
  wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" caddy 120 || return 1
  [[ "${DEPLOY_FORCE_SMOKE_FAILURE:-false}" != true || "${REQUESTED_ENV}" != staging ]] || return 1
  "${RELEASE_DIR}/deploy/scripts/smoke-check.sh" "${REQUESTED_SHA}" "https://$(require_env_value "${RUNTIME_ENV}" WORKFORCE_DOMAIN)" "https://$(require_env_value "${RUNTIME_ENV}" ADMIN_DOMAIN)"
}

if ! candidate_deploy; then
  echo "Candidate failed; database down migration will not be attempted." >&2
  if [[ -n "${previous_release}" && "${previous_release}" != "${REQUESTED_SHA}" ]]; then
    DEPLOY_LOCK_HELD=true "${BASE_DIR}/releases/${previous_release}/deploy/scripts/remote-rollback.sh" "${REQUESTED_ENV}" "${previous_release}" "${BASE_DIR}" || echo "Automatic code rollback also failed." >&2
  else compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" stop caddy workforce-web admin-web api || true; fi
  exit 1
fi

if [[ -n "${previous_release}" && "${previous_release}" != "${REQUESTED_SHA}" ]]; then
  printf '%s\n' "${previous_release}" >"${BASE_DIR}/previous_release.tmp"
  mv "${BASE_DIR}/previous_release.tmp" "${BASE_DIR}/previous_release"
fi
activate_symlink "${RELEASE_DIR}" "${BASE_DIR}/current"
printf '%s\n' "${REQUESTED_SHA}" >"${BASE_DIR}/current_release.tmp"; mv "${BASE_DIR}/current_release.tmp" "${BASE_DIR}/current_release"
releases=()
while IFS= read -r release_entry; do releases+=("${release_entry}"); done < <(find "${BASE_DIR}/releases" -mindepth 1 -maxdepth 1 -type d -print | sort)
kept=("${RELEASE_DIR}"); [[ -z "${previous_release}" || ! -d "${BASE_DIR}/releases/${previous_release}" ]] || kept+=("${BASE_DIR}/releases/${previous_release}")
for entry in "${releases[@]}"; do [[ " ${kept[*]} " == *" ${entry} "* || ${#kept[@]} -ge 5 ]] || kept+=("${entry}"); done
for stale in "${releases[@]}"; do
  [[ " ${kept[*]} " != *" ${stale} "* ]] || continue
  require_safe_path "${stale}" "${BASE_DIR}/releases"; stale_sha="$(basename "${stale}")"; require_sha "${stale_sha}"; rm -rf -- "${stale}"
  docker image rm "care-api:${stale_sha}" "care-web-voice:${stale_sha}" "care-web-admin:${stale_sha}" "care-caddy:${stale_sha}" >/dev/null 2>&1 || true
done
rm -f -- "${ARCHIVE}" "${RUNTIME_ENV_INCOMING}"
printf 'Release %s is active; previous release was %s.\n' "${REQUESTED_SHA}" "${previous_release:-none}"
