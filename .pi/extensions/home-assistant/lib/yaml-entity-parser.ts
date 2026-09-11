/**
 * YAML entity parser — indexes entity-defining blocks across HA YAML config.
 *
 * Traverses configuration.yaml and all !include files, identifies integration
 * platform blocks that define entities, and returns structured metadata.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, Document, YAMLMap, Pair, YAMLSeq, Scalar, isMap, isSeq, isScalar, isPair } from "yaml";
import { HA_CONFIG_PATH } from "./config.js";
import { resolveYamlIncludes } from "./graph/yaml-resolver.js";

// ── Types ────────────────────────────────────────────────────

export interface YamlEntityBlock {
  /** Identifier key — domain + platform + name/unique_id, e.g. "alarm_control_panel.manual.home_alarm" */
  key: string;
  /** HA domain */
  domain: string;
  /** Platform if applicable */
  platform: string | null;
  /** Name or unique_id from config */
  name: string | null;
  unique_id: string | null;
  /** Source file path */
  file: string;
  /** 1-based line range in source file */
  lineStart: number;
  lineEnd: number;
  /** The parsed config object */
  config: Record<string, unknown>;
}

/** A top-level config block (homeassistant:, recorder:, logger:, etc.) */
export interface YamlConfigBlock {
  /** The top-level key (e.g. "homeassistant", "recorder") */
  key: string;
  /** Source file */
  file: string;
  lineStart: number;
  lineEnd: number;
  /** Parsed config */
  config: Record<string, unknown>;
}

export interface YamlIndex {
  entities: YamlEntityBlock[];
  /** Top-level config blocks that aren't entity definitions */
  configs: YamlConfigBlock[];
  errors: string[];
}

// Domains that define entities in YAML via platform lists or direct config
const ENTITY_DOMAINS = new Set([
  "alarm_control_panel", "binary_sensor", "camera", "climate", "cover",
  "fan", "humidifier", "light", "lock", "media_player", "notify",
  "number", "select", "sensor", "siren", "switch", "vacuum",
  "water_heater", "weather",
  // Template integration (different structure)
  "template",
  // Command line
  "command_line",
  // MQTT
  "mqtt",
  // Shell commands
  "shell_command",
  // Input helpers (sometimes YAML-defined)
  "input_boolean", "input_number", "input_select", "input_text",
  "input_datetime", "input_button",
  // Groups
  "group",
  // Utility meter
  "utility_meter",
]);

// ── Public API ───────────────────────────────────────────────

/**
 * Build a full index of all YAML-defined entities.
 */
export function buildYamlIndex(): YamlIndex {
  const configPath = join(HA_CONFIG_PATH, "configuration.yaml");
  if (!existsSync(configPath)) {
    return { entities: [], configs: [], errors: ["configuration.yaml not found"] };
  }

  const resolved = resolveYamlIncludes(configPath);
  const entities: YamlEntityBlock[] = [];
  const configs: YamlConfigBlock[] = [];
  const errors: string[] = [...resolved.errors];

  // Parse the main configuration.yaml for inline entity definitions + config blocks
  const mainSource = resolved.sources.find((s) => s.path.endsWith("configuration.yaml"));
  if (mainSource) {
    try {
      const doc = parseDocument(mainSource.raw, { keepSourceTokens: true });
      if (isMap(doc.contents)) {
        extractEntitiesFromConfigMap(doc.contents, mainSource.path, mainSource.raw, entities);
        extractConfigBlocks(doc.contents, mainSource.path, mainSource.raw, configs);
      }
    } catch (e) {
      errors.push(`Failed to parse configuration.yaml: ${(e as Error).message}`);
    }
  }

  // Parse included files — automations.yaml, etc.
  for (const source of resolved.sources) {
    if (source.path.endsWith("configuration.yaml")) continue;

    // Determine domain from how it's included
    const domain = inferDomainFromPath(source.path, mainSource?.raw ?? "");
    if (!domain) continue;

    try {
      const doc = parseDocument(source.raw, { keepSourceTokens: true });
      extractEntitiesFromInclude(doc, domain, source.path, source.raw, entities);
    } catch (e) {
      errors.push(`Failed to parse ${source.path}: ${(e as Error).message}`);
    }
  }

  return { entities, configs, errors };
}

/**
 * Read a single YAML file as a Document (for mutations).
 */
export function readYamlDoc(filePath: string): { doc: Document; raw: string } {
  const raw = readFileSync(filePath, "utf-8");
  const doc = parseDocument(raw, { keepSourceTokens: true });
  return { doc, raw };
}

// ── Extractors ───────────────────────────────────────────────

