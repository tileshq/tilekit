#!/usr/bin/env bash
# Build Tiles Agent.app bundle
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"
DIST_DIR="${ROOT_DIR}/dist"
APP_NAME="Tiles Agent"
APP_DIR="${DIST_DIR}/${APP_NAME}.app"

echo "Building ${APP_NAME}.app..."

# Clean and create app bundle structure
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Copy icon if available
if [[ -f "${ROOT_DIR}/tiles_icon.icns" ]]; then
    cp "${ROOT_DIR}/tiles_icon.icns" "${APP_DIR}/Contents/Resources/AppIcon.icns"
fi

# Create Info.plist
cat > "${APP_DIR}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Tiles Agent</string>
    <key>CFBundleIdentifier</key>
    <string>com.tiles.agent</string>
    <key>CFBundleName</key>
    <string>Tiles Agent</string>
    <key>CFBundleDisplayName</key>
    <string>Tiles</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSBackgroundOnly</key>
    <false/>
</dict>
</plist>
PLIST

# Create the executable that runs the agent script
cat > "${APP_DIR}/Contents/MacOS/Tiles Agent" << 'AGENT'
#!/usr/bin/env bash
set -euo pipefail

# Find the agent script
TILES_DIR="$HOME/.tiles"
AGENT_SCRIPT="${TILES_DIR}/tiles-agent.sh"

# Log file
LOG_FILE="${TILES_DIR}/agent.log"
mkdir -p "${TILES_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tiles Agent.app launched" >> "${LOG_FILE}"

# Check if agent script exists
if [[ ! -f "${AGENT_SCRIPT}" ]]; then
    osascript -e 'display alert "Tiles Agent Error" message "Agent script not found. Please reinstall Tiles." as critical'
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Agent script not found at ${AGENT_SCRIPT}" >> "${LOG_FILE}"
    exit 1
fi

# Run the agent script
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting agent script" >> "${LOG_FILE}"
bash "${AGENT_SCRIPT}"
AGENT

chmod +x "${APP_DIR}/Contents/MacOS/Tiles Agent"

# Copy the agent script to dist for installation
cp "${SCRIPT_DIR}/tiles-agent.sh" "${DIST_DIR}/tiles-agent.sh"
chmod +x "${DIST_DIR}/tiles-agent.sh"

echo "✓ ${APP_NAME}.app created at ${APP_DIR}"
echo "✓ Agent script ready at ${DIST_DIR}/tiles-agent.sh"

