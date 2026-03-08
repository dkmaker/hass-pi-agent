# Add-on Development Workflow

## Overview

The **Pi Agent for Home Assistant** add-on source lives in `addon/` at the repo root.

| Property | Value |
|----------|-------|
| Add-on name | Pi Agent for Home Assistant |
| Slug | `pi_agent` |
| Supervisor slug | `local_pi_agent` (local add-ons get `local_` prefix) |
| VM path | `/addons/pi_agent/` (SSH) |
| Config | `addon/config.yaml` |

## Deploy

```bash
tools/deploy-addon
```

This script:
1. Cleans `/addons/pi_agent/` on the VM via SSH
2. Copies `addon/*` to the VM via `scp` (no rsync on HAOS)
3. Runs `ha store reload` to tell Supervisor about changes

**Note:** The VM does not have `rsync`. We use `scp` instead.

### First time after deploy

1. Go to http://10.99.0.13:8123 → Settings → Add-ons → Add-on Store
2. Click ⋮ (top right) → Check for updates
3. Scroll to "Local add-ons" → Pi Agent for Home Assistant → Install

Supervisor builds the Docker image locally on the VM from the Dockerfile. This takes a few minutes on first build.

### After code changes

```bash
# Deploy updated source
tools/deploy-addon

# Rebuild the add-on (rebuilds Docker image + restarts)
tools/ha-supervisor addon-rebuild local_pi_agent
```

### Quick restart (no rebuild, e.g. run.sh-only changes after rebuild)

```bash
tools/ha-supervisor addon-restart local_pi_agent
```

## Checking Logs

```bash
# Via REST API (returns recent output, may be truncated)
tools/ha-api addon-logs local_pi_agent

# Via SSH
tools/vm-ctl ssh 'ha apps logs local_pi_agent'
```

**Tip:** The log API truncates long output. For full logs, download from the
HA UI: Settings → Add-ons → Pi Agent → Log tab.

## Add-on Structure (current)

```
addon/
├── config.yaml     # Add-on manifest (name, slug, version, arch, access)
├── Dockerfile      # Alpine base + curl/jq
└── run.sh          # Startup script
```

## Add-on Config (config.yaml)

Current access configuration:

```yaml
homeassistant_api: true       # Core REST + WebSocket API via http://supervisor/core/
hassio_api: true              # Supervisor API via http://supervisor/
hassio_role: admin            # Full admin access to all Supervisor endpoints
auth_api: true                # Can validate HA user credentials
map:
  - homeassistant_config:rw   # /homeassistant — full HA config dir (.storage/, yaml, DB)
  - all_addon_configs:rw      # /addon_configs — all add-ons' config folders
  - ssl:rw                    # /ssl
  - share:rw                  # /share
  - media:rw                  # /media
  - backup:rw                 # /backup
init: false                   # Disable s6 default init (we use our own CMD)
```

## Environment Inside the Container

| Variable | Source | Notes |
|----------|--------|-------|
| `SUPERVISOR_TOKEN` | `/run/s6/container_environment/SUPERVISOR_TOKEN` | NOT in env by default when `init: false`. Must be sourced from s6 container_environment file. |

**Important:** Because `init: false` is set, `$SUPERVISOR_TOKEN` is **not** automatically
injected into the shell environment. Scripts must load it:

```bash
if [ -z "$SUPERVISOR_TOKEN" ] && [ -f /run/s6/container_environment/SUPERVISOR_TOKEN ]; then
  SUPERVISOR_TOKEN=$(cat /run/s6/container_environment/SUPERVISOR_TOKEN)
  export SUPERVISOR_TOKEN
fi
```

## Filesystem Mounts (verified working)

| Container path | Content |
|----------------|---------|
| `/homeassistant` | Full HA config: `configuration.yaml`, `.storage/`, `automations.yaml`, `secrets.yaml`, SQLite DB, blueprints |
| `/homeassistant/.storage/` | All registries: `core.entity_registry`, `core.device_registry`, `core.config_entries`, `auth`, `lovelace.*`, etc. |
| `/addon_configs` | Per-addon config folders (e.g. `45df7312_zigbee2mqtt/`) |
| `/ssl` | SSL certificates |
| `/share` | Shared data between add-ons |
| `/media` | Media files |
| `/backup` | Backup tarballs |
| `/data` | Add-on persistent storage (always mapped, contains `options.json`) |

## API Access (verified working)

All API calls use `Authorization: Bearer $SUPERVISOR_TOKEN`.

| API | URL from inside container | What it does |
|-----|---------------------------|-------------|
| Supervisor | `http://supervisor/` | Add-on management, system info, backups, host, OS, network |
| Core REST | `http://supervisor/core/api/` | Entity states, service calls, history, templates, config check |
| Core WebSocket | `ws://supervisor/core/websocket` | Real-time events, subscriptions, all WebSocket commands |
