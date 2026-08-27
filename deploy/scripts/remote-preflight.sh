#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 6 ]] || die "Usage: remote-preflight.sh <release-dir> <runtime-env> <base-dir> <archive> <archive-sha256> <expected-host>"
RELEASE_DIR="$1"; RUNTIME_ENV="$2"; BASE_DIR="$3"; ARCHIVE="$4"; ARCHIVE_SHA256="$5"; EXPECTED_HOST="$6"
for command in docker jq curl getent sha256sum stat tar; do require_command "${command}"; done
require_safe_path "${RELEASE_DIR}" "${BASE_DIR}"
require_safe_path "${ARCHIVE}" "${BASE_DIR}"
[[ -f "${RELEASE_DIR}/deploy/compose/docker-compose.remote.yml" && -f "${ARCHIVE}" ]] || die "Release or archive is incomplete."
[[ "${ARCHIVE_SHA256}" =~ ^[0-9a-f]{64}$ ]] || die "Archive checksum has invalid shape."
printf '%s  %s\n' "${ARCHIVE_SHA256}" "${ARCHIVE}" | sha256sum --check --status || die "Archive checksum mismatch."
[[ -r /etc/os-release ]] || die "Cannot identify VM operating system."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 22.04 ]] || die "Hosted runtime requires Ubuntu 22.04 LTS."
"${SCRIPT_DIR}/validate-runtime-env.sh" "${RUNTIME_ENV}"
docker info >/dev/null
version_ge "$(docker version --format '{{.Server.Version}}')" 24.0.0 || die "Docker Engine 24+ is required."
version_ge "$(docker compose version --short)" 2.20.0 || die "Docker Compose 2.20+ is required."
for path in "${BASE_DIR}" "${BASE_DIR}/releases" "${BASE_DIR}/incoming" "${BASE_DIR}/shared"; do [[ -d "${path}" && -w "${path}" ]] || die "Required writable path unavailable: ${path}"; done
for path in media caddy-data caddy-config deployment-state; do [[ -d "${BASE_DIR}/shared/${path}" && -w "${BASE_DIR}/shared/${path}" ]] || die "Shared path unavailable: ${path}"; done
[[ -d "${BASE_DIR}/shared/postgres-data" && "$(stat -c '%u' "${BASE_DIR}/shared/postgres-data")" == 70 ]] || die "PostgreSQL data must be owned by UID 70."
available_kib="$(df -Pk "${BASE_DIR}" | awk 'NR==2 {print $4}')"; (( available_kib >= 5 * 1024 * 1024 )) || die "At least 5 GiB free disk is required."
config_json="$(compose_for "${RELEASE_DIR}" "${RUNTIME_ENV}" --profile operations config --format json)"
jq -e '(.services.postgres.ports // [] | length) == 0 and ([.services | to_entries[] | select(.key != "caddy") | (.value.ports // []) | length] | add) == 0 and (.networks.data.internal == true)' <<<"${config_json}" >/dev/null || die "Compose exposure policy failed."
expected_addresses="$(resolve_addresses "${EXPECTED_HOST}")"; [[ -n "${expected_addresses}" ]] || expected_addresses="${EXPECTED_HOST}"
for key in WORKFORCE_DOMAIN ADMIN_DOMAIN; do
  domain="$(require_env_value "${RUNTIME_ENV}" "${key}")"; resolved="$(resolve_addresses "${domain}")"
  [[ -n "${resolved}" ]] || die "DNS does not resolve for ${domain}."
  grep -Fxf <(printf '%s\n' "${expected_addresses}") <(printf '%s\n' "${resolved}") >/dev/null || die "${domain} does not resolve to expected VM."
done
printf 'Remote preflight passed.\n'
