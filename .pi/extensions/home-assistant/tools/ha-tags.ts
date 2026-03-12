/**
 * Home Assistant tag management tool.
 *
 * Full CRUD for NFC/QR tags via WebSocket API.
 * All changes take effect immediately.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { backupBeforeMutation } from "../lib/mutation-log.js";

// ── Types ────────────────────────────────────────────────────

interface WSTag {
  id: string;
  tag_id: string;
  name: string | null;
  description: string | null;
  last_scanned: string | null;
}

// ── Tool registration ────────────────────────────────────────

export function registerTagsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_tags",
    label: "HA Tags",
    description: `Manage HA tags (NFC/QR). Actions: list, get, create, update, delete. Use ha_tool_docs('ha_tags') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Tag ID (for get/update/delete)" })),
      tag_id: Type.Optional(Type.String({ description: "Custom tag ID (for create; auto-generated if omitted)" })),
      name: Type.Optional(Type.String({ description: "Tag name" })),
      description: Type.Optional(Type.String({ description: "Tag description" })),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Tags", args, theme);
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
    case "get": return handleGet(params.id as string | undefined);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params.id as string | undefined, params.confirm as boolean | undefined);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const tags = await wsCommand<WSTag[]>("tag/list");
  if (tags.length === 0) return "No tags defined.";

  const lines: string[] = [
    "| Name | Tag ID | Description | Last Scanned | ID |",
    "|------|--------|-------------|--------------|-----|",
    ...tags.map((t) => {
      const name = t.name || "(unnamed)";
      const desc = t.description || "";
      const scanned = t.last_scanned || "never";
      return `| **${name}** | ${t.tag_id} | ${desc} | ${scanned} | ${t.id} |`;
    }),
    `\n${tags.length} tags`,
  ];
  return lines.join("\n");
}

async function handleGet(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for get");

  const tags = await wsCommand<WSTag[]>("tag/list");
  const tag = tags.find((t) => t.id === id || t.tag_id === id);
  if (!tag) throw new Error(`Tag '${id}' not found`);

  return [
    `## ${tag.name || "(unnamed)"}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| ID | ${tag.id} |`,
    `| Tag ID | ${tag.tag_id} |`,
    `| Name | ${tag.name || "—"} |`,
    `| Description | ${tag.description || "—"} |`,
    `| Last scanned | ${tag.last_scanned || "never"} |`,
  ].join("\n");
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const data: Record<string, unknown> = {};
  if (params.tag_id !== undefined) data.tag_id = params.tag_id;
  if (params.name !== undefined) data.name = params.name;
  if (params.description !== undefined) data.description = params.description;

  const result = await wsCommand<WSTag>("tag/create", data);
  return `✅ Created tag '${result.name || result.tag_id}' (id: ${result.id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const id = params.id as string | undefined;
  if (!id) throw new Error("'id' is required for update");

  const data: Record<string, unknown> = { tag_id: id };
  if (params.name !== undefined) data.name = params.name;
  if (params.description !== undefined) data.description = params.description;

  try {
    const tags = await wsCommand<WSTag[]>("tag/list");
    const current = tags.find((t) => t.id === id);
    if (current) backupBeforeMutation("ha_tags", "update", id, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSTag>("tag/update", data);
  return `✅ Updated tag '${result.name || result.tag_id}' (id: ${result.id})`;
}

async function handleDelete(id?: string, confirm?: boolean): Promise<string> {
  if (!id) throw new Error("'id' is required for delete");
  if (!confirm) {
    return `⚠️ **Confirm delete**: tag \`${id}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  try {
    const tags = await wsCommand<WSTag[]>("tag/list");
    const current = tags.find((t) => t.id === id);
    if (current) backupBeforeMutation("ha_tags", "delete", id, current);
  } catch { /* best-effort */ }

  await wsCommand("tag/delete", { tag_id: id });
  return `✅ Deleted tag '${id}'`;
}
