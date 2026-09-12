/**
 * Home Assistant shopping list management tool.
 *
 * Full CRUD for shopping list items via WebSocket API.
 * Requires the shopping_list integration to be configured.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { defineHaTool, type HaDetails, type Row } from "../lib/tool-render.js";

// ── Types ────────────────────────────────────────────────────

interface ShoppingItem {
  id: string;
  name: string;
  complete: boolean;
}

// ── Tool registration ────────────────────────────────────────

export function registerShoppingListTool(pi: ExtensionAPI): void {
  defineHaTool(pi, {
    name: "ha_shopping_list",
    label: "HA Shopping List",
    description: `Manage HA shopping list. Actions: list, add, update, remove, clear.`,
    promptSnippet:
      "Manage the HA shopping list: list, add, update (rename/complete), remove, clear completed.",
    promptGuidelines: [
      "Use ha_shopping_list when the user asks to add, check off, or manage shopping list items.",
    ],

    parameters: Type.Object({
      action: StringEnum(["list", "add", "update", "remove", "clear"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Item ID (for update/remove)" })),
      name: Type.Optional(Type.String({ description: "Item name (for add/update)" })),
      complete: Type.Optional(Type.Boolean({ description: "Mark as complete/incomplete (for update)" })),
    }),


    execute: (params) => executeAction(params),
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string | HaDetails> {
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

async function handleList(): Promise<string | HaDetails> {
  const items = await wsCommand<ShoppingItem[]>("shopping_list/items");
  if (items.length === 0) return "Shopping list is empty.";

  const rows: Row[] = items.map((item) => ({
    icon: item.complete ? "checkbox-marked-outline" : "checkbox-blank-outline",
    cells: { name: item.name, id: item.id },
  }));
  const incomplete = items.filter((i) => !i.complete).length;
  const complete = items.filter((i) => i.complete).length;
  return {
    kind: "table",
    columns: [
      { key: "name", label: "Name" },
      { key: "id", label: "ID" },
    ],
    rows,
    page: { offset: 0, limit: items.length, total: items.length },
    note: `${items.length} items (${incomplete} to buy, ${complete} done)`,
  };
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
