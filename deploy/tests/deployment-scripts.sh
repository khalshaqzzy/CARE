#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; SCRIPTS="${ROOT}/deploy/scripts"; EXAMPLE="${ROOT}/deploy/env/runtime.staging.env.example"; COMPOSE="${ROOT}/deploy/compose/docker-compose.remote.yml"
TEST_ROOT="$(mktemp -d)"; DEPLOY_TEST_BASE="$(mktemp -d /tmp/care-deployment-test-XXXXXX)"; trap 'rm -rf -- "${TEST_ROOT}" "${DEPLOY_TEST_BASE}"' EXIT
fail() { echo "deployment harness failed: $*" >&2; exit 1; }
for script in "${SCRIPTS}"/*.sh; do bash -n "${script}"; done
"${SCRIPTS}/validate-runtime-env.sh" "${EXAMPLE}" >/dev/null
config_json="$(docker compose --env-file "${EXAMPLE}" -f "${COMPOSE}" --profile operations config --format json)"
jq -e '(.services|keys|sort)==["admin-web","api","bootstrap-admin","caddy","live-provider-smoke","migrate","postgres","push-canary","workforce-web"] and (.services.postgres.ports//[]|length)==0 and ([.services|to_entries[]|select(.key!="caddy")|(.value.ports//[])|length]|add)==0 and .networks.data.internal==true' <<<"${config_json}" >/dev/null || fail "Compose topology drifted"

rendered="${TEST_ROOT}/runtime.env"
CADDY_EMAIL=operator@care.test POSTGRES_USER=care POSTGRES_PASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa POSTGRES_DATABASE=care \
SESSION_HASH_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb SESSION_CSRF_SECRET=cccccccccccccccccccccccccccccccc AUTH_THROTTLE_SECRET=dddddddddddddddddddddddddddddddd \
CURSOR_SIGNING_SECRET=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee METRICS_TOKEN=ffffffffffffffffffffffffffffffff CARE_ADMIN_USERNAME=care-admin CARE_ADMIN_PASSWORD=gggggggggggggggg \
OPENAI_API_KEY=sk-live-000000000000000000000000 OPENAI_MODEL=care-model OPENAI_BASE_URL=https://api.vendor.test/v1 \
VAPID_SUBJECT=mailto:operator@care.test VAPID_PUBLIC_KEY=hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh VAPID_PRIVATE_KEY=iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii \
  "${SCRIPTS}/render-runtime-env.sh" staging aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 42 >"${rendered}"
chmod 600 "${rendered}"; "${SCRIPTS}/validate-runtime-env.sh" "${rendered}" >/dev/null
grep -qx 'OPENAI_REASONING_EFFORT=medium' "${rendered}" || fail "Default OpenAI reasoning effort was not rendered"
invalid="${TEST_ROOT}/invalid.env"; sed 's/SESSION_HASH_SECRET=.*/UNKNOWN_KEY=bad/' "${rendered}" >"${invalid}"
if "${SCRIPTS}/validate-runtime-env.sh" "${invalid}" >/dev/null 2>&1; then fail "Unknown env key accepted"; fi
invalid_effort="${TEST_ROOT}/invalid-effort.env"; sed 's/OPENAI_REASONING_EFFORT=.*/OPENAI_REASONING_EFFORT=extreme/' "${rendered}" >"${invalid_effort}"
if "${SCRIPTS}/validate-runtime-env.sh" "${invalid_effort}" >/dev/null 2>&1; then fail "Invalid OpenAI reasoning effort accepted"; fi
hosted_invalid="${TEST_ROOT}/hosted-invalid.env"
sed -e 's#^SHARED_DIR=.*#SHARED_DIR=/opt/care/staging/shared#' -e 's#^OPENAI_MODEL=.*#OPENAI_MODEL=placeholder#' "${rendered}" >"${hosted_invalid}"
chmod 600 "${hosted_invalid}"
if "${SCRIPTS}/validate-runtime-env.sh" "${hosted_invalid}" >/dev/null 2>&1; then fail "Hosted placeholder accepted"; fi

