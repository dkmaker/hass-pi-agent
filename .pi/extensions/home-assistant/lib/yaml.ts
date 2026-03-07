/**
 * Minimal YAML serializer and parser for Home Assistant automation configs.
 *
 * Handles the common patterns found in HA automation YAML — nested objects,
 * lists of maps, scalar values, inline JSON arrays/objects. Not a full YAML
 * spec implementation — for full fidelity, HA validates server-side on save.
 *
 * Used by the automation builder for YAML preview and import.
 */

// ── Serializer ───────────────────────────────────────────────

/** Convert a JS object to YAML string */
export function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") {
    if (obj === "" || obj.includes("\n") || obj.includes(":") || obj.includes("#") ||
        obj.startsWith("{") || obj.startsWith("[") || obj.startsWith("'") ||
        obj.startsWith('"') || obj.startsWith("!") || obj.startsWith("&") ||
        obj.startsWith("*") || obj.match(/^(true|false|null|yes|no|on|off)$/i) ||
        obj.includes("{{")) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const lines: string[] = [];
    for (const item of obj) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length > 0) {
          const [firstKey, firstVal] = entries[0];
          lines.push(`${pad}- ${firstKey}: ${toYaml(firstVal, indent + 2)}`);
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i];
            lines.push(`${pad}  ${k}: ${toYaml(v, indent + 2)}`);
          }
        } else {
          lines.push(`${pad}- {}`);
        }
      } else {
        lines.push(`${pad}- ${toYaml(item, indent + 1)}`);
      }
    }
    return "\n" + lines.join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines: string[] = [];
    for (const [k, v] of entries) {
      if (k.startsWith("_")) continue;
      const val = toYaml(v, indent + 1);
      if (val.startsWith("\n")) {
        lines.push(`${pad}${k}:${val}`);
      } else {
        lines.push(`${pad}${k}: ${val}`);
      }
    }
    return "\n" + lines.join("\n");
  }

  return String(obj);
}

// ── Parser ───────────────────────────────────────────────────

interface ParseResult {
  value: unknown;
  nextLine: number;
}

/** Parse a YAML string into a JS object */
export function parseYaml(yamlStr: string): Record<string, unknown> {
  const lines = yamlStr.split("\n");
  return parseYamlObject(lines, 0, 0).value as Record<string, unknown>;
}

function parseYamlObject(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }

    const currentIndent = line.search(/\S/);
    if (currentIndent < baseIndent) break;
    if (currentIndent > baseIndent && i > startLine) break;

    const kvMatch = line.match(/^(\s*)(\w[\w\s]*?):\s*(.*)/);
    if (!kvMatch) { i++; continue; }

    const key = kvMatch[2].trim();
    const inlineValue = kvMatch[3].trim();

    if (inlineValue === "" || inlineValue === "|" || inlineValue === ">") {
      const nextNonEmpty = findNextNonEmpty(lines, i + 1);
      if (nextNonEmpty < lines.length) {
        const nextLine = lines[nextNonEmpty];
        const nextIndent = nextLine.search(/\S/);
        if (nextIndent > currentIndent) {
          if (nextLine.trim().startsWith("- ")) {
            const listResult = parseYamlList(lines, nextNonEmpty, nextIndent);
            result[key] = listResult.value;
            i = listResult.nextLine;
          } else {
            const objResult = parseYamlObject(lines, nextNonEmpty, nextIndent);
            result[key] = objResult.value;
            i = objResult.nextLine;
          }
        } else {
          result[key] = inlineValue === "" ? null : inlineValue;
          i++;
        }
      } else {
        result[key] = null;
        i++;
      }
    } else if (inlineValue.startsWith("[") || inlineValue.startsWith("{")) {
      try {
        result[key] = JSON.parse(inlineValue.replace(/'/g, '"'));
      } catch {
        result[key] = parseYamlScalar(inlineValue);
      }
      i++;
    } else {
      result[key] = parseYamlScalar(inlineValue);
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function parseYamlList(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const result: unknown[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }

    const currentIndent = line.search(/\S/);
    if (currentIndent < baseIndent) break;
    if (!line.trim().startsWith("- ")) break;

    const after = line.replace(/^\s*-\s*/, "");
    const afterIndent = currentIndent + 2;

    if (after.match(/^\w[\w\s]*?:\s*/)) {
      const itemObj: Record<string, unknown> = {};
      const firstKv = after.match(/^(\w[\w\s]*?):\s*(.*)/);
      if (firstKv) {
        const key = firstKv[1].trim();
        const val = firstKv[2].trim();
        if (val === "" || val === "|") {
          const nextNonEmpty = findNextNonEmpty(lines, i + 1);
          if (nextNonEmpty < lines.length) {
            const nextIndent = lines[nextNonEmpty].search(/\S/);
            if (nextIndent > afterIndent) {
              if (lines[nextNonEmpty].trim().startsWith("- ")) {
                const r = parseYamlList(lines, nextNonEmpty, nextIndent);
                itemObj[key] = r.value;
                i = r.nextLine;
              } else {
                const r = parseYamlObject(lines, nextNonEmpty, nextIndent);
                itemObj[key] = r.value;
                i = r.nextLine;
              }
            } else {
              itemObj[key] = val === "" ? null : val;
              i++;
            }
          } else {
            itemObj[key] = null;
            i++;
          }
        } else {
          itemObj[key] = parseYamlScalar(val);
          i++;
        }

        // Read remaining keys at afterIndent
        while (i < lines.length) {
          const nextLine = lines[i];
          if (nextLine.trim() === "" || nextLine.trim().startsWith("#")) { i++; continue; }
          const nextInd = nextLine.search(/\S/);
          if (nextInd < afterIndent) break;
          if (nextInd > afterIndent) break;

          const kv2 = nextLine.match(/^(\s*)(\w[\w\s]*?):\s*(.*)/);
          if (!kv2) break;

          const k2 = kv2[2].trim();
          const v2 = kv2[3].trim();
          if (v2 === "" || v2 === "|") {
            const nne = findNextNonEmpty(lines, i + 1);
            if (nne < lines.length) {
              const ni = lines[nne].search(/\S/);
              if (ni > nextInd) {
                if (lines[nne].trim().startsWith("- ")) {
                  const r = parseYamlList(lines, nne, ni);
                  itemObj[k2] = r.value;
                  i = r.nextLine;
                } else {
                  const r = parseYamlObject(lines, nne, ni);
                  itemObj[k2] = r.value;
                  i = r.nextLine;
                }
              } else {
                itemObj[k2] = null;
                i++;
              }
            } else {
              itemObj[k2] = null;
              i++;
            }
          } else if (v2.startsWith("[") || v2.startsWith("{")) {
            try {
              itemObj[k2] = JSON.parse(v2.replace(/'/g, '"'));
            } catch {
              itemObj[k2] = parseYamlScalar(v2);
            }
            i++;
          } else {
            itemObj[k2] = parseYamlScalar(v2);
            i++;
          }
        }
        result.push(itemObj);
      } else {
        i++;
      }
    } else {
      result.push(parseYamlScalar(after.trim()));
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function findNextNonEmpty(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() !== "" && !lines[i].trim().startsWith("#")) return i;
  }
  return lines.length;
}

function parseYamlScalar(s: string): unknown {
  if (s === "null" || s === "~") return null;
  if (s === "true" || s === "yes") return true;
  if (s === "false" || s === "no") return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  return s;
}
