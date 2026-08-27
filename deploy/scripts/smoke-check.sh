#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 3 ]] || { echo "Usage: smoke-check.sh <release-sha> <workforce-origin> <admin-origin>" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHA="$1"; WORKFORCE="${2%/}"; ADMIN="${3%/}"
fetch() { curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 --retry "${SMOKE_RETRY_COUNT:-30}" --retry-delay "${SMOKE_RETRY_DELAY:-5}" --retry-connrefused --retry-all-errors "$1"; }
fetch "${WORKFORCE}/release.json" | jq -e --arg sha "${SHA}" '.application == "care-web-voice" and .releaseSha == $sha' >/dev/null
fetch "${ADMIN}/release.json" | jq -e --arg sha "${SHA}" '.application == "care-web-admin" and .releaseSha == $sha' >/dev/null
fetch "${WORKFORCE}/a/deep/link" | grep -F '<div id="root"></div>' >/dev/null
fetch "${ADMIN}/a/deep/link" | grep -F '<div id="root"></div>' >/dev/null
manifest="$(fetch "${WORKFORCE}/manifest.webmanifest")"; jq -e '.id == "/" and .start_url == "/" and .scope == "/" and .display == "standalone"' <<<"${manifest}" >/dev/null
fetch "${WORKFORCE}/sw.js" | grep -F 'offline.html' >/dev/null
admin_manifest_status="$(curl -sS -o /dev/null -w '%{http_code}' "${ADMIN}/manifest.webmanifest")"
[[ "${admin_manifest_status}" == 404 ]] || { echo "Admin unexpectedly serves a manifest." >&2; exit 1; }
fetch "${WORKFORCE}/health" | jq -e '.status == "ok"' >/dev/null
"${SCRIPT_DIR}/assert-ready.sh" "${ADMIN}/ready" "${SHA}"
for url in "${WORKFORCE}/" "${ADMIN}/" "${ADMIN}/ready"; do
  headers="$(curl --fail --silent --show-error --head "${url}")"
  grep -Eiq '^strict-transport-security:' <<<"${headers}" || { echo "HSTS missing: ${url}" >&2; exit 1; }
  grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' <<<"${headers}" || { echo "nosniff missing: ${url}" >&2; exit 1; }
  grep -Eiq '^content-security-policy:' <<<"${headers}" || { echo "CSP missing: ${url}" >&2; exit 1; }
  if grep -Eiq '^(server|via):' <<<"${headers}"; then echo "Server identity header leaked: ${url}" >&2; exit 1; fi
done
printf 'Two-origin smoke checks passed for %s.\n' "${SHA}"
