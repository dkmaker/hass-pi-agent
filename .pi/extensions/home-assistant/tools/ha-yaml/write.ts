/**
 * YAML write handlers — update, create, delete.
 *
 * All operations back up the target file first, then mutate the parsed
 * document through the `yaml` library's AST (`setIn`/`deleteIn`) — never by
 * hand-splicing lines. Only the touched nodes are re-rendered, so comments and
 * untouched formatting survive. Every write is re-parsed before it hits disk;
 * if the result would be invalid YAML the write is refused (the file is never
 * left corrupt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, isMap, isSeq, stringify, type Document, type YAMLSeq } from "yaml";
import { buildYamlIndex, type YamlEntityBlock } from "../../lib/yaml-entity-parser.js";
import { toYaml } from "../../lib/yaml.js";
import { backupBeforeMutation } from "../../lib/mutation-log.js";
import { HA_CONFIG_PATH } from "../../lib/config.js";

function rel(path: string): string {
  return path.replace(HA_CONFIG_PATH + "/", "");
}

/** Backup a YAML file before modifying it. */
function backupYamlFile(file: string, action: string, target: string): void {
  const raw = readFileSync(file, "utf-8");
  backupBeforeMutation("ha_yaml", action, target, {
    file: rel(file),
    content: raw,
  }, `${action} ${target} in ${rel(file)}`);
}

/**
 * Serialize a mutated document and write it — but only if the serialized text
 * re-parses as valid YAML. This is the safety net: a mutation that would
 * produce invalid YAML is refused and the file on disk is left untouched.
 */
function writeChecked(filePath: string, doc: Document): void {
  const output = stringify(doc, { lineWidth: 0 });
  const verify = parseDocument(output);
  if (verify.errors.length > 0) {
    throw new Error(
      `Refusing to write ${rel(filePath)} — the result would be invalid YAML ` +
      `(${verify.errors[0].message}). No changes were made (a backup was already taken).`
    );
  }
  writeFileSync(filePath, output, "utf-8");
}

/**
 * Resolve the AST path (map keys / seq indices) to an entity's block inside a
 * freshly parsed document, matching how the parser located it. Returns null
 * when the structure isn't one we can target safely — the caller then refuses
 * to write rather than risk corruption.
 */
function entityPath(doc: Document, entity: YamlEntityBlock): (string | number)[] | null {
  const root = doc.contents;
  const domain = entity.domain;
  const entityId = entity.key.startsWith(domain + ".")
    ? entity.key.slice(domain.length + 1)
    : entity.key;

  if (isMap(root)) {
    // Named-map include file (scripts.yaml): top-level keys ARE entity ids.
    if (root.has(entityId) && !root.has(domain)) return [entityId];

    const domainNode = root.get(domain, true) as unknown;
    if (domainNode !== undefined && domainNode !== null) {
      const eid = ((entity.config as Record<string, unknown>)._entity_id as string) ?? entityId;
      // Named map under a domain key: input_boolean: { my_toggle: {...} }
      if (isMap(domainNode) && domainNode.has(eid)) return [domain, eid];
      // Platform list under a domain key: alarm_control_panel: [ {platform:..} ]
      if (isSeq(domainNode)) {
        const idx = findSeqIndex(domainNode, entity);
        if (idx >= 0) return [domain, idx];
      }
      // Single inline map under a domain key.
      if (isMap(domainNode)) return [domain];
    }

    // Fallback: a direct top-level key.
    if (root.has(entityId)) return [entityId];
  }

  if (isSeq(root)) {
    // List include file (automations.yaml, scenes.yaml).
    const idx = findSeqIndex(root, entity);
    if (idx >= 0) return [idx];
  }

  return null;
}

/** Find a seq item matching the entity by id/unique_id, then alias/name. */
function findSeqIndex(seq: YAMLSeq, entity: YamlEntityBlock): number {
  for (let i = 0; i < seq.items.length; i++) {
    const it = seq.items[i];
    if (!isMap(it)) continue;
    const id = it.get("id");
    const uid = it.get("unique_id");
    const alias = it.get("alias");
    const name = it.get("name");
    if (entity.unique_id && (String(id) === entity.unique_id || String(uid) === entity.unique_id)) return i;
    if (entity.name && (String(alias) === entity.name || String(name) === entity.name)) return i;
  }
  return -1;
}

// ── Update ───────────────────────────────────────────────────

