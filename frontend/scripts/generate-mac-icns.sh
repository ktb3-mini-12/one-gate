#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_PNG="${ROOT_DIR}/resources/icon.png"
OUT_ICNS="${ROOT_DIR}/build/icon.icns"
OUT_PNG="${ROOT_DIR}/build/icon.png"

if [[ ! -f "${SRC_PNG}" ]]; then
  echo "Missing source icon: ${SRC_PNG}" >&2
  exit 1
fi

HAS_ALPHA="$(/usr/bin/sips -g hasAlpha "${SRC_PNG}" 2>/dev/null | awk -F': ' '/hasAlpha/ {print $2}')"
if [[ "${HAS_ALPHA}" != "yes" ]]; then
  echo "iconutil requires PNGs with an alpha channel, but this file hasAlpha=${HAS_ALPHA}:" >&2
  echo "  ${SRC_PNG}" >&2
  echo "Re-export the icon as a 1024x1024 PNG with transparency (RGBA), then re-run:" >&2
  echo "  npm run icons:mac" >&2
  exit 1
fi

TMP_BASE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/onegate-icons.XXXXXX")"
ICONSET_DIR="${TMP_BASE_DIR}/OneGate.iconset"
mkdir -p "${ICONSET_DIR}"
trap 'rm -rf "${TMP_BASE_DIR}"' EXIT

cp "${SRC_PNG}" "${OUT_PNG}"

make_icon() {
  local size="$1"
  local filename="$2"
  /usr/bin/sips -z "${size}" "${size}" "${SRC_PNG}" --out "${ICONSET_DIR}/${filename}" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png

/usr/bin/iconutil -c icns "${ICONSET_DIR}" -o "${OUT_ICNS}"
echo "Wrote ${OUT_ICNS}"
