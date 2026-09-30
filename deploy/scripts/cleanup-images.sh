#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 2 && "$1" =~ ^(inventory|clean)$ ]] || die "Usage: cleanup-images.sh <inventory|clean> <base>"
MODE="$1"; BASE_DIR="$2"
[[ "${BASE_DIR}" == /opt/care/staging || "${BASE_DIR}" == /opt/care/production || "${BASE_DIR}" == /tmp/care-deployment-test-* ]] || die "Invalid cleanup base."
STATE="${BASE_DIR}/shared/deployment-state/care-image-inventory"
umask 077

# Capture legacy image identities BEFORE mutable tags (notably PostgreSQL) move.
# Keep this inventory across failed builds so the next successful run catches them.
images="$(docker image ls --no-trunc --format '{{.Repository}} {{.ID}}')"
{
  [[ ! -f "${STATE}" ]] || cat "${STATE}"
  awk '$1 ~ /^(care-api|care-web-voice|care-web-admin|care-caddy|care-postgres)$/ {print $2}' <<<"${images}"
} | sort -u >"${STATE}.tmp"
mv "${STATE}.tmp" "${STATE}"
[[ "${MODE}" == clean ]] || exit 0

echo "Cleaning unused CARE images after successful activation."
# Remove only stopped containers belonging to this deployment project. Docker
# image deletion below still protects images referenced by ANY other container.
project="$(require_env_value "${BASE_DIR}/current/.runtime.env" COMPOSE_PROJECT_NAME)"
stopped="$(docker ps -aq --filter "label=com.docker.compose.project=${project}" --filter status=exited --filter status=dead --filter status=created)"
while IFS= read -r container; do
  [[ -z "${container}" ]] || docker container rm "${container}"
done <<<"${stopped}"

containers="$(docker ps -aq)"
used_images=''
while IFS= read -r container; do
  [[ -z "${container}" ]] || used_images+="$(docker inspect --format '{{.Image}}' "${container}")"$'\n'
done <<<"${containers}"

: >"${STATE}.tmp"
failed=false
while IFS= read -r id; do
  [[ "${id}" =~ ^sha256:[0-9a-f]{64}$ ]] || die "Invalid CARE image inventory identity."
  if ! docker image inspect "${id}" >/dev/null 2>&1; then continue; fi
  if grep -Fxq "${id}" <<<"${used_images}"; then printf '%s\n' "${id}" >>"${STATE}.tmp"; continue; fi
  tags="$(docker image inspect --format '{{range .RepoTags}}{{println .}}{{end}}' "${id}")"
  foreign=false
  while IFS= read -r tag; do
    [[ -z "${tag}" || "${tag}" =~ ^(care-api|care-web-voice|care-web-admin|care-caddy|care-postgres): ]] || foreign=true
  done <<<"${tags}"
  if [[ "${foreign}" == true ]]; then
    echo "Preserving shared image ${id}: a non-CARE tag references it."
    printf '%s\n' "${id}" >>"${STATE}.tmp"; continue
  fi
  # Remove every CARE tag, then the ID if it remains. Never force deletion.
  while IFS= read -r tag; do
    [[ -z "${tag}" ]] || docker image rm "${tag}" || failed=true
  done <<<"${tags}"
  if docker image inspect "${id}" >/dev/null 2>&1; then docker image rm "${id}" || failed=true; fi
  if docker image inspect "${id}" >/dev/null 2>&1; then printf '%s\n' "${id}" >>"${STATE}.tmp"; fi
done <"${STATE}"
mv "${STATE}.tmp" "${STATE}"
# New builds carry this label, including dangling images from failed builds.
docker image prune --force --filter label=com.satucare.application=care
docker system df
[[ "${failed}" == false ]] || die "CARE image cleanup failed; the healthy release remains active."
