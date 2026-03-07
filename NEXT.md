# NEXT: Build the Pi Agent Add-on for Home Assistant

## Goal

Build a working Docker add-on that installs pi, exposes it via ttyd/tmux in the HA web UI (ingress), persists credentials across restarts, and loads the HA extension with all custom tools.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Home Assistant Supervisor                       │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Pi Agent Add-on Container (Alpine)         │ │
│  │                                             │ │
│  │  s6-overlay services:                       │ │
│  │  ├─ init-pi       (oneshot) set up env,     │ │
│  │  │                 symlink /data, install pi │ │
│  │  ├─ init-extension (oneshot) copy extension, │ │
│  │  │                 build docs index          │ │
│  │  └─ ttyd          (longrun) ttyd → tmux → pi│ │
│  │                                             │ │
│  │  Volumes:                                   │ │
│  │  ├─ /homeassistant  (HA config, rw)         │ │
│  │  ├─ /data           (persistent, survives   │ │
│  │  │                   rebuilds)              │ │
│  │  │  ├─ .pi/agent/auth.json (credentials)    │ │
│  │  │  ├─ .pi/agent/settings.json              │ │
│  │  │  ├─ .pi/agent/sessions/                  │ │
│  │  │  └─ ha-docs/ (docs index cache)          │ │
│  │  ├─ /share, /ssl, /media, /backup           │ │
│  │  └─ /addon_configs                          │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Credentials in `/data/`

Pi stores credentials in `~/.pi/agent/auth.json` (API keys, OAuth tokens). The container runs as root, so `~` = `/root`. On container rebuild, `/root` is wiped — but `/data/` persists.

**Solution**: Symlink `~/.pi/` → `/data/.pi/` at startup (init-pi service).

```
/root/.pi → /data/.pi    (symlink)
/data/.pi/agent/
  ├── auth.json           (API keys — persisted)
  ├── settings.json       (model prefs — persisted)
  ├── sessions/           (conversation history — persisted)
  ├── extensions/         (user-installed extensions — persisted)
  ├── skills/             (user-installed skills — persisted)
  └── agents/             (custom agents — persisted)
```

This means `pi` sees `/data/.pi/agent/auth.json` as `~/.pi/agent/auth.json` transparently. First run creates the directory structure. Subsequent rebuilds find existing credentials.

### 2. HA Extension Loading

The HA extension (custom tools) lives in the repo at `.pi/extensions/home-assistant/`. It needs to be available as a **project-level extension** when pi runs in `/homeassistant`.

**Solution**: Copy the extension into `/homeassistant/.pi/extensions/home-assistant/` at startup (init-extension service). The extension's `config.ts` already defaults `HA_CONFIG_PATH` to `/homeassistant` and detects `SUPERVISOR_TOKEN` — no changes needed.

The `.env` file is NOT needed in the container — defaults are correct:
- `HA_CONFIG_PATH` → `/homeassistant` ✓
- `HA_URL` → `http://supervisor/core` ✓
- `HA_TOKEN` → `SUPERVISOR_TOKEN` from s6 env ✓

### 3. Docs Index at Startup

The `ha_docs` tool fetches integration docs from GitHub on first use and caches locally. In the container, the cache should go to `/data/ha-docs/` (persisted). The extension's `config.ts` already handles this — when `HA_URL` contains "supervisor", `DOCS_DATA_DIR` defaults to `/data/ha-docs`.

### 4. Web UI via Ingress

Same proven pattern as the Claude Code addon:
- **ttyd** serves a web terminal on the ingress port
- **tmux** provides session persistence (reconnect = same session)
- Pi runs inside tmux as the shell command

### 5. Add-on Configuration (config.yaml options)

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `default_provider` | select | `anthropic` | Default AI provider |
| `default_model` | str | `""` | Default model (empty = provider default) |
| `api_key` | password | `""` | API key (written to auth.json) |
| `yolo_mode` | bool | `false` | Auto-approve all tool calls |
| `additional_packages` | list[str] | `[]` | Extra Alpine packages to install |

### 6. SUPERVISOR_TOKEN Injection

