#!/usr/bin/env bash
# Opt-in: run INSIDE a disposable, empty Docker-in-Docker daemon, never a VM.
set -euo pipefail
[[ "${CARE_CACHE_INTEGRATION_ISOLATED:-false}" == true ]] || { echo 'An isolated empty Docker daemon is required.' >&2; exit 1; }
[[ -z "$(docker ps -aq)" ]] || { echo 'Refusing a nonempty Docker daemon.' >&2; exit 1; }
# A preloaded immutable BuildKit bootstrap image is allowed in offline rehearsals.
while IFS= read -r image; do
  [[ -z "${image}" || "${image}" == sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8 ]] || { echo 'Refusing unrelated images in isolated daemon.' >&2; exit 1; }
done < <(docker image ls -aq --no-trunc | sort -u)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="$(mktemp -d /tmp/care-deployment-test-real-cache-XXXXXX)"
cleanup() { docker rm -f care-cache-current care-cache-foreign >/dev/null 2>&1 || true; docker buildx rm care-staging-deploy >/dev/null 2>&1 || true; rm -rf -- "${BASE}"; }
trap cleanup EXIT
mkdir -p "${BASE}/shared/deployment-state" "${BASE}/care" "${BASE}/foreign"
printf 'persistent-media\n' >"${BASE}/shared/media-sentinel"
cat >"${BASE}/care/Dockerfile" <<'DOCKER'
FROM alpine:3.24
RUN printf '#!/bin/sh\ndd if=/dev/zero of=/care-dependencies bs=1048576 count=3\n' > /usr/local/bin/pnpm && chmod +x /usr/local/bin/pnpm
RUN pnpm install --frozen-lockfile --filter @care/api... --filter @care/contracts
COPY care.txt /care.txt
RUN echo care-descendant > /descendant
CMD ["sleep", "3600"]
DOCKER
printf 'care\n' >"${BASE}/care/care.txt"
cat >"${BASE}/foreign/Dockerfile" <<'DOCKER'
FROM alpine:3.24
RUN echo unrelated > /foreign-data
CMD ["sleep", "3600"]
DOCKER
docker buildx build --builder default --load -t care-legacy-test:probe "${BASE}/care"
docker image rm care-legacy-test:probe
docker buildx build --builder default --load -t unrelated-test:probe "${BASE}/foreign"
docker run -d --name care-cache-foreign unrelated-test:probe
"${ROOT}/deploy/scripts/build-cache.sh" prepare staging "${BASE}"
cat >"${BASE}/compose.yml" <<YAML
services:
  app:
    image: care-cache-current:probe
    build: ${BASE}/care
YAML
# This verifies Compose + default-load, not merely buildx build --load.
docker compose -f "${BASE}/compose.yml" build --builder care-staging-deploy
docker run -d --name care-cache-current -v "${BASE}/shared:/data:ro" care-cache-current:probe

docker buildx du --builder default --format=json >"${BASE}/before.jsonl"
jq -rs -f "${ROOT}/deploy/buildkit/legacy-care-cache.jq" "${BASE}/before.jsonl" >"${BASE}/owned-ids"
[[ -s "${BASE}/owned-ids" ]] || { echo 'No attributable private legacy records in fixture.' >&2; exit 1; }
jq -rs '[.[]|select(.Description|contains("unrelated"))|.ID]' "${BASE}/before.jsonl" >"${BASE}/foreign-ids"
[[ "$(jq length "${BASE}/foreign-ids")" -gt 0 ]]
"${ROOT}/deploy/scripts/build-cache.sh" clean staging "${BASE}"
docker buildx du --builder care-staging-deploy --format=json | jq -es 'all(.[]; .Reclaimable==false)' >/dev/null
docker buildx du --builder default --format=json >"${BASE}/after.jsonl"
while IFS= read -r id; do
  if jq -es --arg id "${id}" 'any(.[];.ID==$id)' "${BASE}/after.jsonl" >/dev/null; then
    echo "Owned legacy record survived: ${id}" >&2; exit 1
  fi
done <"${BASE}/owned-ids"
jq -es --slurpfile expected "${BASE}/foreign-ids" '[.[].ID] as $actual | all($expected[0][]; . as $id | $actual | index($id))' "${BASE}/after.jsonl" >/dev/null
# Exported images, running containers and business-data bind mounts survive.
[[ "$(docker inspect --format '{{.State.Running}}' care-cache-current)" == true ]]
[[ "$(docker inspect --format '{{.State.Running}}' care-cache-foreign)" == true ]]
docker exec care-cache-current cat /care.txt | grep -qx care
docker exec care-cache-current cat /data/media-sentinel | grep -qx persistent-media
docker image inspect care-cache-current:probe unrelated-test:probe >/dev/null
"${ROOT}/deploy/scripts/build-cache.sh" clean staging "${BASE}"
echo 'Real isolated Docker/BuildKit/Compose export, legacy descendant deletion, foreign cache and active image/data protection PASS.'
