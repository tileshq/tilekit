#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
BINARY_NAME="Tiles"
VERSION=$(grep '^version' "${ROOT_DIR}/Cargo.toml" | head -1 | awk -F'"' '{print $2}')
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
BUNDLE_NAME="${BINARY_NAME}-v${VERSION}-${ARCH}-${OS}.tar.gz"
BUNDLE_PATH="${DIST_DIR}/${BUNDLE_NAME}"
ISO_NAME="Tiles-installer-v${VERSION}-${ARCH}-${OS}.iso"
ISO_PATH="${DIST_DIR}/${ISO_NAME}"

log() { echo -e "\033[1;36m$*\033[0m"; }
err() { echo -e "\033[1;31m$*\033[0m" >&2; exit 1; }

log "Preparing ${BINARY_NAME} bundle (${VERSION})..."
"${ROOT_DIR}/scripts/bundler.sh"

if [[ ! -f "${BUNDLE_PATH}" ]]; then
  err "Expected bundle ${BUNDLE_PATH} was not created."
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

# Create a hidden subfolder for all installer files (except the app)
INSTALLER_FILES_DIR="${TMPDIR}/.tiles-installer"
mkdir -p "${INSTALLER_FILES_DIR}"

# Copy ASCII art to hidden installer folder if it exists
if [[ -f "${ROOT_DIR}/ascii-art.txt" ]]; then
  cp "${ROOT_DIR}/ascii-art.txt" "${INSTALLER_FILES_DIR}/ascii-art.txt"
  log "Added ASCII art to hidden installer folder"
fi

# Copy installer files to the subfolder
cp "${ROOT_DIR}/scripts/install.sh" "${INSTALLER_FILES_DIR}/install.sh"
chmod +x "${INSTALLER_FILES_DIR}/install.sh"
cp "${BUNDLE_PATH}" "${INSTALLER_FILES_DIR}/${BUNDLE_NAME}"

# Extract and add Tiles.app to the ISO root
log "Extracting Tiles.app from bundle..."
EXTRACT_DIR=$(mktemp -d)
tar -xzf "${BUNDLE_PATH}" -C "${EXTRACT_DIR}"
if [[ -d "${EXTRACT_DIR}/Tiles.app" ]]; then
  cp -r "${EXTRACT_DIR}/Tiles.app" "${TMPDIR}/Tiles.app"
  log "Added Tiles.app to ISO root"
else
  log "Warning: Tiles.app not found in bundle"
fi
rm -rf "${EXTRACT_DIR}"

# For macOS builds, create a .command file and an .app bundle that auto-launches
if [[ "${OS}" == "darwin" ]]; then
  log "Creating macOS auto-launch installer..."
  
  # Create the .command file with logging in the subfolder
  cat > "${INSTALLER_FILES_DIR}/Tiles.command" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${HOME}/Library/Logs/tiles"
LOG_FILE="${LOG_DIR}/install-$(date +%Y%m%d-%H%M%S).log"

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Logging function
log_to_file() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

# Log script start
log_to_file "=== Tiles Installer Started ==="
log_to_file "Script directory: ${SCRIPT_DIR}"
log_to_file "Log file: ${LOG_FILE}"
log_to_file "User: $(whoami)"
log_to_file "System: $(uname -a)"

# Change to script directory
cd "${SCRIPT_DIR}"
log_to_file "Changed directory to: ${SCRIPT_DIR}"

# Check if install.sh exists
if [[ ! -f "./install.sh" ]]; then
  log_to_file "ERROR: install.sh not found in ${SCRIPT_DIR}"
  echo "Error: install.sh not found!" | tee -a "${LOG_FILE}"
  exit 1
fi

log_to_file "Found install.sh, starting installation..."

# Run installer and capture all output
set +e  # Temporarily disable exit on error to capture exit code
./install.sh 2>&1 | tee -a "${LOG_FILE}"
EXIT_CODE=${PIPESTATUS[0]}
set -e  # Re-enable exit on error

if [[ ${EXIT_CODE} -eq 0 ]]; then
  log_to_file "=== Installation Completed Successfully ==="
  echo ""
  echo "Installation complete! Log saved to: ${LOG_FILE}"
else
  log_to_file "=== Installation Failed with exit code: ${EXIT_CODE} ==="
  echo ""
  echo "Installation failed. Check log: ${LOG_FILE}"
  exit ${EXIT_CODE}
fi
EOF
  chmod +x "${INSTALLER_FILES_DIR}/Tiles.command"
  
  # Create AppleScript application bundle at the root level
  log "Creating AppleScript application bundle..."
  APP_DIR="${TMPDIR}/Tiles.app"
  mkdir -p "${APP_DIR}/Contents/MacOS"
  mkdir -p "${APP_DIR}/Contents/Resources"
  
  # Copy icon if it exists
  if [[ -f "${ROOT_DIR}/tiles_icon.icns" ]]; then
    cp "${ROOT_DIR}/tiles_icon.icns" "${APP_DIR}/Contents/Resources/tiles_icon.icns"
    log "Added icon to app bundle"
  fi
  
  # Create Info.plist
  cat > "${APP_DIR}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>installer</string>
    <key>CFBundleIdentifier</key>
    <string>com.tiles.installer</string>
    <key>CFBundleName</key>
    <string>Tiles</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleIconFile</key>
    <string>tiles_icon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST
  
  # Create the executable script that runs the installer automatically
  # The app bundle will be in the same directory as Tiles.command
  cat > "${APP_DIR}/Contents/MacOS/installer" << 'APPSCRIPT'
