# HA Documentation Search

Local mirrors of official Home Assistant docs at `docs/homeassistant/`.

## Layout

```
docs/homeassistant/
├── developer/                  # ~289 files — from developers.home-assistant repo
│   ├── api/                    # REST API, WebSocket, native app, Supervisor API
│   ├── apps/                   # Add-on development (tutorial, testing, config, security)
│   ├── architecture/           # HA architecture overview
│   ├── blog/                   # Dev blog (changelogs, migration guides)
│   ├── core/                   # Core internals
│   │   ├── entity/             # Entity platforms (sensor, switch, light, climate, etc.)
│   │   ├── integration-quality-scale/
│   │   ├── llm/                # LLM integration
│   │   └── platform/           # Platform development
│   ├── development/            # Dev environment, testing, debugging
│   ├── frontend/               # Frontend dev (custom-ui, extending)
│   ├── internationalization/
│   ├── operating-system/       # HAOS internals
│   ├── supervisor/             # Supervisor development
│   └── voice/                  # Voice assistant (intents, pipelines)
│
└── user/                       # ~1,601 files — from home-assistant.io repo
    ├── dashboards/             # Lovelace dashboard config
    ├── docs/                   # Core user docs
    │   ├── authentication/
    │   ├── automation/         # Triggers, conditions, actions
    │   ├── blueprint/
    │   ├── configuration/      # YAML, secrets, templates, packages
    │   └── ...
    ├── faq/
    ├── installation/
    └── integrations/           # All integration docs (1400+ files)
```

## Search Patterns

### Keyword search with ripgrep
```bash
rg -l "config_flow" docs/homeassistant/developer/
rg -li "supervisor api" docs/homeassistant/developer/api/
rg -l "automation trigger" docs/homeassistant/user/docs/automation/
rg -li "template sensor" docs/homeassistant/user/integrations/
rg -l "custom_components" docs/homeassistant/
```

### Find by topic
```bash
find docs/homeassistant/developer/apps/ -name "*.md"           # Add-on dev
find docs/homeassistant/developer/core/entity/ -name "*.md"    # Entity platforms
find docs/homeassistant/developer/api/supervisor/ -name "*.md" # Supervisor API
find docs/homeassistant/user/integrations/ -name "mqtt*"       # Specific integration
```

## Key Docs for Add-on Development

| Topic | Path |
|-------|------|
| Add-on tutorial | `docs/homeassistant/developer/apps/tutorial.md` |
| Add-on config | `docs/homeassistant/developer/apps/configuration.md` |
| Add-on testing | `docs/homeassistant/developer/apps/testing.md` |
| Add-on security | `docs/homeassistant/developer/apps/security.md` |
| Supervisor API | `docs/homeassistant/developer/api/supervisor/` |
| REST API | `docs/homeassistant/developer/api/rest.md` |
| WebSocket API | `docs/homeassistant/developer/api/websocket.md` |