archive_root="${TEST_ROOT}/archive"; mkdir -p "${archive_root}/deploy/scripts"; printf 'ok\n' >"${archive_root}/file"
safe_archive="${TEST_ROOT}/safe.tar.gz"; tar -czf "${safe_archive}" -C "${archive_root}" .
checksum_base=/tmp/care-deployment-test-entry
rm -rf -- "${checksum_base}"
mkdir -p "${checksum_base}/incoming"
checksum_archive="${checksum_base}/incoming/candidate.tar.gz"; checksum_env="${checksum_base}/incoming/candidate.env"
cp "${safe_archive}" "${checksum_archive}"; cp "${rendered}" "${checksum_env}"
if bash "${SCRIPTS}/remote-entrypoint.sh" staging aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 "${checksum_base}" "${checksum_archive}" "${checksum_env}" "$(printf bad | sha256sum | cut -d' ' -f1)" 127.0.0.1 >/dev/null 2>&1; then fail "Bad archive checksum accepted"; fi
[[ ! -d "${checksum_base}/incoming/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.1.1" && ! -e "${checksum_archive}" ]] || fail "Archive was extracted before checksum verification"
if tar --help 2>&1 | grep -q -- --transform; then
  malicious_archive="${TEST_ROOT}/malicious.tar.gz"
  tar -czf "${malicious_archive}" --transform='s#^\./file$#../escape#' -C "${archive_root}" ./file
  malicious_base=/tmp/care-deployment-test-malicious; rm -rf -- "${malicious_base}"; mkdir -p "${malicious_base}/incoming"
  malicious_upload="${malicious_base}/incoming/candidate.tar.gz"; malicious_env="${malicious_base}/incoming/candidate.env"
  cp "${malicious_archive}" "${malicious_upload}"; cp "${rendered}" "${malicious_env}"; malicious_sum="$(sha256sum "${malicious_upload}" | cut -d' ' -f1)"
  if bash "${SCRIPTS}/remote-entrypoint.sh" staging aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 "${malicious_base}" "${malicious_upload}" "${malicious_env}" "${malicious_sum}" 127.0.0.1 >/dev/null 2>&1; then fail "Traversal archive accepted"; fi
  [[ ! -e "${malicious_base}/escape" && ! -e "${malicious_upload}" ]] || fail "Traversal archive escaped or was not cleaned"
fi

fake_bin="${TEST_ROOT}/bin"; mkdir -p "${fake_bin}"
cat >"${fake_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == inspect ]]; then echo healthy; exit 0; fi
if [[ "${1:-}" == logs || "${1:-}" == image ]]; then exit 0; fi
if [[ "${1:-}" == compose ]]; then
  for arg in "$@"; do
    [[ "${arg}" != build || "${TEST_BUILD_FAIL:-false}" != true ]] || exit 1
    [[ "${arg}" != migrate || "${TEST_MIGRATE_FAIL:-false}" != true ]] || exit 1
    [[ "${arg}" != "live-provider-smoke" || "${TEST_PROVIDER_SMOKE_FAIL:-false}" != true ]] || exit 1
  done
  previous=''; for arg in "$@"; do [[ "${previous}" != -q ]] || { echo "${arg}-container"; exit 0; }; previous="${arg}"; done
  exit 0
fi
exit 0
EOF
chmod +x "${fake_bin}/docker"
if ! command -v flock >/dev/null 2>&1; then printf '#!/usr/bin/env bash\nexit 0\n' >"${fake_bin}/flock"; chmod +x "${fake_bin}/flock"; fi

