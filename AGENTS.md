# Home Assistant — Local Development Environment

This project is the development workspace for a **Pi extension** that provides AI-powered maintenance and management tools for Home Assistant. The extension gives Pi direct access to the HA REST API, Supervisor API, entity management, service calls, and documentation search.

**Reference repo** (for inspiration only): `git@github.com:dkmaker/hass-claude-code.git`

## Project Structure

```
.
├── AGENTS.md                   # This file — project context for the agent
├── .env                        # API token + VM config (gitignored)
├── .gitignore
├── .pi/
│   ├── extensions/
│   │   └── home-assistant/     # Pi extension (IN PROGRESS)
│   │       ├── index.ts        # Extension entry point
│   │       └── package.json    # Dependencies (ws for WebSocket)
│   └── skills/
│       └── ha-dev/             # Unified skill: API, VM, deploy, docs
│           ├── SKILL.md        # Slim router — read this first
│           ├── scripts/        # All executable tools
│           │   ├── ha-api      # HA REST API CLI
│           │   ├── ha-supervisor # Supervisor API CLI (via WebSocket)
│           │   ├── vm-ctl      # VM lifecycle (start/stop/ssh/destroy)
│           │   ├── deploy-addon # Rsync addon/ to VM + reload
│           │   └── setup-vm    # One-shot VM creation
│           └── docs/           # Workflow documentation
│               ├── api-reference.md
│               ├── supervisor-reference.md
│               ├── vm-management.md
│               ├── addon-workflow.md
│               └── documentation.md
├── dev/
│   └── haos/
│       └── README.md           # Dev VM documentation
├── docs/
│   └── homeassistant/          # Local mirror of HA documentation (markdown)
│       ├── developer/          # ~289 files — add-on dev, API, core, entity platforms
│       └── user/               # ~1,601 files — config, automations, integrations, dashboards
└── repository.yaml             # HA add-on repository manifest
```

## Local Dev VM

A Home Assistant OS VM runs locally via KVM/libvirt on an **isolated network** that prevents HA from discovering real devices on the host's LAN.

| Property | Value |
|----------|-------|
| VM name | `haos-dev` |
| Network | `haos-isolated` (10.99.0.0/24, NAT for internet, no LAN bridge) |
| VM IP | `10.99.0.13` |
| HA URL | http://10.99.0.13:8123 |
| HA version | 2026.3.1 |
| API token | stored in `.env` |

### VM Setup (already done, documented for reference)

```bash
# One-shot setup: creates isolated network, downloads HAOS 17.1, creates VM
.pi/skills/ha-dev/scripts/setup-vm

# Then: complete onboarding at http://10.99.0.13:8123
# Then: install SSH add-on (port 22), add authorized_keys
# Then: create long-lived token, add to .env as HAOS_API_TOKEN
```

### VM Management

```bash
.pi/skills/ha-dev/scripts/vm-ctl start       # Boot VM
.pi/skills/ha-dev/scripts/vm-ctl stop        # Graceful shutdown
.pi/skills/ha-dev/scripts/vm-ctl status      # Info + IP
.pi/skills/ha-dev/scripts/vm-ctl ssh [cmd]   # SSH into HAOS (port 22)
.pi/skills/ha-dev/scripts/vm-ctl destroy     # Delete VM + disk
```

### Network Isolation

The `haos-isolated` libvirt network uses a virtual bridge (`virbr-haos`) on a private subnet. It is **not bridged** to the host's physical NIC, so:
- HA cannot see mDNS/SSDP/UPnP broadcasts from the real LAN
- HA cannot discover real smart home devices
- The VM can still reach the internet via NAT (for installing add-ons, pulling images)
- The host can reach the VM at `10.99.0.13`

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
.pi/skills/ha-dev/scripts/ha-supervisor addon-rebuild local_claude_code

# VM management
.pi/skills/ha-dev/scripts/vm-ctl status
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha os info'

# Deploy add-on
.pi/skills/ha-dev/scripts/deploy-addon

# Search HA docs
rg -l "config_flow" docs/homeassistant/developer/
```

All scripts source config from `.env` in the repo root. Run any script with `help` for usage.

## Pi Extension: `home-assistant`

A Pi extension (`.pi/extensions/home-assistant/`) that registers custom tools the LLM can call directly to interact with Home Assistant. This is the primary deliverable of this project.

**Goal**: Give Pi the ability to perform ALL maintenance aspects of a Home Assistant setup — manage entities, call services, create/edit automations, monitor system health, manage add-ons, search docs, and more.

The extension uses:
- The HA REST API for entity/service/state operations
- The Supervisor WebSocket API for add-on/system management
- Config from `.env` in the repo root

## Conventions

- Use "Home Assistant" in full — never "HA" or "HASS" in user-facing text
- The `docs/` directory is auto-generated — don't edit docs directly
- API token in `.env` is for the local dev instance only
- All scripts source config from `.env` (never hardcode tokens)