function extractEntitiesFromConfigMap(
  map: YAMLMap,
  file: string,
  raw: string,
  out: YamlEntityBlock[]
): void {
  for (const item of map.items) {
    if (!isPair(item)) continue;
    const key = isScalar(item.key) ? String(item.key.value) : null;
    if (!key || !ENTITY_DOMAINS.has(key)) continue;

    const value = item.value;

    // Skip !include directives — those files are processed separately
    if (isScalar(value) && typeof value.value === "string") continue;
    // Check for !include tag
    if (value && "tag" in (value as any) && String((value as any).tag)?.includes("include")) continue;

    if (isSeq(value)) {
      if (key === "template") {
        // Template integration: list of { sensor: [...], binary_sensor: [...] }
        extractTemplateEntities(value, file, raw, out);
      } else {
        // List of platform configs: e.g. alarm_control_panel: [{ platform: manual, ... }]
        for (let i = 0; i < value.items.length; i++) {
          const entry = value.items[i];
          if (isMap(entry)) {
            const block = mapToBlock(entry, key, file, raw);
            if (block) out.push(block);
          }
        }
      }
    } else if (isMap(value)) {
      // Single config or named entries (e.g. input_boolean: { my_toggle: { name: ... } })
      if (isInputDomain(key)) {
        // Named map: each key is an entity
        for (const sub of value.items) {
          if (!isPair(sub)) continue;
          const entityId = isScalar(sub.key) ? String(sub.key.value) : null;
          if (!entityId) continue;
          const config = isMap(sub.value) ? mapToPlainObj(sub.value) : {};
          const range = getRange(sub, raw);
          out.push({
            key: `${key}.${entityId}`,
            domain: key,
            platform: null,
            name: (config.name as string) ?? entityId,
            unique_id: null,
            file,
            ...range,
            config: { ...config, _entity_id: entityId },
          });
        }
      } else {
        const block = mapToBlock(value, key, file, raw);
        if (block) out.push(block);
      }
    }
  }
}

function extractEntitiesFromInclude(
  doc: Document,
  domain: string,
  file: string,
  raw: string,
  out: YamlEntityBlock[]
): void {
  const contents = doc.contents;

  if (isSeq(contents)) {
    if (domain === "template") {
      // Template include: list of { sensor: [...], binary_sensor: [...] }
      extractTemplateEntities(contents, file, raw, out);
    } else {
      // List file (automations.yaml, scenes.yaml, sensor dir merge list)
      for (const item of contents.items) {
        if (isMap(item)) {
          const block = mapToBlock(item, domain, file, raw);
          if (block) out.push(block);
        }
      }
    }
  } else if (isMap(contents)) {
    // Named map file (scripts.yaml — keys are script IDs)
    for (const item of contents.items) {
      if (!isPair(item)) continue;
      const entityId = isScalar(item.key) ? String(item.key.value) : null;
      if (!entityId) continue;
      const config = isMap(item.value) ? mapToPlainObj(item.value) : {};
      const range = getRange(item, raw);
      out.push({
        key: `${domain}.${entityId}`,
        domain,
        platform: null,
        name: (config.alias as string) ?? (config.name as string) ?? entityId,
        unique_id: (config.unique_id as string) ?? (config.id as string) ?? null,
        file,
        ...range,
        config,
      });
    }
  }
}

// Keys that are config blocks (not entity definitions, not !include-only)
const CONFIG_BLOCK_KEYS = new Set([
  "homeassistant", "recorder", "history", "logbook", "logger",
  "frontend", "http", "api", "default_config", "tts",
  "media_source", "cloud", "google_assistant", "alexa",
  "wake_on_lan", "stream", "ffmpeg", "pi_agent",
]);

function extractConfigBlocks(
  map: YAMLMap,
  file: string,
  raw: string,
  out: YamlConfigBlock[]
): void {
  for (const item of map.items) {
    if (!isPair(item)) continue;
    const key = isScalar(item.key) ? String(item.key.value) : null;
    if (!key) continue;

    // Include both known config blocks AND any unknown non-entity key
    const isEntityDomain = ENTITY_DOMAINS.has(key);
    const isKnownConfig = CONFIG_BLOCK_KEYS.has(key);
    // Also treat as config if it's a map/null but not an entity domain
    if (!isKnownConfig && isEntityDomain) continue;
    // Skip include-only keys (value is a scalar with !include tag)
    if (isScalar(item.value)) {
      const tag = (item.value as any).tag;
      if (tag && String(tag).includes("include")) continue;
      // Null/empty value (e.g. `default_config:` or `pi_agent:`)
    }

    const value = item.value;
    let config: Record<string, unknown> = {};
    if (isMap(value)) {
      config = mapToPlainObj(value);
    } else if (isScalar(value) && value.value != null) {
      config = { _value: value.value };
    }

    const range = getRange(item, raw);
    out.push({ key, file, ...range, config });
  }
}

