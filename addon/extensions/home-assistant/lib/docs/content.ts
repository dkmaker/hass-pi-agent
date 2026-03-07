/**
 * Doc content reader — reads locally stored markdown files.
 *
 * All content is pre-fetched by the update-docs.py script.
 * This module just reads from disk.
 */
import { join } from "node:path";
import { DOCS_DATA_DIR } from "../config.js";

const CONTENT_DIR = join(DOCS_DATA_DIR, "content");

/**
 * Read an integration doc by domain.
 */
export async function readIntegrationDoc(domain: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const path = join(CONTENT_DIR, "integrations", `${domain}.md`);
  try {
    return await readFile(path, "utf-8");
  } catch {
    throw new Error(`Integration '${domain}' not found locally. Run update-docs.py to fetch.`);
  }
}

/**
 * Read a general doc by path (e.g., "automation/trigger").
 */
export async function readDoc(docPath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const path = join(CONTENT_DIR, "docs", `${docPath}.md`);
  try {
    return await readFile(path, "utf-8");
  } catch {
    throw new Error(`Doc '${docPath}' not found locally. Run update-docs.py to fetch.`);
  }
}
