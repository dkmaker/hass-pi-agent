/**
 * Automation trace handlers — list traces and get trace detail.
 */
import { wsCommand } from "../../lib/ws.js";
import { timeSince, formatTrace } from "../../lib/format.js";
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

  const lines: string[] = [
    "| Status | Automation | Execution | Run ID | Last Step | Time |",
    "|--------|-----------|-----------|--------|-----------|------|",
  ];
  for (const t of page) {
    const stateIcon = t.state === "stopped" ? "✅" : t.state === "running" ? "🔄" : "❌";
    const ago = timeSince(t.timestamp.start);
    const execution = t.script_execution || "unknown";
    lines.push(`| ${stateIcon} | ${t.item_id} | ${execution} | ${t.run_id} | ${t.last_step || "none"} | ${ago} |`);
  }

  lines.push(`\n${traces.length} traces (showing ${page.length})`);
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

  return formatTrace("automation", automationId, runId, trace);
}
