/**
 * Shared formatting and string utilities.
 *
 * Common helpers used across multiple tools — time formatting,
 * slugification, element summarization.
 */

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
