/**
 * Home Assistant integrations (config entries) management tool.
 *
 * List, inspect, disable/enable, reload, and remove config entries.
 * Uses REST API for config entries.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import { timeSince , renderMarkdownResult, renderToolCall } from "../lib/format.js";

// ── Types ────────────────────────────────────────────────────

interface ConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  source: string;
  state: string;
  supports_options: boolean;
  disabled_by: string | null;
  pref_disable_new_entities: boolean;
  pref_disable_polling: boolean;
  created_at: number;
  modified_at: number;
  reason?: string | null;
}

// ── Tool registration ────────────────────────────────────────

export function registerIntegrationsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_integrations",
    label: "HA Integrations",
    description: `Manage HA integrations (config entries). Actions: list, get, disable, enable, reload, remove. Use ha_tool_docs('ha_integrations') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "disable", "enable", "reload", "remove"] as const, {
        description: "Action to perform",
      }),
      entry_id: Type.Optional(
        Type.String({ description: "Config entry ID (for get/disable/enable/reload/remove)" })
      ),
      domain: Type.Optional(
        Type.String({ description: "Filter by integration domain (e.g., hue, mqtt, zwave_js)" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search by title or domain" })
      ),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Integrations", args, theme);
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
    case "list": return handleList(params);
    case "get": return handleGet(params.entry_id as string | undefined);
    case "disable": return handleDisable(params.entry_id as string | undefined);
    case "enable": return handleEnable(params.entry_id as string | undefined);
    case "reload": return handleReload(params.entry_id as string | undefined);
    case "remove": return handleRemove(params.entry_id as string | undefined, params.confirm as boolean | undefined);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  let entries = await apiGet<ConfigEntry[]>("/api/config/config_entries/entry");
  const domain = params.domain as string | undefined;
  const search = params.search as string | undefined;

  if (domain) {
    entries = entries.filter((e) => e.domain === domain);
  }
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) => e.title.toLowerCase().includes(q) || e.domain.toLowerCase().includes(q)
    );
  }

  if (entries.length === 0) return "No config entries found.";

  // Group by domain
  entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.title.localeCompare(b.title));

  const lines: string[] = [
    "| Status | Title | Domain | Entry ID |",
    "|--------|-------|--------|----------|",
    ...entries.map((e) => {
      const status = e.disabled_by ? "🔴 disabled" : e.state === "loaded" ? "🟢" : `⚠️ ${e.state}`;
      return `| ${status} | **${e.title}** | ${e.domain} | ${e.entry_id} |`;
    }),
    `\n${entries.length} config entries`,
  ];
  return lines.join("\n");
}

async function handleGet(entryId?: string): Promise<string> {
  if (!entryId) throw new Error("'entry_id' is required for get");

  const entries = await apiGet<ConfigEntry[]>("/api/config/config_entries/entry");
  const entry = entries.find((e) => e.entry_id === entryId);
  if (!entry) throw new Error(`Config entry '${entryId}' not found`);

  const lines = [
    `## ${entry.title}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Domain | ${entry.domain} |`,
    `| Entry ID | ${entry.entry_id} |`,
    `| State | ${entry.state} |`,
    `| Source | ${entry.source} |`,
    `| Disabled by | ${entry.disabled_by || "—"} |`,
    `| Supports options | ${entry.supports_options} |`,
    `| Disable new entities | ${entry.pref_disable_new_entities} |`,
    `| Disable polling | ${entry.pref_disable_polling} |`,
  ];

  return lines.join("\n");
}

async function handleDisable(entryId?: string): Promise<string> {
  if (!entryId) throw new Error("'entry_id' is required for disable");

  const result = await apiPost<{ entry_id: string; disabled_by: string }>(
    `/api/config/config_entries/entry/${entryId}/disable`,
    { disabled_by: "user" }
  );
  return `✅ Disabled config entry '${entryId}'`;
}

async function handleEnable(entryId?: string): Promise<string> {
  if (!entryId) throw new Error("'entry_id' is required for enable");

  await apiPost(
    `/api/config/config_entries/entry/${entryId}/disable`,
    { disabled_by: null }
  );
  return `✅ Enabled config entry '${entryId}'`;
}

async function handleReload(entryId?: string): Promise<string> {
  if (!entryId) throw new Error("'entry_id' is required for reload");

  await apiPost(`/api/config/config_entries/entry/${entryId}/reload`, {});
  return `✅ Reloaded config entry '${entryId}'`;
}

async function handleRemove(entryId?: string, confirm?: boolean): Promise<string> {
  if (!entryId) throw new Error("'entry_id' is required for remove");
  if (!confirm) {
    return `⚠️ **Confirm remove**: integration config entry \`${entryId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  await apiDelete(`/api/config/config_entries/entry/${entryId}`);
  return `✅ Removed config entry '${entryId}'`;
}
