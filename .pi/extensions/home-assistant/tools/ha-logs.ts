/**
 * Home Assistant system log and logger control tool.
 *
 * Supports: get (view error log), list (structured log entries), set-level (per-integration log level).
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { apiGet, apiPost } from "../lib/api.js";
import { wsCommand } from "../lib/ws.js";

interface LogEntry {
  name: string;
  message: string[];
  level: string;
  source: string[];
  timestamp: number;
  count: number;
  first_occurred: number;
  [key: string]: unknown;
}

// ── Get (raw error log) ──────────────────────────────────────

async function handleGet(params: Record<string, unknown>): Promise<string> {
  // Try multiple paths — the error log endpoint varies by setup
  let log: string | undefined;
  for (const path of ["/api/error_log", "/error_log"]) {
    try {
      log = await apiGet<string>(path, true);
      break;
    } catch { /* try next */ }
  }
  if (!log) {
    // Fallback to WS structured log
    const entries = await wsCommand<LogEntry[]>("system_log/list");
    if (entries.length === 0) return "No log entries.";
    log = entries.map((e) => `[${e.level}] ${e.name}: ${e.message.join("\n")}`).join("\n\n");
  }
  const lines = log.split("\n");
  const limit = (params.limit as number) || 100;
  const tail = lines.slice(-limit);
  const header = lines.length > limit
    ? `Showing last ${limit} of ${lines.length} lines:\n\n`
    : "";
  return header + tail.join("\n");
}

// ── List (structured log entries) ────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const entries = await wsCommand<LogEntry[]>("system_log/list");

  if (entries.length === 0) return "No log entries.";

  const search = (params.search as string)?.toLowerCase();
  let filtered = entries;
  if (search) {
    filtered = entries.filter((e) =>
      e.name.toLowerCase().includes(search) ||
      e.message.join(" ").toLowerCase().includes(search) ||
      e.source.join(" ").toLowerCase().includes(search)
    );
  }

  const limit = (params.limit as number) || 30;
  const page = filtered.slice(0, limit);

  const levelIcons: Record<string, string> = {
    ERROR: "🔴",
    WARNING: "🟡",
    INFO: "🔵",
    DEBUG: "⚪",
  };

  const lines: string[] = [];
  for (const e of page) {
    const icon = levelIcons[e.level] || "⚪";
    const date = new Date(e.timestamp * 1000).toISOString().slice(0, 19);
    const count = e.count > 1 ? ` (×${e.count})` : "";
    lines.push(`${icon} [${e.level}] ${e.name}${count} — ${date}`);
    lines.push(`  ${e.message[0]?.slice(0, 200) || "(no message)"}`);
    if (e.source.length > 0) {
      lines.push(`  source: ${e.source[0]}`);
    }
  }

  lines.push("");
  lines.push(`${filtered.length} entries (showing ${page.length})`);
  return lines.join("\n");
}

// ── Set Level ────────────────────────────────────────────────

async function handleSetLevel(params: Record<string, unknown>): Promise<string> {
  const levels = params.levels as Record<string, string> | undefined;
  if (!levels || Object.keys(levels).length === 0) {
    throw new Error("'levels' is required — e.g., {\"homeassistant.components.zwave_js\": \"debug\"}");
  }

  await apiPost("/api/services/logger/set_level", levels);

  const entries = Object.entries(levels)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `✅ Set log levels:\n${entries}`;
}

// ── Clear ────────────────────────────────────────────────────

async function handleClear(): Promise<string> {
  await apiPost("/api/services/system_log/clear", {});
  return `✅ Cleared system log`;
}

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = ["get", "list", "set-level", "clear"] as const;

export function registerLogsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_logs",
    label: "HA Logs",
    description: `View Home Assistant system logs and control logger levels.

Actions:
- get: Get raw error log text (last N lines). Useful for seeing full tracebacks.
- list: List structured log entries with level, source, count. Filter by search.
- set-level: Set log level for specific integrations (e.g., debug for zwave_js).
- clear: Clear the system log.

Log levels: debug, info, warning, error, critical.
Integration format: "homeassistant.components.<domain>" (e.g., "homeassistant.components.zha").`,

    parameters: Type.Object({
      action: StringEnum(ALL_ACTIONS, { description: "Action to perform" }),
      levels: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "Log levels to set — keys are logger names, values are levels. E.g., {\"homeassistant.components.zha\": \"debug\"}",
        })
      ),
      search: Type.Optional(
        Type.String({ description: "Search log entries by name/message/source (for list)" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max entries/lines to return (default: 100 for get, 30 for list)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await dispatch(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

async function dispatch(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "get": return handleGet(params);
    case "list": return handleList(params);
    case "set-level": return handleSetLevel(params);
    case "clear": return handleClear();
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
