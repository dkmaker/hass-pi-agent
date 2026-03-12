import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { supportedDomains } from "../lib/registry.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

const RELOADABLE_DOMAINS = [
  "automation", "conversation", "frontend", "input_boolean", "input_button",
  "input_datetime", "input_number", "input_select", "input_text", "person",
  "scene", "schedule", "script", "template", "timer", "zone",
];

function buildToolDocs(): Record<string, string> {
  const allDomains = supportedDomains().join(", ");
  const reloadable = RELOADABLE_DOMAINS.join(", ");

  return {
    ha_addons: `## ha_addons — Manage Home Assistant Add-ons

Actions:
- list: List installed add-ons with state and version.
- get: Get full add-on details — config schema, options, state.
- start: Start an add-on.
- stop: Stop an add-on.
- restart: Restart an add-on.
- install: Install an add-on from the store.
- uninstall: Uninstall an add-on.
- update: Update an add-on to latest version.
- logs: Get add-on logs (plain text, last N lines).
- stats: Get add-on CPU/memory usage.
- config: View current add-on configuration.
- set-config: Update add-on configuration.
- store: Browse available add-ons in the store (with optional search filter).
- store-refresh: Refresh the add-on store cache.
- list-repos: List configured add-on repositories.
- add-repo: Add a new repository URL.
- remove-repo: Remove a repository.`,

    ha_areas: `## ha_areas — Manage Home Assistant Areas and Floors

Actions:
- list: List all areas grouped by floor, with device/entity counts.
- get: Get area details with devices and entities.
- create-area: Create a new area (name required, optional: floor_id, icon, labels, aliases).
- update-area: Update an area.
- delete-area: Delete an area.
- list-floors: List all floors.
- create-floor: Create a new floor (name required, optional: level, icon, aliases).
- update-floor: Update a floor.
- delete-floor: Delete a floor.

All changes take effect immediately via WebSocket.`,

    ha_automations: `## ha_automations — Full Automation Management

Actions:
- list: List all automations with state and last triggered time. Filters: state (on/off), search.
- get: Get full automation config + current state.
- create: Create a new automation (alias and at least one trigger+action required). Auto-reloads.
- update: Update an existing automation config. Auto-reloads.
- delete: Delete an automation. Auto-cleans entity registry.
- trigger: Manually trigger an automation.
- enable: Enable a disabled automation.
- disable: Disable an automation.
- traces: List recent execution traces for an automation.
- trace: Get detailed trace for a specific run.

Builder actions (step-by-step automation construction):
- new: Start a new draft automation (requires alias, description).
- load: Load an existing automation into a draft for editing.
- list-drafts: List all in-progress drafts.
- show: Show draft state as JSON.
- yaml: Show draft state as YAML.
- save: Save draft to HA (validates + auto-reloads). Removes draft on success.
- discard: Delete a draft.
- list-trigger-types: Show available trigger types with fields.
- add-trigger: Add a trigger to a draft.
- update-trigger: Update a trigger at index.
- remove-trigger: Remove a trigger at index.
- list-condition-types: Show available condition types with fields.
- add-condition: Add a condition to a draft.
- update-condition: Update a condition at index.
- remove-condition: Remove a condition at index.
- list-action-types: Show available action types with fields.
- add-action: Add an action to a draft.
- update-action: Update an action at index.
- remove-action: Remove an action at index.
- get-service-schema: Get service fields from HA (for building service call actions).
- import-yaml: Import YAML string into a draft.

All changes take effect immediately — HA auto-reloads after writes.`,

    ha_backups: `## ha_backups — Manage Home Assistant Backups

Actions:
- list: List all backups with date, type, and size.
- get: Get detailed backup info (add-ons, folders, HA version).
- create-full: Create a full backup (all config, add-ons, folders).
- create-partial: Create a partial backup (specify add-ons/folders).
- restore-full: Restore a full backup.
- restore-partial: Restore specific parts of a backup.
- delete: Delete a backup.`,

    ha_blueprints: `## ha_blueprints — Manage Home Assistant Blueprints

Actions:
- list: List all blueprints, optionally filtered by domain (automation/script).
- import: Import a blueprint from a URL (community forums, GitHub).
- delete: Delete a blueprint by path.

Blueprints are reusable automation/script templates stored in blueprints/<domain>/.`,

    ha_categories: `## ha_categories — Manage Categories for Automations/Scripts/Scenes

Actions:
- list: List all categories for a scope (automation, script, scene).
- create: Create a new category (scope and name required).
- update: Update a category by category_id.
- delete: Delete a category by category_id.

Categories help organize large numbers of automations/scripts/scenes in the UI.`,

    ha_conversation: `## ha_conversation — Home Assistant Conversation/Assist

Actions:
- process: Send text to the conversation agent and get a response (like talking to Assist).
- agents: List available conversation agents.

Useful for testing voice/assist commands and verifying intent handling.`,

    ha_dashboards: `## ha_dashboards — Manage Dashboards (Lovelace UI)

Actions:
- list: List all dashboards with view counts.
- get: Get full dashboard config (all views and cards). Use url_path (null for default).
- create: Create a new dashboard (title + url_path required).
- update: Update dashboard metadata (title, icon, sidebar, require_admin).
- delete: Delete a dashboard by dashboard_id.
- get-view: Get a specific view config by index or path.
- add-view: Add a new view to a dashboard.
- update-view: Update a view's config (merges with existing).
- remove-view: Remove a view by index.
- move-view: Move a view to a new position.
- add-card: Add a card to a view.
- update-card: Update a card's config at a specific index.
- remove-card: Remove a card from a view by index.
- move-card: Move a card to a different position or view.
- list-card-types: Show available built-in card types with field schemas.

Dashboard content is atomic — views/cards are fetched, modified in memory, and saved back as a whole config.
Custom cards use "custom:" prefix (e.g., type: "custom:mushroom-entity-card") with freeform config fields.`,

    ha_devices: `## ha_devices — Discover, Inspect, and Manage Devices

Actions:
- list: List devices with filters. Filters: integration, area, manufacturer, model, search. Hides disabled by default. Paginated.
- get: Full detail for one device — hardware info, integrations, area, all entities with states.
- update: Update device properties — rename (name_by_user), move to area (area_id), set labels, disable/enable.
- tree: Show device hierarchy — hub/bridge devices and their children via via_device_id.

Uses WebSocket API for live data. Entity states come from REST API.`,

    ha_docs: `## ha_docs — Integration and Configuration Documentation

Actions:
- list: List integrations with filters. Filters: category, platform, iot_class, integration_type, search. Shows matching integrations with key metadata.
- get: Get full documentation for a specific integration or doc page. Fetches from GitHub and caches locally.
- search: Search integration index by keyword (title, description, domain).
- update: Refresh the docs index from GitHub (fetches latest integration metadata).
- status: Show index info — version, source, integration/doc counts.

Index is auto-fetched on first startup and refreshed daily. Content is fetched on demand from GitHub and cached persistently.`,

    ha_entities: `## ha_entities — Discover and Inspect Entities

Actions:
- list: List entities with state. Filters: domain, device_id, search, state. Hides unavailable by default (reports count). Paginated.
- get: Full detail for one entity — state, attributes, device, area.
- domains: Overview of all domains with entity counts.
- update: Update entity — rename, change entity_id, set area/labels, disable/enable, change icon.
- remove: Remove an entity from the registry.
- regenerate-ids: Preview and apply new entity IDs based on current device/entity names. Accepts entity_ids array or device_id to select all entities for a device. Shows old→new mapping AND all automations/scripts/scenes that reference the affected entities. The agent MUST review the related items before confirming the rename.

Entity listings include device name and area when available.`,

    ha_events: `## ha_events — Capture Live Events

Actions:
- capture: Subscribe to events for N seconds and return what was captured. Useful for troubleshooting triggers, watching state changes, or seeing what's happening in real-time.

Common event types: state_changed, call_service, automation_triggered, script_started, homeassistant_start`,

    ha_graph: `## ha_graph — Entity & Configuration Relationship Graph

Actions:
- build: Full index rebuild — parse all YAML + .storage, build graph, cache result
- status: Show last build time, node/edge counts, any parse errors
- query: Find all references to/from an entity, area, label, etc.
- impact: Impact analysis — "if I rename/delete X, what breaks?"
- orphans: Find entities registered but referenced nowhere
- unused-labels: Find labels defined but not applied to anything
- unused-areas: Find areas with no devices or entities assigned
- summary: High-level overview — counts by type, most-referenced entities
- export: Export graph as JSON`,

    ha_helpers: `## ha_helpers — Manage All Helper Types

Supported types: ${allDomains}

Actions:
- list-types: Show all supported helper types with field schemas
- list: List all helpers, optionally filtered by type
- get: Get a specific helper by type and id
- add: Add a new helper (all types are live — no restart needed)
- update: Update an existing helper (all types are live — no restart needed)
- remove: Remove a helper by type and id (all types are live — no restart needed)

Collection helpers (input_boolean, input_number, input_text, input_select, input_datetime, input_button, counter, timer, schedule) use WebSocket — changes take effect immediately.
Config entry helpers (template, derivative, utility_meter, etc.) use the config flow API — changes take effect immediately.`,

    ha_history: `## ha_history — Query Entity State History

Actions:
- states: Get state changes for one or more entities. Shows when states changed and to what values.

Time can be relative (1h, 24h, 7d, 2w) or ISO datetime. Default: last 24 hours.`,

    ha_integrations: `## ha_integrations — Manage Integrations (Config Entries)

Actions:
- list: List all config entries. Optional: domain filter, search.
- get: Get full details for a config entry by entry_id.
- disable: Disable a config entry.
- enable: Enable a disabled config entry.
- reload: Reload a config entry.
- remove: Remove a config entry.

Config entries represent configured integrations (e.g., Hue bridge, MQTT, Weather).
Does NOT support adding new integrations (use the UI for config flow wizards).`,

    ha_labels: `## ha_labels — Manage Labels

Actions:
- list: List all labels.
- create: Create a new label (name required, optional: color, icon, description).
- update: Update a label.
- delete: Delete a label.

All changes take effect immediately via WebSocket.`,

    ha_logbook: `## ha_logbook — Activity Log Timeline

Actions:
- events: Get logbook events for entities, devices, or everything over a time range.

Time can be relative (1h, 24h, 7d) or ISO datetime. Default: last 24 hours.`,

    ha_logs: `## ha_logs — System Logs and Logger Levels

Actions:
- get: Get raw error log text (last N lines). Useful for seeing full tracebacks.
- list: List structured log entries with level, source, count. Filter by search.
- set-level: Set log level for specific integrations (e.g., debug for zwave_js).
- clear: Clear the system log.

Log levels: debug, info, warning, error, critical.
Integration format: "homeassistant.components.<domain>" (e.g., "homeassistant.components.zha").`,

    ha_notifications: `## ha_notifications — Persistent Notifications

Actions:
- list: List all persistent notifications.
- create: Create a persistent notification (message required, title and notification_id optional).
- dismiss: Dismiss a specific notification by ID.
- dismiss_all: Dismiss all persistent notifications.

Persistent notifications appear in the HA UI notification panel and persist until dismissed.`,

    ha_people: `## ha_people — Manage People

Actions:
- list: List all people with their device trackers.
- get: Get full details for a person by id.
- create: Create a new person (name required).
- update: Update a person by id.
- delete: Delete a person by id.

People link HA users to device trackers for presence detection.`,

    ha_mutations: `## ha_mutations — Pre-Mutation Backups and Changelog

Actions:
- log: Show recent mutation changelog entries (newest first). Filter by tool, action_filter, target. Limit defaults to 30.
- list: List backup snapshot files (newest first). Filter by tool, target.
- show: Show contents of a specific backup snapshot. Requires filename.
- purge: Remove old backups beyond retention limit. Optional keep_count.

Every write/update/delete action across all HA tools automatically snapshots the current state before applying changes.
Backups are stored in /homeassistant/.pi-backups/mutations/ with a JSONL changelog.
Use the /ha-log and /ha-backups slash commands for interactive TUI views.`,

    ha_recorder: `## ha_recorder — Recorder and Statistics Management

Actions:
- adjust: Adjust a statistic value (add/subtract from sum-based statistics).
- change-unit: Change the unit of measurement for a statistic.
- clear: Clear all statistics for a statistic_id.
- purge: Purge old data from the recorder database.
- info: Get recorder info (running, thread_running, migration).

Statistics management is useful for correcting utility meter readings or fixing unit mismatches.`,

    ha_restart: `## ha_restart — Restart or Reload Configuration

Actions:
- restart: Full Home Assistant restart (~30-60s). Required after storage file changes.
- reload-all: Reload all YAML-based configuration without restarting.
- reload-core: Reload core config (name, location, units, customize).
- reload-templates: Reload custom Jinja2 templates from custom_templates/.
- reload-domain: Reload a specific domain's config. Domains: ${reloadable}
- validate: Check configuration.yaml for errors before restarting.

Use 'restart' after modifying .storage files directly (rare — most operations use APIs now).
Use 'reload-*' after modifying YAML config (faster, no downtime).`,

    ha_scenes: `## ha_scenes — Manage Scenes

Actions:
- list: List all scenes. Filter by search.
- get: Get full scene config + state.
- create: Create a new scene (scene_id, name, and entities required).
- update: Update an existing scene config.
- delete: Delete a scene.
- activate: Activate a scene (restore saved entity states).
- snapshot: Create a scene by capturing current states of specified entities.

Scenes store entity state snapshots. When activated, all entities are restored to their saved states.`,

    ha_scripts: `## ha_scripts — Manage Scripts

Actions:
- list: List all scripts with state and last triggered time. Filters: state (on/off), search.
- get: Get full script config + current state.
- create: Create a new script (script_id, alias, and sequence required). Auto-reloads.
- update: Update an existing script config. Auto-reloads.
- delete: Delete a script.
- run: Run a script, optionally with input variables.
- stop: Stop a running script.
- traces: List recent execution traces for a script.
- trace: Get detailed trace for a specific run.

All changes take effect immediately — HA auto-reloads after writes.`,

    ha_services: `## ha_services — Discover and Call Services

Actions:
- list: List all available services, optionally filtered by domain. Shows service names grouped by domain.
- get: Get full schema for a specific service — fields, selectors, targets, required params.
- call: Call a service with optional data and target entity.

Service schemas come directly from Home Assistant and include field types, selectors, and valid targets.`,

    ha_shopping_list: `## ha_shopping_list — Shopping List

Actions:
- list: List all shopping list items.
- add: Add an item to the shopping list.
- update: Update an item (rename or mark complete/incomplete).
- remove: Remove an item from the list.
- clear: Clear all completed items.

Requires the Shopping List integration to be configured.`,

    ha_stats: `## ha_stats — Long-term Statistics

Actions:
- list: List available statistic IDs with metadata (unit, type, source).
- get: Get aggregated statistics over a time range with period grouping.

Time can be relative (1h, 24h, 7d) or ISO datetime.`,

    ha_system: `## ha_system — System Information

Actions:
- info: Supervisor info (version, channel, arch, supported, healthy).
- host: Host info (hostname, OS, kernel, disk usage, features).
- os: HAOS info (version, update available, board, boot slot).
- network: Network interfaces and configuration.
- resolution: System health issues and suggestions from the resolution center.`,

    ha_tags: `## ha_tags — Manage Tags (NFC/QR)

Actions:
- list: List all tags.
- get: Get tag details by id.
- create: Create a new tag (name optional, tag_id auto-generated if not provided).
- update: Update a tag by id.
- delete: Delete a tag by id.

Tags can be scanned to trigger automations via the tag_scanned event.`,

    ha_template: `## ha_template — Render and Validate Jinja2 Templates

Actions:
- render: Render a template and return the output. Use to test template expressions against live entity states.
- validate: Check if a template has valid syntax. Returns valid/invalid with error details.

Templates have access to all HA template functions: states(), is_state(), state_attr(), now(), as_timestamp(), etc.`,

    questionnaire: `## questionnaire — Interactive Question UI

Ask the user one or more questions with a visual selection interface.
Single question: simple options list. Multiple questions: tab-based navigation.

Parameters:
- questions: Array of question objects, each with:
  - id: Unique identifier (e.g., "entity_naming")
  - label: Short label for tab bar (e.g., "Naming")
  - prompt: Full question text displayed to the user
  - options: Array of { value, label, description? }
  - allowOther: Allow free-text input (default: true)

Returns structured answers with question id, selected value, label, and whether custom text was entered.

Best practices:
- Keep options concise — use descriptions for explanations
- Use 1-3 questions per call for focused decision-making
- Include concrete examples from the user's system in descriptions`,

    ha_policies: `## ha_policies — User-Defined Policies

Manages naming conventions, organization preferences, and other policies the AI should follow consistently.
Policies are stored in \`/homeassistant/pi-agent/policies.yaml\` — human-readable, survives backups/restores.

Actions:
- list: Show all current policies formatted for reading.
- get: Get a specific policy category. Requires: category.
- set: Set/update policies. Requires: category + (key & value, or fields object).
- remove: Remove a policy category or key within it. Requires: category, optional: key.
- init: Scan the system and return analysis data to power the guided setup wizard conversation.
- check: Audit entities against defined policies — finds _2/_3 suffixes, brand names in IDs, etc.

Policy categories: naming, organization, automations, dashboards, language, general.

The \`init\` action scans all entities and returns:
- Domain breakdown, naming pattern samples
- Problematic names (_2/_3 suffixes, brand names in IDs)
- Metric sensor analysis (power/energy/voltage/etc.)
- Integration detection

Use this data to guide the user through an educational setup conversation.
The wizard should show examples from the user's own devices, explain concepts in plain language, and propose conventions with sensible defaults.

The 'language' category supports multilingual setups with mapping tables:
- areas: { "Kitchen": "Køkken", "Bedroom": "Soveværelse" }
- device_types: { "ceiling light": "loftlampe", "motion sensor": "bevægelsessensor" }
- metrics: { "power": "effekt", "energy": "energi", "temperature": "temperatur" }
- common_words: { "on": "tændt", "off": "slukket" }

The 'check' action validates language mappings — reports unmapped device types, metrics, and areas.`,

    ha_zones: `## ha_zones — Manage Zones

Actions:
- list: List all zones.
- get: Get zone details by id.
- create: Create a new zone (name, latitude, longitude required).
- update: Update a zone by id.
- delete: Delete a zone by id.

Zones define geographic areas used for presence detection and automations.
The "home" zone is managed in Settings > General and cannot be modified here.`,
  };
}

export function registerToolDocsTool(pi: ExtensionAPI) {
  const TOOL_DOCS = buildToolDocs();

  pi.registerTool({
    name: "ha_tool_docs",
    label: "HA Tool Docs",
    description:
      "Get full usage docs for any HA tool. Call with tool name or 'all' to list.",
    parameters: Type.Object({
      tool: Type.String({ description: "Tool name (e.g. 'ha_zones') or 'all'" }),
    }),

    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Tool Docs", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      if (params.tool === "all") {
        const list = Object.keys(TOOL_DOCS)
          .map((name) => `- ${name}`)
          .join("\n");
        return { content: [{ type: "text" as const, text: `Available HA tools:\n${list}` }] };
      }
      const doc = TOOL_DOCS[params.tool];
      if (!doc) {
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${params.tool}. Use tool='all' to list.` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: doc }] };
    },
  });
}
