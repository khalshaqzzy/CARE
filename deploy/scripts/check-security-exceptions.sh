#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Usage: check-security-exceptions.sh <registry.json>" >&2; exit 1; }
REGISTRY="$1"; [[ -s "${REGISTRY}" ]] || { echo "Security exception registry missing." >&2; exit 1; }; command -v jq >/dev/null
today="$(date -u +%F)"
jq -e --arg today "${today}" 'type=="array" and (length==(unique_by([.scanner,.id])|length)) and all(.[]; (.scanner|type=="string" and length>0) and (.id|type=="string" and length>0 and ((contains("*") or contains("?"))|not)) and (.rationale|type=="string" and length>=20) and (.expiresOn|test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) and .expiresOn >= $today)' "${REGISTRY}" >/dev/null || { echo "Security exceptions must be exact, justified, and unexpired." >&2; exit 1; }
registry_has() { jq -e --arg scanner "$1" --arg id "$2" 'any(.[];.scanner==$scanner and .id==$id)' "${REGISTRY}" >/dev/null; }
for unsupported in .trivyignore.yaml .trivyignore.yml; do [[ ! -e "${unsupported}" ]] || { echo "Use exact IDs in .trivyignore." >&2; exit 1; }; done
if [[ -f .trivyignore ]]; then while IFS= read -r id; do [[ -z "${id}" || "${id}" == \#* ]] && continue; [[ "${id}" != *'*'* && "${id}" != *'?'* && "${id}" != *:* ]] || { echo "Invalid Trivy exception." >&2; exit 1; }; registry_has trivy "${id}" || { echo "Unregistered Trivy exception: ${id}" >&2; exit 1; }; done <.trivyignore; fi
echo "Security exception registry is valid."
