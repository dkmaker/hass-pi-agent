/**
 * Home Assistant Helper management tool — unified interface.
 *
 * Supports ALL helper types through a positive-list registry:
 * - Collection helpers: input_boolean, input_number, input_text, input_select,
 *   input_datetime, input_button, counter, timer, schedule
 * - Config entry helpers: template, group, derivative, utility_meter, threshold,
 *   trend, tod, statistics, min_max, filter, integration, generic_thermostat,
 *   generic_hygrostat, switch_as_x, random, history_stats, mold_indicator
 *
 * The tool delegates to the correct storage backend based on the type's
 * storage_type in the registry. No storage logic lives in this file.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  listTypes,
  getType,
  isSupported,
  supportedDomains,
  validateFields,
  formatSchema,
} from "../lib/registry.js";
import * as collectionWsBackend from "../lib/backends/collection-ws.js";
import * as configEntryBackend from "../lib/backends/config-entry.js";
import { listBackups, restoreBackup } from "../lib/backup.js";

// ── Tool registration ────────────────────────────────────────

export function registerHelperTool(pi: ExtensionAPI): void {
  const allDomains = supportedDomains();

  pi.registerTool({
    name: "ha_helpers",
    label: "HA Helpers",
    description: `Manage Home Assistant helpers — all types, unified interface.

Supported types: ${allDomains.join(", ")}

Actions:
- list-types: Show all supported helper types with field schemas
- list: List all helpers, optionally filtered by type
- get: Get a specific helper by type and id
- add: Add a new helper (collection types are live, config entry types require HA restart)
- update: Update an existing helper (collection types are live, config entry types require HA restart)
- remove: Remove a helper by type and id (collection types are live, config entry types require HA restart)
- backups: List available backups for rollback
- restore: Restore a backup file

Collection helpers (input_boolean, input_number, input_text, input_select, input_datetime, input_button, counter, timer, schedule) use WebSocket — changes take effect immediately.
Config entry helpers require HA restart after add/update/remove.`,

    parameters: Type.Object({
      action: StringEnum(
        ["list-types", "list", "get", "add", "update", "remove", "backups", "restore"] as const,
        { description: "Action to perform" }
      ),
      type: Type.Optional(
        Type.String({
          description: `Helper type/domain (required for get/add/update/remove). Supported: ${allDomains.join(", ")}`,
        })
      ),
      id: Type.Optional(
        Type.String({
          description: "Helper id — for collections: item id; for config entries: entry_id",
        })
      ),
      fields: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Helper fields for add/update. Use 'list-types' to see required fields per type.",
        })
      ),
      backup_filename: Type.Optional(
        Type.String({ description: "Backup filename for restore action" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: {
  action: string;
  type?: string;
  id?: string;
  fields?: Record<string, unknown>;
  backup_filename?: string;
}): Promise<string> {
  const { action, type, id, fields, backup_filename } = params;

  switch (action) {
    case "list-types":
      return handleListTypes();

    case "list":
      return handleList(type);

    case "get":
      return handleGet(type, id);

    case "add":
      return handleAdd(type, fields);

    case "update":
      return handleUpdate(type, id, fields);

    case "remove":
      return handleRemove(type, id);

    case "backups": {
      const backups = listBackups(type);
      if (backups.length === 0) return "No backups found.";
      return `Available backups (newest first):\n${backups.map((b) => `  ${b}`).join("\n")}`;
    }

    case "restore": {
      if (!backup_filename) return "Error: 'backup_filename' is required for restore";
      const restoredPath = restoreBackup(backup_filename);
      return `Restored backup to ${restoredPath}.\n\n⚠️ Run action 'restart' to apply changes.`;
    }

    default:
      return `Unknown action '${action}'. Valid: list-types, list, get, add, update, remove, backups, restore, validate, restart`;
  }
}

// ── Action handlers ──────────────────────────────────────────

function handleListTypes(): string {
  const types = listTypes().sort((a, b) => a.domain.localeCompare(b.domain));
  const lines: string[] = ["Supported helper types:\n"];

  for (const item of types) {
    if (item.schema.sub_types && item.schema.sub_type_key) {
      const subNames = Object.keys(item.schema.sub_types);
      lines.push(`${item.domain}:`);
      lines.push(`  requires: ${item.schema.sub_type_key} (${subNames.join(", ")})`);
      lines.push(`  each sub-type has its own fields — use list-types with get for details`);
    } else {
      const reqFields = item.schema.fields
        .filter((f) => f.required && f.default === undefined)
        .map((f) => f.field);
      const optFields = item.schema.fields
        .filter((f) => !f.required || f.default !== undefined)
        .map((f) => f.field);
      lines.push(`${item.domain}:`);
      if (reqFields.length) lines.push(`  required: ${reqFields.join(", ")}`);
      if (optFields.length) lines.push(`  optional: ${optFields.join(", ")}`);
    }
  }

  return lines.join("\n");
}

async function handleList(type?: string): Promise<string> {
  if (type) {
    const t = requireType(type);
    if (typeof t === "string") return t;
    const items = t.storageType === "collection"
      ? await collectionWsBackend.listItems(t)
      : configEntryBackend.listEntries(t);
    if (items.length === 0) return `No ${type} helpers found.\n\n${formatSchema(type)}`;
    return JSON.stringify(items, null, 2);
  }

  // List all types
  const results: Record<string, unknown[]> = {};
  for (const t of listTypes()) {
    const items = t.storageType === "collection"
      ? await collectionWsBackend.listItems(t)
      : configEntryBackend.listEntries(t);
    if (items.length > 0) results[t.domain] = items;
  }

  if (Object.keys(results).length === 0) return "No helpers found.";
  return JSON.stringify(results, null, 2);
}

async function handleGet(type?: string, id?: string): Promise<string> {
  if (!type || !id) return "Error: 'type' and 'id' are required for get";
  const t = requireType(type);
  if (typeof t === "string") return t;

  const item = t.storageType === "collection"
    ? await collectionWsBackend.getItem(t, id)
    : configEntryBackend.getEntry(t, id);

  if (!item) return `Helper '${id}' not found in ${type}.\n\n${formatSchema(type)}`;
  return JSON.stringify(item, null, 2);
}

async function handleAdd(type?: string, fields?: Record<string, unknown>): Promise<string> {
  if (!type) return "Error: 'type' is required for add";
  const t = requireType(type);
  if (typeof t === "string") return t;

  if (!fields || !fields.name) {
    return `Error: 'fields' with 'name' is required for add.\n\n${formatSchema(type)}`;
  }

  const validation = validateFields(type, fields, "create");
  if (!validation.valid) {
    return `Validation errors:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}\n\n${formatSchema(type)}`;
  }

  if (t.storageType === "collection") {
    const result = await collectionWsBackend.addItem(t, fields);
    if (!result.success) return `Error: ${result.message}`;
    return `✅ ${result.message} (live — no restart needed)`;
  } else {
    const result = configEntryBackend.addEntry(t, fields);
    if (!result.success) return `Error: ${result.message}`;
    return `${result.message}\n${result.backupMessage || ""}\n\n⚠️ Restart HA to apply changes.`;
  }
}

async function handleUpdate(type?: string, id?: string, fields?: Record<string, unknown>): Promise<string> {
  if (!type || !id) return "Error: 'type' and 'id' are required for update";
  const t = requireType(type);
  if (typeof t === "string") return t;

  if (!fields) return `Error: 'fields' is required for update.\n\n${formatSchema(type)}`;

  const validation = validateFields(type, fields, "update");
  if (!validation.valid) {
    return `Validation errors:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}\n\n${formatSchema(type)}`;
  }

  if (t.storageType === "collection") {
    const result = await collectionWsBackend.updateItem(t, id, fields);
    if (!result.success) return `Error: ${result.message}`;
    return `✅ ${result.message} (live — no restart needed)`;
  } else {
    const result = configEntryBackend.updateEntry(t, id, fields);
    if (!result.success) return `Error: ${result.message}`;
    return `${result.message}\n${result.backupMessage || ""}\n\n⚠️ Restart HA to apply changes.`;
  }
}

async function handleRemove(type?: string, id?: string): Promise<string> {
  if (!type || !id) return "Error: 'type' and 'id' are required for remove";
  const t = requireType(type);
  if (typeof t === "string") return t;

  if (t.storageType === "collection") {
    const result = await collectionWsBackend.removeItem(t, id);
    if (!result.success) return `Error: ${result.message}`;
    return `✅ ${result.message} (live — no restart needed)`;
  } else {
    const result = configEntryBackend.removeEntry(t, id);
    if (!result.success) return `Error: ${result.message}`;
    return `${result.message}\n${result.backupMessage || ""}\n\n⚠️ Restart HA to apply changes.`;
  }
}

// ── Utilities ────────────────────────────────────────────────

function requireType(domain: string): ReturnType<typeof getType> | string {
  const t = getType(domain);
  if (!t) return `Error: Unknown type '${domain}'. Supported: ${supportedDomains().join(", ")}`;
  return t;
}
