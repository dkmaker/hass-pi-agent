/**
 * Home Assistant automation management tool.
 *
 * Full CRUD for automations via REST config API + WS for reads/traces.
 * All changes are live — HA auto-reloads after create/update/delete.
 *
 * Storage: automations.yaml (ID-based list, managed by EditIdBasedConfigView)
 * WS: automation/config (read), trace/list, trace/get
 * REST: /api/config/automation/config/{id} (CRUD with auto-reload)
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";

// ── Types ────────────────────────────────────────────────────

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface AutomationConfig {
  id: string;
  alias?: string;
  description?: string;
  triggers?: unknown[];
  trigger?: unknown[];
  conditions?: unknown[];
  condition?: unknown[];
  actions?: unknown[];
  action?: unknown[];
  mode?: string;
  max?: number;
  max_exceeded?: string;
  variables?: Record<string, unknown>;
  trace?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TraceListEntry {
  run_id: string;
  state: string;
  script_execution: string;
  timestamp: { start: string; finish: string | null };
  domain: string;
  item_id: string;
  last_step: string | null;
  [key: string]: unknown;
}

interface WSAreaRegistryEntry {
  area_id: string;
  name: string;
  [key: string]: unknown;
}

interface WSEntityRegistryEntry {
  entity_id: string;
  area_id: string | null;
  labels: string[];
  [key: string]: unknown;
}

// ── Tool registration ────────────────────────────────────────

export function registerAutomationsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_automations",
    label: "HA Automations",
    description: `Manage Home Assistant automations — full CRUD, enable/disable, trigger, and trace debugging.

Actions:
- list: List all automations with state and last triggered time. Filters: state (on/off), search.
- get: Get full automation config + current state.
- create: Create a new automation (alias and at least one trigger+action required). Auto-reloads.
- update: Update an existing automation config. Auto-reloads.
- delete: Delete an automation. Auto-cleans entity registry.
- trigger: Manually trigger an automation.
- enable: Enable a disabled automation.
- disable: Disable an automation.
- traces: List recent execution traces for an automation.
- trace: Get detailed trace for a specific run.

All changes take effect immediately — HA auto-reloads after writes.`,

    parameters: Type.Object({
      action: StringEnum(
        ["list", "get", "create", "update", "delete", "trigger", "enable", "disable", "traces", "trace"] as const,
        { description: "Action to perform" }
      ),
      automation_id: Type.Optional(
        Type.String({ description: "Automation config ID (the numeric/string id, not entity_id)" })
      ),
      entity_id: Type.Optional(
        Type.String({ description: "Automation entity_id (e.g., automation.my_automation)" })
      ),
      config: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Automation config for create/update. Keys: alias, description, triggers, conditions, actions, mode, max, variables",
        })
      ),
      run_id: Type.Optional(
        Type.String({ description: "Trace run_id for the 'trace' action" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search automation name/entity_id" })
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
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList(params);
    case "get": return handleGet(params);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params);
    case "trigger": return handleTrigger(params);
    case "enable": return handleEnableDisable(params, true);
    case "disable": return handleEnableDisable(params, false);
    case "traces": return handleTraces(params);
    case "trace": return handleTrace(params);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function resolveEntityId(params: Record<string, unknown>): string {
  if (params.entity_id) return params.entity_id as string;
  if (params.automation_id) return `automation.${normalizeAlias(params.automation_id as string)}`;
  throw new Error("'entity_id' or 'automation_id' is required");
}

function resolveAutomationId(params: Record<string, unknown>): string {
  if (params.automation_id) return params.automation_id as string;
  throw new Error("'automation_id' is required");
}

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function generateId(): string {
  return Date.now().toString();
}

// ── List ─────────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const allStates = await wsCommand<HAState[]>("get_states");
  const limit = (params.limit as number) || 50;
  const offset = (params.offset as number) || 0;
  const search = (params.search as string)?.toLowerCase();
  const stateFilter = (params.state as string)?.toLowerCase();

  let automations = allStates.filter((s) => s.entity_id.startsWith("automation."));

  // State filter
  if (stateFilter) {
    automations = automations.filter((s) => s.state.toLowerCase() === stateFilter);
  }

  // Search filter
  if (search) {
    automations = automations.filter((s) => {
      const name = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return s.entity_id.toLowerCase().includes(search) || name.includes(search);
    });
  }

  automations.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const total = automations.length;
  const page = automations.slice(offset, offset + limit);

  const lines: string[] = [];
  for (const a of page) {
    const name = (a.attributes.friendly_name as string) || a.entity_id;
    const configId = a.attributes.id as string;
    const lastTriggered = a.attributes.last_triggered as string;
    const mode = a.attributes.mode as string;
    const stateIcon = a.state === "on" ? "🟢" : "🔴";

    let line = `${stateIcon} ${name}`;
    const meta: string[] = [];
    if (configId) meta.push(`id: ${configId}`);
    meta.push(`entity: ${a.entity_id}`);
    if (mode && mode !== "single") meta.push(`mode: ${mode}`);
    if (lastTriggered) {
      const ago = timeSince(lastTriggered);
      meta.push(`last: ${ago}`);
    }
    lines.push(line);
    lines.push(`  ${meta.join(" | ")}`);
  }

  let summary: string;
  if (total <= limit && offset === 0) {
    summary = `${total} automations`;
  } else {
    summary = `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} automations`;
  }

  return lines.join("\n") + "\n\n" + summary;
}

// ── Get ──────────────────────────────────────────────────────

async function handleGet(params: Record<string, unknown>): Promise<string> {
  // We need either entity_id or automation_id
  const entityId = params.entity_id as string | undefined;
  const automationId = params.automation_id as string | undefined;

  if (!entityId && !automationId) {
    throw new Error("'entity_id' or 'automation_id' is required for get");
  }

  // Get state
  let state: HAState | undefined;
  if (entityId) {
    try {
      state = await apiGet<HAState>(`/api/states/${entityId}`);
    } catch { /* may not exist */ }
  }

  // Get config - prefer automation_id, fall back to extracting from state
  let configId = automationId;
  if (!configId && state) {
    configId = state.attributes.id as string;
  }

  let config: AutomationConfig | null = null;
  if (configId) {
    try {
      config = await apiGet<AutomationConfig>(`/api/config/automation/config/${configId}`);
    } catch { /* may not exist */ }
  }

  // Also try WS for config if we have entity_id
  if (!config && entityId) {
    try {
      const wsResult = await wsCommand<{ config: AutomationConfig }>("automation/config", { entity_id: entityId });
      config = wsResult.config;
    } catch { /* not available */ }
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

  if (!state && !config) {
    throw new Error(`Automation not found. Provide a valid entity_id or automation_id.`);
  }

  return JSON.stringify(result, null, 2);
}

