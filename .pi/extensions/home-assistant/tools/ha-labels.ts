/**
 * Home Assistant label management tool.
 *
 * Full CRUD for labels via WebSocket API.
 * All changes take effect immediately.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { defineHaTool, type HaDetails, type Row } from "../lib/tool-render.js";
import { backupBeforeMutation } from "../lib/mutation-log.js";

// ── Types ────────────────────────────────────────────────────

interface WSLabel {
  label_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
}

// ── Tool registration ────────────────────────────────────────

export function registerLabelsTool(pi: ExtensionAPI): void {
  defineHaTool(pi, {
    name: "ha_labels",
    label: "HA Labels",
    description: `Manage HA labels. Actions: list, create, update, delete.`,
    promptSnippet:
      "Manage labels: list, create, update, delete (name, color, icon, description) — applied live.",
    promptGuidelines: [
      "Use ha_labels when the user asks to create, rename, recolor, or delete labels used to categorize entities/devices/areas.",
    ],

    parameters: Type.Object({
      action: StringEnum(["list", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      label_id: Type.Optional(
        Type.String({ description: "Label ID for update/delete" })
      ),
      name: Type.Optional(
        Type.String({ description: "Label name" })
      ),
      color: Type.Optional(
        Type.String({ description: "Label color (e.g., red, #ff0000)" })
      ),
      icon: Type.Optional(
        Type.String({ description: "Label icon (e.g., mdi:tag)" })
      ),
      description: Type.Optional(
        Type.String({ description: "Label description" })
      ),
      confirm: Type.Optional(
        Type.Boolean({ description: "Set true to confirm delete (default: false, preview only)" })
      ),
    }),


    execute: (params) => executeAction(params),
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string | HaDetails> {
  switch (params.action as string) {
    case "list": return handleList();
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params.label_id as string | undefined, params.confirm as boolean | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string | HaDetails> {
  const labels = await wsCommand<WSLabel[]>("config/label_registry/list");
  if (labels.length === 0) return "No labels defined.";

  labels.sort((a, b) => a.name.localeCompare(b.name));
  const rows: Row[] = labels.map((l) => ({
    icon: (l.icon || "").replace(/^mdi:/, "") || "tag-outline",
    cells: {
      name: l.name,
      color: l.color || "",
      description: l.description || "",
      id: l.label_id,
    },
  }));
  return {
    kind: "table",
    columns: [
      { key: "name", label: "Name" },
      { key: "color", label: "Color" },
      { key: "description", label: "Description" },
      { key: "id", label: "ID" },
    ],
    rows,
    page: { offset: 0, limit: labels.length, total: labels.length },
    note: `${labels.length} labels`,
  };
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for create");

  const data: Record<string, unknown> = { name };
  if (params.color !== undefined) data.color = params.color;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.description !== undefined) data.description = params.description;

  const result = await wsCommand<WSLabel>("config/label_registry/create", data);
  return `✅ Created label '${result.name}' (id: ${result.label_id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const labelId = params.label_id as string | undefined;
  if (!labelId) throw new Error("'label_id' is required for update");

  const data: Record<string, unknown> = { label_id: labelId };
  if (params.name !== undefined) data.name = params.name;
  if (params.color !== undefined) data.color = params.color;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.description !== undefined) data.description = params.description;

  try {
    const labels = await wsCommand<WSLabel[]>("config/label_registry/list");
    const current = labels.find((l) => l.label_id === labelId);
    if (current) backupBeforeMutation("ha_labels", "update", labelId, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSLabel>("config/label_registry/update", data);
  return `✅ Updated label '${result.name}' (id: ${result.label_id})`;
}

async function handleDelete(labelId?: string, confirm?: boolean): Promise<string> {
  if (!labelId) throw new Error("'label_id' is required for delete");
  if (!confirm) {
    return `⚠️ **Confirm delete**: label \`${labelId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  try {
    const labels = await wsCommand<WSLabel[]>("config/label_registry/list");
    const current = labels.find((l) => l.label_id === labelId);
    if (current) backupBeforeMutation("ha_labels", "delete", labelId, current);
  } catch { /* best-effort */ }

  await wsCommand("config/label_registry/delete", { label_id: labelId });
  return `✅ Deleted label '${labelId}'`;
}
