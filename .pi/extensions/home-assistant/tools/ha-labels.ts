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
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

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
    description: `Manage HA labels. Actions: list, create, update, delete. Use ha_tool_docs('ha_labels') for full usage.`,

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


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Labels", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

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
    case "delete": return handleDelete(params.label_id as string | undefined, params.confirm as boolean | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const labels = await wsCommand<WSLabel[]>("config/label_registry/list");
  if (labels.length === 0) return "No labels defined.";

  labels.sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [
    "| Name | Color | Icon | Description | ID |",
    "|------|-------|------|-------------|----|",
    ...labels.map((l) => {
      const color = l.color || "";
      const icon = l.icon || "";
      const desc = l.description || "";
      return `| **${l.name}** | ${color} | ${icon} | ${desc} | ${l.label_id} |`;
    }),
    `\n${labels.length} labels`,
  ];
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

async function handleDelete(labelId?: string, confirm?: boolean): Promise<string> {
  if (!labelId) throw new Error("'label_id' is required for delete");
  if (!confirm) {
    return `⚠️ **Confirm delete**: label \`${labelId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }
  await wsCommand("config/label_registry/delete", { label_id: labelId });
  return `✅ Deleted label '${labelId}'`;
}