export function handleUpdate(key?: string, rawConfig?: Record<string, unknown> | string): string {
  if (!key) throw new Error("'key' is required for update");
  if (!rawConfig) throw new Error("'config' is required for update — provide the fields to change");

  // Handle config passed as JSON string (see coerceJsonParams in the tool layer).
  const config: Record<string, unknown> = typeof rawConfig === "string"
    ? JSON.parse(rawConfig)
    : rawConfig;

  const index = buildYamlIndex();

  // Config block update (homeassistant:, recorder:, logger:, ...)
  const configBlock = index.configs.find((c) => c.key === key);
  if (configBlock) {
    const filePath = configBlock.file;
    const doc = parseDocument(readFileSync(filePath, "utf-8"));
    if (!isMap(doc.contents)) throw new Error("configuration.yaml root is not a map");

    backupYamlFile(filePath, "update", key);

    const existing = doc.contents.get(key);
    if (isMap(existing)) {
      for (const [k, v] of Object.entries(config)) doc.setIn([key, k], doc.createNode(v));
    } else {
      doc.set(key, doc.createNode(config));
    }

    writeChecked(filePath, doc);
    return `✅ Updated config block \`${key}\` in ${rel(filePath)}.\n\nBackup created. Run \`ha_restart reload-core\` if needed to apply changes.`;
  }

  // Entity update — merge changed keys into the AST node in place. Untouched
  // keys, comments, and the mapping key itself are preserved by the library.
  const entity = index.entities.find((e) => e.key === key);
  if (entity) {
    const filePath = entity.file;
    const doc = parseDocument(readFileSync(filePath, "utf-8"));

    const path = entityPath(doc, entity);
    if (!path) {
      throw new Error(
        `Could not locate \`${key}\` structurally in ${rel(filePath)} for a safe update. ` +
        `Edit the file manually rather than risk corruption.`
      );
    }

    backupYamlFile(filePath, "update", key);

    for (const [k, v] of Object.entries(config)) {
      if (k === "_entity_id") continue;
      doc.setIn([...path, k], doc.createNode(v));
    }

    writeChecked(filePath, doc);
    return `✅ Updated entity \`${key}\` in ${rel(filePath)}.\n\nBackup created. Reload the integration or restart HA to apply.`;
  }

  return `Key '${key}' not found. Use \`list\` to see available keys.`;
}

// ── Create ───────────────────────────────────────────────────

export function handleCreate(domain?: string, rawConfig?: Record<string, unknown> | string): string {
  if (!domain) throw new Error("'domain' is required for create");
  if (!rawConfig) throw new Error("'config' is required for create — provide the full entity config");

  const config: Record<string, unknown> = typeof rawConfig === "string"
    ? JSON.parse(rawConfig)
    : rawConfig;

  const index = buildYamlIndex();
  const configPath = join(HA_CONFIG_PATH, "configuration.yaml");

  let targetFile: string;
  const existingEntities = index.entities.filter((e) => e.domain === domain);
  if (existingEntities.length > 0) {
    targetFile = existingEntities[0].file;
  } else {
    targetFile = configPath;
  }

  const raw = readFileSync(targetFile, "utf-8");

  backupYamlFile(targetFile, "create", `${domain}.new`);

  if (targetFile === configPath) {
    const doc = parseDocument(raw);
    if (!isMap(doc.contents)) throw new Error("configuration.yaml root is not a map");

    const existing = doc.contents.get(domain);
    if (isSeq(existing)) {
      existing.add(doc.createNode(config));
    } else if (existing === undefined || existing === null) {
      doc.set(domain, doc.createNode([config]));
    } else {
      throw new Error(`Domain '${domain}' exists but is not a list — cannot auto-add. Edit manually.`);
    }

    writeChecked(targetFile, doc);
  } else {
    const doc = parseDocument(raw);
    if (isSeq(doc.contents)) {
      doc.contents.add(doc.createNode(config));
      writeChecked(targetFile, doc);
    } else if (doc.contents === null || doc.contents === undefined || raw.trim() === "[]") {
      const newDoc = parseDocument("[]");
      (newDoc.contents as YAMLSeq).add(newDoc.createNode(config));
      writeChecked(targetFile, newDoc);
    } else {
      throw new Error(`File ${rel(targetFile)} is not a list — cannot auto-append.`);
    }
  }

  const name = (config as Record<string, unknown>).name ?? (config as Record<string, unknown>).alias ?? domain;
  return `✅ Created \`${domain}\` entity "${name}" in ${rel(targetFile)}.\n\nBackup created. Reload the integration or restart HA to apply.`;
}

// ── Delete ───────────────────────────────────────────────────

export function handleDelete(key?: string, confirm?: boolean): string {
  if (!key) throw new Error("'key' is required for delete");

  const index = buildYamlIndex();

  const entity = index.entities.find((e) => e.key === key);
  if (!entity) {
    return `Entity '${key}' not found. Use \`list\` to see available keys.\n\n⚠️ Config blocks cannot be deleted via this tool — edit configuration.yaml directly.`;
  }

  if (!confirm) {
    return `⚠️ Will delete entity \`${key}\` from ${rel(entity.file)}:\n\n\`\`\`yaml\n${toYaml(entity.config).trim()}\n\`\`\`\n\nSet \`confirm: true\` to proceed.`;
  }

  const filePath = entity.file;
  const doc = parseDocument(readFileSync(filePath, "utf-8"));

  const path = entityPath(doc, entity);
  if (!path) {
    throw new Error(
      `Could not locate \`${key}\` structurally in ${rel(filePath)} for a safe delete. ` +
      `Edit the file manually rather than risk corruption.`
    );
  }

  backupYamlFile(filePath, "delete", key);

  doc.deleteIn(path);

  writeChecked(filePath, doc);

  return `✅ Deleted entity \`${key}\` from ${rel(filePath)}.\n\nBackup created. Reload the integration or restart HA to apply.`;
}
