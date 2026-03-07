# Automation Builder — Interactive In-Memory Builder

## Concept

The HA frontend automation editor builds automations interactively — you pick a trigger type, it shows you available fields with selectors, you fill them in, repeat for conditions and actions. Our tool should work the same way but as a **stateful builder** that stores the work-in-progress automation on disk (temp folder) and provides step-by-step building.

## How the Frontend Works (Research Findings)

### Architecture
1. **Static type catalog** — The 18 trigger types, 9 condition types, and 14 action types are hardcoded in the frontend with their TypeScript interfaces defining exact fields
2. **Dynamic integration triggers** — `trigger_platforms/subscribe` WS subscription streams integration-specific trigger descriptions with selector metadata. Core triggers (state, time, etc.) are NOT in this stream — they're always available
3. **Dynamic integration conditions** — `condition_platforms/subscribe` does the same for conditions
4. **Service schemas for actions** — `get_services` WS command returns all available services with their field schemas and selectors (entity pickers, number ranges, etc.)
5. **Superstruct validation** — Each frontend editor validates locally using superstruct schemas
6. **REST config API** — Final save goes to `POST /api/config/automation/config/{id}` which validates server-side and auto-reloads

### Key Data Sources
| Source | What it provides | Dynamic? |
|--------|-----------------|----------|
| Frontend TS types | Trigger/condition/action field definitions | No (compile-time) |
| `trigger_platforms/subscribe` WS | Integration-specific trigger fields + selectors | Yes |
| `condition_platforms/subscribe` WS | Integration-specific condition fields + selectors | Yes |
| `get_services` WS | All services with field schemas for action builder | Yes |
| `get_states` WS | Entity IDs for entity pickers | Yes |
| `config/entity_registry/list` WS | Entity metadata (domain, platform, area) | Yes |
| `config/device_registry/list` WS | Device info for device triggers/actions | Yes |
| `config/area_registry/list` WS | Area names for area targets | Yes |

### Frontend Trigger Type Catalog
Each trigger editor component defines:
1. `defaultConfig()` — initial empty config for that type
2. `_schema` — dynamic `ha-form` schema with selectors (entity picker, state picker, etc.)
3. Superstruct validation schema for runtime checks

## Builder Design

### Core Idea
A **temp file** stores the automation being built/edited. The tool operates on this file, adding/removing/modifying elements step by step. The agent can:
1. Start a new automation or load an existing one
2. Add triggers one at a time, with guided field selection
3. Add conditions with proper field validation
4. Add actions — service calls (with live service schema lookup), control flow blocks, etc.
5. Preview as YAML (for cross-referencing with internet docs)
6. Save to HA (POST to config API) or discard

### Temp Storage
```
/tmp/ha-automation-builder/
  current.json          # The work-in-progress automation config
  current.yaml          # YAML mirror for preview/manual editing
```

### Tool Actions

#### Session Management
| Action | Description |
|--------|-------------|
| `new` | Start a new empty automation (alias required) |
| `load` | Load existing automation by id into builder |
| `show` | Show current builder state (JSON) |
| `yaml` | Show current builder state as YAML |
| `save` | Save to HA (POST config API) — validates + auto-reloads |
| `discard` | Clear the builder |

#### Trigger Builder
| Action | Description |
|--------|-------------|
| `list-trigger-types` | Show all available trigger types with their fields |
| `add-trigger` | Add a trigger (specify type + fields) |
| `update-trigger` | Update trigger at index |
| `remove-trigger` | Remove trigger at index |

#### Condition Builder
| Action | Description |
|--------|-------------|
| `list-condition-types` | Show all available condition types with fields |
| `add-condition` | Add a condition |
| `update-condition` | Update condition at index |
| `remove-condition` | Remove condition at index |

#### Action Builder
| Action | Description |
|--------|-------------|
| `list-action-types` | Show all action types (service call, delay, choose, if, etc.) |
| `list-services` | List available services (uses get_services WS) for service call actions |
| `get-service` | Get field schema for a specific service |
| `add-action` | Add an action |
| `update-action` | Update action at index |
| `remove-action` | Remove action at index |

#### Metadata
| Action | Description |
|--------|-------------|
| `set-mode` | Set automation mode (single/restart/queued/parallel) |
| `set-description` | Set description |

### Smart Field Discovery

When adding a trigger/condition/action, the tool should:
1. Know what fields are available for each type (from our static schema)
2. For service call actions, dynamically look up the service schema from HA
3. Validate field types before adding
4. Provide helpful error messages with valid options

### YAML Round-Trip

The builder should support:
1. **Export as YAML** — for when the agent wants to reference internet documentation
2. **Import from YAML** — paste YAML from internet examples into the builder
3. **Edit as YAML** — write YAML to temp file, tool reads it back as the new state

This handles the "all docs on the internet are YAML" problem — the agent can always fall back to YAML editing while still having structured building available.

## What We Need from the Frontend Source

### Static Schema Extract
From the frontend TS types, extract a JSON schema catalog:

```json
{
  "triggers": {
    "state": {
      "fields": {
        "entity_id": {"type": "string|string[]", "required": true, "selector": {"entity": {"multiple": true}}},
        "attribute": {"type": "string", "selector": {"attribute": {}}},
        "from": {"type": "string|string[]|null", "selector": {"state": {"multiple": true}}},
        "to": {"type": "string|string[]|null", "selector": {"state": {"multiple": true}}},
        "for": {"type": "string|number|ForDict", "selector": {"duration": {}}}
      },
      "default": {"trigger": "state", "entity_id": []}
    },
    ...
  },
  "conditions": { ... },
  "actions": { ... }
}
```

### Dynamic Schema at Runtime
- Service schemas come from `get_services` WS
- Integration-specific triggers/conditions come from subscribe WS (mostly empty for dev instance)
- Entity/device/area lists come from registry WS commands

## Implementation Notes

- The temp file approach means the builder state survives across tool calls without using process memory
- JSON is the canonical format (matches what the REST API accepts)
- YAML is for display/import only (using js-yaml for conversion)
- Validation happens both locally (field type checking) and server-side (HA validates on save)
- The tool should be ONE tool (`ha_automations`) with expanded actions, not a separate tool
