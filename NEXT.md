# Next Steps — WebSocket Migration & New Tools

## Context

The extension cleanup is complete (shared `lib/api.ts`, `StringEnum`, proper error handling, dead code removed). The `ha-devices` tool was built on the new shared WebSocket client (`lib/ws.ts`). A full audit of HA's WebSocket API (see `PLAN_WS.md`) revealed that most of our storage-file operations have proper WS equivalents that work **live without restarts**.

This plan migrates existing tools to WebSocket and adds new tools unlocked by it.

## Current Architecture

```
lib/
  api.ts          — REST helpers: requireToken(), apiGet(), apiPost(), callService()
  ws.ts           — WebSocket client: wsCommand(), wsClose(), wsConnected()
  config.ts       — env vars, paths, .env loader
  storage.ts      — read/write .storage files with backup
  backup.ts       — timestamped backup with rotation
  registry.ts     — type registry, schema loading, validation
  backends/
    collection.ts — .storage/<domain> items[] CRUD ← TO BE REPLACED BY WS
    config-entry.ts — core.config_entries CRUD ← PARTIALLY REPLACEABLE

tools/
  ha-helpers.ts   — helper management (delegates to backends)
  ha-devices.ts   — device management (WS-based) ✅
  ha-entities.ts  — entity discovery (REST + storage reads)
  ha-services.ts  — service list/get/call (REST)
  ha-restart.ts   — restart/reload (REST service calls)
  ha-template.ts  — template render/validate (REST)
```

## Phase 1: Migrate `ha-helpers` Collection Backend to WS

**Goal:** Eliminate restart requirement for the 9 collection helper types.
**Impact:** HIGH — biggest user-facing improvement.

### What changes

The 9 collection helpers (input_boolean, input_number, input_text, input_select, input_datetime, input_button, counter, timer, schedule) all have WS CRUD commands:

```
{domain}/list                          → list all items
{domain}/create   + fields             → create item (immediate)
{domain}/update   + {domain}_id + fields → update item (immediate)
{domain}/delete   + {domain}_id        → delete item (immediate)
```

### Plan

1. **Create `lib/backends/collection-ws.ts`** — new backend using `wsCommand()`:
   - `listItems(type)` → `wsCommand("{domain}/list")`
   - `addItem(type, fields)` → `wsCommand("{domain}/create", fields)`
   - `updateItem(type, id, fields)` → `wsCommand("{domain}/update", { {domain}_id: id, ...fields })`
   - `removeItem(type, id)` → `wsCommand("{domain}/delete", { {domain}_id: id })`
   - No backup needed (HA manages its own storage)
   - No restart needed (changes are live)

2. **Update `ha-helpers.ts`** — use WS backend for collection types:
   - Route collection types → `collection-ws.ts`
   - Route config entry types → `config-entry.ts` (unchanged for now)
   - Remove "⚠️ Restart HA" messages for collection types
   - Keep backup/restore actions as emergency recovery (reads storage files)

3. **Keep `lib/backends/collection.ts`** — retain as fallback / backup-restore path. Don't delete yet.

4. **Research config entry flows** — investigate `config_entries/flow` WS commands to see if config entry helpers can also go live. This is Phase 1b if feasible.

### Validation

- Verify field names match between our schemas and WS create/update expectations
- Check if WS `{domain}/list` returns the same shape as storage items
- Test error responses (duplicate ID, missing required fields, not found)

## Phase 2: Migrate `ha-entities` to WS

**Goal:** Live entity registry data + add update/remove capabilities.
**Impact:** MEDIUM — adds mutation capabilities, removes storage dependency.

### What changes

| Current | WS Replacement |
|---------|---------------|
| `apiGet("/api/states")` | Keep REST (or `get_states` WS — equivalent) |
| `readStorage("core.entity_registry")` | `wsCommand("config/entity_registry/list")` |
| `readStorage("core.device_registry")` | `wsCommand("config/device_registry/list")` |
| `readStorage("core.area_registry")` | `wsCommand("config/area_registry/list")` |
| (not available) | `wsCommand("config/entity_registry/update", ...)` |
| (not available) | `wsCommand("config/entity_registry/remove", ...)` |

### New actions for `ha-entities`

- **update** — rename entity, change entity_id, set area/labels, disable/enable, change icon
- **remove** — delete orphaned/unwanted entities from the registry

### Plan

1. Replace storage reads with WS calls in registry loaders
2. Add `update` and `remove` actions with appropriate parameters
3. Keep REST for `/api/states` (simpler for one-shot reads than WS subscription)

