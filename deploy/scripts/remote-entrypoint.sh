#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 9 ]] || { echo "Usage: remote-entrypoint.sh <env> <sha> <run> <attempt> <base> <archive> <runtime-env> <checksum> <expected-host>" >&2; exit 1; }
APP_ENV="$1"; RELEASE_SHA="$2"; RUN_NUMBER="$3"; RUN_ATTEMPT="$4"; BASE_DIR="$5"; ARCHIVE="$6"; RUNTIME_ENV="$7"; CHECKSUM="$8"; EXPECTED_HOST="$9"
[[ "${APP_ENV}" =~ ^(staging|production)$ && ( "${BASE_DIR}" == "/opt/care/${APP_ENV}" || "${BASE_DIR}" == /tmp/care-deployment-test-* ) ]] || { echo "Invalid environment/base path." >&2; exit 1; }
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ && "${RUN_NUMBER}" =~ ^[1-9][0-9]*$ && "${RUN_ATTEMPT}" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid release identity." >&2; exit 1; }
[[ "${ARCHIVE}" == "${BASE_DIR}/incoming/"* && "${RUNTIME_ENV}" == "${BASE_DIR}/incoming/"* ]] || { echo "Incoming path escaped deployment base." >&2; exit 1; }
[[ "${CHECKSUM}" =~ ^[0-9a-f]{64}$ ]] || { echo "Invalid archive checksum." >&2; exit 1; }
cleanup_uploads() { rm -f -- "${ARCHIVE}" "${RUNTIME_ENV}"; }
trap cleanup_uploads EXIT
printf '%s  %s\n' "${CHECKSUM}" "${ARCHIVE}" | sha256sum --check --status || { echo "Archive checksum mismatch." >&2; exit 1; }
while IFS= read -r member; do
  [[ -n "${member}" && "${member}" != /* && "${member}" != '..' && "${member}" != ../* && "${member}" != */../* && "${member}" != */.. ]] || { echo "Unsafe archive member." >&2; exit 1; }
done < <(tar -tzf "${ARCHIVE}")
while IFS= read -r listing; do
  case "${listing:0:1}" in l|h|b|c|p) echo "Archive links/devices are not allowed." >&2; exit 1 ;; esac
done < <(tar -tvzf "${ARCHIVE}")
INCOMING_DIR="${BASE_DIR}/incoming/${RELEASE_SHA}.${RUN_NUMBER}.${RUN_ATTEMPT}"
[[ ! -e "${INCOMING_DIR}" ]] || { echo "Incoming attempt path already exists." >&2; exit 1; }
install -d -m 700 "${INCOMING_DIR}"
tar --extract --gzip --file "${ARCHIVE}" --directory "${INCOMING_DIR}" --no-same-owner --no-same-permissions
trap - EXIT
exec bash "${INCOMING_DIR}/deploy/scripts/remote-deploy.sh" "${APP_ENV}" "${RELEASE_SHA}" "${RUN_NUMBER}" "${BASE_DIR}" "${INCOMING_DIR}" "${RUNTIME_ENV}" "${ARCHIVE}" "${CHECKSUM}" "${EXPECTED_HOST}"
