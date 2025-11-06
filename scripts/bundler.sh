#!/usr/bin/env bash
set -euo pipefail

BINARY_NAME="tiles"
DIST_DIR="dist"
SERVER_DIR="server"
TARGET="release"

VERSION=$(grep '^version' Cargo.toml | head -1 | awk -F'"' '{print $2}')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
OUT_NAME="${BINARY_NAME}-v${VERSION}-${ARCH}-${OS}"
ISO_VOLUME_NAME="Tiles_${VERSION}"

mkdir -p "${DIST_DIR}"
rm -f "${DIST_DIR}/${OUT_NAME}.tar.gz" "${DIST_DIR}/${OUT_NAME}.iso"
rm -rf "${DIST_DIR}/tmp"

echo "🚀 Building ${BINARY_NAME} (${TARGET} mode)..."
cargo build --${TARGET}

mkdir -p "${DIST_DIR}/tmp"
cp "target/${TARGET}/${BINARY_NAME}" "${DIST_DIR}/tmp/"
cp -r "${SERVER_DIR}" "${DIST_DIR}/tmp/"

rm -rf "${DIST_DIR}/tmp/server/__pycache__"
rm -rf "${DIST_DIR}/tmp/server/.venv"

echo "📦 Creating ${OUT_NAME}.tar.gz..."
tar -czf "${DIST_DIR}/${OUT_NAME}.tar.gz" -C "${DIST_DIR}/tmp" .

create_iso() {
  pushd "${DIST_DIR}/tmp" >/dev/null
  if command -v genisoimage >/dev/null 2>&1; then
    genisoimage -quiet -o "../${OUT_NAME}.iso" -V "${ISO_VOLUME_NAME}" -R -J .
  elif command -v mkisofs >/dev/null 2>&1; then
    mkisofs -quiet -o "../${OUT_NAME}.iso" -V "${ISO_VOLUME_NAME}" -R -J .
  elif [[ "${OS}" == "darwin" ]] && command -v hdiutil >/dev/null 2>&1; then
    hdiutil makehybrid -iso -joliet -default-volume-name "${ISO_VOLUME_NAME}" -o "../${OUT_NAME}.iso" . >/dev/null
  else
    popd >/dev/null
    echo "❌ Unable to create ISO image. Install 'genisoimage' (Linux) or ensure 'hdiutil' is available on macOS." >&2
    exit 1
  fi
  popd >/dev/null
}

echo "💿 Creating ${OUT_NAME}.iso..."
create_iso

rm -rf "${DIST_DIR}/tmp"

echo "✅ Bundle created: ${DIST_DIR}/${OUT_NAME}.tar.gz"
echo "✅ Bundle created: ${DIST_DIR}/${OUT_NAME}.iso"
