/**
 * Policy storage and management for Pi Agent.
 *
 * Policies are user-defined conventions (naming, organization, etc.)
 * stored in /homeassistant/pi-agent/policies.yaml and injected into
 * the system prompt so the AI follows them consistently.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { HA_CONFIG_PATH } from "./config.js";
import { parseYaml, toYaml } from "./yaml.js";

// ── Paths ────────────────────────────────────────────────────

export const PI_AGENT_DIR = join(HA_CONFIG_PATH, "pi-agent");
export const POLICIES_FILE = join(PI_AGENT_DIR, "policies.yaml");

// ── Types ────────────────────────────────────────────────────

/** Top-level policy categories */
export type PolicyCategory =
  | "naming"
  | "organization"
  | "automations"
  | "dashboards"
  | "language"
  | "general";

export interface NamingPolicy {
  /** Entity ID pattern: "location_device" or "device_location" */
  entity_id_pattern?: string;
  /** Friendly name pattern description */
  friendly_name_pattern?: string;
  /** Metric sensor suffixes convention */
  metric_suffixes?: string;
  /** Voice assistant optimization notes */
  voice_assistant?: string;
  /** Any additional naming notes */
  notes?: string;
}

export interface OrganizationPolicy {
  /** Area naming/structure convention */
  areas?: string;
  /** Floor usage */
  floors?: string;
  /** Label strategy */
  labels?: string;
  /** Device naming convention */
  devices?: string;
  /** Any additional organization notes */
  notes?: string;
}

export interface AutomationPolicy {
  /** Automation naming pattern */
  naming?: string;
  /** Category usage */
  categories?: string;
  /** Script naming pattern */
  scripts?: string;
  /** Any additional automation notes */
  notes?: string;
}

export interface DashboardPolicy {
  /** Dashboard organization convention */
  organization?: string;
  /** Card preferences */
  cards?: string;
  /** Any additional dashboard notes */
  notes?: string;
}

/** Language mapping entry: technical (English) name → display name */
export interface LanguageMapping {
  /** English technical name (used in entity IDs, labels, YAML) */
  en: string;
  /** Display name in user's language */
  display: string;
}

export interface LanguagePolicy {
  /** Whether multilingual naming is enabled */
  enabled?: boolean;
  /** Technical/entity ID language (usually "en") */
  technical_language?: string;
  /** Display/friendly name language code (e.g., "da", "de", "fr") */
  display_language?: string;
  /** Strategy description */
  strategy?: string;
  /** Area mappings: English name → display language name */
  areas?: Record<string, string>;
  /** Zone mappings: English name → display language name */
  zones?: Record<string, string>;
  /** Device type mappings: English → display language (e.g., "ceiling light" → "loftlampe") */
  device_types?: Record<string, string>;
  /** Metric mappings: English → display language (e.g., "power" → "effekt") */
  metrics?: Record<string, string>;
  /** Common words/qualifiers: English → display (e.g., "temperature" → "temperatur") */
  common_words?: Record<string, string>;
}

export interface Policies {
  naming?: NamingPolicy;
  organization?: OrganizationPolicy;
  automations?: AutomationPolicy;
  dashboards?: DashboardPolicy;
  language?: LanguagePolicy;
  general?: Record<string, string>;
}

// ── Load / Save ──────────────────────────────────────────────

/** Check if policies file exists */
export function policiesExist(): boolean {
  return existsSync(POLICIES_FILE);
}

/** Load policies from disk. Returns empty object if file doesn't exist. */
export function loadPolicies(): Policies {
  if (!existsSync(POLICIES_FILE)) return {};
  try {
    const raw = readFileSync(POLICIES_FILE, "utf-8");
    return (parseYaml(raw) as Policies) ?? {};
  } catch {
    return {};
  }
}

/** Save policies to disk. Creates pi-agent directory if needed. */
export function savePolicies(policies: Policies): void {
  if (!existsSync(PI_AGENT_DIR)) {
    mkdirSync(PI_AGENT_DIR, { recursive: true });
  }
  const yaml = toYaml(policies);
  writeFileSync(POLICIES_FILE, yaml, "utf-8");
}

/** Get a specific policy category */
export function getPolicy(category: PolicyCategory): unknown {
  const policies = loadPolicies();
  return policies[category] ?? null;
}

/** Deep merge: nested objects are merged, not replaced */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
      result[k] = deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Set a specific policy category (deep-merges with existing) */
export function setPolicy(category: PolicyCategory, value: Record<string, unknown>): Policies {
  const policies = loadPolicies();
  const existing = (policies[category] as Record<string, unknown>) ?? {};
  (policies as Record<string, unknown>)[category] = deepMerge(existing, value);
  savePolicies(policies);
  return policies;
}

/** Remove a policy category or specific key within a category */
export function removePolicy(category: PolicyCategory, key?: string): Policies {
  const policies = loadPolicies();
  if (key) {
    const cat = policies[category] as Record<string, unknown> | undefined;
    if (cat) {
      delete cat[key];
      if (Object.keys(cat).length === 0) {
        delete (policies as Record<string, unknown>)[category];
      }
    }
  } else {
    delete (policies as Record<string, unknown>)[category];
  }
  savePolicies(policies);
  return policies;
}

