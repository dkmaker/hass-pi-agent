#!/usr/bin/env bash
# ==============================================================================
# Pi Agent Add-on: Pi entrypoint
# Launches pi inside tmux, spawned by ttyd.
# ==============================================================================
set -e

# Source environment (written by init-pi)
if [[ -f /etc/profile.d/pi-agent.sh ]]; then
    # shellcheck source=/dev/null
    source /etc/profile.d/pi-agent.sh
fi

# Build pi args
declare -a PI_ARGS=()

if [[ -n "${PI_DEFAULT_PROVIDER:-}" ]]; then
    PI_ARGS+=(--provider "${PI_DEFAULT_PROVIDER}")
fi

if [[ -n "${PI_DEFAULT_MODEL:-}" ]]; then
    PI_ARGS+=(--model "${PI_DEFAULT_MODEL}")
fi

echo "Starting Pi Agent..."
echo "Working directory: $(pwd)"
echo ""

exec pi "${PI_ARGS[@]}"
