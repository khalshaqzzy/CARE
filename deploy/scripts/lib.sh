#!/usr/bin/env bash
set -euo pipefail

die() { printf '%s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Required command is unavailable: $1"; }
require_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "Expected a full lowercase Git SHA."; }
require_safe_path() { [[ -n "$1" && "$1" == "$2"/* ]] || die "Path is outside approved base: $1"; }
require_environment_base() {
  [[ "$2" == "/opt/care/$1" || "$2" == /tmp/care-deployment-test-* ]] || die "Environment/base path mismatch."
}

env_value() {
  local file="$1" key="$2"
  awk -v wanted="${key}" '
    index($0, "=") > 0 {
      key=substr($0,1,index($0,"=")-1)
      if (key == wanted) { count++; print substr($0,index($0,"=")+1) }
    }
    END { if (count != 1) exit 1 }
  ' "${file}"
}

require_env_value() {
  local value
  value="$(env_value "$1" "$2")" || die "Runtime env key is missing or duplicated: $2"
  [[ -n "${value}" ]] || die "Runtime env key is empty: $2"
  printf '%s' "${value}"
}

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" == "$2" ]]; }
resolve_addresses() { getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u || true; }

compose_for() {
  local release_dir="$1" runtime_env="$2" project_name
  shift 2
  project_name="$(require_env_value "${runtime_env}" COMPOSE_PROJECT_NAME)"
  docker compose --project-name "${project_name}" --env-file "${runtime_env}" \
    -f "${release_dir}/deploy/compose/docker-compose.remote.yml" "$@"
}

wait_for_service() {
  local release_dir="$1" runtime_env="$2" service="$3" timeout_seconds="${4:-240}"
  local started_at container_id='' status
  started_at="$(date +%s)"
  while true; do
    container_id="$(compose_for "${release_dir}" "${runtime_env}" ps -q "${service}" 2>/dev/null || true)"
    if [[ -n "${container_id}" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
      case "${status}" in
        healthy) printf 'Service %s is healthy.\n' "${service}"; return 0 ;;
        unhealthy|exited|dead)
          docker inspect --format '{{json .State.Health}}' "${container_id}" >&2 || true
          docker logs "${container_id}" --tail 150 >&2 || true
          return 1 ;;
      esac
    fi
    if (( $(date +%s) - started_at >= timeout_seconds )); then
      printf 'Timed out waiting for %s.\n' "${service}" >&2
      [[ -z "${container_id}" ]] || docker logs "${container_id}" --tail 150 >&2 || true
      return 1
    fi
    sleep 5
  done
}

activate_symlink() {
  local target="$1" link_path="$2" temporary_link="${2}.tmp"
  rm -f -- "${temporary_link}"
  ln -s "${target}" "${temporary_link}"
  if [[ "$(uname -s)" == Darwin ]]; then mv -hf "${temporary_link}" "${link_path}"; else mv -Tf "${temporary_link}" "${link_path}"; fi
}
