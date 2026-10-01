#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT="$(mktemp -d /tmp/care-deployment-test-cache-XXXXXX)"
trap 'rm -rf -- "${TEST_ROOT}"' EXIT
mkdir -p "${TEST_ROOT}/bin" "${TEST_ROOT}/builders"
export CACHE_TEST_ROOT="${TEST_ROOT}"
cat >"${TEST_ROOT}/records.jsonl" <<'JSON'
{"ID":"ancestor000001","Description":"pulled from node","Parents":null,"Shared":false,"Reclaimable":true}
{"ID":"careinstall001","Description":"mount / from exec /bin/sh -c pnpm install --frozen-lockfile --filter @care/api... --filter @care/contracts","Parents":["ancestor000001"],"Shared":false,"Reclaimable":true}
{"ID":"caredescend001","Description":"[build] COPY apps/api apps/api","Parents":["careinstall001"],"Shared":false,"Reclaimable":true}
{"ID":"caretransit001","Description":"[build] COPY packages/contracts packages/contracts","Parents":["caredescend001"],"Shared":false,"Reclaimable":true}
{"ID":"careshared0001","Description":"mount / from exec /bin/sh -c pnpm --filter @care/web-voice... build","Parents":[],"Shared":true,"Reclaimable":true}
{"ID":"careactive0001","Description":"mount / from exec /bin/sh -c pnpm --filter @care/web-admin... build","Parents":[],"Shared":false,"Reclaimable":false}
{"ID":"foreign000001","Description":"mount / from exec /bin/sh -c pnpm install --filter @other/api","Parents":["ancestor000001"],"Shared":false,"Reclaimable":true}
{"ID":"unknown000001","Description":"COPY package.json ./","Parents":["ancestor000001"],"Shared":false,"Reclaimable":true}
JSON
cat >"${TEST_ROOT}/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${CACHE_TEST_ROOT}/calls"
[[ "$1" == buildx ]] || exit 0
shift
case "$1" in
  inspect)
    builder="${@: -1}"
    [[ -f "${CACHE_TEST_ROOT}/builders/${builder}" ]] || exit 1
    printf 'Driver: %s\n' "${CACHE_TEST_DRIVER:-docker-container}" ;;
  create)
    shift
    while [[ $# -gt 0 ]]; do if [[ "$1" == --name ]]; then touch "${CACHE_TEST_ROOT}/builders/$2"; break; fi; shift; done ;;
  du)
    [[ "$*" != *'--builder default'* ]] || cat "${CACHE_TEST_ROOT}/records.jsonl" ;;
  prune) [[ "${CACHE_TEST_PRUNE_FAIL:-false}" != true ]] ;;
esac
DOCKER
chmod +x "${TEST_ROOT}/bin/docker"
export PATH="${TEST_ROOT}/bin:${PATH}"
fail() { echo "build cache harness failed: $*" >&2; exit 1; }
base="${TEST_ROOT}/owned"; mkdir -p "${base}/shared/deployment-state"
"${ROOT}/deploy/scripts/build-cache.sh" prepare staging "${base}" >/dev/null
[[ "$(<"${base}/shared/deployment-state/build-cache-owner")" == care-staging-deploy ]] || fail "Ownership was not recorded"
"${ROOT}/deploy/scripts/build-cache.sh" prepare staging "${base}" >/dev/null
[[ "$(grep -c '^buildx create' "${TEST_ROOT}/calls")" == 1 ]] || fail "Owned builder was recreated"
grep -q -- '--driver docker-container --driver-opt image=moby/buildkit:v0.32.2@sha256:' "${TEST_ROOT}/calls" || fail "Unpinned or shared builder"
grep -q -- '--driver-opt default-load=true' "${TEST_ROOT}/calls" || fail "Compose images will not be loaded"
"${ROOT}/deploy/scripts/build-cache.sh" clean staging "${base}" >/dev/null
prune="$(grep '^buildx prune --builder default' "${TEST_ROOT}/calls")"
for id in careinstall001 caredescend001 caretransit001; do [[ "${prune}" == *"${id}"* ]] || fail "Owned record/descendant missed: ${id}"; done
for id in ancestor000001 careshared0001 careactive0001 foreign000001 unknown000001; do [[ "${prune}" != *"${id}"* ]] || fail "Protected record selected: ${id}"; done
[[ "${prune}" == *'--filter private=""'* ]] || fail "Concurrent shared/in-use protection missing"
grep -q '^buildx prune --builder care-staging-deploy --all --force$' "${TEST_ROOT}/calls" || fail "Dedicated cache not cleaned"

foreign="${TEST_ROOT}/foreign"; mkdir -p "${foreign}/shared/deployment-state"
if "${ROOT}/deploy/scripts/build-cache.sh" prepare staging "${foreign}" >/dev/null 2>&1; then fail "Adopted unowned preexisting builder"; fi
if "${ROOT}/deploy/scripts/build-cache.sh" clean staging "${foreign}" >/dev/null 2>&1; then fail "Cleaned without ownership"; fi
if CACHE_TEST_DRIVER=docker "${ROOT}/deploy/scripts/build-cache.sh" clean staging "${base}" >/dev/null 2>&1; then fail "Accepted shared docker driver"; fi
if CACHE_TEST_PRUNE_FAIL=true "${ROOT}/deploy/scripts/build-cache.sh" clean staging "${base}" >/dev/null 2>&1; then fail "Prune failure was hidden"; fi
if "${ROOT}/deploy/scripts/build-cache.sh" clean staging /tmp >/dev/null 2>&1; then fail "Accepted unsafe base"; fi
printf 'wrong-builder\n' >"${base}/shared/deployment-state/build-cache-owner"
if "${ROOT}/deploy/scripts/build-cache.sh" clean staging "${base}" >/dev/null 2>&1; then fail "Accepted corrupted ownership"; fi
production="${TEST_ROOT}/production"; mkdir -p "${production}/shared/deployment-state"
"${ROOT}/deploy/scripts/build-cache.sh" prepare production "${production}" >/dev/null
[[ "$(<"${production}/shared/deployment-state/build-cache-owner")" == care-production-deploy ]] || fail "Environments share a builder"
echo "CARE builder ownership, isolation, descendant attribution, shared/active/foreign protection, repeat prepare and cleanup failure tests passed."
