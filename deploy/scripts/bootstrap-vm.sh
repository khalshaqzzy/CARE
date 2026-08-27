#!/usr/bin/env bash
set -euo pipefail
usage() { echo 'Usage: bootstrap-vm.sh [--check] staging <deploy-user> "<ssh-public-key>" [ssh-port]' >&2; }
CHECK_ONLY=false; [[ "${1:-}" != --check ]] || { CHECK_ONLY=true; shift; }
[[ $# -ge 3 && $# -le 4 ]] || { usage; exit 1; }
APP_ENV="$1"; DEPLOY_USER="$2"; DEPLOY_KEY="$3"; SSH_PORT="${4:-22}"
[[ "${APP_ENV}" == staging ]] || { echo "Only staging is enabled." >&2; exit 1; }
[[ "${DEPLOY_USER}" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || { echo "Invalid deploy user." >&2; exit 1; }
[[ "${DEPLOY_KEY}" =~ ^ssh-(ed25519|rsa)[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]] || { echo "Unsupported SSH key." >&2; exit 1; }
if ! [[ "${SSH_PORT}" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then echo "Invalid SSH port." >&2; exit 1; fi
[[ -r /etc/os-release ]] || { echo "Cannot identify OS." >&2; exit 1; }
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 22.04 ]] || { echo "Ubuntu 22.04 LTS is required." >&2; exit 1; }
BASE=/opt/care/staging
${CHECK_ONLY} && { echo "Bootstrap inputs valid for ${BASE}."; exit 0; }
[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg jq git ufw util-linux
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "${VERSION_CODENAME}" >/etc/apt/sources.list.d/docker.list
apt-get update; apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; systemctl enable --now docker
id -u "${DEPLOY_USER}" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
usermod -aG docker "${DEPLOY_USER}"
if getent group 2000 >/dev/null 2>&1 && [[ "$(getent group 2000 | cut -d: -f1)" != care-data ]]; then echo "GID 2000 is occupied." >&2; exit 1; fi
getent group care-data >/dev/null 2>&1 || groupadd --gid 2000 care-data
[[ "$(getent group care-data | cut -d: -f3)" == 2000 ]] || { echo "care-data GID mismatch." >&2; exit 1; }
usermod -aG care-data "${DEPLOY_USER}"
USER_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"; SSH_DIR="${USER_HOME}/.ssh"; KEYS="${SSH_DIR}/authorized_keys"
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${SSH_DIR}"; touch "${KEYS}"; chmod 600 "${KEYS}"; chown "${DEPLOY_USER}:${DEPLOY_USER}" "${KEYS}"
grep -Fqx "${DEPLOY_KEY}" "${KEYS}" || printf '%s\n' "${DEPLOY_KEY}" >>"${KEYS}"
install -d -m 755 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${BASE}" "${BASE}/releases" "${BASE}/incoming" "${BASE}/shared" "${BASE}/shared/deployment-state"
install -d -m 0700 -o 999 -g 999 "${BASE}/shared/postgres-data"
install -d -m 2770 -o 65532 -g 2000 "${BASE}/shared/media"
install -d -m 2770 -o "${DEPLOY_USER}" -g 2000 "${BASE}/shared/caddy-data" "${BASE}/shared/caddy-config"
ufw allow "${SSH_PORT}/tcp"; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp; ufw --force enable
echo "VM bootstrap complete at ${BASE}; reconnect before checking Docker group membership."
