# Future Features (Backlog)

Ideas and candidates for future implementation. Not scheduled — pick when ready.

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