// ── System prompt formatting ─────────────────────────────────

/** Safely format a policy value — stringify objects instead of [object Object] */
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Format policies as a system prompt section for LLM injection */
export function formatPoliciesForPrompt(policies: Policies): string {
  const sections: string[] = [];

  if (policies.naming) {
    const n = policies.naming;
    const lines = ["## Naming Conventions (User Policy)"];
    if (n.entity_id_pattern) lines.push(`- **Entity ID pattern:** ${fmtVal(n.entity_id_pattern)}`);
    if (n.friendly_name_pattern) lines.push(`- **Friendly names:** ${fmtVal(n.friendly_name_pattern)}`);
    if (n.metric_suffixes) lines.push(`- **Metric sensors:** ${fmtVal(n.metric_suffixes)}`);
    if (n.voice_assistant) lines.push(`- **Voice assistant:** ${fmtVal(n.voice_assistant)}`);
    if (n.notes) lines.push(`- **Notes:** ${fmtVal(n.notes)}`);
    sections.push(lines.join("\n"));
  }

  if (policies.organization) {
    const o = policies.organization;
    const lines = ["## Organization Conventions (User Policy)"];
    if (o.areas) lines.push(`- **Areas:** ${fmtVal(o.areas)}`);
    if (o.floors) lines.push(`- **Floors:** ${fmtVal(o.floors)}`);
    if (o.labels) lines.push(`- **Labels:** ${fmtVal(o.labels)}`);
    if (o.devices) lines.push(`- **Devices:** ${fmtVal(o.devices)}`);
    if (o.notes) lines.push(`- **Notes:** ${fmtVal(o.notes)}`);
    sections.push(lines.join("\n"));
  }

  if (policies.automations) {
    const a = policies.automations;
    const lines = ["## Automation Conventions (User Policy)"];
    if (a.naming) lines.push(`- **Naming:** ${fmtVal(a.naming)}`);
    if (a.categories) lines.push(`- **Categories:** ${fmtVal(a.categories)}`);
    if (a.scripts) lines.push(`- **Scripts:** ${fmtVal(a.scripts)}`);
    if (a.notes) lines.push(`- **Notes:** ${fmtVal(a.notes)}`);
    sections.push(lines.join("\n"));
  }

  if (policies.dashboards) {
    const d = policies.dashboards;
    const lines = ["## Dashboard Conventions (User Policy)"];
    if (d.organization) lines.push(`- **Organization:** ${fmtVal(d.organization)}`);
    if (d.cards) lines.push(`- **Cards:** ${fmtVal(d.cards)}`);
    if (d.notes) lines.push(`- **Notes:** ${fmtVal(d.notes)}`);
    sections.push(lines.join("\n"));
  }

  if (policies.language?.enabled) {
    const l = policies.language;
    const lines = ["## Language Policy (User Policy)"];
    lines.push(`- **Technical language:** ${l.technical_language || "en"} (entity IDs, labels, YAML)`);
    lines.push(`- **Display language:** ${l.display_language || "en"} (friendly names, area names, zones, automations)`);
    if (l.strategy) lines.push(`- **Strategy:** ${l.strategy}`);

    // Format mapping tables
    const mappingSection = (title: string, map: Record<string, string> | undefined) => {
      if (!map || typeof map !== "object" || Object.keys(map).length === 0) return;
      lines.push("");
      lines.push(`### ${title}`);
      lines.push("| English (technical) | Display |");
      lines.push("|---------------------|---------|");
      for (const [en, display] of Object.entries(map)) {
        lines.push(`| ${en} | ${display} |`);
      }
    };

    mappingSection("Area Names", l.areas);
    mappingSection("Zone Names", l.zones);
    mappingSection("Device Types", l.device_types);
    mappingSection("Metric Names", l.metrics);
    mappingSection("Common Words", l.common_words);

    lines.push("");
    lines.push("**When creating/renaming:** Use English for entity IDs and labels. Use display language for friendly names, area display names, zone names, and automation names. Always use the mapping tables above — if a mapping is missing, ask the user for the translation and add it.");
    sections.push(lines.join("\n"));
  }

  if (policies.general && Object.keys(policies.general).length > 0) {
    const lines = ["## General Policies (User Policy)"];
    for (const [k, v] of Object.entries(policies.general)) {
      lines.push(`- **${k}:** ${v}`);
    }
    sections.push(lines.join("\n"));
  }

  if (sections.length === 0) return "";

  return (
    "# User-Defined Policies\n\n" +
    "Follow these conventions when creating, renaming, or organizing entities, automations, and other Home Assistant objects. " +
    "These are the user's preferences — respect them consistently.\n\n" +
    "**Applies to all object types:** entities, helpers (input_boolean, counter, timer, etc.), scripts, scenes, automations, dashboards, zones, and any other named HA objects.\n\n" +
    sections.join("\n\n")
  );
}
