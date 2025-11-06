#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
BINARY_NAME="tiles"
VERSION=$(grep '^version' "${ROOT_DIR}/Cargo.toml" | head -1 | awk -F'"' '{print $2}')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
BUNDLE_NAME="${BINARY_NAME}-v${VERSION}-${ARCH}-${OS}.tar.gz"
BUNDLE_PATH="${DIST_DIR}/${BUNDLE_NAME}"
ISO_NAME="${BINARY_NAME}-installer-v${VERSION}-${ARCH}-${OS}.iso"
ISO_PATH="${DIST_DIR}/${ISO_NAME}"

log() { echo -e "\033[1;36m$*\033[0m"; }
err() { echo -e "\033[1;31m$*\033[0m" >&2; exit 1; }

log "🚀 Preparing ${BINARY_NAME} bundle (${VERSION})..."
"${ROOT_DIR}/scripts/bundler.sh"

if [[ ! -f "${BUNDLE_PATH}" ]]; then
  err "Expected bundle ${BUNDLE_PATH} was not created."
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

cp "${ROOT_DIR}/scripts/install.sh" "${TMPDIR}/install.sh"
chmod +x "${TMPDIR}/install.sh"
cp "${BUNDLE_PATH}" "${TMPDIR}/${BUNDLE_NAME}"

log "📦 Creating ISO layout..."

ISO_LABEL="tiles-${VERSION}"

create_iso() {
  local src_dir="$1"
  local out_path="$2"
  local label="$3"

  if command -v xorriso >/dev/null 2>&1; then
    xorriso -as mkisofs -quiet -o "${out_path}" -V "${label}" "${src_dir}"
  elif command -v genisoimage >/dev/null 2>&1; then
    genisoimage -quiet -V "${label}" -o "${out_path}" "${src_dir}"
  elif command -v mkisofs >/dev/null 2>&1; then
    mkisofs -quiet -V "${label}" -o "${out_path}" "${src_dir}"
  else
    err "Could not find xorriso, genisoimage, or mkisofs. Please install one of them to build the ISO."
  fi
}

mkdir -p "${DIST_DIR}"
create_iso "${TMPDIR}" "${ISO_PATH}" "${ISO_LABEL}"

log "✅ ISO created: ${ISO_PATH}"