#!/usr/bin/env bash
set -euo pipefail

# Find the directory containing this app bundle (the mounted volume root)
# App bundle structure: Tiles.app/Contents/MacOS/installer
# So we go up 2 levels to get to the app bundle, then up 1 more to get to volume root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"  # .../Tiles.app/Contents/MacOS
APP_BUNDLE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"  # .../Tiles.app
VOLUME_DIR="$(dirname "${APP_BUNDLE_DIR}")"  # .../ (volume root)
# Look for Tiles.command in the hidden installer subfolder
COMMAND_FILE="${VOLUME_DIR}/.tiles-installer/Tiles.command"

# Log directory for app launches
LOG_DIR="${HOME}/Library/Logs/tiles"
mkdir -p "${LOG_DIR}"
APP_LOG="${LOG_DIR}/app-launch-$(date +%Y%m%d-%H%M%S).log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tiles.app launched" >> "${APP_LOG}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Volume directory: ${VOLUME_DIR}" >> "${APP_LOG}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Command file: ${COMMAND_FILE}" >> "${APP_LOG}"

# If command file exists in the hidden installer folder, run it automatically
if [[ -f "${COMMAND_FILE}" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found Tiles.command, launching installer..." >> "${APP_LOG}"
  # Use AppleScript to open Terminal and run the installer automatically
  INSTALLER_DIR="${VOLUME_DIR}/.tiles-installer"
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '${INSTALLER_DIR}' && './Tiles.command'"
end tell
EOF
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Installer launched successfully" >> "${APP_LOG}"
else
  # Fallback: try to find it in mounted volumes
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Command file not found, searching mounted volumes..." >> "${APP_LOG}"
  FOUND=0
  for vol in /Volumes/tiles-*; do
    if [[ -d "$vol/.tiles-installer" ]] && [[ -f "$vol/.tiles-installer/Tiles.command" ]]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found installer in ${vol}/.tiles-installer" >> "${APP_LOG}"
      osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '${vol}/.tiles-installer' && './Tiles.command'"
end tell
EOF
      FOUND=1
      exit 0
    elif [[ -f "$vol/Tiles.command" ]]; then
      # Also check root level for backwards compatibility
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found installer in ${vol} (root level)" >> "${APP_LOG}"
      osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '${vol}' && './Tiles.command'"
end tell
EOF
      FOUND=1
      exit 0
    fi
  done
  
  # Error if not found
  if [[ ${FOUND} -eq 0 ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Tiles.command not found" >> "${APP_LOG}"
    osascript <<EOF
tell application "Terminal"
  activate
  do script "echo 'Error: Tiles.command not found.'; echo 'Please navigate to the mounted volume and run Tiles.command manually.'; echo ''; echo 'Log file: ${APP_LOG}'"
end tell
EOF
    exit 1
  fi
fi
APPSCRIPT
  chmod +x "${APP_DIR}/Contents/MacOS/installer"
fi

# Create README at root level with ASCII art (reading from hidden folder)
if [[ -f "${INSTALLER_FILES_DIR}/ascii-art.txt" ]]; then
  cat > "${TMPDIR}/README.txt" << EOF
$(cat "${INSTALLER_FILES_DIR}/ascii-art.txt")

Welcome to Tiles Installer!

INSTALLATION:
Double-click "Tiles.app" to start the installation.

The installer will automatically:
- Check for Python and uv dependencies
- Download and install the Tiles binary
- Set up the Python server environment  
- Save installation logs to ~/Library/Logs/tiles/

Installation logs are saved with timestamps for troubleshooting.

For manual installation, open Terminal and run:
  cd /Volumes/tiles-${VERSION}/.tiles-installer
  ./Tiles.command
EOF
  log "Created README.txt with ASCII art at root"
else
  # Fallback README without ASCII art if file not found
  cat > "${TMPDIR}/README.txt" << 'README'
Welcome to Tiles Installer!

INSTALLATION:
Double-click "Tiles.app" to start the installation.

The installer will automatically:
- Check for Python and uv dependencies
- Download and install the Tiles binary
- Set up the Python server environment  
- Save installation logs to ~/Library/Logs/tiles/

Installation logs are saved with timestamps for troubleshooting.

For manual installation, open Terminal and run:
  cd /Volumes/tiles-<version>/.tiles-installer
  ./Tiles.command
README
fi

log "Creating ISO layout..."

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

log "ISO created: ${ISO_PATH}"
