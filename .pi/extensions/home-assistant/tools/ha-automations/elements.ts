/**
 * Automation element CRUD — add/update/remove triggers, conditions, actions.
 * Also: list available types from the schema catalog.
 */
import { loadSchema } from "../../lib/schema.js";
import { validateElement } from "../../lib/validation.js";
import { loadDraft, saveDraft, requireAlias, draftSummary } from "./draft.js";

// ── List types ───────────────────────────────────────────────

export function handleListTypes(category: "triggers" | "conditions" | "actions"): string {
  const schema = loadSchema();
  const types = schema[category];
  const lines: string[] = [];

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  lines.push(`Available ${categoryLabel}:\n`);

  for (const [typeName, typeSchema] of Object.entries(types)) {
    lines.push(`  ${typeName}`);
    lines.push(`    ${typeSchema.description}`);

    if (Object.keys(typeSchema.fields).length > 0) {
      lines.push("    Fields:");
      for (const [fname, finfo] of Object.entries(typeSchema.fields)) {
        const req = finfo.required ? " (required)" : "";
        lines.push(`      ${fname}: ${finfo.type}${req}`);
      }
    }

    if (typeSchema.default) {
      lines.push(`    Default: ${JSON.stringify(typeSchema.default)}`);
    }

    lines.push("");
  }

  // Base fields
  const baseLabel = category === "triggers" ? "trigger" : category === "conditions" ? "condition" : "action";
  const baseFields = schema.base_fields[baseLabel];
  lines.push(`Common fields (all ${category}):`);
  for (const [fname, finfo] of Object.entries(baseFields)) {
    lines.push(`  ${fname}: ${finfo.type} — ${finfo.description || ""}`);
  }

  // Extra info for actions
  if (category === "actions") {
    lines.push("");
    lines.push("Note: Service call actions use 'action' field (e.g., action: 'light.turn_on').");
    lines.push("Use 'get-service-schema' to look up fields for a specific service.");
    lines.push("");
    lines.push("Repeat variants: count, while, until, for_each");
    for (const [variant, info] of Object.entries(schema.repeat_variants)) {
      const fields = Object.entries(info.fields).map(([k, v]) => `${k}: ${v.type}`).join(", ");
      lines.push(`  ${variant}: ${fields}`);
    }
  }

  return lines.join("\n");
}

// ── Add ──────────────────────────────────────────────────────

export function handleAddElement(params: Record<string, unknown>, category: "triggers" | "conditions" | "actions"): string {
  const alias = requireAlias(params);
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error(`'config' is required — the ${category.slice(0, -1)} configuration object`);

  const errors = validateElement(config, category);
  if (errors.length > 0) {
    throw new Error(`Validation errors:\n${errors.map(e => `  • ${e}`).join("\n")}`);
  }

  const draft = loadDraft(alias);
  draft[category].push(config);
  saveDraft(draft);

  const index = draft[category].length - 1;
  const singular = category.slice(0, -1);
  return `✅ Added ${singular} at index [${index}]\n\n${draftSummary(draft)}`;
}

// ── Update ───────────────────────────────────────────────────

export function handleUpdateElement(params: Record<string, unknown>, category: "triggers" | "conditions" | "actions"): string {
  const alias = requireAlias(params);
  const index = params.index as number | undefined;
  const config = params.config as Record<string, unknown> | undefined;

  if (index === undefined) throw new Error("'index' is required (0-based)");
  if (!config) throw new Error("'config' is required");

  const draft = loadDraft(alias);
  if (index < 0 || index >= draft[category].length) {
    throw new Error(`Index ${index} out of range. ${category} has ${draft[category].length} items (0-${draft[category].length - 1}).`);
  }

  const existing = draft[category][index] as Record<string, unknown>;
  const merged = { ...existing, ...config };

  const errors = validateElement(merged, category);
  if (errors.length > 0) {
    throw new Error(`Validation errors:\n${errors.map(e => `  • ${e}`).join("\n")}`);
  }

  draft[category][index] = merged;
  saveDraft(draft);

  const singular = category.slice(0, -1);
  return `✅ Updated ${singular} at index [${index}]\n\n${draftSummary(draft)}`;
}

// ── Remove ───────────────────────────────────────────────────

export function handleRemoveElement(params: Record<string, unknown>, category: "triggers" | "conditions" | "actions"): string {
  const alias = requireAlias(params);
  const index = params.index as number | undefined;

  if (index === undefined) throw new Error("'index' is required (0-based)");

  const draft = loadDraft(alias);
  if (index < 0 || index >= draft[category].length) {
    throw new Error(`Index ${index} out of range. ${category} has ${draft[category].length} items (0-${draft[category].length - 1}).`);
  }

  draft[category].splice(index, 1);
  saveDraft(draft);

  const singular = category.slice(0, -1);
  return `✅ Removed ${singular} at index [${index}]\n\n${draftSummary(draft)}`;
}
