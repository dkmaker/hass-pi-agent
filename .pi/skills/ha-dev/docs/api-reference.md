# HA API Reference

CLI tool: `.pi/skills/ha-dev/scripts/ha-api`

Token and URL are embedded in the script. All commands return JSON or formatted text.

## Commands

### Info
```bash
.pi/skills/ha-dev/scripts/ha-api ping              # Test connectivity
.pi/skills/ha-dev/scripts/ha-api health             # Quick status (state, version, tz)
.pi/skills/ha-dev/scripts/ha-api config             # Full HA config JSON
```

### Entities & States
```bash
.pi/skills/ha-dev/scripts/ha-api states             # List all entities
.pi/skills/ha-dev/scripts/ha-api states sun          # Filter by substring
.pi/skills/ha-dev/scripts/ha-api state sun.sun       # Full state + attributes
.pi/skills/ha-dev/scripts/ha-api set-state <entity_id> <state> [attributes_json]
```

### Services
```bash
.pi/skills/ha-dev/scripts/ha-api services            # List all services
.pi/skills/ha-dev/scripts/ha-api services light       # Filter
.pi/skills/ha-dev/scripts/ha-api call <domain> <service> [json_data]
# Examples:
.pi/skills/ha-dev/scripts/ha-api call homeassistant restart
.pi/skills/ha-dev/scripts/ha-api call light turn_on '{"entity_id":"light.x","brightness":200}'
```

### Events
```bash
.pi/skills/ha-dev/scripts/ha-api events              # List event types + listener counts
.pi/skills/ha-dev/scripts/ha-api fire <event> [json]  # Fire custom event
```

### History & Logbook
```bash
.pi/skills/ha-dev/scripts/ha-api history <entity_id> [hours]   # Default 24h
.pi/skills/ha-dev/scripts/ha-api logbook [hours]               # Recent entries
```

### Jinja2 Templates
```bash
.pi/skills/ha-dev/scripts/ha-api template '{{ states("sun.sun") }}'
.pi/skills/ha-dev/scripts/ha-api template '{{ state_attr("sun.sun", "elevation") }}'
```

### Add-on Management
```bash
.pi/skills/ha-dev/scripts/ha-api addons                        # List installed
.pi/skills/ha-dev/scripts/ha-api addon-info <slug>             # Details
.pi/skills/ha-dev/scripts/ha-api addon-logs <slug>             # Logs
.pi/skills/ha-dev/scripts/ha-api addon-start <slug>
.pi/skills/ha-dev/scripts/ha-api addon-stop <slug>
.pi/skills/ha-dev/scripts/ha-api addon-restart <slug>
.pi/skills/ha-dev/scripts/ha-api addon-rebuild <slug>          # Rebuild from source
```

### Raw API
```bash
.pi/skills/ha-dev/scripts/ha-api get /api/states
.pi/skills/ha-dev/scripts/ha-api get /api/error_log
.pi/skills/ha-dev/scripts/ha-api post /api/services/switch/toggle '{"entity_id":"switch.x"}'
```

Run `.pi/skills/ha-dev/scripts/ha-api help` for the built-in usage text.
