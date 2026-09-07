#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/scripts/lib.sh
source "${SCRIPT_DIR}/lib.sh"
[[ $# -eq 1 ]] || die "Usage: validate-runtime-env.sh <runtime-env-file>"
RUNTIME_ENV="$1"
[[ -s "${RUNTIME_ENV}" ]] || die "Runtime env file is missing or empty."

allowed='^(APP_ENV|RELEASE_SHA|DEPLOY_RUN_NUMBER|COMPOSE_PROJECT_NAME|SHARED_DIR|WORKFORCE_DOMAIN|ADMIN_DOMAIN|CADDY_EMAIL|CADDY_SCHEME|PUBLISHED_HTTP_PORT|PUBLISHED_HTTPS_PORT|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DATABASE|SESSION_HASH_SECRET|SESSION_CSRF_SECRET|AUTH_THROTTLE_SECRET|CURSOR_SIGNING_SECRET|METRICS_TOKEN|CARE_ADMIN_USERNAME|CARE_ADMIN_PASSWORD|OPENAI_API_KEY|OPENAI_CONFIG_ENCRYPTION_KEY|OPENAI_MODEL|OPENAI_BASE_URL|OPENAI_REASONING_EFFORT|OPENAI_CONFIDENCE_THRESHOLD|OPENAI_TIMEOUT_MS|VAPID_SUBJECT|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|PUSH_ENDPOINT_HOSTS|PUSH_CANARY_ENDPOINT_HASH|SESSION_IDLE_HOURS|SESSION_ABSOLUTE_DAYS)='
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  [[ "${line}" =~ ${allowed} ]] || die "Runtime env contains an unknown or malformed key."
  [[ "${line}" != *$'\r'* && "${line}" != *$'\n'* ]] || die "Runtime env contains a newline injection."
done <"${RUNTIME_ENV}"

APP_ENV="$(require_env_value "${RUNTIME_ENV}" APP_ENV)"
RELEASE_SHA="$(require_env_value "${RUNTIME_ENV}" RELEASE_SHA)"
DEPLOY_RUN_NUMBER="$(require_env_value "${RUNTIME_ENV}" DEPLOY_RUN_NUMBER)"
COMPOSE_PROJECT_NAME="$(require_env_value "${RUNTIME_ENV}" COMPOSE_PROJECT_NAME)"
SHARED_DIR="$(require_env_value "${RUNTIME_ENV}" SHARED_DIR)"
[[ "${APP_ENV}" =~ ^(staging|production)$ ]] || die "APP_ENV must be staging or production."
require_sha "${RELEASE_SHA}"
[[ "${DEPLOY_RUN_NUMBER}" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_RUN_NUMBER must be positive."
[[ "${COMPOSE_PROJECT_NAME}" == "care-${APP_ENV}" ]] || die "COMPOSE_PROJECT_NAME does not match APP_ENV."
[[ "${SHARED_DIR}" == "/opt/care/${APP_ENV}/shared" || "${SHARED_DIR}" == /tmp/care-* ]] || die "SHARED_DIR is outside the approved path."

safe_names=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DATABASE SESSION_HASH_SECRET SESSION_CSRF_SECRET AUTH_THROTTLE_SECRET CURSOR_SIGNING_SECRET METRICS_TOKEN CARE_ADMIN_USERNAME CARE_ADMIN_PASSWORD OPENAI_API_KEY OPENAI_CONFIG_ENCRYPTION_KEY OPENAI_MODEL VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY)
for name in "${safe_names[@]}"; do
  value="$(require_env_value "${RUNTIME_ENV}" "${name}")"
  [[ "${value}" =~ ^[A-Za-z0-9._/-]+$ ]] || die "${name} contains unsupported dotenv characters."
done
for name in POSTGRES_PASSWORD SESSION_HASH_SECRET SESSION_CSRF_SECRET AUTH_THROTTLE_SECRET CURSOR_SIGNING_SECRET METRICS_TOKEN OPENAI_CONFIG_ENCRYPTION_KEY; do
  value="$(require_env_value "${RUNTIME_ENV}" "${name}")"
  (( ${#value} >= 32 )) || die "${name} must contain at least 32 characters."
done
admin_password="$(require_env_value "${RUNTIME_ENV}" CARE_ADMIN_PASSWORD)"
(( ${#admin_password} >= 12 )) || die "CARE_ADMIN_PASSWORD must contain at least 12 characters."
openai_encryption_key="$(require_env_value "${RUNTIME_ENV}" OPENAI_CONFIG_ENCRYPTION_KEY)"
[[ "${openai_encryption_key}" =~ ^[A-Za-z0-9_-]{43}$ ]] || die "OPENAI_CONFIG_ENCRYPTION_KEY must be a 32-byte base64url value."

secrets=()
for name in POSTGRES_PASSWORD SESSION_HASH_SECRET SESSION_CSRF_SECRET AUTH_THROTTLE_SECRET CURSOR_SIGNING_SECRET METRICS_TOKEN CARE_ADMIN_PASSWORD OPENAI_CONFIG_ENCRYPTION_KEY; do secrets+=("$(require_env_value "${RUNTIME_ENV}" "${name}")"); done
[[ "$(printf '%s\n' "${secrets[@]}" | sort -u | wc -l | tr -d ' ')" == "${#secrets[@]}" ]] || die "Runtime secrets that protect different purposes must be distinct."

for name in WORKFORCE_DOMAIN ADMIN_DOMAIN; do
  value="$(require_env_value "${RUNTIME_ENV}" "${name}")"
  [[ "${value}" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "${name} is not a valid hostname."
done
caddy_email="$(require_env_value "${RUNTIME_ENV}" CADDY_EMAIL)"
[[ "${caddy_email}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "CADDY_EMAIL is invalid."
openai_base_url="$(require_env_value "${RUNTIME_ENV}" OPENAI_BASE_URL)"
url_pattern='^https://[-A-Za-z0-9._~:/?#@!&()*+,;=%]+$'
[[ "${openai_base_url}" =~ ${url_pattern} ]] || die "OPENAI_BASE_URL must use HTTPS."
openai_reasoning_effort="$(env_value "${RUNTIME_ENV}" OPENAI_REASONING_EFFORT)" || die "OPENAI_REASONING_EFFORT must be present."
[[ "${openai_reasoning_effort}" =~ ^(none|minimal|low|medium|high|xhigh|max)?$ ]] || die "OPENAI_REASONING_EFFORT is invalid."
vapid_subject="$(require_env_value "${RUNTIME_ENV}" VAPID_SUBJECT)"
[[ "${vapid_subject}" =~ ^(mailto:|https://) ]] || die "VAPID_SUBJECT must use mailto: or https:."
endpoint_hosts="$(require_env_value "${RUNTIME_ENV}" PUSH_ENDPOINT_HOSTS)"
[[ "${endpoint_hosts}" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+(,([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+)*$ ]] || die "PUSH_ENDPOINT_HOSTS must be an exact comma-separated hostname allowlist."
canary_hash="$(env_value "${RUNTIME_ENV}" PUSH_CANARY_ENDPOINT_HASH)" || die "PUSH_CANARY_ENDPOINT_HASH must be present."
[[ -z "${canary_hash}" || "${canary_hash}" =~ ^[0-9a-f]{64}$ ]] || die "PUSH_CANARY_ENDPOINT_HASH must be empty or a SHA-256 hex value."

scheme="$(env_value "${RUNTIME_ENV}" CADDY_SCHEME)" || die "CADDY_SCHEME must be present."
http_port="$(require_env_value "${RUNTIME_ENV}" PUBLISHED_HTTP_PORT)"
https_port="$(require_env_value "${RUNTIME_ENV}" PUBLISHED_HTTPS_PORT)"
[[ -z "${scheme}" || "${scheme}" == http:// ]] || die "CADDY_SCHEME must be empty or http://."
[[ "${http_port}" =~ ^[0-9]+$ && "${https_port}" =~ ^[0-9]+$ ]] || die "Published ports must be numeric."
if [[ "${SHARED_DIR}" == /opt/* ]]; then
  [[ -z "${scheme}" && "${http_port}" == 80 && "${https_port}" == 443 ]] || die "Hosted runtime must use automatic HTTPS on ports 80/443."
  if stat -c '%a' "${RUNTIME_ENV}" >/dev/null 2>&1; then mode="$(stat -c '%a' "${RUNTIME_ENV}")"; else mode="$(stat -f '%Lp' "${RUNTIME_ENV}")"; fi
  [[ "${mode}" == 600 ]] || die "Hosted runtime env must have mode 0600."
  grep -Eiq '(replace|example|placeholder|invalid)' "${RUNTIME_ENV}" && die "Hosted runtime contains a placeholder value."
fi
printf 'Runtime environment is valid for %s release %s.\n' "${APP_ENV}" "${RELEASE_SHA}"
