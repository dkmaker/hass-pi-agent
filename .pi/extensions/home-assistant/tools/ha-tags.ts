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
    description: `Manage Home Assistant tags (NFC/QR).

Actions:
- list: List all tags.
- get: Get tag details by id.
- create: Create a new tag (name optional, tag_id auto-generated if not provided).
- update: Update a tag by id.
- delete: Delete a tag by id.

Tags can be scanned to trigger automations via the tag_scanned event.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Tag ID (for get/update/delete)" })),
      tag_id: Type.Optional(Type.String({ description: "Custom tag ID (for create; auto-generated if omitted)" })),
      name: Type.Optional(Type.String({ description: "Tag name" })),
      description: Type.Optional(Type.String({ description: "Tag description" })),
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
    case "get": return handleGet(params.id as string | undefined);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params.id as string | undefined);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const tags = await wsCommand<WSTag[]>("tag/list");
  if (tags.length === 0) return "No tags defined.";

  const lines = tags.map((t) => {
    const parts = [t.name || "(unnamed)"];
    parts.push(`tag_id: ${t.tag_id}`);
    if (t.description) parts.push(`"${t.description}"`);
    if (t.last_scanned) parts.push(`last scanned: ${t.last_scanned}`);
    return `${parts.join(" — ")} (id: ${t.id})`;
  });

  lines.push("");
  lines.push(`${tags.length} tags`);
  return lines.join("\n");
}

async function handleGet(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for get");

  const tags = await wsCommand<WSTag[]>("tag/list");
  const tag = tags.find((t) => t.id === id || t.tag_id === id);
  if (!tag) throw new Error(`Tag '${id}' not found`);

  return [
    `# ${tag.name || "(unnamed)"}`,
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

  const result = await wsCommand<WSTag>("tag/update", data);
  return `✅ Updated tag '${result.name || result.tag_id}' (id: ${result.id})`;
}

async function handleDelete(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for delete");
  await wsCommand("tag/delete", { tag_id: id });
  return `✅ Deleted tag '${id}'`;
}
