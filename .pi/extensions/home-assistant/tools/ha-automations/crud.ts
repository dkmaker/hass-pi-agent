/**
 * Automation CRUD handlers — list, get, create, update, delete, trigger, enable/disable.
 *
 * These are the core REST+WS operations on automations.
 */
import { wsCommand } from "../../lib/ws.js";
import { apiGet, apiPost, apiDelete } from "../../lib/api.js";
import { timeSince } from "../../lib/format.js";
import { validateAutomationConfig } from "../../lib/validation.js";
import type { HAState, AutomationConfig } from "../../lib/types.js";
import { toYaml } from "../../lib/yaml.js";
import { backupBeforeMutation } from "../../lib/mutation-log.js";

// ── Helpers ──────────────────────────────────────────────────

function resolveEntityId(params: Record<string, unknown>): string {
  if (params.entity_id) return params.entity_id as string;
  if (params.automation_id) return `automation.${normalizeAlias(params.automation_id as string)}`;
  throw new Error("'entity_id' or 'automation_id' is required");
}

export function resolveAutomationId(params: Record<string, unknown>): string {
  if (params.automation_id) return params.automation_id as string;
  throw new Error("'automation_id' is required");
}

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function generateId(): string {
  return Date.now().toString();
}

// ── List ─────────────────────────────────────────────────────

export async function handleList(params: Record<string, unknown>): Promise<string> {
  const allStates = await wsCommand<HAState[]>("get_states");
  const limit = (params.limit as number) || 50;
  const offset = (params.offset as number) || 0;
  const search = (params.search as string)?.toLowerCase();
  const stateFilter = (params.state as string)?.toLowerCase();

  let automations = allStates.filter((s) => s.entity_id.startsWith("automation."));

  if (stateFilter) {
    automations = automations.filter((s) => s.state.toLowerCase() === stateFilter);
  }

  if (search) {
    automations = automations.filter((s) => {
      const name = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return s.entity_id.toLowerCase().includes(search) || name.includes(search);
    });
  }

  automations.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const total = automations.length;
  const page = automations.slice(offset, offset + limit);

  const rows: string[] = [];
  rows.push("| | Name | Entity | Mode | Last triggered |");
  rows.push("|---|------|--------|------|----------------|");
  for (const a of page) {
    const name = (a.attributes.friendly_name as string) || a.entity_id;
    const lastTriggered = a.attributes.last_triggered as string;
    const mode = (a.attributes.mode as string) || "single";
    const stateIcon = a.state === "on" ? "🟢" : "🔴";
    const ago = lastTriggered ? timeSince(lastTriggered) : "—";
    rows.push(`| ${stateIcon} | ${name} | ${a.entity_id} | ${mode} | ${ago} |`);
  }

  let summary: string;
  if (total <= limit && offset === 0) {
    summary = `${total} automations`;
  } else {
    summary = `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} automations`;
  }

  return rows.join("\n") + "\n\n" + summary;
}

// ── Get ──────────────────────────────────────────────────────

export async function handleGet(params: Record<string, unknown>): Promise<string> {
  const entityId = params.entity_id as string | undefined;
  const automationId = params.automation_id as string | undefined;

  if (!entityId && !automationId) {
    throw new Error("'entity_id' or 'automation_id' is required for get");
  }

  let state: HAState | undefined;
  if (entityId) {
    try {
      state = await apiGet<HAState>(`/api/states/${entityId}`);
    } catch { /* may not exist */ }
  }

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

  if (!config && entityId) {
    try {
      const wsResult = await wsCommand<{ config: AutomationConfig }>("automation/config", { entity_id: entityId });
      config = wsResult.config;
    } catch { /* not available */ }
  }

  if (!state && !config) {
    throw new Error(`Automation not found. Provide a valid entity_id or automation_id.`);
  }

  const lines: string[] = [];
  const name = state?.attributes.friendly_name || config?.alias || entityId || "(unnamed)";
  lines.push(`## ${name}`);
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  if (state) {
    lines.push(`| Entity | ${state.entity_id} |`);
    lines.push(`| State | ${state.state} |`);
    lines.push(`| Mode | ${state.attributes.mode || "single"} |`);
    if (state.attributes.last_triggered) lines.push(`| Last triggered | ${state.attributes.last_triggered} |`);
    if (state.attributes.current) lines.push(`| Current runs | ${state.attributes.current} |`);
  }
  if (config) {
    if (config.description) lines.push(`| Description | ${config.description} |`);
    const triggers = config.triggers || config.trigger;
    const conditions = config.conditions || config.condition;
    const actions = config.actions || config.action;
    if (Array.isArray(triggers)) lines.push(`| Triggers | ${triggers.length} |`);
    if (Array.isArray(conditions)) lines.push(`| Conditions | ${conditions.length} |`);
    if (Array.isArray(actions)) lines.push(`| Actions | ${actions.length} |`);
    lines.push("");
    lines.push("### Config");
    lines.push("");
    lines.push("```yaml");
    lines.push(toYaml(config).trim());
    lines.push("```");
  }

  return lines.join("\n");
}

