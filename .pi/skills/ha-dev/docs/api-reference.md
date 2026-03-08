# HA API Reference

CLI tool: `tools/ha-api`

Token and URL are embedded in the script. All commands return JSON or formatted text.

## Commands

### Info
```bash
tools/ha-api ping              # Test connectivity
tools/ha-api health             # Quick status (state, version, tz)
tools/ha-api config             # Full HA config JSON
```

### Entities & States
```bash
tools/ha-api states             # List all entities
tools/ha-api states sun          # Filter by substring
tools/ha-api state sun.sun       # Full state + attributes
tools/ha-api set-state <entity_id> <state> [attributes_json]
```

### Services
```bash
tools/ha-api services            # List all services
tools/ha-api services light       # Filter
tools/ha-api call <domain> <service> [json_data]
# Examples:
tools/ha-api call homeassistant restart
tools/ha-api call light turn_on '{"entity_id":"light.x","brightness":200}'
```

### Events
```bash
tools/ha-api events              # List event types + listener counts
tools/ha-api fire <event> [json]  # Fire custom event
```

### History & Logbook
```bash
tools/ha-api history <entity_id> [hours]   # Default 24h
tools/ha-api logbook [hours]               # Recent entries
```

### Jinja2 Templates
```bash
tools/ha-api template '{{ states("sun.sun") }}'
tools/ha-api template '{{ state_attr("sun.sun", "elevation") }}'
```

### Add-on Management
```bash
tools/ha-api addons                        # List installed
tools/ha-api addon-info <slug>             # Details
tools/ha-api addon-logs <slug>             # Logs
tools/ha-api addon-start <slug>
tools/ha-api addon-stop <slug>
tools/ha-api addon-restart <slug>
tools/ha-api addon-rebuild <slug>          # Rebuild from source
```

### Raw API
```bash
tools/ha-api get /api/states
tools/ha-api get /api/error_log
tools/ha-api post /api/services/switch/toggle '{"entity_id":"switch.x"}'
```

Run `tools/ha-api help` for the built-in usage text.
