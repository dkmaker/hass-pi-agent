/**
 * Supported Types Registry — the positive list.
 *
 * Only types registered here can be managed by the tool.
 * Schemas are loaded from JSON files in schemas/ directory.
 * Extensible to future categories (automations, scenes, etc.).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Schema types ─────────────────────────────────────────────

export interface FieldDefinition {
  field: string;
  required: boolean;
  type: string;
  default?: unknown;
  format?: string;
  min_length?: number;
  minimum?: number;
  items?: unknown;
  raw?: string;
  [key: string]: unknown;
}

export interface SchemaDefinition {
  domain: string;
  storage_key: string;
  storage_type: "collection" | "config_entry";
  name?: string;
  integration_type?: string;
  documentation?: string;
  storage_version?: number;
  storage_minor_version?: number;
  /** Unified fields list (populated from fields, create_fields, or update_fields). */
  fields: FieldDefinition[];
  /** Original create_fields if schema uses separate create/update (config entries). */
  create_fields?: FieldDefinition[];
  /** Original update_fields if schema uses separate create/update (config entries). */
  update_fields?: FieldDefinition[];
  /** For multi-sub-type integrations (e.g., template): the options key that selects sub-type. */
  sub_type_key?: string;
  /** Per-sub-type field definitions. Key = sub_type name (e.g., "binary_sensor"). */
  sub_types?: Record<string, FieldDefinition[]>;
}

interface RawSchema {
  domain: string;
  storage_key: string;
  storage_type: "collection" | "config_entry";
  name?: string;
  integration_type?: string;
  documentation?: string;
  storage_version?: number;
  storage_minor_version?: number;
  fields?: FieldDefinition[];
  create_fields?: FieldDefinition[];
  update_fields?: FieldDefinition[];
  sub_type_key?: string;
  sub_types?: Record<string, FieldDefinition[]>;
}

/** Normalize a raw schema — merge create_fields/update_fields into a unified fields list. */
function normalizeSchema(raw: RawSchema): SchemaDefinition {
  // Pass through sub_type info
  const result: SchemaDefinition = {
    ...raw,
    fields: raw.fields ?? [],
    sub_type_key: raw.sub_type_key,
    sub_types: raw.sub_types,
  };

  if (raw.fields && raw.fields.length > 0) {
    return result;
  }

  // For sub-type schemas with no top-level fields, fields stays empty
  // (validation uses sub_types directly)
  if (raw.sub_types && Object.keys(raw.sub_types).length > 0) {
    return result;
  }

  // Merge create_fields and update_fields, preferring create_fields for duplicates
  const fieldMap = new Map<string, FieldDefinition>();
  for (const f of raw.update_fields ?? []) {
    fieldMap.set(f.field, f);
  }
  for (const f of raw.create_fields ?? []) {
    fieldMap.set(f.field, f);
  }

  result.fields = Array.from(fieldMap.values());
  result.create_fields = raw.create_fields;
  result.update_fields = raw.update_fields;
  return result;
}

export type Category = "helper";

export interface SupportedType {
  domain: string;
  category: Category;
  storageType: "collection" | "config_entry";
  storageKey: string;
  schema: SchemaDefinition;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Excluded collection domains (not helpers) ────────────────

const EXCLUDED_COLLECTIONS = new Set([
  "lovelace",
  "person",
  "zone",
  "tag",
  "application_credentials",
]);

// ── Registry singleton ───────────────────────────────────────

let _types: Map<string, SupportedType> | null = null;

function schemasDir(): string {
  // Support both ESM (import.meta.url) and CJS (__dirname) environments
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return join(dirname(thisFile), "..", "schemas");
  } catch {
    // Fallback for CJS / jiti
    return join(__dirname, "..", "schemas");
  }
}

function loadSchemaFile(path: string): SchemaDefinition {
  const raw: RawSchema = JSON.parse(readFileSync(path, "utf-8"));
  return normalizeSchema(raw);
}

function loadAllTypes(): Map<string, SupportedType> {
  const types = new Map<string, SupportedType>();
  const root = schemasDir();

  // Load collection helpers
  const collectionsDir = join(root, "collections");
  try {
    const files = readdirSync(collectionsDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const schema = loadSchemaFile(join(collectionsDir, file));
      if (EXCLUDED_COLLECTIONS.has(schema.domain)) continue;
      types.set(schema.domain, {
        domain: schema.domain,
        category: "helper",
        storageType: "collection",
        storageKey: schema.storage_key,
        schema,
      });
    }
  } catch {
    /* schemas/collections/ may not exist */
  }

  // Load config entry helpers
  const configEntriesDir = join(root, "config_entries");
  try {
    for (const file of readdirSync(configEntriesDir).filter((f) => f.endsWith(".json"))) {
      const schema = loadSchemaFile(join(configEntriesDir, file));
      if (schema.integration_type !== "helper") continue;
      types.set(schema.domain, {
        domain: schema.domain,
        category: "helper",
        storageType: "config_entry",
        storageKey: schema.storage_key,
        schema,
      });
    }
  } catch {
    /* schemas/config_entries/ may not exist */
  }

  return types;
}

