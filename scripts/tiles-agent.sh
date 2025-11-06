#!/usr/bin/env bash
# Tiles Agent - Keeps the Tiles dock icon alive while models are running
set -euo pipefail

# Configuration
TILES_DIR="$HOME/.tiles"
MODELS_FILE="${TILES_DIR}/models.json"
AGENT_PID_FILE="${TILES_DIR}/agent.pid"
CHECK_INTERVAL=5

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "${TILES_DIR}/agent.log"
}

log "Tiles Agent started (PID: $$)"

# Save our PID
echo $$ > "${AGENT_PID_FILE}"

# Cleanup on exit
cleanup() {
    log "Tiles Agent shutting down"
    rm -f "${AGENT_PID_FILE}"
    exit 0
}
trap cleanup EXIT INT TERM

# Function to check if any models are running
has_running_models() {
    if [[ ! -f "${MODELS_FILE}" ]]; then
        return 1
    fi
    
    # Check if models.json has any entries
    local model_count=$(cat "${MODELS_FILE}" | grep -c '"name"' || echo "0")
    [[ ${model_count} -gt 0 ]]
}

# Function to check if processes are still alive
check_processes() {
    if [[ ! -f "${MODELS_FILE}" ]]; then
        return 1
    fi
    
    # Extract PIDs from models.json and check if any are running
    local pids=$(cat "${MODELS_FILE}" | grep '"pid"' | grep -o '[0-9]\+' || echo "")
    
    if [[ -z "${pids}" ]]; then
        return 1
    fi
    
    for pid in ${pids}; do
        if kill -0 "${pid}" 2>/dev/null; then
            return 0  # At least one process is running
        fi
    done
    
    return 1  # No processes are running
}

# Main loop - keep running while models exist
log "Starting monitoring loop"

while true; do
    if ! has_running_models || ! check_processes; then
        log "No running models detected, shutting down agent"
        break
    fi
    
    sleep ${CHECK_INTERVAL}
done

log "Agent exiting normally"