The token is NOT in env by default when `init: false`. But with s6-overlay (the HA base image default), it IS available at `/run/s6/container_environment/SUPERVISOR_TOKEN`. The init scripts use `with-contenv` to source it.

When `init: true` (use s6-overlay), the base image handles this automatically.

---

## File Structure

```
addon/
├── config.yaml                    # Add-on manifest
├── build.yaml                     # Build args (base image per arch)
├── Dockerfile                     # Multi-stage: install node, pi, ttyd
├── rootfs/
│   ├── usr/bin/
│   │   └── pi-entrypoint.sh       # Launched by tmux — sources env, runs pi
│   └── etc/s6-overlay/s6-rc.d/
│       ├── init-pi/               # Oneshot: symlink /data/.pi, write auth.json
│       │   ├── type               # "oneshot"
│       │   ├── up                 # "run"
│       │   ├── run                # The script
│       │   └── dependencies.d/
│       │       └── base           # Depends on base init
│       ├── init-extension/        # Oneshot: copy extension to /homeassistant/.pi/
│       │   ├── type
│       │   ├── up
│       │   ├── run
│       │   └── dependencies.d/
│       │       └── init-pi
│       ├── ttyd/                  # Longrun: ttyd → tmux → pi
│       │   ├── type               # "longrun"
│       │   ├── run
│       │   ├── finish
│       │   └── dependencies.d/
│       │       ├── init-pi
│       │       └── init-extension
│       └── user/contents.d/
│           ├── init-pi
│           ├── init-extension
│           └── ttyd
```

---

## Implementation Plan

### Phase 1: Dockerfile & Base Image

**Dockerfile** (multi-stage not needed — pi is an npm package):

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# System packages
RUN apk add --no-cache \
    bash curl git nodejs npm \
    ripgrep tmux ttyd \
    libgcc libstdc++

# Install pi globally
RUN npm install -g @mariozechner/pi-coding-agent

# Copy HA extension into image (baked in)
COPY extensions/home-assistant /opt/ha-extension/

# Copy rootfs overlay (s6 services, entrypoint)
COPY rootfs /

# Ensure scripts are executable
RUN chmod a+x /usr/bin/pi-entrypoint.sh && \
    find /etc/s6-overlay/s6-rc.d -name 'run' -exec chmod a+x {} \; && \
    find /etc/s6-overlay/s6-rc.d -name 'finish' -exec chmod a+x {} \;
```

### Phase 2: s6 Init Services

**init-pi/run** — Set up persistent storage + credentials:
```bash
#!/command/with-contenv bashio

# Persistent pi home
mkdir -p /data/.pi/agent
ln -sf /data/.pi /root/.pi

# Write API key from config if provided
api_key=$(bashio::config 'api_key')
provider=$(bashio::config 'default_provider')
if bashio::var.has_value "${api_key}"; then
    # Write to auth.json
    jq -n --arg key "$api_key" --arg provider "$provider" \
      '{($provider): {"type": "api_key", "key": $key}}' > /data/.pi/agent/auth.json
    chmod 600 /data/.pi/agent/auth.json
fi

# Write settings.json from config
model=$(bashio::config 'default_model')
if [[ -n "$model" && "$model" != '""' ]]; then
    jq -n --arg p "$provider" --arg m "$model" \
      '{defaultProvider: $p, defaultModel: $m}' > /data/.pi/agent/settings.json
fi

# Expose SUPERVISOR_TOKEN for extension
printf '%s' "${SUPERVISOR_TOKEN}" > /var/run/s6/container_environment/HA_TOKEN
printf '%s' "http://supervisor/core" > /var/run/s6/container_environment/HA_URL
printf '%s' "/homeassistant" > /var/run/s6/container_environment/HA_CONFIG_PATH
```

**init-extension/run** — Deploy HA extension to project:
```bash
#!/command/with-contenv bashio

