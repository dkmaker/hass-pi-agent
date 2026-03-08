/**
 * Home Assistant blueprint management tool.
 *
 * List, import, and delete blueprints for automations and scripts.
 * Uses WebSocket for list and REST API for import/delete.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiPost, apiDelete } from "../lib/api.js";

// ── Types ────────────────────────────────────────────────────

interface BlueprintInfo {
  metadata: {
    name: string;
    domain: string;
    source_url?: string;
    description?: string;
    author?: string;
  };
}

// ── Tool registration ────────────────────────────────────────

export function registerBlueprintsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_blueprints",
    label: "HA Blueprints",
    description: `Manage HA blueprints (reusable templates). Actions: list, import, delete. Use ha_tool_docs('ha_blueprints') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "import", "delete"] as const, {
        description: "Action to perform",
      }),
      domain: Type.Optional(
        Type.String({ description: "Blueprint domain: automation or script (default: both for list)" })
      ),
      url: Type.Optional(
        Type.String({ description: "Blueprint URL to import (for import action)" })
      ),
      path: Type.Optional(
        Type.String({ description: "Blueprint path to delete (e.g., automation/motion_light.yaml)" })
      ),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
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
    case "list": return handleList(params.domain as string | undefined);
    case "import": return handleImport(params);
    case "delete": return handleDelete(params);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(domain?: string): Promise<string> {
  const domains = domain ? [domain] : ["automation", "script"];
  const lines: string[] = [];
  let total = 0;

  for (const d of domains) {
    const blueprints = await wsCommand<Record<string, BlueprintInfo | null>>("blueprint/list", { domain: d });
    const entries = Object.entries(blueprints).filter(([, v]) => v !== null);
    if (entries.length === 0) continue;

    lines.push(`## ${d}`);
    for (const [path, bp] of entries) {
      if (!bp) continue;
      const parts = [`**${bp.metadata.name}**`];
      if (bp.metadata.author) parts.push(`by ${bp.metadata.author}`);
      if (bp.metadata.source_url) parts.push(`source: ${bp.metadata.source_url}`);
      lines.push(`  ${parts.join(" — ")} (${path})`);
      total++;
    }
    lines.push("");
  }

  if (total === 0) return "No blueprints installed.";
  lines.push(`${total} blueprints`);
  return lines.join("\n");
}

async function handleImport(params: Record<string, unknown>): Promise<string> {
  const url = params.url as string | undefined;
  if (!url) throw new Error("'url' is required for import");

  const result = await apiPost<{ result: string }>("/api/blueprint/import", { url });
  return `✅ Imported blueprint from ${url}`;
}

async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const path = params.path as string | undefined;
  const domain = params.domain as string | undefined;
  if (!path) throw new Error("'path' is required for delete");
  if (!domain) throw new Error("'domain' is required for delete");
  if (!params.confirm) {
    return `⚠️ **Confirm delete**: blueprint \`${path}\` from ${domain}\n\nCall again with \`confirm: true\` to proceed.`;
  }

  await wsCommand("blueprint/delete", { domain, path });
  return `✅ Deleted blueprint '${path}' from ${domain}`;
}
