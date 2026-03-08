/**
 * Home Assistant script management tool.
 *
 * Supports: list, get, create, update, delete, run, traces, trace.
 * Scripts use `sequence` (not `actions`) and can have input `fields`.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import { timeSince } from "../lib/format.js";
import type { HAState, TraceListEntry } from "../lib/types.js";

// ── Helpers ──────────────────────────────────────────────────

function resolveEntityId(params: Record<string, unknown>): string {
  if (params.entity_id) return params.entity_id as string;
  if (params.script_id) return `script.${params.script_id as string}`;
  throw new Error("'entity_id' or 'script_id' is required");
}

// ── List ─────────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const allStates = await wsCommand<HAState[]>("get_states");
  const limit = (params.limit as number) || 50;
  const offset = (params.offset as number) || 0;
  const search = (params.search as string)?.toLowerCase();
  const stateFilter = (params.state as string)?.toLowerCase();

  let scripts = allStates.filter((s) => s.entity_id.startsWith("script."));

  if (stateFilter) {
    scripts = scripts.filter((s) => s.state.toLowerCase() === stateFilter);
  }

  if (search) {
    scripts = scripts.filter((s) => {
      const name = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return s.entity_id.toLowerCase().includes(search) || name.includes(search);
    });
  }

  scripts.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const total = scripts.length;
  const page = scripts.slice(offset, offset + limit);

  if (total === 0) return "No scripts found.";

  const lines: string[] = [];
  for (const s of page) {
    const name = (s.attributes.friendly_name as string) || s.entity_id;
    const lastTriggered = s.attributes.last_triggered as string;
    const mode = s.attributes.mode as string;
    const stateIcon = s.state === "on" ? "🔄" : "⏹️";
    const objectId = s.entity_id.replace("script.", "");

    const meta: string[] = [`id: ${objectId}`];
    if (mode && mode !== "single") meta.push(`mode: ${mode}`);
    if (lastTriggered) meta.push(`last: ${timeSince(lastTriggered)}`);

    lines.push(`${stateIcon} ${name}`);
    lines.push(`  ${meta.join(" | ")}`);
  }

  const summary = total <= limit && offset === 0
    ? `${total} scripts`
    : `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} scripts`;

  return lines.join("\n") + "\n\n" + summary;
}

// ── Get ──────────────────────────────────────────────────────

async function handleGet(params: Record<string, unknown>): Promise<string> {
  const entityId = params.entity_id as string | undefined;
  const scriptId = params.script_id as string | undefined;

  if (!entityId && !scriptId) {
    throw new Error("'entity_id' or 'script_id' is required for get");
  }

  const resolvedEntityId = entityId || `script.${scriptId}`;
  const objectId = scriptId || resolvedEntityId!.replace("script.", "");

  let state: HAState | undefined;
  try {
    state = await apiGet<HAState>(`/api/states/${resolvedEntityId}`);
  } catch { /* may not exist */ }

  let config: Record<string, unknown> | null = null;
  try {
    config = await apiGet<Record<string, unknown>>(`/api/config/script/config/${objectId}`);
  } catch { /* may not exist */ }

  if (!config && resolvedEntityId) {
    try {
      const wsResult = await wsCommand<{ config: Record<string, unknown> }>("script/config", { entity_id: resolvedEntityId });
      config = wsResult.config;
    } catch { /* not available */ }
  }

  if (!state && !config) {
    throw new Error(`Script not found. Provide a valid entity_id or script_id.`);
  }

  const result: Record<string, unknown> = {};
  if (state) {
    result.entity_id = state.entity_id;
    result.state = state.state;
    result.friendly_name = state.attributes.friendly_name;
    result.last_triggered = state.attributes.last_triggered;
    result.mode = state.attributes.mode;
    result.current = state.attributes.current;
  }
  if (config) {
    result.config = config;
  }

  return JSON.stringify(result, null, 2);
}

// ── Create ───────────────────────────────────────────────────

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const config = params.config as Record<string, unknown> | undefined;
  const scriptId = params.script_id as string | undefined;
  if (!config) throw new Error("'config' is required for create. Include at least: alias, sequence");
  if (!scriptId) throw new Error("'script_id' is required for create (the object_id, e.g., 'morning_routine')");
  if (!config.alias) throw new Error("'config.alias' is required");
  if (!config.sequence) throw new Error("'config.sequence' is required (array of action objects)");

  await apiPost(`/api/config/script/config/${scriptId}`, config);
  return `✅ Created script '${config.alias}' (id: ${scriptId})\nAuto-reloaded — active immediately.`;
}

// ── Update ───────────────────────────────────────────────────

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const scriptId = params.script_id as string;
  if (!scriptId) throw new Error("'script_id' is required for update");
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for update");

  let existing: Record<string, unknown>;
  try {
    existing = await apiGet<Record<string, unknown>>(`/api/config/script/config/${scriptId}`);
  } catch {
    throw new Error(`Script '${scriptId}' not found`);
  }

  const { id: _id, ...existingWithoutId } = existing;
  const merged = { ...existingWithoutId, ...config };

  await apiPost(`/api/config/script/config/${scriptId}`, merged);
  const name = (merged.alias as string) || scriptId;
  return `✅ Updated script '${name}' (id: ${scriptId})\nAuto-reloaded — changes active immediately.`;
}