## Phase 3: New Registry Tools

**Goal:** Full management of areas, floors, and labels.
**Impact:** MEDIUM — completes the organizational layer.
**Effort:** Small — these are all simple CRUD over WS.

### `ha_areas` tool

Manages areas and floors (combined — floors are the parent of areas).

| Action | WS Command |
|--------|-----------|
| list | `config/area_registry/list` + `config/floor_registry/list` |
| get | List + filter, enrich with device/entity counts |
| create-area | `config/area_registry/create` (name, floor_id, icon, labels, aliases) |
| update-area | `config/area_registry/update` |
| delete-area | `config/area_registry/delete` |
| create-floor | `config/floor_registry/create` (name, level, icon, aliases) |
| update-floor | `config/floor_registry/update` |
| delete-floor | `config/floor_registry/delete` |
| reorder | `config/area_registry/reorder` / `config/floor_registry/reorder` |

### `ha_labels` tool

| Action | WS Command |
|--------|-----------|
| list | `config/label_registry/list` |
| create | `config/label_registry/create` (name, color, icon, description) |
| update | `config/label_registry/update` |
| delete | `config/label_registry/delete` |

## Phase 4: Config Entry Helpers via WS

**Goal:** Eliminate restart for config-entry-based helpers (template, derivative, utility_meter, etc.).
**Impact:** HIGH — completes the "no restart" story.
**Effort:** Medium-Large — config flows are multi-step.

### Investigation needed

Config entry helpers are created via `config_entries/flow`, which is a multi-step wizard:
1. `config_entries/flow` with `handler: "domain"` → returns `flow_id` + first step
2. Submit step data → may return next step or create entry

Need to map out the flow for each helper type:
- How many steps?
- What data at each step?
- Can we complete in a single round-trip?
- How does options update work (`config_entries/update`)?

### 17 config entry helper types

derivative, filter, generic_hygrostat, generic_thermostat, group, history_stats, integration, min_max, mold_indicator, random, statistics, switch_as_x, template, threshold, tod, trend, utility_meter

## Phase 5: Dashboard Management

**Goal:** View and edit Lovelace dashboards.
**Impact:** MEDIUM — popular request.

| Action | WS Command |
|--------|-----------|
| list | `lovelace/dashboards` (collection WS) |
| get-config | `lovelace/config` + `url_path` |
| save-config | `lovelace/config/save` |
| create | `lovelace/dashboards/create` |
| delete | `lovelace/dashboards/delete` |
| resources | `lovelace/resources/list` |

## Phase 6: Future Tools

Lower priority, enabled by WS:

| Tool | WS Commands | Notes |
|------|-------------|-------|
| `ha_automations` | automation collection CRUD + trace | Large — automation configs are complex |
| `ha_search` | `search/related` | Find everything related to a device/entity/area |
| `ha_system` | `system_log/list`, integration info | Diagnostics and troubleshooting |
| `ha_history` | `recorder/statistics_during_period` | Query historical data |
| `ha_backup` | backup WS commands | Create/restore HA backups |

## Migration Strategy

### Storage file access — deprecation path

| Phase | Storage reads | Storage writes | WS |
|-------|--------------|----------------|-----|
| Current | Registries + helpers | Helpers (+ restart) | Devices only |
| Phase 1 | Registries only | Config entry helpers only | Devices + collection helpers |
| Phase 2 | Schemas only | Config entry helpers only | Devices + helpers + entities + registries |
| Phase 4 | Schemas only | None (backup/restore only) | Everything |

### What stays on REST

- `ha-template` — one-shot template rendering (WS is subscription-based, overkill)
- `ha-services` — service listing and calling (REST is clean, no benefit from WS)
- `ha-restart` — service calls for restart/reload (REST is appropriate)
- Entity state reads in `ha-entities` and `ha-devices` — `/api/states` is simple and sufficient

### What stays as storage file reads

- Schema JSON files in `schemas/` — these are our extracted schemas, not HA storage
- Backup/restore in `lib/backup.ts` — emergency recovery, orthogonal to WS

## Execution Order

```
Phase 1:  ha-helpers collection → WS        (highest impact, eliminates restarts)
Phase 2:  ha-entities → WS registries        (adds update/remove, live data)
Phase 3:  ha_areas + ha_labels tools          (new tools, trivial CRUD)
Phase 4:  ha-helpers config entries → WS      (research config flows first)
Phase 5:  ha_dashboards tool                  (new tool)
Phase 6:  ha_automations, ha_search, etc.     (future)
```

Each phase is independently shippable and testable.