// ── Create ───────────────────────────────────────────────────

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for create. Include at least: alias, triggers, actions");

  if (!config.alias) throw new Error("'config.alias' is required");
  if (!config.triggers && !config.trigger) throw new Error("'config.triggers' is required (array of trigger objects)");
  if (!config.actions && !config.action) throw new Error("'config.actions' is required (array of action objects)");

  const automationId = (params.automation_id as string) || generateId();

  // POST to the config endpoint — this writes to automations.yaml and auto-reloads
  await apiPost(`/api/config/automation/config/${automationId}`, config);

  return `✅ Created automation '${config.alias}' (id: ${automationId})\nAuto-reloaded — active immediately.`;
}

// ── Update ───────────────────────────────────────────────────

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const automationId = resolveAutomationId(params);
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for update");

  // Get existing config first to merge
  let existing: AutomationConfig;
  try {
    existing = await apiGet<AutomationConfig>(`/api/config/automation/config/${automationId}`);
  } catch {
    throw new Error(`Automation '${automationId}' not found`);
  }

  // Merge — remove the 'id' field from existing (REST API adds it but doesn't want it back)
  const { id: _id, ...existingWithoutId } = existing;
  const merged = { ...existingWithoutId, ...config };

  await apiPost(`/api/config/automation/config/${automationId}`, merged);

  const name = (merged.alias as string) || automationId;
  return `✅ Updated automation '${name}' (id: ${automationId})\nAuto-reloaded — changes active immediately.`;
}

// ── Delete ───────────────────────────────────────────────────

async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const automationId = resolveAutomationId(params);
  await apiDelete(`/api/config/automation/config/${automationId}`);
  return `✅ Deleted automation '${automationId}'\nEntity registry cleaned up automatically.`;
}

// ── Trigger ──────────────────────────────────────────────────

async function handleTrigger(params: Record<string, unknown>): Promise<string> {
  const entityId = resolveEntityId(params);

  await apiPost("/api/services/automation/trigger", {
    entity_id: entityId,
  });

  return `✅ Triggered ${entityId}`;
}

// ── Enable / Disable ─────────────────────────────────────────

async function handleEnableDisable(params: Record<string, unknown>, enable: boolean): Promise<string> {
  const entityId = resolveEntityId(params);
  const service = enable ? "turn_on" : "turn_off";

  await apiPost(`/api/services/automation/${service}`, {
    entity_id: entityId,
  });

  return `✅ ${enable ? "Enabled" : "Disabled"} ${entityId}`;
}

// ── Traces ───────────────────────────────────────────────────

async function handleTraces(params: Record<string, unknown>): Promise<string> {
  const automationId = params.automation_id as string | undefined;

  const wsParams: Record<string, unknown> = { domain: "automation" };
  if (automationId) wsParams.item_id = automationId;

  const traces = await wsCommand<TraceListEntry[]>("trace/list", wsParams);

  if (traces.length === 0) {
    return automationId
      ? `No traces found for automation '${automationId}'.`
      : "No automation traces found.";
  }

  // Sort newest first
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

// ── Trace detail ─────────────────────────────────────────────

async function handleTrace(params: Record<string, unknown>): Promise<string> {
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

// ── Utilities ────────────────────────────────────────────────

function timeSince(isoDate: string): string {
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
