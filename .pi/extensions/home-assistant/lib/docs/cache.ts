/**
 * Docs index cache — manages loading and saving the docs index.
 *
 * Storage location is configured via DOCS_DATA_DIR (config.ts):
 *   Add-on: /data/ha-docs/
 *   Local dev: .pi/extensions/home-assistant/data/ha-docs/
 *
 * Index is loaded once and held in memory.
 */
import { join } from "node:path";
import { DOCS_DATA_DIR } from "../config.js";
import type { DocsIndex } from "./builder.js";

let cachedIndex: DocsIndex | null = null;

function indexPath(): string {
  return join(DOCS_DATA_DIR, "index.json");
}

/**
 * Load the docs index from persistent storage.
 */
export async function loadIndex(): Promise<DocsIndex> {
  if (cachedIndex) return cachedIndex;

  const { readFile } = await import("node:fs/promises");

  try {
    const data = await readFile(indexPath(), "utf-8");
    cachedIndex = JSON.parse(data) as DocsIndex;
    return cachedIndex;
  } catch {
    throw new Error(
      "No docs index found. Waiting for initial load — the index is fetched automatically on first startup."
    );
  }
}

/**
 * Check if an index exists on disk.
 */
export async function indexExists(): Promise<boolean> {
  const { access } = await import("node:fs/promises");
  try {
    await access(indexPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Save index to persistent storage and update in-memory cache.
 */
export async function saveIndex(index: DocsIndex): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");

  const p = indexPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(index, null, 2), "utf-8");
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
