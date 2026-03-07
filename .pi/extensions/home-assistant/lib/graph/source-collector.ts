/**
 * Collect all configuration sources from a Home Assistant installation.
 *
 * Two entry points:
 *   1. configuration.yaml → recursive !include resolution → all YAML files
 *   2. .storage/ directory → all JSON storage files
 *
 * Returns a unified list of ConfigSource objects for the graph builder.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ConfigSource } from "./types.js";
import { resolveYamlIncludes } from "./yaml-resolver.js";

export interface CollectedSources {
  sources: ConfigSource[];
  errors: string[];
}

/**
 * Collect all config sources from the HA config directory.
 * @param configDir Root HA config directory (e.g., /homeassistant or /mnt/ha-config)
 */
export function collectSources(configDir: string): CollectedSources {
  const sources: ConfigSource[] = [];
  const errors: string[] = [];

  // ── 1. YAML: resolve configuration.yaml + all includes ─────
  const configYaml = join(configDir, "configuration.yaml");
  if (existsSync(configYaml)) {
    const resolved = resolveYamlIncludes(configYaml);
    sources.push(...resolved.sources);
    errors.push(...resolved.errors);
  } else {
    errors.push(`configuration.yaml not found at ${configYaml}`);
  }

  // ── 2. JSON: scan .storage/ directory ──────────────────────
  const storageDir = join(configDir, ".storage");
  if (existsSync(storageDir)) {
    let entries: string[];
    try {
      entries = readdirSync(storageDir).sort();
    } catch (e) {
      errors.push(`Failed to read .storage/: ${(e as Error).message}`);
      entries = [];
    }

    for (const entry of entries) {
      const fullPath = join(storageDir, entry);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        // Skip non-config files
        if (entry === "core.uuid" || entry === "core.analytics") continue;

        const raw = readFileSync(fullPath, "utf-8");
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Not valid JSON — skip silently (auth files, etc.)
          continue;
        }
        sources.push({ path: fullPath, format: "json", raw, parsed });
      } catch (e) {
        errors.push(`Failed to read .storage/${entry}: ${(e as Error).message}`);
      }
    }
  } else {
    errors.push(`.storage/ directory not found at ${storageDir}`);
  }

  return { sources, errors };
}
