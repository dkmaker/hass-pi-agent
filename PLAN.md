# Storage Rewrite Plan — Unified Helper Management (COMPLETED)

## Goal

One tool (`ha_helpers`) that manages ALL helper types — both collection-style (input_boolean, counter, etc.) and config-entry-style (template, group, derivative, etc.) — through a unified interface with a positive-list registry that gates what's supported.

## Architecture

### Layer 1: Supported Types Registry (`lib/registry.ts`)

The gatekeeper. A TypeScript module that:
- Scans `schemas/collections/` and `schemas/config_entries/` at startup
- Filters to helper-relevant types only (excludes lovelace, person, zone, tag, etc.)
- Provides schema loading, field validation, and storage routing
- Categorizes types into groups (e.g., "helper") — extensible later for "automation", "scene", etc.

```typescript
interface SupportedType {
  domain: string;              // "input_number", "template", "group"
  category: string;            // "helper" — later: "automation", "scene"
  storageType: "collection" | "config_entry";
  storageKey: string;          // "input_number" or "core.config_entries"
  schema: SchemaDefinition;    // parsed from JSON file
}
```

**Positive list rule**: If a type has no schema file, or is explicitly excluded, the tool refuses to manage it. No schema = no support.

The category system groups types logically (helpers, scenes, automations) so shared behavior can be reused while keeping a unified approach.

### Layer 2: Storage Backends

Common interface:
```typescript
interface StorageBackend {
  list(domain: string): Item[]
  get(domain: string, id: string): Item | null
  add(domain: string, fields: Record<string, unknown>): BackendResult
  update(domain: string, id: string, fields: Record<string, unknown>): BackendResult
  remove(domain: string, id: string): BackendResult
}
```

#### Collection Backend (`lib/backends/collection.ts`)

Handles: `input_boolean`, `input_number`, `input_text`, `input_select`, `input_datetime`, `input_button`, `counter`, `timer`, `schedule`

Storage: `.storage/<domain>` → `data.items[]`

Extracted from current `ha-helpers.ts`, made generic (no hardcoded types).

#### Config Entry Backend (`lib/backends/config-entry.ts`)

Handles: `template`, `derivative`, `utility_meter`, `group`, `threshold`, `trend`, `tod`, `statistics`, `min_max`, `filter`, `integration`, `generic_thermostat`, `generic_hygrostat`, `switch_as_x`, `random`, `history_stats`, `mold_indicator`

Storage: `.storage/core.config_entries` → `data.entries[]` (filtered by `domain`)

Must generate ULID `entry_id`, set `source: "user"`, timestamps, version, etc.
User fields go into `options`, `data` is always `{}`.

**On removal**: Must also clean up `core.entity_registry` entries matching the `config_entry_id`, otherwise orphaned `unavailable` entities persist.

### Layer 3: Tool (`tools/ha-helpers.ts`)

Thin wrapper — no storage logic. Actions:
- `list-types` — show all supported types with field schemas, grouped by category
- `list [type]` — list helpers, optionally filtered
- `get <type> <id>` — get one helper
- `add <type> <fields>` — create (validates against schema first)
- `update <type> <id> <fields>` — update
- `remove <type> <id>` — remove
- `backups`, `restore`, `validate`, `restart` — unchanged

### Shared Libraries (unchanged)

- `lib/backup.ts` — backup with rotation
- `lib/storage.ts` — read/write `.storage` files
- `lib/config.ts` — env vars, paths
- `lib/config-check.ts` — HA API config validation + restart

## Scope

### IN scope (helpers only)
- All 9 collection-style helpers (input_*, counter, timer, schedule)
- All 17 config-entry-style helpers (template, group, derivative, etc.)

### OUT of scope (for now)
- Lovelace dashboards, person, zone, tag, application_credentials
- Core registries (area, device, entity, floor, label, category)
- Automations, scripts, scenes (future — registry design supports them)

## Implementation Order — ALL COMPLETED ✅

