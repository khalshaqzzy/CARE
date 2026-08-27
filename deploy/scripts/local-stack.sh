#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${ROOT}/deploy/scripts/lib.sh"

ACTION="${1:-}"
[[ "${ACTION}" =~ ^(up|down|status|logs)$ ]] || die "Usage: local-stack.sh <up|down|status|logs>"
ENV_FILE="${ROOT}/.env.local"
[[ -f "${ENV_FILE}" ]] || die ".env.local is missing; copy .env.local.example and review its local-only values."

require_command curl
require_command docker
require_command git
require_command jq
docker info >/dev/null || die "Docker daemon is unavailable."

[[ "$(require_env_value "${ENV_FILE}" APP_ENV)" == development ]] || die "Local APP_ENV must be development."
[[ "$(require_env_value "${ENV_FILE}" COMPOSE_PROJECT_NAME)" == care-local ]] || die "Local Compose project must be care-local."
[[ "$(require_env_value "${ENV_FILE}" WORKFORCE_DOMAIN)" == care.localhost ]] || die "Local workforce domain must be care.localhost."
[[ "$(require_env_value "${ENV_FILE}" ADMIN_DOMAIN)" == admin.care.localhost ]] || die "Local Admin domain must be admin.care.localhost."
[[ "$(env_value "${ENV_FILE}" CADDY_SCHEME)" == http:// ]] || die "Local Caddy scheme must be http://."

RELEASE_SHA="$(git -C "${ROOT}" rev-parse HEAD)"
export RELEASE_SHA
export LOCAL_SHARED_DIR="${ROOT}/local-data/fullstack"
export SHARED_DIR="${LOCAL_SHARED_DIR}"
mkdir -p "${LOCAL_SHARED_DIR}/media" "${LOCAL_SHARED_DIR}/caddy-data" "${LOCAL_SHARED_DIR}/caddy-config"
chmod 0777 "${LOCAL_SHARED_DIR}/media" "${LOCAL_SHARED_DIR}/caddy-data" "${LOCAL_SHARED_DIR}/caddy-config"
chmod 0600 "${ENV_FILE}"

if [[ "${ACTION}" =~ ^(up|down)$ ]]; then
  lock_dir="${LOCAL_SHARED_DIR}/deployment-state/local-stack.lock"
  lock_token="$$-${RANDOM}"
  mkdir -p "${LOCAL_SHARED_DIR}/deployment-state"

  while ! mkdir "${lock_dir}" 2>/dev/null; do
    lock_pid="$(sed -n '1p' "${lock_dir}/pid" 2>/dev/null || true)"
    if [[ "${lock_pid}" =~ ^[0-9]+$ ]] && kill -0 "${lock_pid}" 2>/dev/null; then
      die "Another CARE local stack operation is running (PID ${lock_pid})."
    fi

    stale_lock="${lock_dir}.stale-${lock_token}"
    if mv "${lock_dir}" "${stale_lock}" 2>/dev/null; then
      rm -rf -- "${stale_lock}"
    fi
  done

  printf '%s\n%s\n' "$$" "${lock_token}" >"${lock_dir}/pid"
  release_local_lock() {
    [[ "$(sed -n '2p' "${lock_dir}/pid" 2>/dev/null || true)" == "${lock_token}" ]] && rm -rf -- "${lock_dir}"
  }
  trap release_local_lock EXIT INT TERM
fi

compose=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${ROOT}/deploy/compose/docker-compose.remote.yml"
  -f "${ROOT}/deploy/compose/docker-compose.local.yml"
)

case "${ACTION}" in
  up)
    "${compose[@]}" --profile operations config --quiet
    "${compose[@]}" build postgres api workforce-web admin-web caddy
    "${compose[@]}" --profile local run --rm local-volume-init
    "${compose[@]}" up -d --no-deps postgres
    "${compose[@]}" up --wait --wait-timeout 180 postgres
    "${compose[@]}" --profile operations run --rm migrate
    "${compose[@]}" --profile operations run --rm bootstrap-admin
    "${compose[@]}" up -d api workforce-web admin-web caddy
    "${compose[@]}" up --wait --wait-timeout 240 api workforce-web admin-web caddy

    http_port="$(require_env_value "${ENV_FILE}" PUBLISHED_HTTP_PORT)"
    workforce_domain="$(require_env_value "${ENV_FILE}" WORKFORCE_DOMAIN)"
    admin_domain="$(require_env_value "${ENV_FILE}" ADMIN_DOMAIN)"
    curl --fail --silent --show-error -H "Host: ${workforce_domain}" "http://127.0.0.1:${http_port}/release.json" |
      jq -e --arg sha "${RELEASE_SHA}" '.application == "care-web-voice" and .releaseSha == $sha' >/dev/null
    curl --fail --silent --show-error -H "Host: ${admin_domain}" "http://127.0.0.1:${http_port}/release.json" |
      jq -e --arg sha "${RELEASE_SHA}" '.application == "care-web-admin" and .releaseSha == $sha' >/dev/null
    curl --fail --silent --show-error -H "Host: ${admin_domain}" "http://127.0.0.1:${http_port}/ready" |
      jq -e --arg sha "${RELEASE_SHA}" '.status == "ready" and .releaseSha == $sha' >/dev/null
    printf 'CARE local full stack is ready:\n  Workforce: http://%s:%s\n  Admin:     http://%s:%s\n  Release:   %s\n' \
      "${workforce_domain}" "${http_port}" "${admin_domain}" "${http_port}" "${RELEASE_SHA}"
    ;;
  down)
    "${compose[@]}" --profile operations --profile local down --remove-orphans
    ;;
  status)
    "${compose[@]}" ps
    ;;
  logs)
    "${compose[@]}" logs --follow --tail=200 postgres api workforce-web admin-web caddy
    ;;
esac
