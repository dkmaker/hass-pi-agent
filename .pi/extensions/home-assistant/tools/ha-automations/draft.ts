/**
 * Draft file management for the automation builder.
 *
 * Drafts are stored as JSON files in /tmp/ha-automation-builder/,
 * keyed by slugified alias. One file per in-progress automation.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { slugify, getActionType, summarizeElement } from "../../lib/format.js";
import type { DraftConfig } from "../../lib/types.js";

const DRAFT_DIR = "/tmp/ha-automation-builder";

export function draftPath(alias: string): string {
  return join(DRAFT_DIR, `${slugify(alias)}.json`);
}

export function ensureDraftDir(): void {
  mkdirSync(DRAFT_DIR, { recursive: true });
}

export function loadDraft(alias: string): DraftConfig {
  const p = draftPath(alias);
  if (!existsSync(p)) {
    throw new Error(`No draft found for '${alias}'. Use 'new' or 'load' to create a draft first.`);
  }
  return JSON.parse(readFileSync(p, "utf-8")) as DraftConfig;
}

export function saveDraft(draft: DraftConfig): void {
  ensureDraftDir();
  draft._meta.modified = new Date().toISOString();
  writeFileSync(draftPath(draft.alias), JSON.stringify(draft, null, 2));
}

export function deleteDraft(alias: string): void {
  const p = draftPath(alias);
  if (existsSync(p)) unlinkSync(p);
}

export function draftExists(alias: string): boolean {
  return existsSync(draftPath(alias));
}

export function listDraftFiles(): string[] {
  ensureDraftDir();
  return readdirSync(DRAFT_DIR).filter(f => f.endsWith(".json"));
}

export function readDraftFile(filename: string): DraftConfig {
  return JSON.parse(readFileSync(join(DRAFT_DIR, filename), "utf-8")) as DraftConfig;
}

export function requireAlias(params: Record<string, unknown>): string {
  const alias = params.alias as string | undefined;
  if (!alias) throw new Error("'alias' is required to identify the draft");
  return alias;
}

/** Convert a draft to a clean config object (no _meta) for HA API */
export function draftToConfig(draft: DraftConfig): Record<string, unknown> {
  const config: Record<string, unknown> = {
    alias: draft.alias,
    description: draft.description,
    triggers: draft.triggers,
    conditions: draft.conditions,
    actions: draft.actions,
    mode: draft.mode,
  };
  if (draft.max) config.max = draft.max;
  if (draft.variables && Object.keys(draft.variables).length > 0) {
    config.variables = draft.variables;
  }
  return config;
}

/** Format a human-readable summary of a draft's contents */
export function draftSummary(draft: DraftConfig): string {
  const lines: string[] = [];
  lines.push(`📋 Draft: ${draft.alias}`);
  lines.push(`   ${draft.description}`);
  lines.push(`   Mode: ${draft.mode}${draft.max ? ` (max: ${draft.max})` : ""}`);
  if (draft._meta.source_id) lines.push(`   Source: ${draft._meta.source_id}`);
  lines.push("");

  lines.push(`   Triggers (${draft.triggers.length}):`);
  for (let i = 0; i < draft.triggers.length; i++) {
    const t = draft.triggers[i] as Record<string, unknown>;
    const type = (t.trigger || t.platform || "unknown") as string;
    const alias = t.alias ? ` "${t.alias}"` : "";
    const id = t.id ? ` [id: ${t.id}]` : "";
    lines.push(`     [${i}] ${type}${alias}${id} — ${summarizeElement(t, type)}`);
  }

  lines.push(`   Conditions (${draft.conditions.length}):`);
  for (let i = 0; i < draft.conditions.length; i++) {
    const c = draft.conditions[i] as Record<string, unknown>;
    const type = (c.condition || "unknown") as string;
    lines.push(`     [${i}] ${type} — ${summarizeElement(c, type)}`);
  }

  lines.push(`   Actions (${draft.actions.length}):`);
  for (let i = 0; i < draft.actions.length; i++) {
    const a = draft.actions[i] as Record<string, unknown>;
    const type = getActionType(a);
    lines.push(`     [${i}] ${type} — ${summarizeElement(a, type)}`);
  }

  return lines.join("\n");
}
