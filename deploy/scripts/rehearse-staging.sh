#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 5 ]] || die "Usage: rehearse-staging.sh <previous-sha> <current-sha> <base-dir> <expected-host> I_ACCEPT_STAGING_INTERRUPTION"
PREVIOUS_SHA="$1"; CURRENT_SHA="$2"; BASE_DIR="$3"; EXPECTED_HOST="$4"; [[ "$5" == I_ACCEPT_STAGING_INTERRUPTION ]] || die "Explicit confirmation required."
require_sha "${PREVIOUS_SHA}"; require_sha "${CURRENT_SHA}"; [[ "${BASE_DIR}" == /opt/care/staging ]] || die "Rehearsal is staging-only."
exec 9>"${BASE_DIR}/deploy.lock"; flock -n 9 || die "Another deploy, rollback, or rehearsal is running."
[[ -f "${BASE_DIR}/current_release" && "$(<"${BASE_DIR}/current_release")" == "${CURRENT_SHA}" ]] || die "Current SHA is not active."
PREVIOUS_DIR="${BASE_DIR}/releases/${PREVIOUS_SHA}"; CURRENT_DIR="${BASE_DIR}/releases/${CURRENT_SHA}"
for path in "${PREVIOUS_DIR}/.runtime.env" "${CURRENT_DIR}/.runtime.env"; do [[ -f "${path}" ]] || die "Retained release unavailable."; done
read -r highest_run _ <"${BASE_DIR}/shared/deployment-state/highest_seen_run"; REHEARSAL_RUN=$((highest_run + 1)); SENTINEL="${BASE_DIR}/shared/media/.rollback-rehearsal-sentinel"
ARCHIVE="${BASE_DIR}/incoming/${CURRENT_SHA}.${REHEARSAL_RUN}.tar.gz"; ENV_FILE="${BASE_DIR}/incoming/${CURRENT_SHA}.${REHEARSAL_RUN}.env"
cleanup_rehearsal() { rm -f -- "${ARCHIVE}" "${ENV_FILE}" "${SENTINEL}"; }
trap cleanup_rehearsal EXIT
database_identity() { compose_for "$1" "$2" exec -T postgres psql --username "$(require_env_value "$2" POSTGRES_USER)" --dbname "$(require_env_value "$2" POSTGRES_DATABASE)" --tuples-only --no-align --command 'SELECT system_identifier FROM pg_control_system();'; }
DB_ID="$(database_identity "${CURRENT_DIR}" "${CURRENT_DIR}/.runtime.env")"; printf '%s\n' "${CURRENT_SHA}" >"${SENTINEL}"
DEPLOY_LOCK_HELD=true "${CURRENT_DIR}/deploy/scripts/remote-rollback.sh" staging "${PREVIOUS_SHA}" "${BASE_DIR}"
[[ "$(database_identity "${PREVIOUS_DIR}" "${PREVIOUS_DIR}/.runtime.env")" == "${DB_ID}" && -f "${SENTINEL}" ]] || die "Persistence failed during rollback."
tar --exclude=.runtime.env -czf "${ARCHIVE}" -C "${CURRENT_DIR}" .
awk -v run="${REHEARSAL_RUN}" 'BEGIN{FS=OFS="="} $1=="DEPLOY_RUN_NUMBER"{$2=run} {print}' "${CURRENT_DIR}/.runtime.env" >"${ENV_FILE}"; chmod 600 "${ENV_FILE}"
CHECKSUM="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
if DEPLOY_LOCK_HELD=true DEPLOY_REHEARSAL=true DEPLOY_FORCE_SMOKE_FAILURE=true bash "${CURRENT_DIR}/deploy/scripts/remote-entrypoint.sh" staging "${CURRENT_SHA}" "${REHEARSAL_RUN}" 1 "${BASE_DIR}" "${ARCHIVE}" "${ENV_FILE}" "${CHECKSUM}" "${EXPECTED_HOST}"; then die "Forced failure unexpectedly succeeded."; fi
[[ "$(<"${BASE_DIR}/current_release")" == "${PREVIOUS_SHA}" && -f "${SENTINEL}" ]] || die "Automatic rollback failed."
DEPLOY_LOCK_HELD=true "${PREVIOUS_DIR}/deploy/scripts/remote-rollback.sh" staging "${CURRENT_SHA}" "${BASE_DIR}"
[[ "$(<"${BASE_DIR}/current_release")" == "${CURRENT_SHA}" && "$(database_identity "${CURRENT_DIR}" "${CURRENT_DIR}/.runtime.env")" == "${DB_ID}" ]] || die "Current release restoration failed."
cleanup_rehearsal; trap - EXIT; echo "Staging rollback rehearsal passed."