1. ✅ **Investigated open questions** — validated on VM + code (all 6 answered)
2. ✅ **`lib/registry.ts`** — positive list, schema loading, validation, routing (with sub-type support)
3. ✅ **`lib/backends/collection.ts`** — generic collection backend
4. ✅ **`lib/backends/config-entry.ts`** — config entry backend (with entity registry cleanup)
5. ✅ **Rewrite `tools/ha-helpers.ts`** — thin wrapper
6. ✅ **Tested on VM** — created group helper, template binary_sensor motion sensor, verified add/remove/cleanup
7. ✅ **Fixed schema extractor** — sub-type support for template (16 sub-types) and group
8. ✅ **Additional tools created:**
   - `ha_template` — render/validate Jinja2 templates
   - `ha_entities` — discover entities with device/area context
   - `ha_restart` — restart, reload-all, reload-core, reload-templates, reload-domain, validate
   - `ha_services` — list, get, call services with full schema introspection

## Open Questions

### Q1: Config entry auto-creates entity registry? ✅ ANSWERED
**Answer**: YES. When a config entry is added to `core.config_entries` and HA restarts, HA automatically creates the entity registry entry. Tested on VM: added a `group` sensor config entry, restarted, and `sensor.test_sensor_group` appeared with correct state.

**Implication**: We only need to write to `core.config_entries` for add operations. No entity registry manipulation needed for creation.

### Q2: Required config entry fields ✅ ANSWERED
**Answer**: All fields from `ConfigEntry.as_dict()` must be present in the storage file. The complete field list (from HA source `config_entries.py`):

```json
{
  "created_at": "ISO timestamp",
  "data": {},                          // Always {} for schema-based helpers
  "disabled_by": null,
  "discovery_keys": {},
  "domain": "group",
  "entry_id": "ULID string",
  "minor_version": 1,
  "modified_at": "ISO timestamp",
  "options": { ... user fields ... },  // ALL user config goes here
  "pref_disable_new_entities": false,
  "pref_disable_polling": false,
  "source": "user",
  "subentries": [],
  "title": "Display Name",
  "unique_id": null,
  "version": 1
}
```

**Key insight**: `SchemaConfigFlowHandler.async_create_entry()` calls `super().async_create_entry(data={}, options=data, title=...)` — meaning **all user-provided fields go into `options`, `data` is always empty `{}`** for all schema-based config flow helpers.

### Q3: Entity registry cleanup on removal ✅ ANSWERED
**Answer**: NO. HA does NOT auto-clean entity registry entries when a config entry is removed. The entity shows as `unavailable` with `restored: True`, and the entity registry entry remains orphaned.

**Implication**: When removing a config entry helper, we MUST also remove the corresponding entries from `core.entity_registry` (matching by `config_entry_id`). Tested and confirmed on VM.

### Q4: Config entry field mapping ✅ ANSWERED
**Answer**: For all schema-based config flow helpers (group, template, derivative, etc.):
- `data` = always `{}` (empty)
- `options` = all user-provided fields (name, entities, type, etc.)
- `title` = display name (usually same as `options.name`)

This is hardcoded in `SchemaConfigFlowHandler.async_create_entry()` in HA core.

### Q5: entry_id format ✅ ANSWERED
**Answer**: ULIDs — generated by `ulid_transform.ulid_now()`. Format: 26-char Crockford Base32 string (e.g., `01KK4E186DQCJCEC6R0FVT85M4`). HA uses them as opaque identifiers. We tested with a non-standard format (`01TESTGROUP00000000000001`) and it worked fine — HA doesn't validate ULID format, just uses it as a unique string. However, we should generate proper ULIDs for correctness.

### Q6: Schedule helper structure ✅ ANSWERED
**Answer**: Standard structure, no special handling needed. Each day (monday–sunday) is an array of `{from: "HH:MM:SS", to: "HH:MM:SS", data?: {}}` objects. The schema correctly documents this.

## Files to Create/Modify

```
.pi/extensions/home-assistant/
  lib/
    registry.ts                # NEW — positive list, schema loading, routing
    backends/
      collection.ts            # NEW — generic collection backend
      config-entry.ts          # NEW — config entry backend
    backup.ts                  # KEEP
    storage.ts                 # KEEP
    config.ts                  # KEEP
    config-check.ts            # KEEP
  tools/
    ha-helpers.ts              # REWRITE — thin wrapper
  schemas/                     # KEEP — used by registry
```
