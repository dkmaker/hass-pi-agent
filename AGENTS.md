# Home Assistant — Local Development Environment

Development workspace for **Pi Agent for Home Assistant**, a Home Assistant add-on that gives the Pi coding agent full access to manage all aspects of a Home Assistant installation.

## Project Layout

| Directory | Purpose |
|-----------|---------|
| `addon/` | Add-on source (config.yaml, Dockerfile, run.sh) |
| `.pi/extensions/home-assistant/` | Pi extension — tools, lib, schemas |
| `dev-scripts/` | Dev scripts — deploy, VM management, API helpers |
| `ha-core/` | Git submodule — HA backend (reference only, **do not edit**) |
| `ha-frontend/` | Git submodule — HA frontend (reference only, **do not edit**) |
| `tools/` | Schema extractors (extract-schemas.py, extract-automation-schemas.py) |
| `docs/homeassistant/` | Auto-generated HA docs mirror (don't edit directly) |
| `.env` | API token + VM config (gitignored) |

## Add-on

| Property | Value |
|----------|-------|
| Name | Pi Agent for Home Assistant |
| Slug / Supervisor slug | `pi_agent` / `local_pi_agent` |
| Source | `addon/` |

**Access inside container:** Supervisor API (`http://supervisor/`), Core REST/WS, `/homeassistant` (R/W), `/addon_configs`, `/ssl`, `/share`, `/media`, `/backup`.

**Token:** `$SUPERVISOR_TOKEN` loaded from `/run/s6/container_environment/SUPERVISOR_TOKEN` (not auto-injected when `init: false`).

## Dev VM

| Property | Value |
|----------|-------|
| VM IP / URL | `10.99.0.13` / `http://10.99.0.13:8123` |
| API token | `.env` (`HAOS_API_TOKEN`) |
| SSH | `root@10.99.0.13:22` (Terminal & SSH add-on) |
| Network | `haos-isolated` — private subnet, NAT internet, no LAN bridge |

```bash
dev-scripts/vm-ctl start|stop|status|ssh|destroy
```

## Deploy Workflow

See asset **"Add-on Deploy & Test Workflow"** for deploy commands, troubleshooting, and details.

## Extension Structure

Tools live in `.pi/extensions/home-assistant/tools/ha-*.ts`, shared code in `lib/`. Registered in `index.ts`. See asset **"New Tool Implementation Pattern"** for conventions.

**Key principles:** <300 lines/file, shared types in `lib/types.ts`, complex tools get sub-directories, thin dispatch files.

## Schema Extraction

```bash
git submodule update --remote --merge
python3 tools/extract-schemas.py                  # ha-core/ → schemas/collections|config_entries|registries
python3 tools/extract-automation-schemas.py       # ha-frontend/ → schemas/automation-elements.json
```

## Policies

- **NEVER push commits or bump versions unless explicitly approved by the user**
- Use "Home Assistant" in full — never "HA" or "HASS" in user-facing text
- Always test add-on changes on the isolated VM before pushing
- Alpine Linux base image; VM has no `rsync` (use `scp`)
- `ha store reload` (not `ha addons reload`) for local add-on changes
- Local add-ons get `local_` prefix in Supervisor slug
