/**
 * Card type listing — loads extracted schemas from card-schemas.json.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// ── Schema loading ───────────────────────────────────────────

interface CardFieldSchema {
  type: string;
  required: boolean;
  deprecated?: boolean;
}

interface CardSchema {
  description: string;
  fields: Record<string, CardFieldSchema>;
  source: string;
}

interface CardSchemasFile {
  base_card_fields: Record<string, CardFieldSchema>;
  cards: Record<string, CardSchema>;
}

let cachedSchemas: CardSchemasFile | null = null;

function loadCardSchemas(): CardSchemasFile {
  if (cachedSchemas) return cachedSchemas;

  try {
    // Try multiple paths — compiled output may be in different locations
    const dir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(dir, "..", "..", "schemas", "card-schemas.json"),  // from tools/ha-dashboards/
      join(dir, "..", "schemas", "card-schemas.json"),        // if flattened
    ];
    let raw: string | undefined;
    for (const p of candidates) {
      try {
        raw = readFileSync(p, "utf-8");
        break;
      } catch { /* try next */ }
    }
    if (!raw) throw new Error(`card-schemas.json not found in: ${candidates.join(", ")}`);
    cachedSchemas = JSON.parse(raw);
    return cachedSchemas!;
  } catch (err: any) {
    throw new Error(`Failed to load card schemas: ${err.message}`);
  }
}

// ── Handler ──────────────────────────────────────────────────

export function handleListCardTypes(search?: string): string {
  const schemas = loadCardSchemas();
  const cards = schemas.cards;

  let entries = Object.entries(cards);

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      ([name, schema]) =>
        name.includes(q) || schema.description.toLowerCase().includes(q)
    );
  }

  if (entries.length === 0) {
    return search
      ? `No card types matching '${search}'. Use list-card-types without search to see all.`
      : "No card types found.";
  }

  const lines: string[] = [
    `## Card Types (${entries.length})\n`,
    `Base fields on all cards: type (required), grid_options, visibility, disabled\n`,
    `Custom cards use "custom:" prefix (e.g., type: "custom:mushroom-entity-card") with freeform fields.\n`,
  ];

  for (const [name, schema] of entries) {
    const fieldCount = Object.keys(schema.fields).length;
    lines.push(`### ${name}`);
    lines.push(`${schema.description}`);

    if (fieldCount === 0) {
      lines.push("  (no additional fields)\n");
      continue;
    }

    const fieldLines: string[] = [];
    for (const [fname, finfo] of Object.entries(schema.fields)) {
      const req = finfo.required ? " **(required)**" : "";
      const dep = finfo.deprecated ? " ~~deprecated~~" : "";
      fieldLines.push(`  - ${fname}: \`${finfo.type}\`${req}${dep}`);
    }
    lines.push(fieldLines.join("\n"));
    lines.push("");
  }

  return lines.join("\n");
}
