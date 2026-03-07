# WebSocket API Audit — Full Findings

## Background

The HA extension was originally built using two approaches:
1. **REST API** (`/api/...`) — for reading states, calling services, rendering templates
2. **Direct storage file manipulation** (`.storage/`) — for managing helpers, reading registries

Investigation revealed that Home Assistant exposes a **comprehensive WebSocket API** that covers almost everything the HA frontend uses. Many operations we do via storage files have proper WS equivalents that are live, immediate, and don't require restarts.

## WebSocket Protocol

```
Connect: ws://<host>:8123/api/websocket (direct) or ws://supervisor/core/websocket (container)
Auth:    { type: "auth", access_token: "..." } → { type: "auth_ok" }
Command: { id: N, type: "...", ...data } → { id: N, type: "result", success: bool, result: ... }
```

Shared client implemented in `lib/ws.ts` — lazy connect, auto-auth, auto-reconnect, command timeouts.

## Complete WS Command Inventory

### Core Built-in Commands (`websocket_api/commands.py`)

| Command | Description |
|---------|-------------|
| `get_states` | All entity states (equivalent to REST `/api/states`) |
| `get_services` | All service definitions (equivalent to REST `/api/services`) |
| `get_config` | Core HA config |
| `call_service` | Call a service |
| `render_template` | Render Jinja2 template (subscription — streams updates) |
| `subscribe_events` | Subscribe to event stream |
| `subscribe_entities` | Subscribe to entity state changes |
| `subscribe_trigger` | Subscribe to trigger events |
| `fire_event` | Fire a custom event |
| `execute_script` | Execute a script inline |
| `validate_config` | Validate automation/script config |
| `ping` / `pong` | Keepalive |
| `search/related` | Find all related items (device→entities, area→devices, etc.) |
| `entity/source` | Get entity sources (which integration created each entity) |
| `integration/setup_info` | Integration load times and status |

### Config Registries (`config/*.py`)

#### Device Registry
| Command | Description |
|---------|-------------|
| `config/device_registry/list` | List all devices |
| `config/device_registry/update` | Update device (area, name, labels, disable) |
| `config/device_registry/remove_config_entry` | Remove config entry from device |

#### Entity Registry
| Command | Description |
|---------|-------------|
| `config/entity_registry/list` | List all entity registry entries |
| `config/entity_registry/list_for_display` | Compact list for UI display |
| `config/entity_registry/get` | Get single entity registry entry |
| `config/entity_registry/get_entries` | Get multiple entries by ID |
| `config/entity_registry/update` | Update entity (name, icon, area, labels, entity_id, disable) |
| `config/entity_registry/remove` | Remove entity from registry |
| `config/entity_registry/get_automatic_entity_ids` | Get auto-generated entity IDs |

#### Area Registry
| Command | Description |
|---------|-------------|
| `config/area_registry/list` | List all areas |
| `config/area_registry/create` | Create area |
| `config/area_registry/update` | Update area (name, floor, icon, labels, aliases) |
| `config/area_registry/delete` | Delete area |
| `config/area_registry/reorder` | Reorder areas |

#### Floor Registry
| Command | Description |
|---------|-------------|
| `config/floor_registry/list` | List all floors |
| `config/floor_registry/create` | Create floor |
| `config/floor_registry/update` | Update floor (name, level, icon, aliases) |
| `config/floor_registry/delete` | Delete floor |
| `config/floor_registry/reorder` | Reorder floors |

#### Label Registry
| Command | Description |
|---------|-------------|
| `config/label_registry/list` | List all labels |
| `config/label_registry/create` | Create label |
| `config/label_registry/update` | Update label (name, color, icon, description) |
| `config/label_registry/delete` | Delete label |

#### Category Registry
| Command | Description |
|---------|-------------|
| `config/category_registry/list` | List categories for a scope |
| `config/category_registry/create` | Create category |
| `config/category_registry/update` | Update category |
| `config/category_registry/delete` | Delete category |

### Collection Helper CRUD (`StorageCollectionWebsocket`)

Every collection-based helper automatically gets `{domain}/{list,create,update,delete}` WS commands via the `DictStorageCollectionWebsocket` class in `homeassistant/helpers/collection.py`.

| Domain | WS Prefix | Commands |
|--------|-----------|----------|
| `input_boolean` | `input_boolean/` | list, create, update, delete |
| `input_number` | `input_number/` | list, create, update, delete |
| `input_text` | `input_text/` | list, create, update, delete |
| `input_select` | `input_select/` | list, create, update, delete |
| `input_datetime` | `input_datetime/` | list, create, update, delete |
| `input_button` | `input_button/` | list, create, update, delete |
| `counter` | `counter/` | list, create, update, delete |
| `timer` | `timer/` | list, create, update, delete |
| `schedule` | `schedule/` | list, create, update, delete |

