/**
 * Home Assistant shopping list management tool.
 *
 * Full CRUD for shopping list items via WebSocket API.
 * Requires the shopping_list integration to be configured.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";

// ── Types ────────────────────────────────────────────────────

interface ShoppingItem {
  id: string;
  name: string;
  complete: boolean;
}

// ── Tool registration ────────────────────────────────────────

export function registerShoppingListTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_shopping_list",
    label: "HA Shopping List",
    description: `Manage HA shopping list. Actions: list, add, update, remove, clear. Use ha_tool_docs('ha_shopping_list') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "add", "update", "remove", "clear"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Item ID (for update/remove)" })),
      name: Type.Optional(Type.String({ description: "Item name (for add/update)" })),
      complete: Type.Optional(Type.Boolean({ description: "Mark as complete/incomplete (for update)" })),
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
    case "add": return handleAdd(params);
    case "update": return handleUpdate(params);
    case "remove": return handleRemove(params.id as string | undefined);
    case "clear": return handleClear();
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const items = await wsCommand<ShoppingItem[]>("shopping_list/items");
  if (items.length === 0) return "Shopping list is empty.";

  const incomplete = items.filter((i) => !i.complete);
  const complete = items.filter((i) => i.complete);

  const lines: string[] = [];
  if (incomplete.length > 0) {
    lines.push("## To buy");
    for (const item of incomplete) {
      lines.push(`  ☐ ${item.name} (id: ${item.id})`);
    }
  }
  if (complete.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("## Completed");
    for (const item of complete) {
      lines.push(`  ☑ ${item.name} (id: ${item.id})`);
    }
  }

  lines.push("");
  lines.push(`${items.length} items (${incomplete.length} to buy, ${complete.length} done)`);
  return lines.join("\n");
}

async function handleAdd(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for add");

  const result = await wsCommand<ShoppingItem>("shopping_list/items/add", { name });
  return `✅ Added '${result.name}' to shopping list (id: ${result.id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const id = params.id as string | undefined;
  if (!id) throw new Error("'id' is required for update");

  const data: Record<string, unknown> = { item_id: id };
  if (params.name !== undefined) data.name = params.name;
  if (params.complete !== undefined) data.complete = params.complete;

  const result = await wsCommand<ShoppingItem>("shopping_list/items/update", data);
  return `✅ Updated '${result.name}' (complete: ${result.complete})`;
}

async function handleRemove(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for remove");
  await wsCommand("shopping_list/items/remove", { item_id: id });
  return `✅ Removed item '${id}'`;
}

async function handleClear(): Promise<string> {
  await wsCommand("shopping_list/items/clear");
  return `✅ Cleared all completed items from shopping list`;
}
