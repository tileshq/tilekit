#!/usr/bin/env bash
set -euo pipefail

BINARY_NAME="Tiles"
DIST_DIR="dist"
SERVER_DIR="server"
TARGET="release"

VERSION=$(grep '^version' Cargo.toml | head -1 | awk -F'"' '{print $2}')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
OUT_NAME="${BINARY_NAME}-v${VERSION}-${ARCH}-${OS}"

echo "Building ${BINARY_NAME} (${TARGET} mode)..."
cargo build --${TARGET}

# Build Tiles Agent.app for macOS
if [[ "${OS}" == "darwin" ]]; then
    echo "Building Tiles Agent.app..."
    bash scripts/build-agent-app.sh
fi

mkdir -p "${DIST_DIR}/tmp"
cp "target/${TARGET}/${BINARY_NAME}" "${DIST_DIR}/tmp/"
cp -r "${SERVER_DIR}" "${DIST_DIR}/tmp/"

# Add agent files for macOS
if [[ "${OS}" == "darwin" ]] && [[ -d "${DIST_DIR}/Tiles Agent.app" ]]; then
    cp -r "${DIST_DIR}/Tiles Agent.app" "${DIST_DIR}/tmp/"
    cp "${DIST_DIR}/tiles-agent.sh" "${DIST_DIR}/tmp/"
fi

rm -rf "${DIST_DIR}/tmp/server/__pycache__"
rm -rf "${DIST_DIR}/tmp/server/.venv"

echo "Creating ${OUT_NAME}.tar.gz..."
tar -czf "${DIST_DIR}/${OUT_NAME}.tar.gz" -C "${DIST_DIR}/tmp" .

rm -rf "${DIST_DIR}/tmp"

echo "Bundle created: ${DIST_DIR}/${OUT_NAME}.tar.gz"
