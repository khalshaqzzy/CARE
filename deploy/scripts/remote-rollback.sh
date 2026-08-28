#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 3 ]] || die "Usage: remote-rollback.sh <env> <sha> <base>"
REQUESTED_ENV="$1"; RELEASE_SHA="$2"; BASE_DIR="$3"; require_sha "${RELEASE_SHA}"
[[ "${REQUESTED_ENV}" =~ ^(staging|production)$ ]] || die "Invalid environment."
require_environment_base "${REQUESTED_ENV}" "${BASE_DIR}"
RELEASE_DIR="${BASE_DIR}/releases/${RELEASE_SHA}"; RUNTIME_ENV="${RELEASE_DIR}/.runtime.env"
[[ -d "${RELEASE_DIR}" && -f "${RUNTIME_ENV}" && "$(require_env_value "${RUNTIME_ENV}" APP_ENV)" == "${REQUESTED_ENV}" ]] || die "Rollback release unavailable or mismatched."
if [[ "${DEPLOY_LOCK_HELD:-false}" != true ]]; then exec 9>"${BASE_DIR}/deploy.lock"; flock -n 9 || die "Another deploy or rollback is running."; fi
active_release=''; [[ ! -f "${BASE_DIR}/current_release" ]] || active_release="$(<"${BASE_DIR}/current_release")"
[[ -z "${active_release}" ]] || require_sha "${active_release}"
echo "Rolling code back; database schema and shared volumes are not restored."
compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps postgres; wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" postgres 180
compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps api; wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" api 240
compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps workforce-web admin-web
wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" workforce-web 180; wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" admin-web 180
compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" up -d --no-deps caddy --remove-orphans; wait_for_service "${RELEASE_DIR}" "${RUNTIME_ENV}" caddy 120
"${RELEASE_DIR}/deploy/scripts/smoke-check.sh" "${RELEASE_SHA}" "https://$(require_env_value "${RUNTIME_ENV}" WORKFORCE_DOMAIN)" "https://$(require_env_value "${RUNTIME_ENV}" ADMIN_DOMAIN)"
if [[ -n "${active_release}" && "${active_release}" != "${RELEASE_SHA}" ]]; then printf '%s\n' "${active_release}" >"${BASE_DIR}/previous_release.tmp"; mv "${BASE_DIR}/previous_release.tmp" "${BASE_DIR}/previous_release"; fi
activate_symlink "${RELEASE_DIR}" "${BASE_DIR}/current"; printf '%s\n' "${RELEASE_SHA}" >"${BASE_DIR}/current_release.tmp"; mv "${BASE_DIR}/current_release.tmp" "${BASE_DIR}/current_release"
