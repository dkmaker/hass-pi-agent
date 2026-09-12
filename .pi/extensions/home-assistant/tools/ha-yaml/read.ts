/**
 * YAML read handlers — list, get, files.
 */
import { buildYamlIndex, type YamlEntityBlock } from "../../lib/yaml-entity-parser.js";
import { toYaml } from "../../lib/yaml.js";
import { appendNoteIfExists } from "../../lib/agent-notes.js";
import { HA_CONFIG_PATH } from "../../lib/config.js";

function rel(path: string): string {
  return path.replace(HA_CONFIG_PATH + "/", "");
}

export function handleList(domain?: string): string {
  const index = buildYamlIndex();

  let entities = index.entities;
  if (domain) {
    entities = entities.filter((e) => e.domain === domain);
  }

  const lines: string[] = [];

  if (!domain && index.configs.length > 0) {
    lines.push(`## Config Blocks (${index.configs.length})`);
    lines.push("");
    lines.push("| Key | File | Lines |");
    lines.push("|-----|------|-------|");
    for (const c of index.configs) {
      const hasConfig = Object.keys(c.config).length > 0;
      lines.push(`| ${c.key} | ${rel(c.file)} | ${c.lineStart}–${c.lineEnd} | ${hasConfig ? "" : "(empty)"}`);
    }
    lines.push("");
  }

  if (entities.length > 0) {
    const byDomain = new Map<string, YamlEntityBlock[]>();
    for (const e of entities) {
      const list = byDomain.get(e.domain) ?? [];
      list.push(e);
      byDomain.set(e.domain, list);
    }

    lines.push(`## YAML Entities (${entities.length})`);
    lines.push("");

    for (const [dom, items] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`### ${dom} (${items.length})`);
      lines.push("");
      lines.push("| Key | Name | Platform | File | Lines |");
      lines.push("|-----|------|----------|------|-------|");
      for (const e of items) {
        lines.push(
          `| ${e.key} | ${e.name ?? "—"} | ${e.platform ?? "—"} | ${rel(e.file)} | ${e.lineStart}–${e.lineEnd} |`
        );
      }
      lines.push("");
    }
  }

  // Emit the empty-state message whenever no entities were listed AND the config
  // block section above did not render (it only renders when there is no domain
  // filter). Otherwise a domain filter with zero matches but existing config
  // blocks produced an empty string -> a blank tool block in the UI.
  if (entities.length === 0 && (domain || index.configs.length === 0)) {
    const hint = domain ? ` for domain '${domain}'` : "";
    lines.push(`No YAML-defined entities found${hint}.`);
  }

  if (index.errors.length > 0) {
    lines.push("### Parse Errors");
    lines.push("");
    for (const err of index.errors) lines.push(`- ${err}`);
  }

  return lines.join("\n");
}

export function handleGet(key?: string): string {
  if (!key) throw new Error("'key' is required for get");

  const index = buildYamlIndex();

  const configBlock = index.configs.find((c) => c.key === key);
  if (configBlock) {
    const lines: string[] = [
      `## Config: ${configBlock.key}`,
      "",
      "| Property | Value |",
      "|----------|-------|",
      `| File | ${rel(configBlock.file)} |`,
      `| Lines | ${configBlock.lineStart}–${configBlock.lineEnd} |`,
    ];

    if (Object.keys(configBlock.config).length > 0) {
      lines.push("");
      lines.push("### Config");
      lines.push("");
      lines.push("```yaml");
      lines.push(`${configBlock.key}:`);
      lines.push(toYaml(configBlock.config).trim().split("\n").map(l => "  " + l).join("\n"));
      lines.push("```");
    } else {
      lines.push("");
      lines.push("*(empty — no sub-keys)*");
    }

    return lines.join("\n");
  }

  const entity = index.entities.find((e) => e.key === key);
  if (entity) {
    const lines: string[] = [
      `## ${entity.key}`,
      "",
      "| Property | Value |",
      "|----------|-------|",
      `| Domain | ${entity.domain} |`,
    ];
    if (entity.platform) lines.push(`| Platform | ${entity.platform} |`);
    if (entity.name) lines.push(`| Name | ${entity.name} |`);
    if (entity.unique_id) lines.push(`| Unique ID | ${entity.unique_id} |`);
    lines.push(`| File | ${rel(entity.file)} |`);
    lines.push(`| Lines | ${entity.lineStart}–${entity.lineEnd} |`);
    lines.push("");
    lines.push("### Config");
    lines.push("");
    lines.push("```yaml");
    lines.push(toYaml(entity.config).trim());
    lines.push("```");

    const noteKey = entity.unique_id
      ? `${entity.domain}.${entity.unique_id}`
      : entity.key;
    const note = appendNoteIfExists(noteKey);
    if (note) lines.push(note);

    return lines.join("\n");
  }

  const allKeys = [
    ...index.configs.map((c) => c.key),
    ...index.entities.map((e) => e.key),
  ];
  const similar = allKeys.filter((k) => k.includes(key) || key.includes(k)).slice(0, 5);
  const hint = similar.length > 0
    ? `\n\nDid you mean:\n${similar.map((k) => `- ${k}`).join("\n")}`
    : "";
  return `Key '${key}' not found in YAML config.${hint}`;
}

export function handleFiles(): string {
  const index = buildYamlIndex();

  const byFile = new Map<string, { entities: number; configs: number; domains: Set<string> }>();

  for (const e of index.entities) {
    const entry = byFile.get(e.file) ?? { entities: 0, configs: 0, domains: new Set() };
    entry.entities++;
    entry.domains.add(e.domain);
    byFile.set(e.file, entry);
  }
  for (const c of index.configs) {
    const entry = byFile.get(c.file) ?? { entities: 0, configs: 0, domains: new Set() };
    entry.configs++;
    entry.domains.add(c.key);
    byFile.set(c.file, entry);
  }

  const lines: string[] = ["## YAML Config Files", ""];
  lines.push("| File | Entities | Config Blocks | Keys |");
  lines.push("|------|----------|---------------|------|");

  for (const [file, info] of [...byFile.entries()].sort()) {
    lines.push(
      `| ${rel(file)} | ${info.entities || "—"} | ${info.configs || "—"} | ${[...info.domains].join(", ")} |`
    );
  }

  if (index.errors.length > 0) {
    lines.push("");
    lines.push("### Errors");
    for (const err of index.errors) lines.push(`- ${err}`);
  }

  return lines.join("\n");
}
