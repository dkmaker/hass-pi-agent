/**
 * Recursively resolve Home Assistant YAML configuration.
 *
 * Handles all HA !include directives:
 *   !include file.yaml
 *   !include_dir_list dir/
 *   !include_dir_merge_list dir/
 *   !include_dir_merge_named dir/
 *   !include_dir_named dir/
 *
 * Returns a flat list of all discovered files with their raw content.
 * Does NOT fully parse YAML — we only need to resolve includes and
 * track which files exist. The reference extractor works on raw text.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { ConfigSource } from "./types.js";

/** Regex to find !include directives in YAML text */
const INCLUDE_RE = /!include\s+(\S+)/g;
const INCLUDE_DIR_RE = /!include_dir_(list|merge_list|merge_named|named)\s+(\S+)/g;

export interface ResolvedYaml {
  /** All discovered YAML files */
  sources: ConfigSource[];
  /** Files that failed to read */
  errors: string[];
}

/**
 * Resolve all YAML files starting from the main configuration.yaml.
 * @param configPath Absolute path to configuration.yaml
 */
export function resolveYamlIncludes(configPath: string): ResolvedYaml {
  const sources: ConfigSource[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();

  function processFile(filePath: string): void {
    const absPath = resolve(filePath);
    if (visited.has(absPath)) return;
    visited.add(absPath);

    let raw: string;
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch (e) {
      errors.push(`Failed to read ${absPath}: ${(e as Error).message}`);
      return;
    }

    sources.push({ path: absPath, format: "yaml", raw, parsed: null });

    const baseDir = dirname(absPath);

    // Find !include file.yaml
    for (const m of raw.matchAll(INCLUDE_RE)) {
      // Skip if this is actually an !include_dir_* (already handled below)
      const lineStart = raw.lastIndexOf("\n", m.index) + 1;
      const line = raw.slice(lineStart, raw.indexOf("\n", m.index));
      if (line.includes("!include_dir_")) continue;

      const target = join(baseDir, m[1]);
      processFile(target);
    }

    // Find !include_dir_* directives
    for (const m of raw.matchAll(INCLUDE_DIR_RE)) {
      const dirPath = join(baseDir, m[2]);
      processDir(dirPath);
    }
  }

  function processDir(dirPath: string): void {
    if (!existsSync(dirPath)) return;
    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) return;
    } catch {
      return;
    }

    let entries: string[];
    try {
      entries = readdirSync(dirPath).sort();
    } catch (e) {
      errors.push(`Failed to read dir ${dirPath}: ${(e as Error).message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && (entry.endsWith(".yaml") || entry.endsWith(".yml"))) {
          processFile(fullPath);
        } else if (stat.isDirectory()) {
          // Recursive for include_dir_* variants
          processDir(fullPath);
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  processFile(configPath);
  return { sources, errors };
}