// ── Delete ───────────────────────────────────────────────────

async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const scriptId = params.script_id as string;
  if (!scriptId) throw new Error("'script_id' is required for delete");
  await apiDelete(`/api/config/script/config/${scriptId}`);
  return `✅ Deleted script '${scriptId}'`;
}

// ── Run ──────────────────────────────────────────────────────

async function handleRun(params: Record<string, unknown>): Promise<string> {
  const entityId = resolveEntityId(params);
  const variables = params.variables as Record<string, unknown> | undefined;
  const data: Record<string, unknown> = { entity_id: entityId };
  if (variables) data.variables = variables;
  await apiPost("/api/services/script/turn_on", data);
  return `✅ Started ${entityId}`;
}

// ── Stop ─────────────────────────────────────────────────────

async function handleStop(params: Record<string, unknown>): Promise<string> {
  const entityId = resolveEntityId(params);
  await apiPost("/api/services/script/turn_off", { entity_id: entityId });
  return `✅ Stopped ${entityId}`;
}

// ── Traces ───────────────────────────────────────────────────

async function handleTraces(params: Record<string, unknown>): Promise<string> {
  const scriptId = params.script_id as string | undefined;
  const wsParams: Record<string, unknown> = { domain: "script" };
  if (scriptId) wsParams.item_id = scriptId;

  const traces = await wsCommand<TraceListEntry[]>("trace/list", wsParams);

  if (traces.length === 0) {
    return scriptId
      ? `No traces found for script '${scriptId}'.`
      : "No script traces found.";
  }

  traces.sort((a, b) => b.timestamp.start.localeCompare(a.timestamp.start));
  const limit = (params.limit as number) || 20;
  const page = traces.slice(0, limit);

  const lines: string[] = [];
  for (const t of page) {
    const stateIcon = t.state === "stopped" ? "✅" : t.state === "running" ? "🔄" : "❌";
    const ago = timeSince(t.timestamp.start);
    const execution = t.script_execution || "unknown";
    lines.push(`${stateIcon} ${t.item_id} — ${execution} (${ago})`);
    lines.push(`  run_id: ${t.run_id} | last_step: ${t.last_step || "none"}`);
  }

  lines.push("");
  lines.push(`${traces.length} traces total (showing ${page.length})`);
  return lines.join("\n");
}

async function handleTrace(params: Record<string, unknown>): Promise<string> {
  const scriptId = params.script_id as string;
  if (!scriptId) throw new Error("'script_id' is required for trace");
  const runId = params.run_id as string;
  if (!runId) throw new Error("'run_id' is required for trace");

  const trace = await wsCommand<Record<string, unknown>>("trace/get", {
    domain: "script",
    item_id: scriptId,
    run_id: runId,
  });

  return JSON.stringify(trace, null, 2);
}

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = [
  "list", "get", "create", "update", "delete",
  "run", "stop", "traces", "trace",
] as const;

export function registerScriptsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_scripts",
    label: "HA Scripts",
    description: `Manage Home Assistant scripts — full CRUD, run, stop, and trace debugging.

Actions:
- list: List all scripts with state and last triggered time. Filters: state (on/off), search.
- get: Get full script config + current state.
- create: Create a new script (script_id, alias, and sequence required). Auto-reloads.
- update: Update an existing script config. Auto-reloads.
- delete: Delete a script.
- run: Run a script, optionally with input variables.
- stop: Stop a running script.
- traces: List recent execution traces for a script.
- trace: Get detailed trace for a specific run.

All changes take effect immediately — HA auto-reloads after writes.`,

    parameters: Type.Object({
      action: StringEnum(ALL_ACTIONS, { description: "Action to perform" }),
      script_id: Type.Optional(
        Type.String({ description: "Script object ID (e.g., 'morning_routine' — the part after 'script.')" })
      ),
      entity_id: Type.Optional(
        Type.String({ description: "Script entity_id (e.g., script.morning_routine)" })
      ),
      config: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Script config for create/update. Keys: alias, description, sequence, icon, mode, max, fields",
        })
      ),
      variables: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Input variables when running a script",
        })
      ),
      run_id: Type.Optional(
        Type.String({ description: "Trace run_id for the 'trace' action" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search script name/entity_id" })
      ),
      state: Type.Optional(
        Type.String({ description: "Filter by state: on, off" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 50)" })
      ),
      offset: Type.Optional(
        Type.Number({ description: "Pagination offset (default: 0)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await dispatch(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function dispatch(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList(params);
    case "get": return handleGet(params);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params);
    case "run": return handleRun(params);
    case "stop": return handleStop(params);
    case "traces": return handleTraces(params);
    case "trace": return handleTrace(params);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
