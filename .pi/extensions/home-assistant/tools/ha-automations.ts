/**
 * Home Assistant automation management tool.
 *
 * Thin registration + dispatch layer. All logic lives in sub-modules:
 *   ./ha-automations/crud.ts           — list, get, create, update, delete, trigger, enable/disable
 *   ./ha-automations/traces.ts         — traces, trace
 *   ./ha-automations/builder.ts        — new, load, show, yaml, save, discard, list-drafts
 *   ./ha-automations/elements.ts       — add/update/remove trigger/condition/action, list-types
 *   ./ha-automations/service-schema.ts — get-service-schema
 *   ./ha-automations/import.ts         — import-yaml
 *
 * Shared libraries:
 *   ../lib/types.ts      — HAState, AutomationConfig, DraftConfig, schema types
 *   ../lib/format.ts     — timeSince, slugify, getActionType, summarizeElement
 *   ../lib/yaml.ts       — toYaml, parseYaml
 *   ../lib/schema.ts     — loadSchema (automation-elements.json)
 *   ../lib/validation.ts — validateElement, validateAutomationConfig
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// Sub-module imports
import { handleList, handleGet, handleCreate, handleUpdate, handleDelete, handleTrigger, handleEnableDisable } from "./ha-automations/crud.js";
import { handleTraces, handleTrace } from "./ha-automations/traces.js";
import { handleNew, handleLoad, handleListDrafts, handleShow, handleYaml, handleSave, handleDiscard } from "./ha-automations/builder.js";
import { handleListTypes, handleAddElement, handleUpdateElement, handleRemoveElement } from "./ha-automations/elements.js";
import { handleGetServiceSchema } from "./ha-automations/service-schema.js";
import { handleImportYaml } from "./ha-automations/import.js";

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = [
  // CRUD
  "list", "get", "create", "update", "delete",
  "trigger", "enable", "disable", "traces", "trace",
  // Builder session
  "new", "load", "list-drafts", "show", "yaml", "save", "discard",
  // Element CRUD
  "list-trigger-types", "add-trigger", "update-trigger", "remove-trigger",
  "list-condition-types", "add-condition", "update-condition", "remove-condition",
  "list-action-types", "add-action", "update-action", "remove-action",
  // Schema lookup
  "get-service-schema",
  // YAML import
  "import-yaml",
] as const;

export function registerAutomationsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_automations",
    label: "HA Automations",
    description: `Manage HA automations — CRUD, builder, enable/disable, trigger, traces. Actions: list, get, create, update, delete, trigger, enable, disable, traces, trace + builder actions (new, load, save, add-trigger, add-condition, add-action, etc). Use ha_tool_docs('ha_automations') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(ALL_ACTIONS, { description: "Action to perform" }),
      automation_id: Type.Optional(
        Type.String({ description: "Automation config ID (the numeric/string id, not entity_id)" })
      ),
      entity_id: Type.Optional(
        Type.String({ description: "Automation entity_id (e.g., automation.my_automation)" })
      ),
      config: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Automation config for create/update, or element config for add-trigger/add-condition/add-action",
        })
      ),
      alias: Type.Optional(
        Type.String({ description: "Draft alias — identifies which draft to operate on (for builder actions)" })
      ),
      description: Type.Optional(
        Type.String({ description: "Automation description (for 'new' action)" })
      ),
      mode: Type.Optional(
        Type.String({ description: "Automation mode: single, restart, queued, parallel" })
      ),
      index: Type.Optional(
        Type.Number({ description: "Element index for update/remove trigger/condition/action (0-based)" })
      ),
      service: Type.Optional(
        Type.String({ description: "Service name for get-service-schema (e.g., light.turn_on)" })
      ),
      yaml_content: Type.Optional(
        Type.String({ description: "YAML string for import-yaml action" })
      ),
      run_id: Type.Optional(
        Type.String({ description: "Trace run_id for the 'trace' action" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search automation name/entity_id" })
      ),
      state: Type.Optional(
        Type.String({ description: "Filter by state: on, off" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 50)" })
      ),
      offset: Type.Optional(
        Type.Number({ description: "Pagination offset (default: 0)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await dispatch(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function dispatch(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    // CRUD
    case "list": return handleList(params);
    case "get": return handleGet(params);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params);
    case "trigger": return handleTrigger(params);
    case "enable": return handleEnableDisable(params, true);
    case "disable": return handleEnableDisable(params, false);

    // Traces
    case "traces": return handleTraces(params);
    case "trace": return handleTrace(params);

    // Builder session
    case "new": return handleNew(params);
    case "load": return handleLoad(params);
    case "list-drafts": return handleListDrafts();
    case "show": return handleShow(params);
    case "yaml": return handleYaml(params);
    case "save": return handleSave(params);
    case "discard": return handleDiscard(params);

    // Element CRUD
    case "list-trigger-types": return handleListTypes("triggers");
    case "add-trigger": return handleAddElement(params, "triggers");
    case "update-trigger": return handleUpdateElement(params, "triggers");
    case "remove-trigger": return handleRemoveElement(params, "triggers");
    case "list-condition-types": return handleListTypes("conditions");
    case "add-condition": return handleAddElement(params, "conditions");
    case "update-condition": return handleUpdateElement(params, "conditions");
    case "remove-condition": return handleRemoveElement(params, "conditions");
    case "list-action-types": return handleListTypes("actions");
    case "add-action": return handleAddElement(params, "actions");
    case "update-action": return handleUpdateElement(params, "actions");
    case "remove-action": return handleRemoveElement(params, "actions");

    // Schema lookup
    case "get-service-schema": return handleGetServiceSchema(params);

    // YAML import
    case "import-yaml": return handleImportYaml(params);

    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