function extractTemplateEntities(seq: YAMLSeq, file: string, raw: string, out: YamlEntityBlock[]): void {
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    // Each item can have sensor:, binary_sensor:, number:, etc. sub-lists
    for (const pair of item.items) {
      if (!isPair(pair)) continue;
      const subDomain = isScalar(pair.key) ? String(pair.key.value) : null;
      if (!subDomain || !isSeq(pair.value)) continue;

      for (const entity of pair.value.items) {
        if (!isMap(entity)) continue;
        const obj = mapToPlainObj(entity);
        const name = obj.name as string | null;
        const uniqueId = obj.unique_id as string | null;
        const identifier = uniqueId ?? name ?? "unknown";
        const range = getRange(entity, raw);
        out.push({
          key: `template.${subDomain}.${identifier}`,
          domain: "template",
          platform: subDomain,
          name,
          unique_id: uniqueId,
          file,
          ...range,
          config: obj,
        });
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function mapToBlock(map: YAMLMap, domain: string, file: string, raw: string): YamlEntityBlock | null {
  const obj = mapToPlainObj(map);
  const platform = (obj.platform as string) ?? null;
  const name = (obj.name as string) ?? (obj.alias as string) ?? null;
  const uniqueId = (obj.unique_id as string) ?? (obj.id as string) ?? null;
  const identifier = uniqueId ?? name ?? platform ?? "unknown";
  const range = getRange(map, raw);

  return {
    key: platform ? `${domain}.${platform}.${identifier}` : `${domain}.${identifier}`,
    domain,
    platform,
    name,
    unique_id: uniqueId,
    file,
    ...range,
    config: obj,
  };
}

function mapToPlainObj(map: YAMLMap): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const item of map.items) {
    if (!isPair(item)) continue;
    const k = isScalar(item.key) ? String(item.key.value) : null;
    if (!k) continue;

    if (isScalar(item.value)) {
      obj[k] = item.value.value;
    } else if (isSeq(item.value)) {
      obj[k] = seqToPlain(item.value);
    } else if (isMap(item.value)) {
      obj[k] = mapToPlainObj(item.value);
    } else {
      obj[k] = null;
    }
  }
  return obj;
}

function seqToPlain(seq: YAMLSeq): unknown[] {
  return seq.items.map((item) => {
    if (isScalar(item)) return item.value;
    if (isMap(item)) return mapToPlainObj(item);
    if (isSeq(item)) return seqToPlain(item);
    return null;
  });
}

function getRange(node: any, raw: string): { lineStart: number; lineEnd: number } {
  // For Pair nodes, combine key and value ranges
  let start: number | null = null;
  let end: number | null = null;

  if (isPair(node)) {
    const keyRange = (node.key as any)?.range;
    const valRange = (node.value as any)?.range;
    if (keyRange && keyRange.length >= 2) start = keyRange[0];
    if (valRange && valRange.length >= 2) {
      if (start === null) start = valRange[0];
      end = valRange[1];
    } else if (keyRange && keyRange.length >= 2) {
      end = keyRange[1];
    }
  } else {
    const range = node.range;
    if (range && range.length >= 2) {
      start = range[0];
      end = range[1];
    }
  }

  if (start !== null && end !== null) {
    return { lineStart: offsetToLine(raw, start), lineEnd: offsetToLine(raw, end) };
  }
  return { lineStart: 1, lineEnd: 1 };
}

function offsetToLine(raw: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < raw.length; i++) {
    if (raw[i] === "\n") line++;
  }
  return line;
}

function inferDomainFromPath(filePath: string, mainRaw: string): string | null {
  // Match include patterns like: automation: !include automations.yaml
  const basename = filePath.split("/").pop() ?? "";
  const includeMatch = mainRaw.match(new RegExp(`(\\w+):\\s*!include\\s+${escapeRegex(basename)}`));
  if (includeMatch) return includeMatch[1];

  // Match !include_dir_* patterns: sensor: !include_dir_merge_list sensors/
  // Check if filePath is inside a directory that's included
  const configDir = join(HA_CONFIG_PATH);
  const relPath = filePath.startsWith(configDir) ? filePath.slice(configDir.length + 1) : filePath;
  const dirPart = relPath.split("/")[0]; // e.g. "sensors" from "sensors/system.yaml"
  if (dirPart) {
    const dirIncludeMatch = mainRaw.match(new RegExp(`(\\w+):\\s*!include_dir_\\w+\\s+${escapeRegex(dirPart)}/?`));
    if (dirIncludeMatch) return dirIncludeMatch[1];
  }

  // Infer from filename
  if (basename.startsWith("automations")) return "automation";
  if (basename.startsWith("scripts")) return "script";
  if (basename.startsWith("scenes")) return "scene";
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInputDomain(domain: string): boolean {
  return domain.startsWith("input_") || domain === "group" || domain === "utility_meter" || domain === "shell_command";
}
