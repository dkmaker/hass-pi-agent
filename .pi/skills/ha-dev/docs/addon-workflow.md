# Add-on Development Workflow

## Overview

The `hass-claude-code` add-on source lives in `addon/` at the repo root. To test it:

1. **Edit** code in `addon/`
2. **Deploy** to VM (rsync via SSH)
3. **Install or rebuild** on the VM's Supervisor
4. **Check logs** via API

## Deploy

```bash
.pi/skills/ha-dev/scripts/deploy-addon
```

This script:
- Rsyncs `addon/` → `/addons/claude_code/` on the VM via SSH
- Runs `ha addons reload` on the VM to tell Supervisor about changes

### First time after deploy

Go to http://10.99.0.13:8123 → Settings → Add-ons → Add-on Store → Local add-ons → Claude Code → Install

Supervisor builds the Docker image locally on the VM from the Dockerfile. This takes several minutes on first build.

### After code changes

```bash
# Deploy updated source
.pi/skills/ha-dev/scripts/deploy-addon

# Rebuild the add-on (rebuilds Docker image + restarts)
.pi/skills/ha-dev/scripts/ha-api addon-rebuild local_claude_code
```

### Quick restart (no rebuild, e.g. config-only changes)

```bash
.pi/skills/ha-dev/scripts/ha-api addon-restart local_claude_code
```

## Checking Logs

```bash
# Via API
.pi/skills/ha-dev/scripts/ha-api addon-logs local_claude_code

# Via SSH
.pi/skills/ha-dev/scripts/vm-ctl ssh 'ha addons logs local_claude_code'
```

## Add-on Structure

```
addon/
├── Dockerfile              # Multi-stage: build MCP server + index docs → final image
├── config.yaml             # Add-on manifest (name, slug, version, options, arch)
├── build.yaml              # Build config (base images per arch)
├── CHANGELOG.md
├── mcp-server/             # TypeScript MCP server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        # MCP server entry point
│       ├── ha-api.ts       # HA REST API client
│       ├── ha-websocket.ts # HA WebSocket client
│       ├── docs-search.ts  # Documentation search tool
│       ├── search.ts       # Search implementation (keyword + semantic)
│       ├── indexer.ts       # Markdown → SQLite indexer
│       ├── embeddings.ts   # Vector embeddings (optional)
│       ├── db.ts           # SQLite database
│       └── build-index.ts  # CLI to build search index
└── rootfs/                 # s6-overlay filesystem
    └── etc/s6-overlay/s6-rc.d/
        ├── init-claude/    # Claude Code setup
        ├── init-mcp/       # MCP server setup
        ├── init-packages/  # Extra package install
        └── ttyd/           # Web terminal service
```

## Build Details

The Dockerfile has 2 stages:

1. **mcp-builder** (Alpine): clone docs from repo, install pnpm deps, build TypeScript, create keyword index in SQLite
2. **Final** (HA base image): install runtime deps (Node.js, tmux, ttyd, ripgrep), copy compiled MCP server + docs + pre-built DB

The add-on exposes:
- **ttyd** web terminal via HA Ingress (no external port needed)
- **MCP server** on a Unix socket for Claude Code to connect to

## Key Config (config.yaml)

- `slug: claude_code`
- `ingress: true` (web UI via HA sidebar)
- `homeassistant_api: true` (gets Supervisor token for HA API access)
- `hassio_api: true` / `hassio_role: admin`
- Maps: `homeassistant_config:rw`, `addon_config:rw`, `share:rw`, `ssl:ro`, `media:ro`