// ── Create ───────────────────────────────────────────────────

export async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for create. Include at least: alias, triggers, actions");

  if (!config.alias) throw new Error("'config.alias' is required");
  if (!config.triggers && !config.trigger) throw new Error("'config.triggers' is required (array of trigger objects)");
  if (!config.actions && !config.action) throw new Error("'config.actions' is required (array of action objects)");

  const errors = validateAutomationConfig(config);
  if (errors.length > 0) {
    throw new Error(`Validation errors — fix before creating:\n${errors.map(e => `  • ${e}`).join("\n")}`);
  }

  const automationId = (params.automation_id as string) || generateId();
  await apiPost(`/api/config/automation/config/${automationId}`, config);

  return `✅ Created automation '${config.alias}' (id: ${automationId})\nAuto-reloaded — active immediately.`;
}

// ── Update ───────────────────────────────────────────────────

export async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const automationId = resolveAutomationId(params);
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for update");

  let existing: AutomationConfig;
  try {
    existing = await apiGet<AutomationConfig>(`/api/config/automation/config/${automationId}`);
  } catch {
    throw new Error(`Automation '${automationId}' not found`);
  }

  // Snapshot before mutation
  backupBeforeMutation("ha_automations", "update", automationId, existing);

  const { id: _id, ...existingWithoutId } = existing;
  const merged = { ...existingWithoutId, ...config };

  const errors = validateAutomationConfig(merged);
  if (errors.length > 0) {
    throw new Error(`Validation errors — fix before updating:\n${errors.map(e => `  • ${e}`).join("\n")}`);
  }

  await apiPost(`/api/config/automation/config/${automationId}`, merged);

  const name = (merged.alias as string) || automationId;
  return `✅ Updated automation '${name}' (id: ${automationId})\nAuto-reloaded — changes active immediately.`;
}

// ── Delete ───────────────────────────────────────────────────

export async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const automationId = resolveAutomationId(params);
  if (!params.confirm) {
    return `⚠️ **Confirm delete**: automation \`${automationId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  // Snapshot before deletion
  try {
    const existing = await apiGet(`/api/config/automation/config/${automationId}`);
    backupBeforeMutation("ha_automations", "delete", automationId, existing);
  } catch { /* best-effort */ }

  await apiDelete(`/api/config/automation/config/${automationId}`);
  return `✅ Deleted automation '${automationId}'\nEntity registry cleaned up automatically.`;
}

// ── Trigger ──────────────────────────────────────────────────

export async function handleTrigger(params: Record<string, unknown>): Promise<string> {
  const entityId = resolveEntityId(params);
  await apiPost("/api/services/automation/trigger", { entity_id: entityId });
  return `✅ Triggered ${entityId}`;
}

// ── Enable / Disable ─────────────────────────────────────────

export async function handleEnableDisable(params: Record<string, unknown>, enable: boolean): Promise<string> {
  const entityId = resolveEntityId(params);
  const service = enable ? "turn_on" : "turn_off";
  await apiPost(`/api/services/automation/${service}`, { entity_id: entityId });
  return `✅ ${enable ? "Enabled" : "Disabled"} ${entityId}`;
}
