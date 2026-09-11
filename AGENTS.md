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

Tools live in `.pi/extensions/home-assistant/tools/ha-*.ts`, shared code in `lib/`. Registered in `index.ts`. See the wiki page **"New Tool Implementation Pattern"** (https://wiki.dkmaker.xyz/pages/MSWTS8F5) for conventions — and the project index https://wiki.dkmaker.xyz/pages/MSWNJA34 for all architecture/pattern/policy docs.

**Key principles:** <300 lines/file, shared types in `lib/types.ts`, complex tools get sub-directories, thin dispatch files.

## Schema Extraction

Submodules are pinned to matching HA **release tags** (not `dev` — it's unstable and huge to fetch). ha-core and ha-frontend track the versions that ship together in a given release (e.g. core `2026.9.1` ↔ frontend `20260826.6`, per core's `package_constraints.txt`).

To bump to a new release:

```bash
# Pin each submodule to the target release tag (shallow = fast)
git -C ha-core     fetch --depth 1 origin tag <core-tag>       && git -C ha-core     checkout <core-tag>
git -C ha-frontend fetch --depth 1 origin tag <frontend-tag>   && git -C ha-frontend checkout <frontend-tag>

python3 tools/extract-schemas.py                  # ha-core/ → .pi/extensions/home-assistant/schemas/{collections,config_entries,registries}
python3 tools/extract-automation-schemas.py       # ha-frontend/ → schemas/automation-elements.json
python3 tools/extract-card-schemas.py             # ha-frontend/ → schemas/card-schemas.json
```

Find the matching frontend tag with: `gh api repos/home-assistant/core/contents/homeassistant/package_constraints.txt?ref=<core-tag> --jq '.content' | base64 -d | grep home-assistant-frontend`.

## Policies

- **NEVER push commits or bump versions unless explicitly approved by the user**
- Use "Home Assistant" in full — never "HA" or "HASS" in user-facing text
- Always test add-on changes on the isolated VM before pushing
- Alpine Linux base image; VM has no `rsync` (use `scp`)
- `ha store reload` (not `ha addons reload`) for local add-on changes
- Local add-ons get `local_` prefix in Supervisor slug
