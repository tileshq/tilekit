#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Tiles Installer
# ============================================================================

# Terminal setup
TERM_WIDTH=${COLUMNS:-80}
if command -v tput >/dev/null 2>&1; then
  TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)
fi
[[ $TERM_WIDTH -lt 60 ]] && TERM_WIDTH=80

# Display ASCII art if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Look in the current directory (hidden installer folder)
ASCII_ART_FILE="${SCRIPT_DIR}/ascii-art.txt"
if [[ ! -f "${ASCII_ART_FILE}" ]]; then
  # Fallback to parent directory
  ASCII_ART_FILE="${SCRIPT_DIR}/../ascii-art.txt"
fi
if [[ ! -f "${ASCII_ART_FILE}" ]]; then
  # Fallback to volume root
  VOLUME_ROOT="$(dirname "${SCRIPT_DIR}")"
  ASCII_ART_FILE="${VOLUME_ROOT}/ascii-art.txt"
fi
if [[ -f "${ASCII_ART_FILE}" ]]; then
  cat "${ASCII_ART_FILE}"
  echo ""
fi

# Configuration
ENV="${TILES_INSTALL_ENV:-prod}"
REPO="tilesprivacy/tilekit"
VERSION="0.1.0"
INSTALL_DIR="$HOME/.local/bin"
SERVER_DIR="$HOME/.tiles/server"
TMPDIR="$(mktemp -d)"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# ============================================================================
# UI Functions
# ============================================================================

# Print functions with color support
print_header() {
  echo ""
  echo -e "\033[1;36m================================================================================\033[0m"
  echo -e "\033[1;37m$*\033[0m"
  echo -e "\033[1;36m================================================================================\033[0m"
  echo ""
}

print_step() {
  echo -e "\033[1;36m>\033[0m $*"
}

print_success() {
  echo -e "\033[1;32m[OK]\033[0m $*"
}

print_warning() {
  echo -e "\033[1;33m[!]\033[0m $*"
}

print_error() {
  echo -e "\033[1;31m[ERROR]\033[0m $*" >&2
}

print_info() {
  echo -e "\033[0;90m  $*\033[0m"
}

