# Home Assistant — Local Development Environment

This project is the development workspace for **Pi Agent for Home Assistant**, a Home Assistant add-on that gives the Pi coding agent full access to manage all aspects of a Home Assistant installation via APIs and direct filesystem access.

**Source repo**: `git@github.com:dkmaker/hass-claude-code.git`

## Project Structure

```
.
├── AGENTS.md                   # This file — project context for the agent
├── addon/                      # The HA add-on source
│   ├── config.yaml             # Add-on manifest (name, version, arch, access)
│   ├── Dockerfile              # Alpine base image
│   └── run.sh                  # Startup script
├── .env                        # API token + VM config + Pi extension overrides (gitignored)
├── ha-core/                    # Shallow clone of github.com/home-assistant/core (gitignored)
│   └── homeassistant/
│       └── components/         # ALL HA component source — schemas, storage, services
├── .pi/
│   ├── extensions/
│   │   └── home-assistant/     # Pi extension: custom tools for HA management
│   │       ├── index.ts        # Extension entry point
│   │       ├── lib/            # Shared libraries (config, backup, storage, config-check)
│   │       ├── tools/          # Tool implementations (ha-helpers, etc.)
│   │       └── docs/           # Storage schemas reference
│   └── skills/
│       └── ha-dev/             # Unified skill: API, VM, deploy, docs
│           ├── SKILL.md        # Slim router — read this first
│           ├── scripts/        # All executable tools
│           │   ├── ha-api      # HA REST API CLI
│           │   ├── ha-supervisor # Supervisor API CLI (via WebSocket)
│           │   ├── vm-ctl      # VM lifecycle (start/stop/ssh/destroy)
│           │   ├── deploy-addon # SCP addon/ to VM + store reload
│           │   └── setup-vm    # One-shot VM creation
│           └── docs/           # Workflow documentation
│               ├── api-reference.md
│               ├── supervisor-reference.md
│               ├── vm-management.md
│               ├── addon-workflow.md
│               └── documentation.md
├── docs/
│   └── homeassistant/          # Local mirror of HA documentation (markdown)
│       ├── developer/          # ~289 files — add-on dev, API, core, entity platforms
│       └── user/               # ~1,601 files — config, automations, integrations, dashboards
└── repository.yaml             # HA add-on repository manifest
```

## Add-on: Pi Agent for Home Assistant

| Property | Value |
|----------|-------|
| Name | Pi Agent for Home Assistant |
| Slug | `pi_agent` |
| Supervisor slug | `local_pi_agent` |
| Source | `addon/` |

### Add-on Access (verified working)

The add-on has full access to Home Assistant:

| Access | How |
|--------|-----|
| **Supervisor API** (admin) | `http://supervisor/` with `$SUPERVISOR_TOKEN` |
| **Core REST API** | `http://supervisor/core/api/` with `$SUPERVISOR_TOKEN` |
| **Core WebSocket** | `ws://supervisor/core/websocket` with `$SUPERVISOR_TOKEN` |
| **HA config dir (R/W)** | `/homeassistant` — includes `.storage/`, yaml files, SQLite DB |
| **All addon configs (R/W)** | `/addon_configs` |
| **SSL, share, media, backup** | `/ssl`, `/share`, `/media`, `/backup` — all R/W |
| **Auth API** | Can validate HA user credentials |

**Token note:** `$SUPERVISOR_TOKEN` is NOT in the shell env by default (because `init: false`).
Must be loaded from `/run/s6/container_environment/SUPERVISOR_TOKEN`.

## Local Dev VM

A Home Assistant OS VM runs locally via KVM/libvirt on an **isolated network** that prevents HA from discovering real devices on the host's LAN.

| Property | Value |
|----------|-------|
| VM name | `haos-dev` |
| Network | `haos-isolated` (10.99.0.0/24, NAT for internet, no LAN bridge) |
| VM IP | `10.99.0.13` |
| HA URL | http://10.99.0.13:8123 |
| HA version | 2026.3.1 |
| HAOS version | 17.1 |
| Supervisor | 2026.02.3 |
| API token | stored in `.env` (`HAOS_API_TOKEN`) |
| SSH | `root@10.99.0.13` port 22 (via Terminal & SSH add-on) |
| Samba | `homeassistant`/`homeassistant` — shares: config, addons, addon_configs, ssl, share, backup, media |

### VM Management

```bash
.pi/skills/ha-dev/scripts/vm-ctl start       # Boot VM
.pi/skills/ha-dev/scripts/vm-ctl stop        # Graceful shutdown
.pi/skills/ha-dev/scripts/vm-ctl status      # Info + IP
.pi/skills/ha-dev/scripts/vm-ctl ssh [cmd]   # SSH into HAOS (port 22)
.pi/skills/ha-dev/scripts/vm-ctl destroy     # Delete VM + disk
```

### Samba Mounts (for local filesystem access during development)

