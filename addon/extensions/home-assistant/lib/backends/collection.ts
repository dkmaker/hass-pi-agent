/**
 * Collection storage backend.
 *
 * Handles helper types stored in `.storage/<domain>` files
 * with the pattern: { version, minor_version, key, data: { items: [...] } }
 *
 * Types: input_boolean, input_number, input_text, input_select,
 *        input_datetime, input_button, counter, timer, schedule
 */
import { readStorage, writeStorage, type StorageFile } from "../storage.js";
import type { SupportedType } from "../registry.js";

// ── Types ────────────────────────────────────────────────────

export interface CollectionItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface CollectionData {
  items: CollectionItem[];
}

export interface BackendResult {
  success: boolean;
  message: string;
  id?: string;
  backupMessage?: string;
}

// ── Backend operations ───────────────────────────────────────

/**
 * List all items for a collection type.
 */
export function listItems(type: SupportedType): CollectionItem[] {
  const storage = getOrCreate(type);
  return storage.data.items;
}

/**
 * Get a single item by id.
 */
export function getItem(type: SupportedType, id: string): CollectionItem | null {
  const storage = getOrCreate(type);
  return storage.data.items.find((i) => i.id === id) ?? null;
}

/**
 * Add a new item. Generates id from name if not provided.
 */
export function addItem(
  type: SupportedType,
  fields: Record<string, unknown>
): BackendResult {
  const storage = getOrCreate(type);

  const id =
    (fields.id as string) ||
    (fields.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  if (storage.data.items.find((i) => i.id === id)) {
    return { success: false, message: `Item with id '${id}' already exists in ${type.domain}` };
  }

  const { id: _discard, ...rest } = fields;
  const newItem: CollectionItem = { id, ...rest } as CollectionItem;
  storage.data.items.push(newItem);

  const backupMessage = writeStorage(type.storageKey, storage);
  return { success: true, message: `Added '${id}' to ${type.domain}`, id, backupMessage };
}

/**
 * Update an existing item by merging fields.
 */
export function updateItem(
  type: SupportedType,
  id: string,
  fields: Record<string, unknown>
): BackendResult {
  const storage = getOrCreate(type);
  const idx = storage.data.items.findIndex((i) => i.id === id);
  if (idx === -1) {
    return { success: false, message: `Item '${id}' not found in ${type.domain}` };
  }

  storage.data.items[idx] = { ...storage.data.items[idx], ...fields, id };
  const backupMessage = writeStorage(type.storageKey, storage);
  return { success: true, message: `Updated '${id}' in ${type.domain}`, id, backupMessage };
}

/**
 * Remove an item by id.
 */
export function removeItem(type: SupportedType, id: string): BackendResult {
  const storage = getOrCreate(type);
  const idx = storage.data.items.findIndex((i) => i.id === id);
  if (idx === -1) {
    return { success: false, message: `Item '${id}' not found in ${type.domain}` };
  }

  storage.data.items.splice(idx, 1);
  const backupMessage = writeStorage(type.storageKey, storage);
  return { success: true, message: `Removed '${id}' from ${type.domain}`, id, backupMessage };
}

// ── Helpers ──────────────────────────────────────────────────

function getOrCreate(type: SupportedType): StorageFile<CollectionData> {
  const existing = readStorage<CollectionData>(type.storageKey);
  if (existing) return existing;
  return {
    version: type.schema.storage_version ?? 1,
    minor_version: type.schema.storage_minor_version ?? 1,
    key: type.storageKey,
    data: { items: [] },
  };
}
