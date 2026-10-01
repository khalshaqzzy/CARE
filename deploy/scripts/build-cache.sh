#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 3 && "$1" =~ ^(prepare|clean)$ && "$2" =~ ^(staging|production)$ ]] || die "Usage: build-cache.sh <prepare|clean> <environment> <base>"
MODE="$1"; APP_ENV="$2"; BASE_DIR="$3"
require_environment_base "${APP_ENV}" "${BASE_DIR}"
BUILDER="care-${APP_ENV}-deploy"
OWNER="${BASE_DIR}/shared/deployment-state/build-cache-owner"
BUILDKIT_IMAGE='moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8'
[[ -d "$(dirname "${OWNER}")" ]] || die "Build cache state directory is missing."

if [[ -f "${OWNER}" ]]; then
  [[ "$(<"${OWNER}")" == "${BUILDER}" ]] || die "Build cache ownership state is invalid."
else
  [[ "${MODE}" == prepare ]] || die "Refusing cleanup without CARE builder ownership."
  if docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then die "Refusing to adopt an existing unowned builder: ${BUILDER}"; fi
fi

if ! docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
  [[ "${MODE}" == prepare ]] || die "Owned CARE builder is unavailable."
  docker buildx create --name "${BUILDER}" --driver docker-container \
    --driver-opt "image=${BUILDKIT_IMAGE}" --driver-opt default-load=true \
    --buildkitd-config "${SCRIPT_DIR}/../buildkit/buildkitd.toml"
  umask 077
  printf '%s\n' "${BUILDER}" >"${OWNER}.tmp"; mv "${OWNER}.tmp" "${OWNER}"
fi
inspection="$(docker buildx inspect "${BUILDER}")"
grep -Eq '^Driver:[[:space:]]+docker-container[[:space:]]*$' <<<"${inspection}" || die "CARE cache cleanup requires the dedicated docker-container driver."
# Pull only the daemon's platform, avoiding unnecessary multi-platform content.
if ! docker image inspect "${BUILDKIT_IMAGE}" >/dev/null 2>&1; then
  architecture="$(docker info --format '{{.Architecture}}')"
  case "${architecture}" in
    x86_64|amd64) architecture=amd64 ;;
    aarch64|arm64) architecture=arm64 ;;
    *) die "Unsupported CARE builder architecture: ${architecture}" ;;
  esac
  docker pull --platform "linux/${architecture}" "${BUILDKIT_IMAGE}"
fi
docker buildx inspect --bootstrap "${BUILDER}" >/dev/null
[[ "${MODE}" == clean ]] || exit 0

echo "Clearing unused build cache in dedicated CARE builder ${BUILDER}."
docker buildx prune --builder "${BUILDER}" --all --force
# First-deploy migration from the shared default builder. Seed ownership with
# explicit CARE package commands, then follow descendants. Unknown ancestors,
# shared records and active builds are protected. Snapshot descendants must also
# be released or their parent dependency layers would remain pinned on disk.
legacy_records="$(docker buildx du --builder default --format=json)"
legacy_ids="$(jq -rs -f "${SCRIPT_DIR}/../buildkit/legacy-care-cache.jq" <<<"${legacy_records}")"
if [[ -n "${legacy_ids}" ]]; then
  while IFS= read -r id; do
    [[ "${id}" =~ ^[a-z0-9]{12,64}$ ]] || die "Invalid legacy cache record identity."
  done <<<"${legacy_ids}"
  legacy_pattern="$(paste -sd '|' - <<<"${legacy_ids}")"
  (( ${#legacy_pattern} < 60000 )) || die "Legacy cache inventory is too large; operator audit required."
  echo "Clearing attributable private CARE build records from legacy default builder."
  # Boolean adapter fields expose an empty string when present; the quoted
  # empty value is intentional (private=true/shared=false do not match here).
  docker buildx prune --builder default --all --force --filter "id~=^(${legacy_pattern})$" --filter 'private=""'
else
  echo "No reclaimable legacy CARE cache records identified."
fi
docker buildx du --builder "${BUILDER}"
docker system df
