#!/usr/bin/env npx tsx
/**
 * Build the docs index from local mirror or GitHub.
 *
 * Usage:
 *   npx tsx scripts/build-docs-index.ts                  # from local docs/homeassistant/
 *   npx tsx scripts/build-docs-index.ts --github          # from GitHub API
 *   npx tsx scripts/build-docs-index.ts --local /path/to  # from custom local path
 *
 * Output: schemas/ha-docs-index.json
 *
 * This uses the same builder module as the tool's runtime 'update' action.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFromLocal, buildFromGitHub } from "../lib/docs/builder.js";
import { saveIndexTo } from "../lib/docs/cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = join(__dirname, "..");
const OUTPUT_PATH = join(EXTENSION_ROOT, "data", "ha-docs", "index.json");

// Default local mirror path (relative to repo root)
const REPO_ROOT = join(EXTENSION_ROOT, "..", "..", "..");
const DEFAULT_LOCAL = join(REPO_ROOT, "docs", "homeassistant");

async function main() {
  const args = process.argv.slice(2);
  const useGitHub = args.includes("--github");
  const localIdx = args.indexOf("--local");
  const localPath = localIdx >= 0 ? args[localIdx + 1] : DEFAULT_LOCAL;

  console.log(`Building docs index...`);
  console.log(`Output: ${OUTPUT_PATH}`);

  let index;

  if (useGitHub) {
    console.log("Source: GitHub API");
    index = await buildFromGitHub((msg) => console.log(`  ${msg}`));
  } else {
    const integrationsDir = join(localPath, "user", "integrations");
    const docsDir = join(localPath, "user", "docs");
    console.log(`Source: ${localPath}`);
    index = await buildFromLocal(integrationsDir, docsDir, `local:${localPath}`);
  }

  await saveIndexTo(index, OUTPUT_PATH);

  const iCount = Object.keys(index.integrations).length;
  const dCount = Object.keys(index.docs).length;
  console.log(`\n✅ Index built: ${iCount} integrations, ${dCount} docs`);
  console.log(`   Written to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
