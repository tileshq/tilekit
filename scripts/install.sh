#!/usr/bin/env bash
set -euo pipefail

ENV="${TILES_INSTALL_ENV:-prod}" # prod pulls from GitHub releases, anything else prefers local assets
REPO="tilesprivacy/tilekit"
# VERSION="${TILES_VERSION:-latest}"
VERSION="0.1.0"
INSTALL_DIR="$HOME/.local/bin"           # CLI install location
SERVER_DIR="$HOME/.local/share/tiles/server"         # Python server folder
TMPDIR="$(mktemp -d)"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


log() { echo -e "\033[1;36m$*\033[0m"; }
err() { echo -e "\033[1;31m$*\033[0m" >&2; exit 1; }

echo "🔍 Checking Python..."
if ! command -v python3 >/dev/null 2>&1; then
  log "⚠️  Python 3.10+ not found."
  if [[ "$OS" == "darwin" ]]; then
    log "Installing via Homebrew..."
    brew install python || err "Could not install Python automatically. Please install manually."
  elif [[ -f /etc/debian_version ]]; then
    log "Installing via apt..."
    sudo apt-get update -y && sudo apt-get install -y python3 python3-venv
  else
    err "Please install Python manually: https://www.python.org/downloads/"
  fi
fi

echo "🔍 Checking uv..."
if ! command -v uv >/dev/null 2>&1; then
  log "⬇️  Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

log "⬇️  Gathering Tiles (${VERSION}) for ${ARCH}-${OS}..."

LOCAL_BUNDLE="${SCRIPT_DIR}/tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"
ROOT_BUNDLE="${SCRIPT_DIR}/../dist/tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"

if [[ -f "${LOCAL_BUNDLE}" ]]; then
  log "📁 Using bundle next to the installer script."
  cp "${LOCAL_BUNDLE}" "${TMPDIR}/tiles.tar.gz"
elif [[ -f "${ROOT_BUNDLE}" ]]; then
  log "📁 Using bundle from repository dist folder."
  cp "${ROOT_BUNDLE}" "${TMPDIR}/tiles.tar.gz"
elif [[ "${ENV}" == "prod" ]]; then
  TAR_URL="https://github.com/${REPO}/releases/download/${VERSION}/tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"
  curl -fsSL -o "${TMPDIR}/tiles.tar.gz" "$TAR_URL"
else
  err "Could not locate bundle tiles-v${VERSION}-${ARCH}-${OS}.tar.gz."
fi

echo "⬇️ Installing tiles..."
# Lets point to tile repo
tar -xzf "${TMPDIR}/tiles.tar.gz" -C "${TMPDIR}"

log "📦 Installing tiles binary to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
install -m 755 "${TMPDIR}/tiles" "${INSTALL_DIR}/tiles"

log "📦 Installing Python server to ${SERVER_DIR}..."
mkdir -p "${SERVER_DIR}"
cp -r "${TMPDIR}/server"/* "${SERVER_DIR}/"

log "🔧 Setting up Python environment..."
cd "${SERVER_DIR}"
uv sync --frozen || err "Dependency setup failed."

rm -rf "${TMPDIR}"

log "✅ Tiles installed successfully!"
log ""
log "👉 Make sure ${INSTALL_DIR} is in your PATH."
