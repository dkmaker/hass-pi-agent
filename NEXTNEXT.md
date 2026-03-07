# NEXT: Custom Component — `pi_agent` Service Registration

## Goal

Allow the Pi Agent add-on to register a native HA service (`pi_agent.ask`) that can be called from automations, scripts, and the UI to start a Pi process with a question.

## Approach

**Self-deploying custom component** — the add-on bundles a small Python integration and drops it into `/homeassistant/custom_components/pi_agent/` on startup.

## How It Works

1. Add-on config gets a new option: `install_integration: true` (default)
2. On startup, `run.sh` checks the option and copies the bundled component to `/homeassistant/custom_components/pi_agent/`
3. Version-stamps the deployment (only overwrites when add-on ships a newer version)
4. First install triggers an HA restart to load the integration
5. The custom component registers a `pi_agent.ask` service
6. When the service is called, it communicates with the add-on (REST API endpoint inside the add-on container)
7. The add-on spawns `pi` with the provided question

## Files to Create

### In the add-on image (`addon/component/pi_agent/`)

Bundled into the Docker image, copied to HA config at runtime.

- `__init__.py` — ~50 lines, registers `pi_agent.ask` service, calls add-on's HTTP endpoint
- `manifest.json` — integration metadata (name, domain, version, dependencies)
- `services.yaml` — service schema for UI (question field, optional context fields)
- `VERSION` — version stamp for update detection

### Add-on changes

- `addon/config.yaml` — add `install_integration` option
- `addon/run.sh` — add startup logic to deploy/update the component
- Add-on needs a small HTTP listener (or use stdin/file queue) to receive service calls and spawn `pi`

## Communication: Service → Add-on

Options (pick one during implementation):

| Method | Pros | Cons |
|--------|------|------|
| **REST API in add-on** | Clean, standard, async-friendly | Need a small HTTP server in the add-on |
| **File-based queue** | Dead simple, no server needed | Polling, latency, messy |
| **stdin/stdout via Supervisor API** | No extra server | Complex, fragile |

**Recommendation:** Small HTTP server in the add-on (e.g., Python `aiohttp` or shell-based `socat`/`netcat` listener). The custom component calls it via `aiohttp.ClientSession`.

## Service Schema

```yaml
# services.yaml
ask:
  name: Ask Pi Agent
  description: Send a question to the Pi coding agent
  fields:
    question:
      name: Question
      description: The question or task for the Pi agent
      required: true
      selector:
        text:
          multiline: true
```

## Deployment Logic (pseudo)

```bash
COMPONENT_SRC="/opt/pi_agent_component"  # bundled in Docker image
COMPONENT_DST="/homeassistant/custom_components/pi_agent"

if bashio::config.true 'install_integration'; then
  BUNDLED_VERSION=$(cat "$COMPONENT_SRC/VERSION")
  INSTALLED_VERSION=$(cat "$COMPONENT_DST/VERSION" 2>/dev/null || echo "none")

  if [ "$BUNDLED_VERSION" != "$INSTALLED_VERSION" ]; then
    mkdir -p "$COMPONENT_DST"
    cp -r "$COMPONENT_SRC"/* "$COMPONENT_DST"/
    bashio::log.info "Deployed pi_agent integration v${BUNDLED_VERSION}"
    # Trigger HA restart if first install
    if [ "$INSTALLED_VERSION" = "none" ]; then
      ha core restart
    fi
  fi
fi
```

## Uninstall

If `install_integration` is toggled off, the add-on could optionally remove the directory and note that a restart is needed. Or just leave it — the component is harmless without the add-on running.

## Prior Art

- HACS bootstraps itself via a similar self-deploy pattern
- Several community add-ons deploy custom components this way
- The add-on already has verified R/W access to `/homeassistant`
