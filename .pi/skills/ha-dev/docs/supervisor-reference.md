# Supervisor API Reference

CLI tool: `.pi/skills/ha-dev/scripts/ha-supervisor`

Uses the WebSocket API's `supervisor/api` proxy (the Supervisor REST API rejects long-lived tokens directly). Config loaded from `.env` in repo root.

## Commands

### System Info
```bash
.pi/skills/ha-dev/scripts/ha-supervisor info            # Supervisor version, channel, etc.
.pi/skills/ha-dev/scripts/ha-supervisor stats           # Supervisor CPU/memory
.pi/skills/ha-dev/scripts/ha-supervisor host            # Host info (OS, hostname, features)
.pi/skills/ha-dev/scripts/ha-supervisor os              # HAOS info (version, board, boot slots)
.pi/skills/ha-dev/scripts/ha-supervisor core            # HA Core info (version, state)
.pi/skills/ha-dev/scripts/ha-supervisor core-stats      # HA Core CPU/memory
.pi/skills/ha-dev/scripts/ha-supervisor network         # Network configuration
.pi/skills/ha-dev/scripts/ha-supervisor resolution      # Issues and suggestions
```

### Add-on Management
```bash
.pi/skills/ha-dev/scripts/ha-supervisor addons                         # List installed
.pi/skills/ha-dev/scripts/ha-supervisor addon-info <slug>              # Full details
.pi/skills/ha-dev/scripts/ha-supervisor addon-stats <slug>             # CPU/memory
.pi/skills/ha-dev/scripts/ha-supervisor addon-logs <slug>              # Logs
.pi/skills/ha-dev/scripts/ha-supervisor addon-start <slug>
.pi/skills/ha-dev/scripts/ha-supervisor addon-stop <slug>
.pi/skills/ha-dev/scripts/ha-supervisor addon-restart <slug>
.pi/skills/ha-dev/scripts/ha-supervisor addon-rebuild <slug>           # Rebuild from source
.pi/skills/ha-dev/scripts/ha-supervisor addon-options <slug> <json>    # Set options
.pi/skills/ha-dev/scripts/ha-supervisor addon-network <slug> <json>    # Set port mapping
.pi/skills/ha-dev/scripts/ha-supervisor reload-addons                  # Reload add-on list
```

### Add-on Store
```bash
.pi/skills/ha-dev/scripts/ha-supervisor store                          # Store info
.pi/skills/ha-dev/scripts/ha-supervisor store-addons [filter]          # Browse (optional filter)
.pi/skills/ha-dev/scripts/ha-supervisor store-repos                    # List repositories
.pi/skills/ha-dev/scripts/ha-supervisor store-add-repo <url>           # Add repository
```

### Backups
```bash
.pi/skills/ha-dev/scripts/ha-supervisor backups                        # List backups
.pi/skills/ha-dev/scripts/ha-supervisor backup-create [name]           # Create full backup
```

### Core Lifecycle
```bash
.pi/skills/ha-dev/scripts/ha-supervisor core-restart
.pi/skills/ha-dev/scripts/ha-supervisor core-stop
.pi/skills/ha-dev/scripts/ha-supervisor core-start
.pi/skills/ha-dev/scripts/ha-supervisor core-update                    # Update to latest
```

### Host
```bash
.pi/skills/ha-dev/scripts/ha-supervisor host-reboot
.pi/skills/ha-dev/scripts/ha-supervisor host-shutdown
```

### Raw
```bash
.pi/skills/ha-dev/scripts/ha-supervisor get <endpoint>                 # GET any Supervisor endpoint
.pi/skills/ha-dev/scripts/ha-supervisor post <endpoint> [json]         # POST any Supervisor endpoint
```

## Note on Auth

The Supervisor API is only accessible via the WebSocket `supervisor/api` message type. The long-lived token authenticates the WebSocket connection, and HA Core proxies the request to the Supervisor with its own internal token. Direct REST calls to `/api/hassio/*` return 401 for Supervisor-specific endpoints.
