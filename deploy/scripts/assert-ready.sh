#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 ]] || { echo "Usage: assert-ready.sh <ready-url> <expected-release-sha>" >&2; exit 1; }
payload="$(curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 --retry "${SMOKE_RETRY_COUNT:-30}" --retry-delay "${SMOKE_RETRY_DELAY:-5}" --retry-connrefused --retry-all-errors "$1")"
jq -e --arg sha "$2" '.status == "ready" and .releaseSha == $sha and .checks.database == "ok" and .checks.migrations == "ok" and .checks.storage == "ok" and .dependencies.openai == "configured" and .dependencies.push == "configured"' <<<"${payload}" >/dev/null || { echo "Readiness payload did not match required release and checks." >&2; exit 1; }
