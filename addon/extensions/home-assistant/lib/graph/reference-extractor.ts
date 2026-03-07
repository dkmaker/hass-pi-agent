/**
 * Extract entity_id, area, label, and device references from raw text.
 *
 * Works on both YAML and JSON content — regex-based, not AST-based.
 * Handles direct references and Jinja2 template expressions.
 */
import type { FoundReference, EdgeType, NodeType } from "./types.js";

// ── Known entity domains ─────────────────────────────────────
// All domains that can appear as entity_id prefixes
const DOMAINS = [
  "alarm_control_panel", "alert", "automation", "binary_sensor", "button",
  "calendar", "camera", "climate", "conversation", "counter", "cover",
  "date", "datetime", "device_tracker", "event", "fan", "geo_location",
  "group", "humidifier", "image", "image_processing", "input_boolean",
  "input_button", "input_datetime", "input_number", "input_select",
  "input_text", "lawn_mower", "light", "lock", "media_player", "notify",
  "number", "person", "plant", "remote", "scene", "schedule", "script",
  "select", "sensor", "siren", "stt", "sun", "switch", "tag", "text",
  "time", "timer", "todo", "tts", "update", "vacuum", "valve",
  "wake_word", "water_heater", "weather", "zone",
];

const DOMAIN_PATTERN = DOMAINS.join("|");

// ── Regex patterns ───────────────────────────────────────────

/** Direct entity_id reference: domain.object_id */
const ENTITY_ID_RE = new RegExp(`\\b(${DOMAIN_PATTERN})\\.([a-z0-9_]+)\\b`, "g");

/** Jinja2: states('entity_id') */
const STATES_RE = /states\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Jinja2: state_attr('entity_id', ...) */
const STATE_ATTR_RE = /state_attr\(\s*['"]([^'"]+)['"]/g;

/** Jinja2: is_state('entity_id', ...) / is_state_attr('entity_id', ...) */
const IS_STATE_RE = /is_state(?:_attr)?\(\s*['"]([^'"]+)['"]/g;

/** Jinja2: expand('entity_id') or expand(['entity_id', ...]) */
const EXPAND_RE = /expand\(\s*['"]([^'"]+)['"]/g;

/** area_id references */
const AREA_ID_RE = /area_id:\s*['"]?([a-z0-9_]+)['"]?/g;

/** label references in YAML/JSON */
const LABEL_RE = /labels?:\s*['"]?([a-z0-9_]+)['"]?/g;

// ── Extraction ───────────────────────────────────────────────

/**
 * Extract all references from a text blob.
 * @param text Raw content (YAML or JSON)
 * @param sourcePath Identifier for context (file path)
 * @param defaultEdgeType Edge type when we can't determine specifics
 */
export function extractReferences(
  text: string,
  sourcePath: string,
  defaultEdgeType: EdgeType = "references",
): FoundReference[] {
  const refs: FoundReference[] = [];
  const seen = new Set<string>();

  function add(target: string, targetType: NodeType, edgeType: EdgeType) {
    const key = `${target}|${edgeType}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ target, targetType, edgeType, context: sourcePath });
  }

  // Entity IDs — direct references
  for (const m of text.matchAll(ENTITY_ID_RE)) {
    const entityId = `${m[1]}.${m[2]}`;
    add(entityId, "entity", defaultEdgeType);
  }

  // Jinja2 template functions
  for (const re of [STATES_RE, STATE_ATTR_RE, IS_STATE_RE, EXPAND_RE]) {
    for (const m of text.matchAll(re)) {
      const entityId = m[1];
      if (entityId.includes(".")) {
        add(entityId, "entity", defaultEdgeType);
      }
    }
  }

  // Area references
  for (const m of text.matchAll(AREA_ID_RE)) {
    add(m[1], "area", "located_in");
  }

  return refs;
}

/**
 * Extract references from an automation config with semantic edge types.
 * Parses triggers, conditions, and actions separately for better edge classification.
 */
export function extractAutomationReferences(
  config: Record<string, unknown>,
  sourcePath: string,
): FoundReference[] {
  const refs: FoundReference[] = [];
  const seen = new Set<string>();

  function addFromText(text: string, edgeType: EdgeType, ctx: string) {
    for (const m of text.matchAll(ENTITY_ID_RE)) {
      const entityId = `${m[1]}.${m[2]}`;
      const key = `${entityId}|${edgeType}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ target: entityId, targetType: "entity", edgeType, context: ctx });
      }
    }
    // Also check Jinja2 patterns
    for (const re of [STATES_RE, STATE_ATTR_RE, IS_STATE_RE, EXPAND_RE]) {
      for (const m of text.matchAll(re)) {
        if (m[1].includes(".")) {
          const key = `${m[1]}|${edgeType}`;
          if (!seen.has(key)) {
            seen.add(key);
            refs.push({ target: m[1], targetType: "entity", edgeType, context: ctx });
          }
        }
      }
    }
  }

  // Triggers
  const triggers = config.triggers ?? config.trigger;
  if (triggers) {
    addFromText(JSON.stringify(triggers), "triggers_on", `${sourcePath} (trigger)`);
  }

  // Conditions
  const conditions = config.conditions ?? config.condition;
  if (conditions) {
    addFromText(JSON.stringify(conditions), "condition_on", `${sourcePath} (condition)`);
  }

  // Actions
  const actions = config.actions ?? config.action;
  if (actions) {
    addFromText(JSON.stringify(actions), "controls", `${sourcePath} (action)`);
  }

  return refs;
}

/**
 * Extract entity_id references only (for simple queries).
 * Returns deduplicated list of entity IDs found in text.
 */
export function extractEntityIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(ENTITY_ID_RE)) {
    ids.add(`${m[1]}.${m[2]}`);
  }
  for (const re of [STATES_RE, STATE_ATTR_RE, IS_STATE_RE, EXPAND_RE]) {
    for (const m of text.matchAll(re)) {
      if (m[1].includes(".")) ids.add(m[1]);
    }
  }
  return [...ids];
}