# Copy baked-in extension to homeassistant config
mkdir -p /homeassistant/.pi/extensions/home-assistant
cp -r /opt/ha-extension/* /homeassistant/.pi/extensions/home-assistant/

bashio::log.info "HA extension deployed to /homeassistant/.pi/extensions/"
```

**ttyd/run** — Web terminal:
```bash
#!/command/with-contenv bashio

ingress_port=$(bashio::addon.ingress_port)
cd /homeassistant

exec ttyd -i 0.0.0.0 -p "${ingress_port}" --writable \
  tmux -u new -A -s pi /usr/bin/pi-entrypoint.sh
```

### Phase 3: Entrypoint Script

**pi-entrypoint.sh** — Runs inside tmux:
```bash
#!/usr/bin/env bash
set -e

# Source s6 environment
source /etc/profile.d/pi.sh 2>/dev/null || true

# Set working directory
cd /homeassistant

echo "Pi Agent for Home Assistant"
echo "Working directory: $(pwd)"
echo ""

exec pi
```

### Phase 4: config.yaml

```yaml
name: "Pi Agent for Home Assistant"
version: "0.1.0"
slug: "pi_agent"
description: "AI coding agent with full Home Assistant access"
startup: services
init: true            # USE s6-overlay (not false!)
ingress: true
ingress_port: 0
ingress_stream: true
panel_icon: mdi:robot
panel_title: Pi Agent
arch:
  - amd64
  - aarch64
homeassistant_api: true
hassio_api: true
hassio_role: admin
auth_api: true
map:
  - homeassistant_config:rw
  - all_addon_configs:rw
  - ssl:rw
  - share:rw
  - media:rw
  - backup:rw
options:
  default_provider: "anthropic"
  default_model: ""
  api_key: ""
  yolo_mode: false
  additional_packages: []
schema:
  default_provider: "list(anthropic|openai|google|openrouter)"
  default_model: "str?"
  api_key: "password?"
  yolo_mode: bool
  additional_packages:
    - str
```

---

## Open Questions to Resolve During Implementation

1. **Pi version pinning**: Pin `@mariozechner/pi-coding-agent@0.57.0` or install latest? Pin for stability, allow override via config option later.

2. **Extension as project vs user**: Copying to `/homeassistant/.pi/extensions/` makes it project-level. This is correct — the extension is specific to this HA instance. But we should NOT overwrite user modifications. Use a version marker file to decide when to re-copy.

3. **ttyd auth**: HA ingress handles auth (only authenticated HA users can access). No additional ttyd auth needed.

4. **tmux reconnect behavior**: When user navigates away and back, ttyd reconnects to the existing tmux session. Pi session continues. This is the desired behavior.

5. **Container size**: Node.js + npm + pi + ttyd + tmux + ripgrep on Alpine should be ~200-300MB. Acceptable for an add-on.

6. **build.yaml**: Need to specify base image per architecture:
   ```yaml
   build_from:
     amd64: ghcr.io/hassio-addons/base:20.0.1
     aarch64: ghcr.io/hassio-addons/base:20.0.1
   ```

---

## Testing Checklist

- [ ] Add-on builds successfully on dev VM
- [ ] Add-on starts and shows in HA sidebar
- [ ] Clicking sidebar opens ttyd with pi running
- [ ] Pi can use all ha_* tools (entities, automations, graph, etc.)
- [ ] API key entered in config persists across rebuilds
- [ ] API key entered via `pi` CLI persists across rebuilds
- [ ] Sessions survive container restart (tmux reconnect)
- [ ] Docs index builds on first tool use and caches in /data/
- [ ] SUPERVISOR_TOKEN is available to the extension
- [ ] Extension auto-loads when pi starts in /homeassistant
- [ ] `ha_graph build` works inside the container
- [ ] Ingress auth works (unauthenticated users cannot access)

---

## Reference: Claude Code Add-on (Inspiration)

Located at `/tmp/hass-claude-code/addon/`. Key patterns borrowed:
- s6-overlay service structure (init-* oneshots + ttyd longrun)
- `/data/` for persistent storage (symlinked to home dir)
- ttyd + tmux for ingress web terminal
- `bashio::config` for reading add-on options
- Managed settings in `/etc/` for tool auto-approval
- `with-contenv` for s6 environment variable injection

Key difference: Claude Code installs via binary (`curl | bash`), pi installs via npm.
Key improvement: Pi's auth.json stores credentials natively — no need for env var hacks.