wrap_text() {
  local text="$1"
  local prefix="${2:-  }"
  local width=$((TERM_WIDTH - ${#prefix}))
  echo "$text" | fold -s -w "$width" | sed "s/^/$prefix/"
}

print_section() {
  echo ""
  echo -e "\033[1;37m[ $* ]\033[0m"
}

print_section_end() {
  echo -e "\033[1;37m------------------------------------------------------------\033[0m"
  echo ""
}

log() { 
  echo -e "\033[1;36m$*\033[0m"
}

err() { 
  print_error "$*"
  echo ""
  exit 1
}

# ============================================================================
# Main Installation
# ============================================================================

print_header "Tiles Installer v${VERSION}"

wrap_text "This installer will set up Tiles on your system, including the CLI tool and Python server environment." "  "
echo ""

# ----------------------------------------------------------------------------
# Check Dependencies
# ----------------------------------------------------------------------------

print_section "Checking Dependencies"

print_step "Checking Python installation..."
if command -v python3 >/dev/null 2>&1; then
  PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
  print_success "Python ${PY_VERSION} found"
else
  print_warning "Python 3.10+ not found"
  
  if [[ "$OS" == "darwin" ]]; then
    print_info "Installing Python via Homebrew..."
    brew install python || err "Could not install Python. Please install manually from https://www.python.org"
  elif [[ -f /etc/debian_version ]]; then
    print_info "Installing Python via apt..."
    sudo apt-get update -y && sudo apt-get install -y python3 python3-venv
  else
    err "Please install Python manually: https://www.python.org/downloads/"
  fi
  
  print_success "Python installed"
fi

print_step "Checking uv package manager..."
if command -v uv >/dev/null 2>&1; then
  UV_VERSION=$(uv --version 2>&1 | awk '{print $2}')
  print_success "uv ${UV_VERSION} found"
else
  print_info "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  print_success "uv installed"
fi

print_section_end

# ----------------------------------------------------------------------------
# Download/Locate Tiles
# ----------------------------------------------------------------------------

print_section "Gathering Tiles Bundle"

print_step "Looking for Tiles v${VERSION} (${ARCH}-${OS})..."

LOCAL_BUNDLE="${SCRIPT_DIR}/Tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"
ROOT_BUNDLE="${SCRIPT_DIR}/../dist/Tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"

if [[ -f "${LOCAL_BUNDLE}" ]]; then
  print_info "Found local bundle"
  cp "${LOCAL_BUNDLE}" "${TMPDIR}/tiles.tar.gz"
  print_success "Bundle located"
elif [[ -f "${ROOT_BUNDLE}" ]]; then
  print_info "Found bundle in repository"
  cp "${ROOT_BUNDLE}" "${TMPDIR}/tiles.tar.gz"
  print_success "Bundle located"
elif [[ "${ENV}" == "prod" ]]; then
  print_info "Downloading from GitHub releases..."
  TAR_URL="https://github.com/${REPO}/releases/download/${VERSION}/Tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"
  
  if curl -fsSL -o "${TMPDIR}/Tiles.tar.gz" "$TAR_URL"; then
    print_success "Bundle downloaded"
  else
    err "Failed to download bundle from ${TAR_URL}"
  fi
else
  err "Could not locate bundle Tiles-v${VERSION}-${ARCH}-${OS}.tar.gz"
fi

print_step "Extracting bundle..."
tar -xzf "${TMPDIR}/Tiles.tar.gz" -C "${TMPDIR}"
print_success "Bundle extracted"

print_section_end

# ----------------------------------------------------------------------------
# Install Tiles
# ----------------------------------------------------------------------------

print_section "Installing Components"

print_step "Installing CLI binary..."
print_info "Location: ${INSTALL_DIR}/Tiles"
mkdir -p "${INSTALL_DIR}"
install -m 755 "${TMPDIR}/Tiles" "${INSTALL_DIR}/Tiles"
print_success "CLI binary installed"

print_step "Installing Python server..."
print_info "Location: ${SERVER_DIR}"
mkdir -p "${SERVER_DIR}"
cp -r "${TMPDIR}/server"/* "${SERVER_DIR}/"
print_success "Server files installed"

print_step "Setting up Python environment..."
print_info "Installing dependencies with uv..."
cd "${SERVER_DIR}"
if uv sync --frozen; then
  print_success "Python environment ready"
else
  err "Failed to set up Python environment"
fi

# Install Tiles Agent for macOS
if [[ "${OS}" == "darwin" ]] && [[ -d "${TMPDIR}/Tiles Agent.app" ]]; then
  print_step "Installing Tiles Agent..."
  mkdir -p "${HOME}/Applications"
  rm -rf "${HOME}/Applications/Tiles Agent.app"
  cp -r "${TMPDIR}/Tiles Agent.app" "${HOME}/Applications/"
  
  # Install agent script
  mkdir -p "${HOME}/.tiles"
  cp "${TMPDIR}/tiles-agent.sh" "${HOME}/.tiles/tiles-agent.sh"
  chmod +x "${HOME}/.tiles/tiles-agent.sh"
  
  print_success "Tiles Agent installed to ~/Applications"
fi

print_section_end

# Cleanup
rm -rf "${TMPDIR}"

# ============================================================================
# Installation Complete
# ============================================================================

print_header "Installation Complete"

print_success "Tiles v${VERSION} installed successfully!"
echo ""

wrap_text "The Tiles CLI has been installed to ${INSTALL_DIR}. Make sure this directory is in your PATH to use the 'Tiles' command." "  "
echo ""

# Display PATH setup instructions if needed
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  print_warning "Setup Required"
  echo ""
  wrap_text "Add the following line to your shell configuration file (~/.bashrc, ~/.zshrc, or ~/.profile):" "  "
  echo ""
  echo -e "\033[1;37m    export PATH=\"\$HOME/.local/bin:\$PATH\"\033[0m"
  echo ""
  wrap_text "Then reload your shell or run: source ~/.zshrc" "  "
  echo ""
fi

# Display help
print_section "Getting Started"

export PATH="${INSTALL_DIR}:${PATH}"
if command -v Tiles >/dev/null 2>&1; then
  Tiles --help 2>/dev/null || "${INSTALL_DIR}/Tiles" --help 2>/dev/null || true
else
  "${INSTALL_DIR}/Tiles" --help 2>/dev/null || true
fi

print_section_end

wrap_text "For more information, visit the documentation or run 'Tiles --help' at any time." "  "
echo ""

# Show recommended tools
print_section "Recommended Setup"
echo ""
wrap_text "For the best experience with Tiles, we recommend:" "  "
echo ""
echo -e "  \033[1;36m•\033[0m \033[1;37mTailscale\033[0m - Access your Tiles instance securely from anywhere"
echo -e "    https://tailscale.com"
echo ""
echo -e "  \033[1;36m•\033[0m \033[1;37mAmphetamine\033[0m (macOS) - Keep your Mac awake when running models"
echo -e "    https://amphetamine.en.softonic.com/mac"
echo ""
echo -e "  \033[1;36m•\033[0m \033[1;37mrsync\033[0m - Sync your memory and data across devices"
echo -e "    https://rsync.samba.org"
echo ""
wrap_text "These tools ensure your models stay accessible, responsive, and synced 24/7." "  "
echo ""
print_section_end
