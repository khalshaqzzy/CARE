#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 3 ]] || { echo "Usage: render-runtime-env.sh <staging|production> <release-sha> <deploy-run-number>" >&2; exit 1; }
APP_ENV="$1"; RELEASE_SHA="$2"; DEPLOY_RUN_NUMBER="$3"
[[ "${APP_ENV}" =~ ^(staging|production)$ ]] || { echo "APP_ENV must be staging or production." >&2; exit 1; }
[[ "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "release-sha must be full lowercase SHA." >&2; exit 1; }
[[ "${DEPLOY_RUN_NUMBER}" =~ ^[1-9][0-9]*$ ]] || { echo "deploy-run-number must be positive." >&2; exit 1; }
if [[ "${APP_ENV}" == staging ]]; then
  COMPOSE_PROJECT_NAME=care-staging; SHARED_DIR=/opt/care/staging/shared
  WORKFORCE_DOMAIN=care.qd-tmmin.site; ADMIN_DOMAIN=admin-ped.qd-tmmin.site
else
  : "${PRODUCTION_CARE_DOMAIN:?PRODUCTION_CARE_DOMAIN is required}"
  : "${PRODUCTION_CARE_ADMIN_DOMAIN:?PRODUCTION_CARE_ADMIN_DOMAIN is required}"
  COMPOSE_PROJECT_NAME=care-production; SHARED_DIR=/opt/care/production/shared
  WORKFORCE_DOMAIN="${PRODUCTION_CARE_DOMAIN}"; ADMIN_DOMAIN="${PRODUCTION_CARE_ADMIN_DOMAIN}"
fi
required=(CADDY_EMAIL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DATABASE SESSION_HASH_SECRET SESSION_CSRF_SECRET AUTH_THROTTLE_SECRET CURSOR_SIGNING_SECRET METRICS_TOKEN CARE_ADMIN_USERNAME CARE_ADMIN_PASSWORD OPENAI_API_KEY OPENAI_MODEL OPENAI_BASE_URL VAPID_SUBJECT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY)
for name in "${required[@]}"; do [[ -n "${!name:-}" && "${!name}" != *$'\n'* && "${!name}" != *$'\r'* ]] || { echo "Missing or invalid required environment variable: ${name}" >&2; exit 1; }; done
printf 'APP_ENV=%s\nRELEASE_SHA=%s\nDEPLOY_RUN_NUMBER=%s\nCOMPOSE_PROJECT_NAME=%s\nSHARED_DIR=%s\n' "${APP_ENV}" "${RELEASE_SHA}" "${DEPLOY_RUN_NUMBER}" "${COMPOSE_PROJECT_NAME}" "${SHARED_DIR}"
printf 'WORKFORCE_DOMAIN=%s\nADMIN_DOMAIN=%s\nCADDY_EMAIL=%s\n' "${WORKFORCE_DOMAIN}" "${ADMIN_DOMAIN}" "${CADDY_EMAIL}"
printf '%s\n' 'CADDY_SCHEME=' 'PUBLISHED_HTTP_PORT=80' 'PUBLISHED_HTTPS_PORT=443'
for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DATABASE SESSION_HASH_SECRET SESSION_CSRF_SECRET AUTH_THROTTLE_SECRET CURSOR_SIGNING_SECRET METRICS_TOKEN CARE_ADMIN_USERNAME CARE_ADMIN_PASSWORD OPENAI_API_KEY OPENAI_MODEL OPENAI_BASE_URL VAPID_SUBJECT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do printf '%s=%s\n' "${name}" "${!name}"; done
printf 'OPENAI_CONFIDENCE_THRESHOLD=%s\nOPENAI_TIMEOUT_MS=%s\n' "${OPENAI_CONFIDENCE_THRESHOLD:-0.75}" "${OPENAI_TIMEOUT_MS:-10000}"
printf 'PUSH_ENDPOINT_HOSTS=%s\nPUSH_CANARY_ENDPOINT_HASH=%s\n' "${PUSH_ENDPOINT_HOSTS:-fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com}" "${PUSH_CANARY_ENDPOINT_HASH:-}"
printf '%s\n' 'SESSION_IDLE_HOURS=8' 'SESSION_ABSOLUTE_DAYS=7'