prepare_base() { mkdir -p "$1"/{releases,incoming,shared/deployment-state,shared/postgres-data,shared/media,shared/caddy-data,shared/caddy-config}; }
prepare_candidate() {
  local base="$1" sha="$2" run="$3" smoke="${4:-0}" incoming="${1}/incoming/${2}.${3}.1" runtime="${1}/incoming/${2}.${3}.env" archive="${1}/incoming/${2}.${3}.tar.gz"
  mkdir -p "${incoming}/deploy/scripts"
  cp "${SCRIPTS}/lib.sh" "${incoming}/deploy/scripts/lib.sh"
  # shellcheck disable=SC2016
  printf '#!/usr/bin/env bash\nexit "${TEST_PREFLIGHT_EXIT:-0}"\n' >"${incoming}/deploy/scripts/remote-preflight.sh"
  printf '#!/usr/bin/env bash\nexit %s\n' "${smoke}" >"${incoming}/deploy/scripts/smoke-check.sh"
  chmod +x "${incoming}/deploy/scripts/"*.sh
  sed -e "s/^RELEASE_SHA=.*/RELEASE_SHA=${sha}/" -e "s/^DEPLOY_RUN_NUMBER=.*/DEPLOY_RUN_NUMBER=${run}/" -e "s#^SHARED_DIR=.*#SHARED_DIR=${base}/shared#" "${EXAMPLE}" >"${runtime}"; chmod 600 "${runtime}"
  printf 'release\n' >"${archive}"; printf '%s|%s|%s|%s\n' "${incoming}" "${runtime}" "${archive}" "$(sha256sum "${archive}" | cut -d' ' -f1)"
}
run_candidate() {
  local base="$1" sha="$2" run="$3" smoke="${4:-0}" incoming runtime archive checksum
  IFS='|' read -r incoming runtime archive checksum < <(prepare_candidate "${base}" "${sha}" "${run}" "${smoke}")
  PATH="${fake_bin}:${PATH}" "${SCRIPTS}/remote-deploy.sh" staging "${sha}" "${run}" "${base}" "${incoming}" "${runtime}" "${archive}" "${checksum}" 127.0.0.1
}

