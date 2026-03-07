# Future Features (Phase 2)

Advanced features requiring deeper implementation. Pick after Phase 1 (NEXT.md) is complete.

---

## Feature: Integration Documentation Lookup

### Problem
When configuring integrations, the agent needs to know what config options, entities, services, and triggers each integration provides. This info lives in the HA docs repo on GitHub but isn't available locally in a structured way.

### Concept
A tool that wraps the HA integrations documentation index on GitHub, fetches specific integration docs on demand, and injects them as context.

### Implementation Ideas
- `ha_docs` tool with actions:
  - `list` — list all integrations from the GitHub index (cached locally)
  - `get` — fetch a specific integration's documentation markdown from GitHub, return as context
  - `search` — search integration docs by keyword
- Source: `https://raw.githubusercontent.com/home-assistant/home-assistant.io/current/source/_integrations/`
- Each integration has a markdown file: `<domain>.markdown`
- Cache fetched docs locally (e.g., `/tmp/ha-docs-cache/`) with TTL
- The index could be built from the GitHub API listing or from a manifest file
- Alternative: use the already-mirrored `docs/homeassistant/` if it covers integrations sufficiently

### Value
- Agent can look up "what services does the `media_player` integration provide?" on demand
- No need to pre-load all docs — fetch only what's needed for the current task
- Keeps context window small — only the relevant integration's docs are loaded

---

## Feature: Entity & Configuration Relationship Graph Engine

### Problem
Home Assistant has no built-in way to see the full picture of how everything connects. Entities are referenced across automations, scripts, scenes, dashboards, helpers, groups, templates, and YAML includes — but there's no unified index. Renaming an entity, deleting a helper, or reorganizing areas risks breaking things silently because you can't see all the places something is used.

### Concept
A dedicated indexing engine that parses **all** configuration sources and builds a complete relationship graph:

1. **YAML Parser** — Parse `configuration.yaml` and recursively follow all `!include`, `!include_dir_merge_named`, `!include_dir_list`, `!include_dir_merge_list`, and `!include_dir_named` directives to discover every YAML file that contributes to the config.

2. **Storage Parser** — Read all `.storage/` files to extract:
   - All entity registrations (`core.entity_registry`)
   - All device registrations (`core.device_registry`)
   - All area/floor/label assignments (`core.area_registry`, `core.floor_registry`, `core.label_registry`, `core.category_registry`)
   - All helpers (input_boolean, input_number, counter, timer, schedule, template sensors, utility meters, etc.)
   - All automations (`automations.json` or `.storage/core.config_entries` for UI-created ones)
   - All scripts, scenes
   - All dashboard configs (`.storage/lovelace*`)
   - All person, zone, tag definitions

3. **Reference Extractor** — Scan all discovered configs for entity_id references:
   - Direct references: `entity_id: sensor.temperature`
   - Template references: `{{ states('sensor.temperature') }}`, `{{ state_attr(...) }}`, `{{ is_state(...) }}`
   - Service call targets: `target: { entity_id: ... }`
   - Trigger/condition entity references
   - Group members, template sensor source entities
   - Dashboard card entity references
   - Label usage on entities, devices, areas
   - Area assignments on entities and devices

4. **Graph Builder** — Produce a structured index:
   - **Node types**: entity, device, area, floor, label, automation, script, scene, dashboard, helper, yaml_file
   - **Edge types**: `references`, `triggers_on`, `controls`, `member_of`, `labeled_with`, `located_in`, `defined_in`, `included_by`
   - Bidirectional lookups: "what uses entity X?" and "what does automation Y reference?"

### Tool Design: `ha_graph`

| Action | Description |
|--------|-------------|
| `build` | Full index rebuild — parse all YAML + .storage, build graph, cache result |
| `status` | Show last build time, node/edge counts, any parse errors |
| `query` | Query the graph — find all references to an entity, label, area, etc. |
| `impact` | Impact analysis — "if I rename/delete X, what breaks?" |
| `orphans` | Find orphaned entities (registered but referenced nowhere) |
| `unused-labels` | Find labels that are defined but not applied to anything |
| `unused-areas` | Find areas with no devices or entities assigned |
| `duplicates` | Find entities that appear to be duplicates (similar names/devices) |
| `summary` | High-level overview — counts by type, most-referenced entities, busiest automations |
| `export` | Export graph as JSON (for visualization or external tools) |

### Query Examples
```
ha_graph query entity_id=sensor.temperature
→ Referenced by:
    automation.heating_control (trigger, condition, action)
    script.morning_routine (action)
    lovelace.dashboard_home (entities card, history-graph card)
    group.climate_sensors (member)
    template sensor.average_temp (source)

ha_graph impact entity_id=sensor.temperature action=rename
→ 12 references across 5 files would need updating:
    automations.yaml: lines 42, 87, 103
    scripts.yaml: line 15
    .storage/lovelace.dashboard_home: 2 card references
    .storage/core.config_entries: 1 template sensor
    groups.yaml: 1 member reference

ha_graph orphans
→ 23 entities registered but never referenced:
    sensor.old_weather_temp (last_changed: 2024-01-15)
    binary_sensor.unused_motion (disabled, no references)
    ...
```

### Implementation Plan

**Phase 1: Core Engine** (`lib/graph/`)
- `parser.ts` — YAML recursive include resolver (follows all `!include*` directives)
- `storage-scanner.ts` — `.storage/` file reader, extracts all registered objects
- `reference-extractor.ts` — Regex + template parser to find entity_id references in any config blob
- `graph.ts` — In-memory graph structure with nodes, edges, bidirectional index
- `cache.ts` — Serialize/deserialize built graph to `/tmp/` or `.storage/` for fast reload

**Phase 2: Tool** (`tools/ha-graph.ts`)
- Tool registration with all actions above
- Query language: simple key=value filters, optionally with depth for transitive references
- Formatted output: grouped by reference type, with file locations

**Phase 3: Integration**
- Auto-suggest `ha_graph impact` before any rename/delete operation in other tools
- `ha_entities regenerate-ids` could use the graph to show full impact beyond just automations/scripts/scenes
- `ha_graph build` could run on a schedule or be triggered after config changes

### Technical Notes
- YAML `!include` parsing needs a custom loader — `js-yaml` supports custom types
- Template reference extraction needs regex for `states(`, `state_attr(`, `is_state(`, `is_state_attr(`, plus Jinja2 variable references
- `.storage/` files are JSON — straightforward to parse
- Dashboard configs can be YAML (file mode) or `.storage/lovelace*` (UI mode) — handle both
- The graph should be rebuildable in <5 seconds for a typical install (hundreds of entities, dozens of automations)
- Entity IDs in templates may use variables — best-effort extraction, flag uncertain references
- Consider using the HA REST API as a secondary source for runtime state (entity list, area assignments) to cross-validate against file-based parsing

### Value
- **Rename safety**: Know exactly what breaks before changing an entity_id
- **Cleanup**: Find orphaned entities, unused labels/areas, dead automations
- **Understanding**: New users (or agents) can see the full topology of an HA install at a glance
- **Refactoring**: Confidently reorganize areas, labels, and entity naming conventions
- **This doesn't exist in HA** — the closest is the "related" panel in entity settings, which only shows device/area/integration, not config-level references
