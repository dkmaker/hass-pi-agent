/**
 * Home Assistant blueprint management tool.
 *
 * List, import, and delete blueprints for automations and scripts.
 * Uses WebSocket for list and REST API for import/delete.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiPost, apiDelete } from "../lib/api.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { defineHaTool, type HaDetails, type Row } from "../lib/tool-render.js";

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
  defineHaTool(pi, {
    name: "ha_blueprints",
    label: "HA Blueprints",
    description: `Manage HA blueprints (reusable templates). Actions: list, import, delete.`,
    promptSnippet:
      "Manage blueprints: list, import from a URL (forums/GitHub), and delete reusable automation/script templates.",
    promptGuidelines: [
      "Use ha_blueprints when the user asks to add, list, or remove automation/script blueprints.",
      "Use ha_blueprints action:import with a community-forum or GitHub URL to install a blueprint.",
    ],

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


    execute: (params) => executeAction(params),
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string | HaDetails> {
  switch (params.action as string) {
    case "list": return handleList(params.domain as string | undefined);
    case "import": return handleImport(params);
    case "delete": return handleDelete(params);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(domain?: string): Promise<string | HaDetails> {
  const domains = domain ? [domain] : ["automation", "script"];
  const rows: Row[] = [];
  for (const d of domains) {
    const blueprints = await wsCommand<Record<string, BlueprintInfo | null>>("blueprint/list", { domain: d });
    for (const [path, bp] of Object.entries(blueprints)) {
      if (!bp) continue;
      rows.push({
        cells: {
          domain: d,
          name: bp.metadata.name,
          path,
          author: bp.metadata.author || "",
          source: bp.metadata.source_url || "",
        },
      });
    }
  }

  if (rows.length === 0) return "No blueprints installed.";
  return {
    kind: "table",
    columns: [
      { key: "domain", label: "Domain" },
      { key: "name", label: "Name" },
      { key: "path", label: "Path" },
      { key: "author", label: "Author" },
      { key: "source", label: "Source" },
    ],
    rows,
    page: { offset: 0, limit: rows.length, total: rows.length },
    note: `${rows.length} blueprints`,
  };
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
