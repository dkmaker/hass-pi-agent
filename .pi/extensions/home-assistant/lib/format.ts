/**
 * Shared formatting and string utilities.
 *
 * Common helpers used across multiple tools — time formatting,
 * slugification, element summarization, and TUI rendering.
 */
import { Markdown, Text } from "@mariozechner/pi-tui";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";

/**
 * Shared renderResult for all HA tools — renders markdown output from execute().
 * Extracts the text content and renders it as formatted markdown in the TUI.
 */
export function renderMarkdownResult(result: { content: Array<{ type: string; text?: string }> }): Markdown | Text {
  const text = result.content?.[0]?.type === "text" ? (result.content[0] as { text: string }).text : "";
  if (!text) return new Text("", 0, 0);
  return new Markdown(text, 0, 0, getMarkdownTheme());
}

/**
 * Shared renderCall for all HA tools — shows "toolName action" with styling.
 */
export function renderToolCall(toolLabel: string, args: Record<string, unknown>, theme: any): Text {
  let text = theme.fg("toolTitle", theme.bold(`${toolLabel} `));
  const action = args.action as string | undefined;
  if (action) {
    text += theme.fg("accent", action);
    // Add key context based on common params
    const id = (args.entity_id || args.device_id || args.area_id || args.slug || args.id || args.domain || "") as string;
    if (id) text += theme.fg("dim", ` ${id}`);
    else if (args.search) text += theme.fg("dim", ` "${args.search}"`);
  } else if (args.template) {
    text += theme.fg("dim", `${String(args.template).slice(0, 50)}`);
  } else if (args.tool) {
    text += theme.fg("accent", String(args.tool));
  }
  return new Text(text, 0, 0);
}

/** Format an ISO date as relative time (e.g., "5m ago", "2h ago") */
export function timeSince(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Convert a string to a URL/filename-safe slug */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Determine the action type from an action config object */
export function getActionType(action: Record<string, unknown>): string {
  if (action.action) return `service: ${action.action}`;
  if ("delay" in action) return "delay";
  if ("wait_template" in action) return "wait_template";
  if ("wait_for_trigger" in action) return "wait_for_trigger";
  if ("event" in action) return "event";
  if ("choose" in action) return "choose";
  if ("if" in action) return "if";
  if ("repeat" in action) return "repeat";
  if ("sequence" in action) return "sequence";
  if ("parallel" in action) return "parallel";
  if ("stop" in action) return "stop";
  if ("variables" in action) return "variables";
  if ("set_conversation_response" in action) return "set_conversation_response";
  if (action.type && action.device_id) return "device";
  return "unknown";
}

/**
 * Parse a relative time string (e.g., "1h", "24h", "7d", "2w") into an ISO datetime string.
 * If the input is already an ISO datetime string, it's returned as-is.
 * Returns an ISO string representing that duration ago from now.
 */
export function parseRelativeTime(input: string): string {
  const trimmed = input.trim();

  // If it looks like an ISO datetime, pass through
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;

  // Parse relative patterns: "1h", "30m", "7d", "2w", "1 hour", "3 days", etc.
  const match = trimmed.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/i);
  if (!match) {
    throw new Error(`Invalid time format: "${input}". Use relative (1h, 24h, 7d, 2w) or ISO datetime.`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms: number;
  if (unit.startsWith("s")) ms = amount * 1000;
  else if (unit.startsWith("mi") || unit === "m") ms = amount * 60_000;
  else if (unit.startsWith("h")) ms = amount * 3_600_000;
  else if (unit.startsWith("d")) ms = amount * 86_400_000;
  else if (unit.startsWith("w")) ms = amount * 604_800_000;
  else throw new Error(`Unknown time unit: ${unit}`);

  return new Date(Date.now() - ms).toISOString();
}

/** Format a trace object (automation or script) into readable markdown */
export function formatTrace(domain: string, itemId: string, runId: string, trace: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`## ${domain} trace: ${itemId} (${runId})`);
  lines.push("");

  const state = (trace.state as string) || "unknown";
  const timestamp = trace.timestamp as Record<string, string> | undefined;
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| State | ${state} |`);
  if (timestamp?.start) lines.push(`| Started | ${timestamp.start} |`);
  if (timestamp?.finish) lines.push(`| Finished | ${timestamp.finish} |`);
  if (trace.script_execution) lines.push(`| Execution | ${trace.script_execution} |`);
  if (trace.error) lines.push(`| Error | ${trace.error} |`);

  const traceSteps = trace.trace as Record<string, unknown[]> | undefined;
  if (traceSteps) {
    lines.push("");
    lines.push("### Steps");
    lines.push("");
    for (const [path, steps] of Object.entries(traceSteps)) {
      for (const step of steps) {
        const s = step as Record<string, unknown>;
        const result = s.result ? ` → ${typeof s.result === "object" ? JSON.stringify(s.result) : s.result}` : "";
        const error = s.error ? ` ❌ ${s.error}` : "";
        lines.push(`- \`${path}\`${result}${error}`);
      }
    }
  }

  return lines.join("\n");
}

/** Produce a short one-line summary of an automation element */
export function summarizeElement(el: Record<string, unknown>, _type: string): string {
  const skip = new Set(["trigger", "platform", "condition", "alias", "id", "enabled", "variables", "options", "continue_on_error"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(el)) {
    if (skip.has(k) || k.startsWith("_")) continue;
    if (v === undefined || v === null) continue;
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${val.length > 50 ? val.slice(0, 47) + "..." : val}`);
  }
  return parts.join(", ") || "(empty)";
}
