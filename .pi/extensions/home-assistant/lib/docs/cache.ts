/**
 * Docs index cache — manages loading and saving the docs index.
 *
 * Priority:
 * 1. Runtime cache (written by `update` action)
 * 2. Shipped index (committed to repo, in schemas/)
 *
 * The shipped index is loaded once and held in memory.
 * Runtime updates replace it in memory and write to disk.
 */
import type { DocsIndex } from "./builder.js";

const RUNTIME_INDEX_PATH = "/tmp/ha-docs-cache/index.json";

let cachedIndex: DocsIndex | null = null;

/**
 * Find the shipped index path relative to this module.
 */
function getShippedIndexPath(): string {
  const { join, dirname } = require("node:path");
  // lib/docs/cache.ts → ../../schemas/ha-docs-index.json
  return join(dirname(dirname(__dirname)), "schemas", "ha-docs-index.json");
}

/**
 * Load the docs index. Checks runtime cache first, then shipped.
 */
export async function loadIndex(): Promise<DocsIndex> {
  if (cachedIndex) return cachedIndex;

  const { readFile } = await import("node:fs/promises");

  // Try runtime cache first
  try {
    const data = await readFile(RUNTIME_INDEX_PATH, "utf-8");
    cachedIndex = JSON.parse(data) as DocsIndex;
    return cachedIndex;
  } catch {
    // Not found, fall through
  }

  // Try shipped index
  try {
    // Use import.meta.url to resolve relative to this file
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const shippedPath = join(thisDir, "..", "..", "schemas", "ha-docs-index.json");
    const data = await readFile(shippedPath, "utf-8");
    cachedIndex = JSON.parse(data) as DocsIndex;
    return cachedIndex;
  } catch {
    // No index at all
  }

  throw new Error(
    "No docs index found. Run 'update' action to fetch from GitHub, or rebuild with the build script."
  );
}

/**
 * Save a new index to the runtime cache and update in-memory cache.
 */
export async function saveIndex(index: DocsIndex): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  await mkdir(dirname(RUNTIME_INDEX_PATH), { recursive: true });
  await writeFile(RUNTIME_INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
  cachedIndex = index;
}

/**
 * Save index to a specific path (for build script).
 */
export async function saveIndexTo(index: DocsIndex, path: string): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname: dn } = await import("node:path");

  await mkdir(dn(path), { recursive: true });
  await writeFile(path, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Clear in-memory cache (forces reload from disk on next loadIndex).
 */
export function clearIndexCache(): void {
  cachedIndex = null;
}