**Key detail:** The `create` command takes fields matching the STORAGE_FIELDS schema. The `update` command takes `{domain}_id` + fields. The `delete` command takes `{domain}_id`. All changes take effect **immediately** — no restart needed.

### Config Entry Management

| Command | Description |
|---------|-------------|
| `config_entries/get` | List all config entries (optional filters: domain, type) |
| `config_entries/get_single` | Get one config entry by entry_id |
| `config_entries/update` | Update config entry (title, disable, options via options flow) |
| `config_entries/disable` | Enable/disable a config entry |
| `config_entries/flow/progress` | List in-progress config flows |
| `config_entries/flow/subscribe` | Start a config flow (returns flow_id for multi-step) |
| `config_entries/subentries/list` | List subentries for a config entry |
| `config_entries/subentries/update` | Update subentry |
| `config_entries/subentries/delete` | Delete subentry |

**Note:** Config entry helpers (template, derivative, utility_meter, etc.) are created via config flows (`config_entries/flow`), which is a multi-step process. This is more complex than collection CRUD but still doable via WS.

### Lovelace / Dashboards

| Command | Description |
|---------|-------------|
| `lovelace/info` | Get dashboard info |
| `lovelace/dashboards` | List all dashboards (via collection WS) |
| `lovelace/dashboards/create` | Create dashboard |
| `lovelace/dashboards/update` | Update dashboard |
| `lovelace/dashboards/delete` | Delete dashboard |
| `lovelace/config` | Get dashboard config (cards, views) |
| `lovelace/config/save` | Save dashboard config |
| `lovelace/config/delete` | Delete dashboard config |
| `lovelace/resources/list` | List dashboard resources |

### Other Notable WS APIs

| Component | Commands | Use Case |
|-----------|----------|----------|
| `automation` | Uses collection WS (list/create/update/delete) | Automation management |
| `script` | Uses collection WS (list/create/update/delete) | Script management |
| `trace` | `trace/get`, `trace/list`, `trace/contexts` | Debug automation/script runs |
| `recorder` | `recorder/statistics_during_period`, `recorder/list_statistic_ids` | Historical data |
| `energy` | `energy/info`, `energy/solar_forecast` | Energy dashboard data |
| `backup` | Various backup commands | Backup management |
| `system_log` | `system_log/list`, `system_log/clear` | System log access |

## Current Tool → WS Migration Impact

### `ha-helpers` — **HIGH IMPACT** 🚨

**Before:** Reads/writes `.storage/` files directly → requires HA restart after every change.
**After (collection helpers):** WS CRUD → changes take effect **immediately**, no restart.
**After (config entry helpers):** WS config flow → more complex but still live.

This is the single biggest improvement. The "⚠️ Restart HA to apply changes" message goes away for 9 helper types.

### `ha-entities` — **MEDIUM IMPACT**

**Before:** REST `/api/states` + storage file reads for registry enrichment. Read-only.
**After:** WS `config/entity_registry/*` for live registry + update/remove capabilities.

Gains: rename entities, change entity_id, disable/enable, move to area, set labels, remove orphaned entities — all live.

### `ha-devices` — **ALREADY DONE** ✅

Built on WS from the start. `config/device_registry/list` + `update`.

### `ha-services` — **LOW IMPACT**

REST works fine. WS `get_services` and `call_service` are equivalent. Could switch for connection reuse but no functional gain.

### `ha-template` — **LOW IMPACT**

REST works fine. WS `render_template` is a subscription model (streams updates on state changes), which is actually more complex for our one-shot use case.

### `ha-restart` — **LOW IMPACT**

Service calls via REST. No WS advantage.

### New tools enabled — **HIGH VALUE**

| Tool | WS Commands | Effort |
|------|-------------|--------|
| `ha_areas` | area + floor registry CRUD + reorder | Small (trivial CRUD) |
| `ha_labels` | label registry CRUD | Small |
| `ha_dashboards` | lovelace CRUD + config save | Medium |
| `ha_automations` | automation collection CRUD + trace | Medium-Large |
| `ha_search` | `search/related` | Small (single command) |

## Storage Files — What Remains

After WS migration, direct storage access is still needed for:
1. **Schema loading** — reading extracted JSON schemas for validation (these are our files, not HA's)
2. **Backup/restore** — the backup module is a safety net for catastrophic recovery, orthogonal to WS
3. **Config entry helper creation** — if we can't fully replicate config flows via WS, fallback to storage + restart

The `readStorage()` function remains useful for enrichment (e.g., entity registry lookups in ha-entities before migration), but should be progressively replaced by WS calls.
