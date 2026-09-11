/**
 * YAML write handlers — update, create, delete.
 * All operations backup the target file before modifying it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, isMap, isSeq, stringify } from "yaml";
import { buildYamlIndex } from "../../lib/yaml-entity-parser.js";
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

// ── Update ───────────────────────────────────────────────────

export function handleUpdate(key?: string, rawConfig?: Record<string, unknown> | string): string {
  if (!key) throw new Error("'key' is required for update");
  if (!rawConfig) throw new Error("'config' is required for update — provide the fields to change");

  // Handle config passed as JSON string
  const config: Record<string, unknown> = typeof rawConfig === "string"
    ? JSON.parse(rawConfig)
    : rawConfig;

  const index = buildYamlIndex();

  // Config block update
  const configBlock = index.configs.find((c) => c.key === key);
  if (configBlock) {
    const filePath = configBlock.file;
    const doc = parseDocument(readFileSync(filePath, "utf-8"));

    if (!isMap(doc.contents)) throw new Error("configuration.yaml root is not a map");

    backupYamlFile(filePath, "update", key);

    const existing = doc.contents.get(key);
    if (isMap(existing)) {
      for (const [k, v] of Object.entries(config)) {
        doc.setIn([key, k], v);
      }
    } else {
      doc.set(key, config);
    }

    writeFileSync(filePath, stringify(doc, { lineWidth: 0 }), "utf-8");

    return `✅ Updated config block \`${key}\` in ${rel(filePath)}.\n\nBackup created. Run \`ha_restart reload-core\` if needed to apply changes.`;
  }

  // Entity update
  const entity = index.entities.find((e) => e.key === key);
  if (entity) {
    const filePath = entity.file;
    const raw = readFileSync(filePath, "utf-8");

    backupYamlFile(filePath, "update", key);

    const lines = raw.split("\n");
    const before = lines.slice(0, entity.lineStart - 1);
    const after = lines.slice(entity.lineEnd);

    const merged = { ...entity.config, ...config };
    delete (merged as any)._entity_id;

    const firstLine = lines[entity.lineStart - 1] ?? "";
    const indent = firstLine.search(/\S/);
    const isListItem = firstLine.trim().startsWith("-");

    let newYaml: string;
    if (isListItem) {
      const yamlStr = stringify(merged, { lineWidth: 0 }).trim();
      const yamlLines = yamlStr.split("\n");
      const pad = " ".repeat(Math.max(indent, 0));
      newYaml = `${pad}- ${yamlLines[0]}`;
      for (let i = 1; i < yamlLines.length; i++) {
        newYaml += `\n${pad}  ${yamlLines[i]}`;
      }
    } else {
      const yamlStr = stringify(merged, { lineWidth: 0 }).trim();
      const pad = " ".repeat(Math.max(indent, 0));
      newYaml = yamlStr.split("\n").map(l => pad + l).join("\n");
    }

    const result = [...before, newYaml, ...after].join("\n");
    writeFileSync(filePath, result, "utf-8");

    return `✅ Updated entity \`${key}\` in ${rel(filePath)} (lines ${entity.lineStart}–${entity.lineEnd}).\n\nBackup created. Reload the integration or restart HA to apply.`;
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

    writeFileSync(targetFile, stringify(doc, { lineWidth: 0 }), "utf-8");
  } else {
    const doc = parseDocument(raw);
    if (isSeq(doc.contents)) {
      doc.contents.add(doc.createNode(config));
    } else if (doc.contents === null || doc.contents === undefined || raw.trim() === "[]") {
      const newDoc = parseDocument("[]");
      (newDoc.contents as any).add(newDoc.createNode(config));
      writeFileSync(targetFile, stringify(newDoc, { lineWidth: 0 }), "utf-8");
      const name = (config as any).name ?? (config as any).alias ?? domain;
      return `✅ Created \`${domain}\` entity "${name}" in ${rel(targetFile)}.\n\nBackup created. Reload the integration or restart HA to apply.`;
    } else {
      throw new Error(`File ${rel(targetFile)} is not a list — cannot auto-append.`);
    }

    writeFileSync(targetFile, stringify(doc, { lineWidth: 0 }), "utf-8");
  }

  const name = (config as any).name ?? (config as any).alias ?? domain;
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
    return `⚠️ Will delete entity \`${key}\` from ${rel(entity.file)} (lines ${entity.lineStart}–${entity.lineEnd}):\n\n\`\`\`yaml\n${toYaml(entity.config).trim()}\n\`\`\`\n\nSet \`confirm: true\` to proceed.`;
  }

  const filePath = entity.file;
  const raw = readFileSync(filePath, "utf-8");

  backupYamlFile(filePath, "delete", key);

  const lines = raw.split("\n");
  const before = lines.slice(0, entity.lineStart - 1);
  const after = lines.slice(entity.lineEnd);

  while (before.length > 0 && before[before.length - 1].trim() === "" &&
         after.length > 0 && after[0].trim() === "") {
    after.shift();
  }

  const result = [...before, ...after].join("\n");
  writeFileSync(filePath, result, "utf-8");

  return `✅ Deleted entity \`${key}\` from ${rel(filePath)}.\n\nBackup created. Reload the integration or restart HA to apply.`;
}
