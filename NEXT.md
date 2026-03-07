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
│  │  │                 write auth.json from cfg  │ │
│  │  ├─ init-extension (oneshot) copy extension, │ │
│  │  │                 build docs index          │ │
│  │  └─ ttyd          (longrun) ttyd → tmux → pi│ │
│  │                                             │ │
│  │  Volumes:                                   │ │
│  │  ├─ /homeassistant  (HA config, rw)         │ │
│  │  ├─ /data           (persistent, survives   │ │
│  │  │                   rebuilds)              │ │
│  │  │  └─ pi-agent/    (PI_CODING_AGENT_DIR)   │ │
│  │  │     ├─ auth.json (credentials)           │ │
│  │  │     ├─ settings.json                     │ │
│  │  │     ├─ sessions/                         │ │
│  │  │     ├─ extensions/                       │ │
│  │  │     ├─ skills/                           │ │
│  │  │     └─ agents/                           │ │
│  │  ├─ /share, /ssl, /media, /backup           │ │
│  │  └─ /addon_configs                          │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Credentials in `/data/`

Pi stores credentials in `~/.pi/agent/auth.json` (API keys, OAuth tokens). The container runs as root, so `~` = `/root`. On container rebuild, `/root` is wiped — but `/data/` persists.

**Solution**: Set `PI_CODING_AGENT_DIR=/data/pi-agent` environment variable.

Pi supports the `PI_CODING_AGENT_DIR` env var (source: `config.js` → `getAgentDir()`). This overrides the default `~/.pi/agent/` path entirely — no symlinks needed.

```
PI_CODING_AGENT_DIR=/data/pi-agent
/data/pi-agent/
  ├── auth.json           (API keys — persisted)
  ├── settings.json       (model prefs — persisted)
  └── sessions/           (conversation history — persisted)
```

No user-level extensions, skills, agents, or rules are stored here. The only extension is the HA extension, shipped as a **project-level** extension at `/homeassistant/.pi/extensions/home-assistant/` (on the HA config volume).

First run creates the directory structure. Subsequent rebuilds find existing credentials.

### 2. HA Extension Loading

The HA extension (custom tools) lives in the repo at `.pi/extensions/home-assistant/`. It needs to be available as a **project-level extension** when pi runs in `/homeassistant`.

**Solution**: Copy the extension into `/homeassistant/.pi/extensions/home-assistant/` at startup (init-extension service). The extension's `config.ts` already defaults `HA_CONFIG_PATH` to `/homeassistant` and detects `SUPERVISOR_TOKEN` — no changes needed.

The `.env` file is NOT needed in the container — defaults are correct:
- `HA_CONFIG_PATH` → `/homeassistant` ✓
- `HA_URL` → `http://supervisor/core` ✓
- `HA_TOKEN` → `SUPERVISOR_TOKEN` from s6 env ✓

### 3. Python in the Container

Python 3 is included in the Docker image (`apk add python3`). Pi uses python for various tasks and users may need it for custom scripts or integrations.

### 4. Docs Index at Startup

The `ha_docs` tool fetches integration docs from GitHub on first use and caches locally. In the container, the cache should go to `/data/ha-docs/` (persisted). The extension's `config.ts` already handles this — when `HA_URL` contains "supervisor", `DOCS_DATA_DIR` defaults to `/data/ha-docs`.

### 5. Web UI via Ingress

Same proven pattern as the Claude Code addon:
- **ttyd** serves a web terminal on the ingress port
- **tmux** provides session persistence (reconnect = same session)
- Pi runs inside tmux as the shell command

### 6. Add-on Configuration (config.yaml options)

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `default_provider` | select | `anthropic` | Default AI provider |
| `default_model` | str | `""` | Default model (empty = provider default) |
| `api_keys` | list[str] | `[]` | API keys as `PROVIDER=key` pairs (see below) |
| `environment` | list[str] | `[]` | Extra env vars as `KEY=VALUE` |
| `yolo_mode` | bool | `false` | Auto-approve all tool calls |
| `additional_packages` | list[str] | `[]` | Extra Alpine packages to install |

#### API Keys

Pi resolves API keys in priority order:
1. **Runtime** (CLI `--api-key`) — in-memory only
2. **auth.json** (`/data/pi-agent/auth.json`) — persisted, set via `/login` in pi or from config
3. **Environment variables** — set via `api_keys` config option
4. **Fallback resolver** (models.json custom providers)

The `api_keys` config option accepts `PROVIDER=key` pairs that get written to `auth.json` on startup. Supported providers and their env var names (from pi-ai source):

