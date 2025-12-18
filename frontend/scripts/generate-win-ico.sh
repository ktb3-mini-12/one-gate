#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_PNG="${ROOT_DIR}/resources/icon.png"
OUT_ICO="${ROOT_DIR}/build/icon.ico"

if [[ ! -f "${SRC_PNG}" ]]; then
  echo "Missing source icon: ${SRC_PNG}" >&2
  exit 1
fi

# Check for alpha channel
HAS_ALPHA="$(/usr/bin/sips -g hasAlpha "${SRC_PNG}" 2>/dev/null | awk -F': ' '/hasAlpha/ {print $2}')"
if [[ "${HAS_ALPHA}" != "yes" ]]; then
  echo "Windows icon generation requires PNG with alpha channel" >&2
  exit 1
fi

# Create temporary directory
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/onegate-ico.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

# Generate Windows icon sizes
echo "Generating Windows icon sizes..."
/usr/bin/sips -z 16 16 "${SRC_PNG}" --out "${TMP_DIR}/icon-16.png" >/dev/null
/usr/bin/sips -z 32 32 "${SRC_PNG}" --out "${TMP_DIR}/icon-32.png" >/dev/null
/usr/bin/sips -z 48 48 "${SRC_PNG}" --out "${TMP_DIR}/icon-48.png" >/dev/null
/usr/bin/sips -z 64 64 "${SRC_PNG}" --out "${TMP_DIR}/icon-64.png" >/dev/null
/usr/bin/sips -z 128 128 "${SRC_PNG}" --out "${TMP_DIR}/icon-128.png" >/dev/null
/usr/bin/sips -z 256 256 "${SRC_PNG}" --out "${TMP_DIR}/icon-256.png" >/dev/null

# Convert to ICO using png-to-ico (via npx)
echo "Converting to ICO format..."
npx --yes png-to-ico@2 \
  "${TMP_DIR}/icon-16.png" \
  "${TMP_DIR}/icon-32.png" \
  "${TMP_DIR}/icon-48.png" \
  "${TMP_DIR}/icon-64.png" \
  "${TMP_DIR}/icon-128.png" \
  "${TMP_DIR}/icon-256.png" \
  > "${OUT_ICO}"

echo "Wrote ${OUT_ICO}"
