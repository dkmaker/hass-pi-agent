/**
 * Config entry storage backend.
 *
 * Handles helper types stored in `.storage/core.config_entries`
 * as entries filtered by domain. User fields go into `options`,
 * `data` is always `{}`.
 *
 * On removal, also cleans up `core.entity_registry` to prevent
 * orphaned entities showing as 'unavailable'.
 *
 * Types: template, group, derivative, utility_meter, threshold,
 *        trend, tod, statistics, min_max, filter, integration,
 *        generic_thermostat, generic_hygrostat, switch_as_x,
 *        random, history_stats, mold_indicator
 */
import { readStorage, writeStorage, type StorageFile } from "../storage.js";
import type { SupportedType } from "../registry.js";
import type { BackendResult } from "./collection.js";

// ── Types ────────────────────────────────────────────────────

interface ConfigEntry {
  created_at: string;
  data: Record<string, unknown>;
  disabled_by: string | null;
  discovery_keys: Record<string, unknown>;
  domain: string;
  entry_id: string;
  minor_version: number;
  modified_at: string;
  options: Record<string, unknown>;
  pref_disable_new_entities: boolean;
  pref_disable_polling: boolean;
  source: string;
  subentries: unknown[];
  title: string;
  unique_id: string | null;
  version: number;
}

interface ConfigEntriesData {
  entries: ConfigEntry[];
}

interface EntityRegistryData {
  entities: EntityRegistryEntry[];
  deleted_entities?: unknown[];
}

interface EntityRegistryEntry {
  config_entry_id: string | null;
  entity_id: string;
  [key: string]: unknown;
}

// ── ULID generation ──────────────────────────────────────────
// Crockford Base32 ULID: 10 chars timestamp + 16 chars random

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateUlid(): string {
  const now = Date.now();
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t & 31] + ts;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return ts + rand;
}

// ── Storage access ───────────────────────────────────────────

const STORAGE_KEY = "core.config_entries";
const ENTITY_REGISTRY_KEY = "core.entity_registry";

function readConfigEntries(): StorageFile<ConfigEntriesData> {
  const existing = readStorage<ConfigEntriesData>(STORAGE_KEY);
  if (!existing) {
    throw new Error(
      `Storage file '${STORAGE_KEY}' not found. Is the HA config path correct?`
    );
  }
  return existing;
}

function readEntityRegistry(): StorageFile<EntityRegistryData> | null {
  return readStorage<EntityRegistryData>(ENTITY_REGISTRY_KEY);
}

// ── Backend operations ───────────────────────────────────────

/**
 * List all config entries for a given helper domain.
 */
export function listEntries(type: SupportedType): ConfigEntry[] {
  const storage = readConfigEntries();
  return storage.data.entries.filter((e) => e.domain === type.domain);
}

/**
 * Get a single config entry by entry_id.
 */
export function getEntry(type: SupportedType, entryId: string): ConfigEntry | null {
  const storage = readConfigEntries();
  return (
    storage.data.entries.find(
      (e) => e.entry_id === entryId && e.domain === type.domain
    ) ?? null
  );
}

/**
 * Add a new config entry. User fields go into `options`.
 * The `name` field is used as the entry title.
 */
export function addEntry(
  type: SupportedType,
  fields: Record<string, unknown>
): BackendResult {
  const storage = readConfigEntries();
  const now = new Date().toISOString();
  const entryId = generateUlid();

  const title = (fields.name as string) || type.domain;

  const newEntry: ConfigEntry = {
    created_at: now,
    data: {},
    disabled_by: null,
    discovery_keys: {},
    domain: type.domain,
    entry_id: entryId,
    minor_version: 1,
    modified_at: now,
    options: { ...fields },
    pref_disable_new_entities: false,
    pref_disable_polling: false,
    source: "user",
    subentries: [],
    title,
    unique_id: null,
    version: 1,
  };

  storage.data.entries.push(newEntry);
  const backupMessage = writeStorage(STORAGE_KEY, storage);

  return {
    success: true,
    message: `Added ${type.domain} config entry '${title}' (entry_id: ${entryId})`,
    id: entryId,
    backupMessage,
  };
}

/**
 * Update an existing config entry's options.
 */
export function updateEntry(
  type: SupportedType,
  entryId: string,
  fields: Record<string, unknown>
): BackendResult {
  const storage = readConfigEntries();
  const idx = storage.data.entries.findIndex(
    (e) => e.entry_id === entryId && e.domain === type.domain
  );
  if (idx === -1) {
    return {
      success: false,
      message: `Config entry '${entryId}' not found for domain '${type.domain}'`,
    };
  }

  const entry = storage.data.entries[idx];
  entry.options = { ...entry.options, ...fields };
  entry.modified_at = new Date().toISOString();

  // Update title if name changed
  if (fields.name) {
    entry.title = fields.name as string;
  }

  const backupMessage = writeStorage(STORAGE_KEY, storage);
  return {
    success: true,
    message: `Updated ${type.domain} config entry '${entry.title}' (entry_id: ${entryId})`,
    id: entryId,
    backupMessage,
  };
}

/**
 * Remove a config entry and clean up entity registry.
 */
export function removeEntry(type: SupportedType, entryId: string): BackendResult {
  const storage = readConfigEntries();
  const idx = storage.data.entries.findIndex(
    (e) => e.entry_id === entryId && e.domain === type.domain
  );
  if (idx === -1) {
    return {
      success: false,
      message: `Config entry '${entryId}' not found for domain '${type.domain}'`,
    };
  }

  const removed = storage.data.entries[idx];
  storage.data.entries.splice(idx, 1);
  const backupMessage = writeStorage(STORAGE_KEY, storage);

  // Clean up entity registry
  let entityCleanupMsg = "";
  const entityRegistry = readEntityRegistry();
  if (entityRegistry) {
    const before = entityRegistry.data.entities.length;
    entityRegistry.data.entities = entityRegistry.data.entities.filter(
      (e) => e.config_entry_id !== entryId
    );
    const removed_count = before - entityRegistry.data.entities.length;
    if (removed_count > 0) {
      const entityBackup = writeStorage(ENTITY_REGISTRY_KEY, entityRegistry);
      entityCleanupMsg = `\nCleaned up ${removed_count} entity registry entry/entries. ${entityBackup}`;
    }
  }

  return {
    success: true,
    message: `Removed ${type.domain} config entry '${removed.title}' (entry_id: ${entryId})${entityCleanupMsg}`,
    id: entryId,
    backupMessage,
  };
}