| Provider | Config key | Env var (also works) |
|----------|-----------|----------------------|
| `anthropic` | `anthropic=sk-ant-...` | `ANTHROPIC_API_KEY` |
| `openai` | `openai=sk-...` | `OPENAI_API_KEY` |
| `google` | `google=AI...` | `GEMINI_API_KEY` |
| `openrouter` | `openrouter=sk-or-...` | `OPENROUTER_API_KEY` |
| `groq` | `groq=gsk_...` | `GROQ_API_KEY` |
| `xai` | `xai=xai-...` | `XAI_API_KEY` |
| `mistral` | `mistral=...` | `MISTRAL_API_KEY` |
| `cerebras` | `cerebras=...` | `CEREBRAS_API_KEY` |
| `huggingface` | `huggingface=hf_...` | `HF_TOKEN` |
| `minimax` | `minimax=...` | `MINIMAX_API_KEY` |
| `zai` | `zai=...` | `ZAI_API_KEY` |
| `azure-openai-responses` | `azure-openai-responses=...` | `AZURE_OPENAI_API_KEY` |
| `github-copilot` | `github-copilot=...` | `GITHUB_TOKEN` |
| `kimi-coding` | `kimi-coding=...` | `KIMI_API_KEY` |

Users can also use OAuth via `/login` command in pi (credentials persist in auth.json across restarts).

The `environment` option allows setting any additional env var (e.g., `AZURE_OPENAI_BASE_URL=https://...`, `GOOGLE_CLOUD_PROJECT=my-project`, `AWS_PROFILE=bedrock`).

### 7. SUPERVISOR_TOKEN Injection

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

# System packages (python3 for pi tools + user scripts)
RUN apk add --no-cache \
    bash curl git nodejs npm python3 \
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

PI_DIR=/data/pi-agent

# Persistent pi agent dir
mkdir -p "${PI_DIR}/sessions"

# Set PI_CODING_AGENT_DIR for all services
printf '%s' "${PI_DIR}" > /var/run/s6/container_environment/PI_CODING_AGENT_DIR

# Write api_keys from config into auth.json
# Config format: list of "provider=key" strings
# Merges with existing auth.json (preserves OAuth tokens from /login)
if bashio::config.has_value 'api_keys'; then
    # Start with existing auth.json or empty object
    if [[ -f "${PI_DIR}/auth.json" ]]; then
        auth_json=$(cat "${PI_DIR}/auth.json")
    else
        auth_json='{}'
    fi

    for entry in $(bashio::config 'api_keys'); do
        provider="${entry%%=*}"
        key="${entry#*=}"
        if [[ -n "$provider" && -n "$key" ]]; then
            auth_json=$(echo "$auth_json" | jq --arg p "$provider" --arg k "$key" \
              '.[$p] = {"type": "api_key", "key": $k}')
        fi
    done

    echo "$auth_json" | jq . > "${PI_DIR}/auth.json"
    chmod 600 "${PI_DIR}/auth.json"
fi

# Write/update settings.json from config
provider=$(bashio::config 'default_provider')
model=$(bashio::config 'default_model')
settings='{}'
if [[ -f "${PI_DIR}/settings.json" ]]; then
    settings=$(cat "${PI_DIR}/settings.json")
fi
settings=$(echo "$settings" | jq --arg p "$provider" '.defaultProvider = $p')
if bashio::config.has_value 'default_model'; then
    settings=$(echo "$settings" | jq --arg m "$model" '.defaultModel = $m')
fi
echo "$settings" | jq . > "${PI_DIR}/settings.json"

# Write environment vars from config to s6 env dir
if bashio::config.has_value 'environment'; then
    for entry in $(bashio::config 'environment'); do
        key="${entry%%=*}"
        value="${entry#*=}"
        if [[ -n "$key" ]]; then
            printf '%s' "$value" > "/var/run/s6/container_environment/${key}"
        fi
    done
fi

# Expose SUPERVISOR_TOKEN + HA defaults for the extension
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
  api_keys: []
  environment: []
  yolo_mode: false
  additional_packages: []
schema:
  default_provider: "list(anthropic|openai|google|openrouter|groq|xai|mistral|cerebras|huggingface|github-copilot|amazon-bedrock|google-vertex|azure-openai-responses)"
  default_model: "str?"
  api_keys:
    - "password"
  environment:
    - "str"
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
Key improvement: `PI_CODING_AGENT_DIR` env var avoids symlink hacks for persistent storage.
