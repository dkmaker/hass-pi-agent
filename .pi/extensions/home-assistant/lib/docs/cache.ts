/**
 * Docs index reader — loads the pre-built index from disk.
 *
 * Index is created and maintained by update-docs.py.
 * This module reads it and caches in memory.
 */
import { join } from "node:path";
import { DOCS_DATA_DIR } from "../config.js";

export interface IntegrationMeta {
  title: string;
  description: string;
  category: string[];
  platforms: string[];
  iot_class: string | null;
  integration_type: string | null;
  config_flow: boolean;
  quality_scale: string | null;
  codeowners: string[];
  featured: boolean;
}

export interface DocMeta {
  title: string;
  description: string;
  path: string;
}

export interface DocsIndex {
  version: string;
  updated: string;
  source: string;
  commit: string;
  integration_count: number;
  doc_count: number;
  integrations: Record<string, IntegrationMeta>;
  docs: Record<string, DocMeta>;
}

let cachedIndex: DocsIndex | null = null;

function indexPath(): string {
  return join(DOCS_DATA_DIR, "index.json");
}

/**
 * Load the docs index from disk. Cached in memory after first load.
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
      "No docs index found. Run update-docs.py to fetch from GitHub."
    );
  }
}

/**
 * Clear in-memory cache (forces reload from disk on next loadIndex).
 */
export function clearIndexCache(): void {
  cachedIndex = null;
}
