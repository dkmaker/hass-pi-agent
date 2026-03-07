/**
 * Automation element schema loader and cache.
 *
 * Loads the extracted automation-elements.json schema catalog and provides
 * it to validation and builder UI functions.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AutomationSchema } from "./types.js";

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);
const SCHEMA_PATH = join(__dirname_local, "..", "schemas", "automation-elements.json");

let _schema: AutomationSchema | null = null;

/** Load and cache the automation elements schema */
export function loadSchema(): AutomationSchema {
  if (_schema) return _schema;
  const raw = readFileSync(SCHEMA_PATH, "utf-8");
  _schema = JSON.parse(raw) as AutomationSchema;
  return _schema;
}