```bash
sudo mount -t cifs //10.99.0.13/config /mnt/ha-config -o username=homeassistant,password=homeassistant,vers=3.0
sudo mount -t cifs //10.99.0.13/addons /mnt/ha-addons -o username=homeassistant,password=homeassistant,vers=3.0
```

**Note:** Samba shares are read-only for writes from the dev host. Use SSH/SCP for deploying files.

### Network Isolation

The `haos-isolated` libvirt network uses a virtual bridge (`virbr-haos`) on a private subnet. It is **not bridged** to the host's physical NIC, so:
- HA cannot see mDNS/SSDP/UPnP broadcasts from the real LAN
- HA cannot discover real smart home devices
- The VM can still reach the internet via NAT (for installing add-ons, pulling images)
- The host can reach the VM at `10.99.0.13`

## Add-on Development Workflow

1. **Edit** code in `addon/`
2. **Deploy** to the VM:
   ```bash
   .pi/skills/ha-dev/scripts/deploy-addon
   ```
   This uses `scp` (no rsync on HAOS) to copy files to `/addons/pi_agent/` and runs `ha store reload`.
3. **First time install**: HA UI → Settings → Add-ons → Add-on Store → ⋮ Check for updates → Local add-ons → Pi Agent for Home Assistant → Install
4. **Rebuild** after code changes:
   ```bash
   .pi/skills/ha-dev/scripts/ha-supervisor addon-rebuild local_pi_agent
   ```
5. **Check logs**:
   ```bash
   .pi/skills/ha-dev/scripts/ha-api addon-logs local_pi_agent
   ```

## Skill: `ha-dev`

One unified skill for everything. Read `.pi/skills/ha-dev/SKILL.md` for the router, then the relevant `docs/*.md` file.

```bash
# REST API
.pi/skills/ha-dev/scripts/ha-api health
.pi/skills/ha-dev/scripts/ha-api states sun
.pi/skills/ha-dev/scripts/ha-api call light turn_on '{"entity_id":"light.x"}'

# Supervisor API (via WebSocket)
.pi/skills/ha-dev/scripts/ha-supervisor info
.pi/skills/ha-dev/scripts/ha-supervisor addons
.pi/skills/ha-dev/scripts/ha-supervisor addon-rebuild local_pi_agent

# VM management
.pi/skills/ha-dev/scripts/vm-ctl status
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha os info'

# Deploy add-on
.pi/skills/ha-dev/scripts/deploy-addon

# Search HA docs
rg -l "config_flow" docs/homeassistant/developer/
```

All scripts source config from `.env` in the repo root. Run any script with `help` for usage.

## Schema Extraction

Storage schemas are auto-extracted from the HA core source into the Pi extension for use by the generic tools. To regenerate after a HA version update:

```bash
cd ha-core && git pull                          # Update HA source
cd .. && python3 tools/extract-schemas.py       # Re-extract all schemas
```

Output: `.pi/extensions/home-assistant/schemas/` (37 schema files in 3 categories)

| Category | Location | Count | What |
|----------|----------|-------|------|
| Collections | `schemas/collections/` | 14 | `.storage/<domain>` with `items[]` — helpers, persons, zones, tags, dashboards |
| Config entries | `schemas/config_entries/` | 17 | Config-flow helpers stored in `core.config_entries` — template, derivative, utility_meter, etc. |
| Registries | `schemas/registries/` | 6 | Core registries — areas, devices, entities, floors, labels, categories |

## HA Core Source Reference

A shallow clone of the [Home Assistant core repo](https://github.com/home-assistant/core) is available at `ha-core/` (gitignored). Use it to look up schemas, storage formats, service definitions, entity platforms, and any other implementation details.

```bash
# Search for storage schemas, field definitions, etc.
rg "STORAGE_FIELDS" ha-core/homeassistant/components/
rg "CREATE_FIELDS" ha-core/homeassistant/components/

# Look up a specific component
cat ha-core/homeassistant/components/input_number/__init__.py

# Find all components that use storage collections
rg -l "STORAGE_KEY" ha-core/homeassistant/components/

# Search for service definitions
rg "async_register" ha-core/homeassistant/components/counter/__init__.py
```

**Do not edit** files in `ha-core/`. To update, pull latest:
```bash
cd ha-core && git pull
```

## Key Technical Details

- The add-on runs on **Alpine Linux** (HA base image) with s6-overlay for process supervision
- The VM does **not** have `rsync` — deployment uses `scp`
- `$SUPERVISOR_TOKEN` must be loaded from `/run/s6/container_environment/SUPERVISOR_TOKEN` (not auto-injected when `init: false`)
- Local add-ons get the `local_` prefix in their Supervisor slug (e.g., `local_pi_agent`)
- `ha store reload` (not `ha addons reload`) is needed to pick up new/changed local add-ons

## Conventions

- Use "Home Assistant" in full — never "HA" or "HASS" in user-facing text
- The `docs/` directory is auto-generated — don't edit docs directly, edit the update scripts
- API token in `.env` is for the local dev instance only
- Always test add-on changes on the isolated VM before pushing to the repo
