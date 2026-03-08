# Supervisor API Reference

CLI tool: `tools/ha-supervisor`

Uses the WebSocket API's `supervisor/api` proxy (the Supervisor REST API rejects long-lived tokens directly). Config loaded from `.env` in repo root.

## Commands

### System Info
```bash
tools/ha-supervisor info            # Supervisor version, channel, etc.
tools/ha-supervisor stats           # Supervisor CPU/memory
tools/ha-supervisor host            # Host info (OS, hostname, features)
tools/ha-supervisor os              # HAOS info (version, board, boot slots)
tools/ha-supervisor core            # HA Core info (version, state)
tools/ha-supervisor core-stats      # HA Core CPU/memory
tools/ha-supervisor network         # Network configuration
tools/ha-supervisor resolution      # Issues and suggestions
```

### Add-on Management
```bash
tools/ha-supervisor addons                         # List installed
tools/ha-supervisor addon-info <slug>              # Full details
tools/ha-supervisor addon-stats <slug>             # CPU/memory
tools/ha-supervisor addon-logs <slug>              # Logs
tools/ha-supervisor addon-start <slug>
tools/ha-supervisor addon-stop <slug>
tools/ha-supervisor addon-restart <slug>
tools/ha-supervisor addon-rebuild <slug>           # Rebuild from source
tools/ha-supervisor addon-options <slug> <json>    # Set options
tools/ha-supervisor addon-network <slug> <json>    # Set port mapping
tools/ha-supervisor reload-addons                  # Reload add-on list
```

### Add-on Store
```bash
tools/ha-supervisor store                          # Store info
tools/ha-supervisor store-addons [filter]          # Browse (optional filter)
tools/ha-supervisor store-repos                    # List repositories
tools/ha-supervisor store-add-repo <url>           # Add repository
```

### Backups
```bash
tools/ha-supervisor backups                        # List backups
tools/ha-supervisor backup-create [name]           # Create full backup
```

### Core Lifecycle
```bash
tools/ha-supervisor core-restart
tools/ha-supervisor core-stop
tools/ha-supervisor core-start
tools/ha-supervisor core-update                    # Update to latest
```

### Host
```bash
tools/ha-supervisor host-reboot
tools/ha-supervisor host-shutdown
```

### Raw
```bash
tools/ha-supervisor get <endpoint>                 # GET any Supervisor endpoint
tools/ha-supervisor post <endpoint> [json]         # POST any Supervisor endpoint
```

## Note on Auth

The Supervisor API is only accessible via the WebSocket `supervisor/api` message type. The long-lived token authenticates the WebSocket connection, and HA Core proxies the request to the Supervisor with its own internal token. Direct REST calls to `/api/hassio/*` return 401 for Supervisor-specific endpoints.
