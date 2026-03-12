/**
 * Home Assistant category management tool.
 *
 * CRUD for categories that organize automations, scripts, and scenes.
 * Uses WebSocket API.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { backupBeforeMutation } from "../lib/mutation-log.js";

// ── Types ────────────────────────────────────────────────────

interface WSCategory {
  category_id: string;
  name: string;
  icon: string | null;
}

// ── Tool registration ────────────────────────────────────────

export function registerCategoriesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_categories",
    label: "HA Categories",
    description: `Manage categories for automations/scripts/scenes. Actions: list, create, update, delete. Use ha_tool_docs('ha_categories') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      scope: Type.Optional(
        Type.String({ description: "Category scope: automation, script, or scene" })
      ),
      category_id: Type.Optional(
        Type.String({ description: "Category ID (for update/delete)" })
      ),
      name: Type.Optional(Type.String({ description: "Category name" })),
      icon: Type.Optional(Type.String({ description: "Category icon (e.g., mdi:lightbulb)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Categories", args, theme);
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
    case "list": return handleList(params.scope as string | undefined);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(scope?: string): Promise<string> {
  if (!scope) throw new Error("'scope' is required (automation, script, or scene)");

  const categories = await wsCommand<WSCategory[]>("config/category_registry/list", { scope });
  if (categories.length === 0) return `No categories defined for ${scope}.`;

  categories.sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [
    "| Name | Icon | ID |",
    "|------|------|----|",
    ...categories.map((c) => `| **${c.name}** | ${c.icon || ""} | ${c.category_id} |`),
    `\n${categories.length} ${scope} categories`,
  ];
  return lines.join("\n");
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const scope = params.scope as string | undefined;
  const name = params.name as string | undefined;
  if (!scope) throw new Error("'scope' is required (automation, script, or scene)");
  if (!name) throw new Error("'name' is required for create");

  const data: Record<string, unknown> = { scope, name };
  if (params.icon !== undefined) data.icon = params.icon;

  const result = await wsCommand<WSCategory>("config/category_registry/create", data);
  return `✅ Created ${scope} category '${result.name}' (id: ${result.category_id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const scope = params.scope as string | undefined;
  const categoryId = params.category_id as string | undefined;
  if (!scope) throw new Error("'scope' is required for update");
  if (!categoryId) throw new Error("'category_id' is required for update");

  const data: Record<string, unknown> = { scope, category_id: categoryId };
  if (params.name !== undefined) data.name = params.name;
  if (params.icon !== undefined) data.icon = params.icon;

  try {
    const cats = await wsCommand<WSCategory[]>("config/category_registry/list", { scope });
    const current = cats.find((c) => c.category_id === categoryId);
    if (current) backupBeforeMutation("ha_categories", "update", `${scope}.${categoryId}`, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSCategory>("config/category_registry/update", data);
  return `✅ Updated category '${result.name}' (id: ${result.category_id})`;
}

async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const scope = params.scope as string | undefined;
  const categoryId = params.category_id as string | undefined;
  if (!scope) throw new Error("'scope' is required for delete");
  if (!categoryId) throw new Error("'category_id' is required for delete");
  if (!params.confirm) {
    return `⚠️ **Confirm delete**: category \`${categoryId}\` (scope: ${scope})\n\nCall again with \`confirm: true\` to proceed.`;
  }

  try {
    const cats = await wsCommand<WSCategory[]>("config/category_registry/list", { scope });
    const current = cats.find((c) => c.category_id === categoryId);
    if (current) backupBeforeMutation("ha_categories", "delete", `${scope}.${categoryId}`, current);
  } catch { /* best-effort */ }

  await wsCommand("config/category_registry/delete", { scope, category_id: categoryId });
  return `✅ Deleted category '${categoryId}'`;
}
