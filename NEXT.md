# Next Steps (Phase 1)

Operational tools — well-scoped, API endpoints already known.

---

## Feature: Add-on Management

### Problem
No tools exist for managing HA add-ons beyond what the `ha-dev` skill scripts provide. Users need to browse, install, configure, and monitor add-ons programmatically.

### Supervisor API Calls
All via `http://supervisor/` with `$SUPERVISOR_TOKEN`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/addons` | GET | List all installed add-ons |
| `/addons/{slug}/info` | GET | Get add-on details (version, state, config schema) |
| `/addons/{slug}/start` | POST | Start an add-on |
| `/addons/{slug}/stop` | POST | Stop an add-on |
| `/addons/{slug}/restart` | POST | Restart an add-on |
| `/addons/{slug}/install` | POST | Install an add-on |
| `/addons/{slug}/uninstall` | POST | Uninstall an add-on |
| `/addons/{slug}/update` | POST | Update an add-on |
| `/addons/{slug}/options` | POST | Update add-on configuration |
| `/addons/{slug}/logs` | GET | Get add-on logs (plain text) |
| `/addons/{slug}/stats` | GET | Get add-on resource usage (CPU, memory) |
| `/store` | GET | List add-on store (available add-ons) |
| `/store/repositories` | GET | List configured add-on repositories |
| `/store/repositories` | POST | Add a new repository URL |
| `/store/repositories/{url}` | DELETE | Remove a repository |
| `/store` | POST | Refresh the add-on store |

### Implementation Plan
New tool: `ha_addons`

| Action | Description |
|--------|-------------|
| `list` | List installed add-ons with state, version |
| `get` | Get add-on details — config schema, options, state, resource usage |
| `start` | Start an add-on |
| `stop` | Stop an add-on |
| `restart` | Restart an add-on |
| `install` | Install an add-on from the store |
| `uninstall` | Uninstall an add-on |
| `update` | Update an add-on to latest version |
| `logs` | Get add-on logs (with tail/line limit) |
| `stats` | Get add-on CPU/memory usage |
| `config` | View current add-on configuration |
| `set-config` | Update add-on configuration (POST to options) |
| `store` | Browse available add-ons in the store |
| `store-refresh` | Refresh the add-on store cache |
| `list-repos` | List configured add-on repositories |
| `add-repo` | Add a new repository URL |
| `remove-repo` | Remove a repository |

### Notes
- The existing `ha-supervisor` skill script already handles some of these — but it's a bash CLI, not a Pi tool
- This should be a proper Pi extension tool with structured output
- Add-on config schemas vary per add-on — the `info` endpoint returns the schema, which can be used for validation
- Logs are plain text (not JSON) — need to handle large log output with line limits

---

## Feature: Backup Management

### Problem
No tool for managing HA backups — create, list, download, restore.

### Supervisor API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/backups` | GET | List all backups |
| `/backups/{slug}/info` | GET | Get backup details |
| `/backups/new/full` | POST | Create full backup |
| `/backups/new/partial` | POST | Create partial backup |
| `/backups/{slug}/restore/full` | POST | Restore full backup |
| `/backups/{slug}/restore/partial` | POST | Restore partial backup |
| `/backups/{slug}` | DELETE | Delete a backup |
| `/backups/{slug}/download` | GET | Download backup file |
| `/backups/upload` | POST | Upload a backup file |

### Implementation
New tool: `ha_backups` — list, create, restore, delete, download backups.

---

## Feature: System / Host Info

### Problem
No tool for viewing HA system information — host details, network config, OS updates.

### Supervisor API
| Endpoint | Description |
|----------|-------------|
| `/info` | Supervisor info (version, channel, arch) |
| `/host/info` | Host OS info (hostname, kernel, disk usage) |
| `/os/info` | HAOS info (version, update available) |
| `/network/info` | Network configuration |
| `/resolution/info` | System health issues and suggestions |

### Implementation
Could be a `ha_system` tool or extend `ha_restart` into a broader system tool.
