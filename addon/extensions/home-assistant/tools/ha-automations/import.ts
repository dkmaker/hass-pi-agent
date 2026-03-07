/**
 * YAML import handler — import YAML automation config into a draft.
 *
 * Handles the "all internet docs are YAML" use case — paste YAML examples
 * from the internet into the builder.
 */
import { parseYaml } from "../../lib/yaml.js";
import { loadDraft, saveDraft, requireAlias, draftSummary } from "./draft.js";

export function handleImportYaml(params: Record<string, unknown>): string {
  const alias = requireAlias(params);
  const yamlContent = params.yaml_content as string | undefined;
  if (!yamlContent) throw new Error("'yaml_content' is required — the YAML string to import");

  const draft = loadDraft(alias);

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(yamlContent);
  } catch (e: any) {
    throw new Error(`Failed to parse YAML: ${e.message}`);
  }

  // Apply parsed fields to draft
  if (parsed.alias) draft.alias = parsed.alias as string;
  if (parsed.description) draft.description = parsed.description as string;
  if (parsed.mode) draft.mode = parsed.mode as string;
  if (parsed.max) draft.max = parsed.max as number;
  if (parsed.variables) draft.variables = parsed.variables as Record<string, unknown>;

  if (parsed.triggers) {
    draft.triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [parsed.triggers];
  } else if (parsed.trigger) {
    draft.triggers = Array.isArray(parsed.trigger) ? parsed.trigger : [parsed.trigger];
  }

  if (parsed.conditions) {
    draft.conditions = Array.isArray(parsed.conditions) ? parsed.conditions : [parsed.conditions];
  } else if (parsed.condition) {
    draft.conditions = Array.isArray(parsed.condition) ? parsed.condition : [parsed.condition];
  }

  if (parsed.actions) {
    draft.actions = Array.isArray(parsed.actions) ? parsed.actions : [parsed.actions];
  } else if (parsed.action) {
    draft.actions = Array.isArray(parsed.action) ? parsed.action : [parsed.action];
  }

  saveDraft(draft);
  return `✅ Imported YAML into draft '${alias}'\n\n${draftSummary(draft)}`;
}
