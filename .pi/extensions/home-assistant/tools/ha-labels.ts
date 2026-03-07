/**
 * Home Assistant label management tool.
 *
 * Full CRUD for labels via WebSocket API.
 * All changes take effect immediately.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";

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
  pi.registerTool({
    name: "ha_labels",
    label: "HA Labels",
    description: `Manage Home Assistant labels.

Actions:
- list: List all labels.
- create: Create a new label (name required, optional: color, icon, description).
- update: Update a label.
- delete: Delete a label.

All changes take effect immediately via WebSocket.`,

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
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList();
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params.label_id as string | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const labels = await wsCommand<WSLabel[]>("config/label_registry/list");
  if (labels.length === 0) return "No labels defined.";

  labels.sort((a, b) => a.name.localeCompare(b.name));
  const lines = labels.map((l) => {
    const parts = [l.name];
    if (l.color) parts.push(`color: ${l.color}`);
    if (l.icon) parts.push(`icon: ${l.icon}`);
    if (l.description) parts.push(`"${l.description}"`);
    return `${parts.join(" — ")} (id: ${l.label_id})`;
  });

  lines.push("");
  lines.push(`${labels.length} labels`);
  return lines.join("\n");
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

  const result = await wsCommand<WSLabel>("config/label_registry/update", data);
  return `✅ Updated label '${result.name}' (id: ${result.label_id})`;
}

async function handleDelete(labelId?: string): Promise<string> {
  if (!labelId) throw new Error("'label_id' is required for delete");
  await wsCommand("config/label_registry/delete", { label_id: labelId });
  return `✅ Deleted label '${labelId}'`;
}
