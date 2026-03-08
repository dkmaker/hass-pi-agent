/**
 * Home Assistant policies tool.
 *
 * Manages user-defined conventions (naming, organization, etc.)
 * stored in /homeassistant/pi-agent/policies.yaml.
 *
 * The `init` action scans the user's system and returns a detailed
 * analysis to power the guided setup wizard conversation.
 * The `check` action audits entities against defined policies.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  loadPolicies,
  savePolicies,
  getPolicy,
  setPolicy,
  removePolicy,
  policiesExist,
  formatPoliciesForPrompt,
  POLICIES_FILE,
  type PolicyCategory,
  type Policies,
} from "../lib/policies.js";
import { apiGet } from "../lib/api.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

// ── Types ────────────────────────────────────────────────────

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

const POLICY_CATEGORIES: PolicyCategory[] = [
  "naming", "organization", "automations", "dashboards", "language", "general",
];

// ── Tool registration ────────────────────────────────────────

export function registerPoliciesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_policies",
    label: "HA Policies",
    description:
      "Manage user-defined policies (naming conventions, organization preferences). " +
      "Actions: list, get, set, remove, init (setup wizard scan), check (audit entities). " +
      "Use ha_tool_docs('ha_policies') for full usage.",

    parameters: Type.Object({
      action: StringEnum(
        ["list", "get", "set", "remove", "init", "check"] as const,
        { description: "Action to perform" }
      ),
      category: Type.Optional(
        StringEnum(POLICY_CATEGORIES, {
          description: "Policy category (naming, organization, automations, dashboards, general)",
        })
      ),
      key: Type.Optional(
        Type.String({
          description: "Specific key within category (for set/remove)",
        })
      ),
      value: Type.Optional(
        Type.String({
          description: "Value to set (for set action)",
        })
      ),
      fields: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Multiple key-value pairs to set at once (for set action)",
        })
      ),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Policies", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Dispatch ─────────────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list":
      return handleList();
    case "get":
      return handleGet(params.category as PolicyCategory | undefined);
    case "set":
      return handleSet(params);
    case "remove":
      return handleRemove(
        params.category as PolicyCategory | undefined,
        params.key as string | undefined
      );
    case "init":
      return handleInit();
    case "check":
      return handleCheck();
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

function handleList(): string {
  if (!policiesExist()) {
    return (
      "No policies configured yet.\n\n" +
      "Use `action: 'init'` to scan the system and start the guided setup wizard."
    );
  }
  const policies = loadPolicies();
  if (Object.keys(policies).length === 0) {
    return "Policies file exists but is empty.";
  }
  return formatPoliciesForPrompt(policies) || "No policies defined.";
}

function handleGet(category?: PolicyCategory): string {
  if (!category) throw new Error("'category' is required for get");
  const value = getPolicy(category);
  if (!value) return `No policies defined for category '${category}'.`;
  const lines: string[] = [`## ${category}`, ""];
  function renderObj(obj: Record<string, unknown>, indent = 0) {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        lines.push(`${"  ".repeat(indent)}- **${k}:**`);
        renderObj(v as Record<string, unknown>, indent + 1);
      } else {
        const val = Array.isArray(v) ? v.join(", ") : String(v);
        lines.push(`${"  ".repeat(indent)}- **${k}:** ${val}`);
      }
    }
  }
  if (typeof value === "object" && value !== null) {
    renderObj(value as Record<string, unknown>);
  } else {
    lines.push(String(value));
  }
  return lines.join("\n");
}

function handleSet(params: Record<string, unknown>): string {
  const category = params.category as PolicyCategory | undefined;
  if (!category) throw new Error("'category' is required for set");

  let values: Record<string, unknown>;
  if (params.fields) {
    values = params.fields as Record<string, unknown>;
  } else if (params.key && params.value !== undefined) {
    values = { [params.key as string]: params.value };
  } else {
    throw new Error("Either 'fields' or both 'key' and 'value' are required for set");
  }

  const result = setPolicy(category, values);
  return `✅ Updated '${category}' policies.\n\nCurrent policies:\n${formatPoliciesForPrompt(result)}`;
}

function handleRemove(category?: PolicyCategory, key?: string): string {
  if (!category) throw new Error("'category' is required for remove");
  const result = removePolicy(category, key);
  if (key) {
    return `✅ Removed '${key}' from '${category}' policies.`;
  }
  return `✅ Removed entire '${category}' policy category.`;
}

// ── Init: System scan for setup wizard ───────────────────────

async function handleInit(): Promise<string> {
  const lines: string[] = [
    "# 🔍 System Scan for Policy Setup",
    "",
    "Scanned your Home Assistant installation. Use this data to guide the user through setting up their naming and organization policies.",
    "",
  ];

  // Fetch all entities
  let states: HAState[] = [];
  try {
    states = await apiGet<HAState[]>("/api/states");
  } catch (e) {
    lines.push("⚠️ Could not fetch entity states. Proceeding with limited analysis.");
    lines.push("");
  }

  if (states.length > 0) {
    // ── Domain breakdown ──
    const domainCounts: Record<string, number> = {};
    for (const s of states) {
      const domain = s.entity_id.split(".")[0];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
    lines.push(`## Entity Overview`);
    lines.push(`**Total entities:** ${states.length}`);
    const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
    lines.push(`**By domain:** ${sorted.map(([d, c]) => `${d}: ${c}`).join(", ")}`);
    lines.push("");

    // ── Detect naming patterns ──
    lines.push("## Current Naming Patterns");
    lines.push("");
    analyzeNamingPatterns(states, lines);

    // ── Detect _2/_3 suffix problems ──
    lines.push("## Problematic Entity Names");
    lines.push("");
    analyzeProblematicNames(states, lines);

    // ── Integration/brand detection ──
    lines.push("## Detected Integrations in Entity Names");
    lines.push("");
    analyzeIntegrationNames(states, lines);

    // ── Metric sensors ──
    lines.push("## Metric Sensors (power/energy/temperature/etc.)");
    lines.push("");
    analyzeMetricSensors(states, lines);

    // ── Areas ──
    lines.push("## Area Assignment");
    lines.push("");
    analyzeAreas(states, lines);
  }

  // ── Existing policies ──
  if (policiesExist()) {
    lines.push("## Existing Policies");
    lines.push(`Policies file found at \`${POLICIES_FILE}\``);
    const policies = loadPolicies();
    lines.push(formatPoliciesForPrompt(policies) || "File is empty.");
    lines.push("");
  } else {
    lines.push("## Existing Policies");
    lines.push("No policies file found — this is a fresh setup.");
    lines.push("");
  }

  // ── Wizard instructions for the AI ──
  lines.push("## Setup Wizard Instructions");
  lines.push("");
  lines.push("Now guide the user through setting up policies. For each topic:");
  lines.push("1. **Show examples from THEIR system** (use the data above)");
  lines.push("2. **Explain the concept** in plain language with analogies");
  lines.push("3. **Propose a convention** with a sensible default");
  lines.push("4. **Let them accept, modify, or skip**");
  lines.push("");
  lines.push("### Topics to cover:");
  lines.push("1. **Language** — ask if multilingual (e.g., English IDs + Danish display). If yes, gather area/room/device type/metric translations.");
  lines.push("2. **Entity ID naming** — location-first vs device-first, show their current pattern");
  lines.push("3. **Metric sensors** — explain power vs energy (speedometer vs odometer), propose suffix standard");
  lines.push("4. **Friendly names** — voice assistant optimization, area inclusion");
  lines.push("5. **Area & floor structure** — how they want to organize physical spaces. If multilingual, gather English→display name for each area.");
  lines.push("6. **Labels** — cross-cutting categories (energy monitoring, security, etc.)");
  lines.push("7. **Automation naming** — prefix convention (Location - Description). If multilingual, automations use display language.");
  lines.push("");
  lines.push("### Language mapping workflow:");
  lines.push("If user enables multilingual, after each relevant topic gather mappings:");
  lines.push("- **Areas:** For each room the user mentions, ask for English + display language name (e.g., Kitchen → Køkken)");
  lines.push("- **Device types:** Common types like 'ceiling light', 'motion sensor', 'temperature', 'door lock' etc.");
  lines.push("- **Metrics:** power, energy, voltage, current, temperature, humidity");
  lines.push("- **Common words:** on, off, open, closed, etc.");
  lines.push("Use the `questionnaire` tool to let users pick/confirm translations.");
  lines.push("Save all mappings with `action: 'set'`, `category: 'language'`.");
  lines.push("");
  lines.push("After all topics, show a complete summary and save with `action: 'set'`.");

  return lines.join("\n");
}

// ── Check: Audit entities against policies ───────────────────

async function handleCheck(): Promise<string> {
  const policies = loadPolicies();
  if (Object.keys(policies).length === 0) {
    return "No policies configured. Run `action: 'init'` first to set up policies.";
  }

  let states: HAState[] = [];
  try {
    states = await apiGet<HAState[]>("/api/states");
  } catch {
    return "⚠️ Could not fetch entity states for audit.";
  }

  const lines: string[] = [
    "# 📋 Policy Compliance Audit",
    "",
  ];

  // Check for _2/_3 suffixes
  const suffixed = states.filter((s) => /_\d+$/.test(s.entity_id));
  if (suffixed.length > 0) {
    lines.push(`## ⚠️ Numbered Suffix Entities (${suffixed.length})`);
    lines.push("These entities have auto-generated `_2`, `_3` suffixes that should be renamed:");
    lines.push("");
    for (const s of suffixed.slice(0, 30)) {
      const name = (s.attributes.friendly_name as string) || "";
      lines.push(`- \`${s.entity_id}\` — "${name}"`);
    }
    if (suffixed.length > 30) lines.push(`- ... and ${suffixed.length - 30} more`);
    lines.push("");
  }

  // Check for brand names in entity IDs
  const brandPatterns = [
    "shelly", "sonoff", "tuya", "tasmota", "philips", "hue", "ikea",
    "xiaomi", "aqara", "zigbee", "zwave", "esp", "wled",
  ];
  const brandEntities = states.filter((s) => {
    const id = s.entity_id.split(".")[1];
    return brandPatterns.some((b) => id.includes(b));
  });
  if (brandEntities.length > 0) {
    lines.push(`## ⚠️ Brand Names in Entity IDs (${brandEntities.length})`);
    lines.push("Entity IDs containing brand/hardware names — consider renaming to purpose-based names:");
    lines.push("");
    for (const s of brandEntities.slice(0, 20)) {
      const name = (s.attributes.friendly_name as string) || "";
      lines.push(`- \`${s.entity_id}\` — "${name}"`);
    }
    if (brandEntities.length > 20) lines.push(`- ... and ${brandEntities.length - 20} more`);
    lines.push("");
  }

  // Check entities without areas
  const noArea = states.filter(
    (s) => !s.attributes.area_id && !["automation", "script", "scene", "zone", "person", "sun", "weather"].includes(s.entity_id.split(".")[0])
  );
  if (noArea.length > 0) {
    lines.push(`## ℹ️ Entities Without Area Assignment (${noArea.length})`);
    lines.push("These entities are not assigned to any area (areas improve voice control and organization).");
    lines.push("");
  }

  if (suffixed.length === 0 && brandEntities.length === 0) {
    lines.push("✅ No major naming issues found!");
    lines.push("");
  }

  // ── Language mapping validation ──
  if (policies.language?.enabled) {
    const lang = policies.language;
    lines.push("## 🌐 Language Mapping Audit");
    lines.push("");

    // Check areas: find area names in entity IDs that aren't in the mapping
    const areaMappings = lang.areas || {};
    const entityParts = states
      .filter((s) => !["automation", "script", "scene", "zone", "person", "sun", "weather", "update", "tts", "conversation", "todo"].includes(s.entity_id.split(".")[0]))
      .map((s) => s.entity_id.split(".")[1]);

    // Extract potential area/location words from entity IDs (first segment before _)
    const locationWords = new Set<string>();
    for (const id of entityParts) {
      const parts = id.split("_");
      if (parts.length >= 2) locationWords.add(parts[0]);
    }

    // Check which location words aren't mapped
    const unmappedLocations = [...locationWords].filter(
      (w) => !Object.keys(areaMappings).some((k) => k.toLowerCase().replace(/\s+/g, "_") === w)
    );

    // Check device type mappings
    const deviceMappings = lang.device_types || {};
    const metricMappings = lang.metrics || {};
    const commonMappings = lang.common_words || {};

    const mappedCount = Object.keys(areaMappings).length + Object.keys(deviceMappings).length +
      Object.keys(metricMappings).length + Object.keys(commonMappings).length;

    lines.push(`**Mapped translations:** ${mappedCount} total`);
    lines.push(`- Areas: ${Object.keys(areaMappings).length} mapped`);
    lines.push(`- Device types: ${Object.keys(deviceMappings).length} mapped`);
    lines.push(`- Metrics: ${Object.keys(metricMappings).length} mapped`);
    lines.push(`- Common words: ${Object.keys(commonMappings).length} mapped`);
    lines.push("");

    // Standard metrics that should be mapped
    const expectedMetrics = ["power", "energy", "voltage", "current", "temperature", "humidity", "battery", "illuminance", "pressure"];
    const unmappedMetrics = expectedMetrics.filter((m) => !metricMappings[m]);
    if (unmappedMetrics.length > 0) {
      lines.push(`⚠️ **Unmapped metrics:** ${unmappedMetrics.join(", ")}`);
      lines.push("These metrics should have translations for friendly name generation.");
      lines.push("");
    }

    // Standard device types that should be mapped
    const expectedDeviceTypes = ["light", "ceiling light", "lamp", "switch", "plug", "outlet", "motion sensor", "door sensor", "window sensor", "temperature sensor", "humidity sensor", "thermostat", "blind", "cover", "lock", "camera", "speaker", "button"];
    const unmappedDeviceTypes = expectedDeviceTypes.filter((d) => !deviceMappings[d]);
    if (unmappedDeviceTypes.length > 0) {
      lines.push(`⚠️ **Unmapped device types (${unmappedDeviceTypes.length}):** ${unmappedDeviceTypes.join(", ")}`);
      lines.push("");
    }

    if (unmappedMetrics.length === 0 && unmappedDeviceTypes.length === 0) {
      lines.push("✅ All standard metrics and device types are mapped!");
      lines.push("");
    }
  }

  lines.push(`**Total entities scanned:** ${states.length}`);
  return lines.join("\n");
}

// ── Analysis helpers ─────────────────────────────────────────

function analyzeNamingPatterns(states: HAState[], lines: string[]): void {
  // Sample entity IDs by domain to detect patterns
  const byDomain: Record<string, string[]> = {};
  for (const s of states) {
    const [domain, id] = s.entity_id.split(".");
    if (!byDomain[domain]) byDomain[domain] = [];
    if (byDomain[domain].length < 10) byDomain[domain].push(id);
  }

  // Show samples for key domains
  for (const domain of ["light", "switch", "sensor", "binary_sensor", "climate", "cover"]) {
    if (byDomain[domain]?.length) {
      lines.push(`**${domain}:** ${byDomain[domain].slice(0, 5).map((id) => `\`${domain}.${id}\``).join(", ")}`);
    }
  }
  lines.push("");
}

function analyzeProblematicNames(states: HAState[], lines: string[]): void {
  const suffixed = states.filter((s) => /_\d+$/.test(s.entity_id));
  if (suffixed.length === 0) {
    lines.push("✅ No `_2`/`_3` suffix entities found.");
  } else {
    lines.push(`⚠️ **${suffixed.length} entities** with numbered suffixes (e.g., \`_2\`, \`_3\`):`);
    for (const s of suffixed.slice(0, 10)) {
      const name = (s.attributes.friendly_name as string) || "";
      lines.push(`- \`${s.entity_id}\` → "${name}"`);
    }
    if (suffixed.length > 10) lines.push(`- ... and ${suffixed.length - 10} more`);
  }
  lines.push("");
}

function analyzeIntegrationNames(states: HAState[], lines: string[]): void {
  const brandPatterns = [
    "shelly", "sonoff", "tuya", "tasmota", "philips", "hue", "ikea",
    "xiaomi", "aqara", "lumi", "esp", "wled", "zigbee", "zwave",
  ];
  const found: Record<string, string[]> = {};
  for (const s of states) {
    const id = s.entity_id.split(".")[1];
    for (const brand of brandPatterns) {
      if (id.includes(brand)) {
        if (!found[brand]) found[brand] = [];
        if (found[brand].length < 3) found[brand].push(s.entity_id);
      }
    }
  }
  if (Object.keys(found).length === 0) {
    lines.push("✅ No brand/hardware names detected in entity IDs.");
  } else {
    for (const [brand, examples] of Object.entries(found)) {
      lines.push(`- **${brand}**: ${examples.map((e) => `\`${e}\``).join(", ")}`);
    }
    lines.push("");
    lines.push("💡 Brand names in entity IDs make it harder to swap hardware later.");
  }
  lines.push("");
}

function analyzeMetricSensors(states: HAState[], lines: string[]): void {
  const metricKeywords = ["power", "energy", "voltage", "current", "temperature", "humidity", "battery", "illuminance", "pressure"];
  const metrics: Record<string, string[]> = {};
  for (const s of states) {
    if (!s.entity_id.startsWith("sensor.")) continue;
    const id = s.entity_id.split(".")[1];
    for (const metric of metricKeywords) {
      if (id.includes(metric)) {
        if (!metrics[metric]) metrics[metric] = [];
        if (metrics[metric].length < 5) metrics[metric].push(s.entity_id);
      }
    }
  }
  if (Object.keys(metrics).length === 0) {
    lines.push("No metric sensors detected.");
  } else {
    for (const [metric, examples] of Object.entries(metrics)) {
      const unit = examples.length > 0
        ? (states.find((s) => s.entity_id === examples[0])?.attributes.unit_of_measurement as string || "")
        : "";
      lines.push(`**${metric}** (${unit}): ${examples.map((e) => `\`${e}\``).join(", ")}`);
    }
  }
  lines.push("");
}

function analyzeAreas(states: HAState[], lines: string[]): void {
  // Area info isn't in states API attributes typically, but friendly_name gives hints
  // We note this limitation and suggest the wizard use ha_areas tool
  const total = states.length;
  lines.push(`Total entities: ${total}`);
  lines.push("Use `ha_areas` and `ha_devices` tools during the wizard to check area assignments.");
  lines.push("");
}
