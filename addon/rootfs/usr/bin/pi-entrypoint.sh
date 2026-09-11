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

# Load HA extension from container image
PI_ARGS+=(--extension /opt/ha-extension)

if [[ -n "${PI_DEFAULT_PROVIDER:-}" ]]; then
    PI_ARGS+=(--provider "${PI_DEFAULT_PROVIDER}")
fi

if [[ -n "${PI_DEFAULT_MODEL:-}" ]]; then
    PI_ARGS+=(--model "${PI_DEFAULT_MODEL}")
fi

# Work from the agent scratch dir (created by init-pi). Belt-and-suspenders —
# ttyd already cd's here, but ensure it even if the session dir differs.
cd /homeassistant/agent 2>/dev/null || true

# Resume the previous session if one exists in the session store, so the
# interactive terminal continues where it left off instead of starting fresh.
SESSION_DIR="${PI_CODING_AGENT_DIR:-/data/pi-agent}/sessions"
if [[ -d "${SESSION_DIR}" ]] && find "${SESSION_DIR}" -type f -print -quit 2>/dev/null | grep -q .; then
    PI_ARGS+=(--continue)
    echo "Found existing session — resuming with --continue"
fi

echo "Starting Pi Agent..."
echo "Working directory: $(pwd)"
echo ""

exec pi "${PI_ARGS[@]}"
