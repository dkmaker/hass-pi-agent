# Next Steps — Automation Builder

## Context

Phases 1-3 of the WebSocket migration are complete. All 9 tools are working:
- `ha_helpers` — collection helpers via WS (live, no restart), config entries via storage
- `ha_entities` — WS registries + update/remove
- `ha_devices` — full WS
- `ha_areas` — full WS CRUD for areas + floors
- `ha_labels` — full WS CRUD
- `ha_automations` — REST+WS CRUD, trigger, traces
- `ha_services` — REST service listing + calling
- `ha_template` — REST template rendering
- `ha_restart` — REST restart/reload

The `ha_automations` tool can create/update/delete automations, but **building complex automations is hard** — the agent has to construct the entire JSON config in one shot. The HA frontend solves this with an interactive step-by-step editor. We need the same.

## Goal

**Interactive automation builder** — a stateful tool that builds automations step-by-step, just like the HA frontend editor. The automation is stored in a temp file on disk between tool calls.

## Phase 1: Extract Automation Element Schemas

**Source:** `ha-frontend/src/` — TypeScript interfaces + superstruct schemas + default configs

### Deliverable: `schemas/automation-elements.json`

Extract from the frontend source into a single JSON catalog:

```json
{
  "triggers": {
    "state": {
      "description": "Entity state changes",
      "fields": {
        "entity_id": {"type": "string|string[]", "required": true},
        "attribute": {"type": "string"},
        "from": {"type": "string|string[]|null"},
        "to": {"type": "string|string[]|null"},
        "for": {"type": "duration"}
      },
      "default": {"trigger": "state", "entity_id": []}
    },
    ...18 trigger types
  },
  "conditions": {
    ...9 condition types
  },
  "actions": {
    ...14 action types
  }
}
```

### What to extract per type:
1. **Fields** — name, type, required, default (from TS interfaces + superstruct)
2. **Default config** — from `static get defaultConfig()` in each editor component
3. **Available options** — for enum fields (e.g., sun event: sunrise/sunset)

### Method:
- Parse the TS source files programmatically or manually build the JSON
- The frontend has ~40 editor components (18 triggers + 9 conditions + 14 actions) — each is self-contained
- Cross-reference with `docs/automation-schema.md` (already written)

## Phase 2: Expand `ha_automations` Tool with Builder Actions

Extend the existing `ha_automations` tool (NOT a new tool) with builder actions.

### New actions:

#### Session
| Action | Params | Description |
|--------|--------|-------------|
| `new` | `alias` (required), `description` (required), `mode?` | Start new draft. Validates alias is unique against HA. |
| `load` | `automation_id` | Load existing automation from HA into a draft |
| `list-drafts` | — | List all in-progress drafts in temp folder |
| `show` | `alias` | Show draft state as JSON |
| `yaml` | `alias` | Show draft state as YAML |
| `save` | `alias`, `automation_id?` | Save draft to HA via REST API (validates + reloads), removes draft |
| `discard` | `alias` | Delete a draft |

#### Element CRUD (triggers, conditions, actions)
| Action | Params | Description |
|--------|--------|-------------|
| `list-trigger-types` | — | Show available trigger types with fields |
| `add-trigger` | `alias`, `config: {trigger: "state", entity_id: "..."}` | Add trigger to draft |
| `update-trigger` | `alias`, `index`, `config` | Update trigger at index |
| `remove-trigger` | `alias`, `index` | Remove trigger at index |
| `list-condition-types` | — | Show available condition types with fields |
| `add-condition` | `alias`, `config: {condition: "state", ...}` | Add condition to draft |
| `update-condition` | `alias`, `index`, `config` | Update condition at index |
| `remove-condition` | `alias`, `index` | Remove condition at index |
| `list-action-types` | — | Show action types + building blocks |
| `add-action` | `alias`, `config: {action: "light.turn_on", ...}` | Add action to draft |
| `update-action` | `alias`, `index`, `config` | Update action at index |
| `remove-action` | `alias`, `index` | Remove action at index |

#### Dynamic Schema Lookup
| Action | Params | Description |
|--------|--------|-------------|
| `get-service-schema` | `service: "light.turn_on"` | Get service fields from HA (for building service call actions) |

### Temp storage
```
/tmp/ha-automation-builder/
  my_morning_routine.json
  evening_lights.json
  ...
```
- One file per automation, named from the alias (slugified)
- Created on `new` (requires `alias` + `description`)
- On `new`, validates alias doesn't conflict with existing automations in HA (WS lookup, no upload)
- Read/written on every builder action (specify which automation by alias/filename)
- Cleared on `save` (uploaded to HA) or `discard`
- `list-drafts` action to show all in-progress automations
- JSON format (matches REST API input)

### Validation
- On `add-*` / `update-*`: validate against the schema catalog (field names, types, required)
- On `save`: HA validates server-side (the POST endpoint calls `async_validate_config_item`)
- Report errors clearly with what fields are wrong and what's expected

## Phase 3: YAML Round-Trip

Add YAML support for internet documentation compatibility:

| Action | Description |
|--------|-------------|
| `yaml` | Export builder state as YAML |
| `import-yaml` | Import YAML string into builder (replaces current state) |
| `edit-yaml` | Write builder state to temp `.yaml` file for manual editing, read back |

This handles the "all internet docs are YAML" use case — the agent can grab YAML examples and import them, or export to YAML for comparison.

## Phase 4: Smart Suggestions

Enhance the builder with context-aware suggestions:

- When adding a service call action, use `get_services` to list available services and their fields
- When a trigger/condition needs an `entity_id`, use entity registry to suggest valid entities
- When a condition references a trigger `id`, validate it exists in the current trigger list
- For `choose`/`if` blocks, validate that nested conditions and actions are valid

## Implementation Order

```
1. Extract automation-elements.json from frontend source
2. Add builder session actions (new/load/show/save/discard)
3. Add element CRUD (add/update/remove trigger/condition/action)  
4. Add list-*-types actions (show available types from schema)
5. Add get-service-schema (dynamic lookup from HA)
6. Add YAML round-trip
7. Smart suggestions
```

Steps 1-5 are the MVP. Steps 6-7 are nice-to-have.

## Files to Change

```
.pi/extensions/home-assistant/
  schemas/
    automation-elements.json    # NEW — extracted from frontend
  tools/
    ha-automations.ts           # EXPAND — add builder actions
  docs/
    automation-schema.md        # EXISTS — reference doc (keep as-is)
```

## Key Design Decisions

1. **One tool, not two** — extend `ha_automations` rather than creating a separate builder tool
2. **Temp file, not memory** — survives across tool calls, can be inspected
3. **JSON canonical, YAML for display** — matches what the REST API accepts
4. **Static + dynamic schemas** — static catalog for trigger/condition/action types, dynamic `get_services` for service call fields
5. **Server-side validation on save** — we validate basics locally, HA validates everything on POST
