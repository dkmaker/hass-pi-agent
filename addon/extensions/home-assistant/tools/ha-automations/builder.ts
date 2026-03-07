/**
 * Automation builder session handlers — new, load, show, yaml, save, discard, list-drafts.
 *
 * Manages the lifecycle of in-progress automation drafts.
 */
import { existsSync } from "node:fs";
import { wsCommand } from "../../lib/ws.js";
import { apiGet, apiPost } from "../../lib/api.js";
import { slugify, timeSince } from "../../lib/format.js";
import { toYaml } from "../../lib/yaml.js";
import type { HAState, AutomationConfig, DraftConfig } from "../../lib/types.js";
import {
  draftPath, loadDraft, saveDraft, deleteDraft, draftExists,
  listDraftFiles, readDraftFile, requireAlias, draftToConfig, draftSummary,
} from "./draft.js";
import { generateId } from "./crud.js";

export async function handleNew(params: Record<string, unknown>): Promise<string> {
  const alias = requireAlias(params);
  const description = (params.description as string) || "";
  const mode = (params.mode as string) || "single";

  if (!description) {
    throw new Error("'description' is required for a new automation draft");
  }

  const validModes = ["single", "restart", "queued", "parallel"];
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid mode '${mode}'. Valid modes: ${validModes.join(", ")}`);
  }

  if (draftExists(alias)) {
    throw new Error(`Draft '${alias}' already exists. Use 'show' to view it, 'discard' to delete it, or choose a different alias.`);
  }

  // Check alias uniqueness against existing automations in HA
  try {
    const allStates = await wsCommand<HAState[]>("get_states");
    const existing = allStates.filter(s => s.entity_id.startsWith("automation."));
    const sluggedAlias = slugify(alias);
    const conflict = existing.find(s => {
      const name = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return slugify(name) === sluggedAlias || s.entity_id === `automation.${sluggedAlias}`;
    });
    if (conflict) {
      throw new Error(`An automation with alias '${alias}' already exists in HA (${conflict.entity_id}). Use 'load' to edit it instead, or choose a different alias.`);
    }
  } catch (e: any) {
    if (e.message.includes("already exists")) throw e;
  }

  const draft: DraftConfig = {
    alias,
    description,
    triggers: [],
    conditions: [],
    actions: [],
    mode,
    _meta: {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    },
  };

  saveDraft(draft);
  return `✅ Created new draft '${alias}'\n\n${draftSummary(draft)}\n\nNext: add triggers with 'add-trigger', conditions with 'add-condition', actions with 'add-action'.`;
}

export async function handleLoad(params: Record<string, unknown>): Promise<string> {
  const automationId = params.automation_id as string;
  if (!automationId) throw new Error("'automation_id' is required");

  let config: AutomationConfig;
  try {
    config = await apiGet<AutomationConfig>(`/api/config/automation/config/${automationId}`);
  } catch {
    throw new Error(`Automation '${automationId}' not found in HA`);
  }

  const alias = (config.alias as string) || automationId;

  if (draftExists(alias)) {
    throw new Error(`Draft '${alias}' already exists. Discard it first or use a different alias.`);
  }

  const triggers = (config.triggers || config.trigger || []) as unknown[];
  const conditions = (config.conditions || config.condition || []) as unknown[];
  const actions = (config.actions || config.action || []) as unknown[];

  const draft: DraftConfig = {
    alias,
    description: (config.description as string) || "",
    triggers: Array.isArray(triggers) ? triggers : [triggers],
    conditions: Array.isArray(conditions) ? conditions : [conditions],
    actions: Array.isArray(actions) ? actions : [actions],
    mode: (config.mode as string) || "single",
    _meta: {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      source_id: automationId,
    },
  };

  if (config.max) draft.max = config.max as number;
  if (config.variables) draft.variables = config.variables as Record<string, unknown>;

  saveDraft(draft);
  return `✅ Loaded automation '${alias}' (id: ${automationId}) into draft\n\n${draftSummary(draft)}`;
}

export function handleListDrafts(): string {
  const files = listDraftFiles();

  if (files.length === 0) {
    return "No drafts found. Use 'new' to create one or 'load' to edit an existing automation.";
  }

  const lines: string[] = [`${files.length} draft(s):\n`];
  for (const f of files.sort()) {
    try {
      const draft = readDraftFile(f);
      const source = draft._meta.source_id ? ` (editing: ${draft._meta.source_id})` : " (new)";
      lines.push(`📋 ${draft.alias}${source}`);
      lines.push(`   T:${draft.triggers.length} C:${draft.conditions.length} A:${draft.actions.length} | mode: ${draft.mode} | modified: ${timeSince(draft._meta.modified)}`);
    } catch {
      lines.push(`❌ ${f} (corrupt)`);
    }
  }

  return lines.join("\n");
}

export function handleShow(params: Record<string, unknown>): string {
  const alias = requireAlias(params);
  const draft = loadDraft(alias);
  const config = draftToConfig(draft);
  return draftSummary(draft) + "\n\n" + JSON.stringify(config, null, 2);
}

export function handleYaml(params: Record<string, unknown>): string {
  const alias = requireAlias(params);
  const draft = loadDraft(alias);
  const config = draftToConfig(draft);
  const yaml = toYaml(config).trim();
  return draftSummary(draft) + "\n\n```yaml\n" + yaml + "\n```";
}

export async function handleSave(params: Record<string, unknown>): Promise<string> {
  const alias = requireAlias(params);
  const draft = loadDraft(alias);

  if (draft.triggers.length === 0) {
    throw new Error("Cannot save: automation has no triggers. Add at least one trigger.");
  }
  if (draft.actions.length === 0) {
    throw new Error("Cannot save: automation has no actions. Add at least one action.");
  }

  const config = draftToConfig(draft);
  const automationId = (params.automation_id as string) || draft._meta.source_id || generateId();

  try {
    await apiPost(`/api/config/automation/config/${automationId}`, config);
  } catch (e: any) {
    throw new Error(`HA rejected the automation config:\n${e.message}\n\nFix the issues and try saving again. The draft is preserved.`);
  }

  deleteDraft(alias);
  return `✅ Saved automation '${alias}' (id: ${automationId})\nAuto-reloaded — active immediately.\nDraft removed.`;
}

export function handleDiscard(params: Record<string, unknown>): string {
  const alias = requireAlias(params);
  if (!draftExists(alias)) {
    throw new Error(`No draft found for '${alias}'`);
  }
  deleteDraft(alias);
  return `✅ Discarded draft '${alias}'`;
}