success="${DEPLOY_TEST_BASE}/success"; prepare_base "${success}"
for i in 1 2 3 4 5 6; do old="$(printf '%040x' "${i}")"; mkdir -p "${success}/releases/${old}"; touch -t "20260${i}010000" "${success}/releases/${old}"; done
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; run_candidate "${success}" "${sha}" 10 >/dev/null
[[ "$(<"${success}/current_release")" == "${sha}" && "$(readlink "${success}/current")" == "${success}/releases/${sha}" ]] || fail "Atomic activation failed"
[[ "$(find "${success}/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" == 5 ]] || fail "Retention failed"
next_sha=abababababababababababababababababababab; run_candidate "${success}" "${next_sha}" 11 >/dev/null
[[ "$(<"${success}/current_release")" == "${next_sha}" && "$(<"${success}/previous_release")" == "${sha}" ]] || fail "Current/previous release pointers failed"
run_candidate "${success}" "${next_sha}" 11 >/dev/null
[[ "$(<"${success}/current_release")" == "${next_sha}" ]] || fail "Idempotent same-run rerun changed activation"

rehearsal_highwater="${DEPLOY_TEST_BASE}/rehearsal-highwater"; prepare_base "${rehearsal_highwater}"
printf '60 %s\n' 9999999999999999999999999999999999999999 >"${rehearsal_highwater}/shared/deployment-state/highest_seen_run"
DEPLOY_REHEARSAL=true run_candidate "${rehearsal_highwater}" 8888888888888888888888888888888888888888 61 >/dev/null
[[ "$(<"${rehearsal_highwater}/shared/deployment-state/highest_seen_run")" == '60 9999999999999999999999999999999999999999' ]] || fail "Rehearsal changed deployment high-water state"

stale="${DEPLOY_TEST_BASE}/stale"; prepare_base "${stale}"; printf '20 %040d\n' 1 >"${stale}/shared/deployment-state/highest_seen_run"
if run_candidate "${stale}" bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 19 >/dev/null 2>&1; then fail "Stale run accepted"; fi
equal="${DEPLOY_TEST_BASE}/equal"; prepare_base "${equal}"; printf '30 %040d\n' 1 >"${equal}/shared/deployment-state/highest_seen_run"
if run_candidate "${equal}" cccccccccccccccccccccccccccccccccccccccc 30 >/dev/null 2>&1; then fail "Equal run with different SHA accepted"; fi

failure="${DEPLOY_TEST_BASE}/failure"; prepare_base "${failure}"
if TEST_BUILD_FAIL=true run_candidate "${failure}" dddddddddddddddddddddddddddddddddddddddd 31 >/dev/null 2>&1; then fail "Build failure returned success"; fi
[[ ! -f "${failure}/current_release" && -d "${failure}/shared/postgres-data" && -d "${failure}/shared/media" ]] || fail "Failure changed pointer/persistence"

preflight="${DEPLOY_TEST_BASE}/preflight"; prepare_base "${preflight}"
if TEST_PREFLIGHT_EXIT=1 run_candidate "${preflight}" 2222222222222222222222222222222222222222 32 >/dev/null 2>&1; then fail "Preflight failure returned success"; fi
[[ ! -f "${preflight}/current_release" ]] || fail "Preflight failure changed pointer"

migration="${DEPLOY_TEST_BASE}/migration"; prepare_base "${migration}"
if TEST_MIGRATE_FAIL=true run_candidate "${migration}" 3333333333333333333333333333333333333333 33 >/dev/null 2>&1; then fail "Migration failure returned success"; fi
[[ ! -f "${migration}/current_release" && -d "${migration}/shared/postgres-data" ]] || fail "Migration failure changed pointer or database path"

provider_smoke="${DEPLOY_TEST_BASE}/provider-smoke"; prepare_base "${provider_smoke}"
TEST_PROVIDER_SMOKE_FAIL=true run_candidate "${provider_smoke}" 4444444444444444444444444444444444444444 34 >/dev/null
[[ "$(<"${provider_smoke}/current_release")" == 4444444444444444444444444444444444444444 ]] || fail "Provider smoke failure blocked activation"
[[ "$(grep -E '^status=failed ' "${provider_smoke}/shared/deployment-state/live-provider-smoke.result")" != "" ]] || fail "Provider smoke failure was not recorded"

rollback="${DEPLOY_TEST_BASE}/rollback"; prepare_base "${rollback}"; previous=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
mkdir -p "${rollback}/releases/${previous}/deploy/scripts"; printf '%s\n' "${previous}" >"${rollback}/current_release"
printf '#!/usr/bin/env bash\ntouch %q\n' "${rollback}/rollback-called" >"${rollback}/releases/${previous}/deploy/scripts/remote-rollback.sh"; chmod +x "${rollback}/releases/${previous}/deploy/scripts/remote-rollback.sh"
if run_candidate "${rollback}" ffffffffffffffffffffffffffffffffffffffff 40 1 >/dev/null 2>&1; then fail "Failed smoke returned success"; fi
[[ -f "${rollback}/rollback-called" && "$(<"${rollback}/current_release")" == "${previous}" ]] || fail "Automatic rollback was not called"

lock="${DEPLOY_TEST_BASE}/lock"; prepare_base "${lock}"
if command -v flock >/dev/null 2>&1; then
  flock "${lock}/deploy.lock" -c 'sleep 2' & lock_pid=$!; sleep 0.2
  if run_candidate "${lock}" 1111111111111111111111111111111111111111 50 >/dev/null 2>&1; then fail "Concurrent deploy acquired lock"; fi
  wait "${lock_pid}"
else echo "flock unavailable; contention remains mandatory in Linux CI."; fi
echo "Deployment env, topology, archive safety, failure stages, stale/equal-run, idempotency, lock, rollback, activation, and retention tests passed."