function getTypes(): Map<string, SupportedType> {
  if (!_types) {
    _types = loadAllTypes();
  }
  return _types;
}

// ── Public API ───────────────────────────────────────────────

/** Get all supported types. */
export function listTypes(): SupportedType[] {
  return Array.from(getTypes().values());
}

/** Get all supported types in a category. */
export function listTypesByCategory(category: Category): SupportedType[] {
  return listTypes().filter((t) => t.category === category);
}

/** Get a supported type by domain. Returns null if not supported. */
export function getType(domain: string): SupportedType | null {
  return getTypes().get(domain) ?? null;
}

/** Check if a domain is supported. */
export function isSupported(domain: string): boolean {
  return getTypes().has(domain);
}

/** Get all supported domain names. */
export function supportedDomains(): string[] {
  return Array.from(getTypes().keys()).sort();
}

/**
 * Validate fields against a type's schema.
 * Mode 'create' checks required fields. Mode 'update' skips required checks.
 */
export function validateFields(
  domain: string,
  fields: Record<string, unknown>,
  mode: "create" | "update"
): ValidationResult {
  const type = getType(domain);
  if (!type) {
    return { valid: false, errors: [`Unknown type: '${domain}'. Supported: ${supportedDomains().join(", ")}`] };
  }

  const errors: string[] = [];
  const schema = type.schema;

  // Resolve fields list — use sub_type-specific fields if applicable
  let modeFields: FieldDefinition[];
  if (schema.sub_types && schema.sub_type_key) {
    const subType = fields[schema.sub_type_key] as string | undefined;
    if (!subType) {
      errors.push(`Missing required field: '${schema.sub_type_key}' (one of: ${Object.keys(schema.sub_types).join(", ")})`);
      return { valid: false, errors };
    }
    const subFields = schema.sub_types[subType];
    if (!subFields) {
      errors.push(`Unknown ${schema.sub_type_key}: '${subType}'. Valid: ${Object.keys(schema.sub_types).join(", ")}`);
      return { valid: false, errors };
    }
    modeFields = subFields;
  } else if (mode === "create") {
    modeFields = schema.create_fields ?? schema.fields;
  } else {
    modeFields = schema.update_fields ?? schema.fields;
  }

  if (mode === "create") {
    for (const field of modeFields) {
      if (field.required && field.default === undefined && fields[field.field] === undefined) {
        errors.push(`Missing required field: '${field.field}'`);
      }
    }
  }

  // Basic type checking for provided fields
  for (const [key, value] of Object.entries(fields)) {
    if (key === "id" || key === "name") continue; // meta fields, always allowed
    if (schema.sub_type_key && key === schema.sub_type_key) continue; // sub-type selector
    const fieldDef = modeFields.find((f) => f.field === key);
    if (!fieldDef) {
      // Allow unknown fields to pass through — HA may have added new ones
      continue;
    }
    // Type validation for basic types
    if (fieldDef.type === "string" && value !== undefined && typeof value !== "string") {
      errors.push(`Field '${key}' must be a string, got ${typeof value}`);
    }
    if (fieldDef.type === "number" && value !== undefined && typeof value !== "number") {
      errors.push(`Field '${key}' must be a number, got ${typeof value}`);
    }
    if (fieldDef.type === "boolean" && value !== undefined && typeof value !== "boolean") {
      errors.push(`Field '${key}' must be a boolean, got ${typeof value}`);
    }
    if (fieldDef.type === "array" && value !== undefined && !Array.isArray(value)) {
      errors.push(`Field '${key}' must be an array, got ${typeof value}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format a type's schema as a human-readable string for error messages.
 */
export function formatSchema(domain: string): string {
  const type = getType(domain);
  if (!type) return `Unknown type '${domain}'. Supported types: ${supportedDomains().join(", ")}`;

  const lines = [
    `${type.schema.name || domain}`,
    type.schema.documentation ? `Docs: ${type.schema.documentation}` : null,
  ].filter((l) => l !== null);

  if (type.schema.sub_types && type.schema.sub_type_key) {
    lines.push("");
    lines.push(`Requires '${type.schema.sub_type_key}' to select sub-type.`);
    lines.push(`Available sub-types: ${Object.keys(type.schema.sub_types).join(", ")}`);
    lines.push("");
    for (const [subName, subFields] of Object.entries(type.schema.sub_types)) {
      const fieldNames = subFields.map((f) => f.field).filter((n) => n !== "name");
      lines.push(`  ${subName}: ${fieldNames.join(", ")}`);
    }
  } else {
    lines.push("");
    lines.push("Fields:");
    for (const field of type.schema.fields) {
      const req = field.required ? "REQUIRED" : "optional";
      const parts = [`  ${field.field} (${req}, ${field.type})`];
      if (field.default !== undefined) parts.push(`default: ${JSON.stringify(field.default)}`);
      if (field.format) parts.push(`format: ${field.format}`);
      if (field.min_length !== undefined) parts.push(`min_length: ${field.min_length}`);
      lines.push(parts.join(" — "));
    }
  }

  return lines.join("\n");
}

/**
 * Reset the registry cache (for testing).
 */
export function resetRegistry(): void {
  _types = null;
}
