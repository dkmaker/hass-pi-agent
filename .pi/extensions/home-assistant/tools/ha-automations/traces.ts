/**
 * Automation trace handlers — list traces and get trace detail.
 */
import { wsCommand } from "../../lib/ws.js";
import { timeSince } from "../../lib/format.js";
import type { TraceListEntry } from "../../lib/types.js";
import { resolveAutomationId } from "./crud.js";

export async function handleTraces(params: Record<string, unknown>): Promise<string> {
  const automationId = params.automation_id as string | undefined;
  const wsParams: Record<string, unknown> = { domain: "automation" };
  if (automationId) wsParams.item_id = automationId;

  const traces = await wsCommand<TraceListEntry[]>("trace/list", wsParams);

  if (traces.length === 0) {
    return automationId
      ? `No traces found for automation '${automationId}'.`
      : "No automation traces found.";
  }

  traces.sort((a, b) => b.timestamp.start.localeCompare(a.timestamp.start));
  const limit = (params.limit as number) || 20;
  const page = traces.slice(0, limit);

  const lines: string[] = [];
  for (const t of page) {
    const stateIcon = t.state === "stopped" ? "✅" : t.state === "running" ? "🔄" : "❌";
    const ago = timeSince(t.timestamp.start);
    const execution = t.script_execution || "unknown";
    const itemId = t.item_id;

    lines.push(`${stateIcon} ${itemId} — ${execution} (${ago})`);
    lines.push(`  run_id: ${t.run_id} | last_step: ${t.last_step || "none"}`);
  }

  lines.push("");
  lines.push(`${traces.length} traces total (showing ${page.length})`);
  return lines.join("\n");
}

export async function handleTrace(params: Record<string, unknown>): Promise<string> {
  const automationId = resolveAutomationId(params);
  const runId = params.run_id as string | undefined;
  if (!runId) throw new Error("'run_id' is required for trace");

  const trace = await wsCommand<Record<string, unknown>>("trace/get", {
    domain: "automation",
    item_id: automationId,
    run_id: runId,
  });

  return JSON.stringify(trace, null, 2);
}
