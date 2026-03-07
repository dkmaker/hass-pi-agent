/**
 * Collection WebSocket backend.
 *
 * Manages the 9 collection helper types via HA's WebSocket API.
 * Changes take effect immediately — no restart needed.
 *
 * WS commands per domain:
 *   {domain}/list                           → list all items
 *   {domain}/create   + fields              → create item (immediate)
 *   {domain}/update   + {domain}_id + fields → update item (immediate)
 *   {domain}/delete   + {domain}_id         → delete item (immediate)
 *
 * Types: input_boolean, input_number, input_text, input_select,
 *        input_datetime, input_button, counter, timer, schedule
 */
import { wsCommand } from "../ws.js";
import type { SupportedType } from "../registry.js";

// ── Types ────────────────────────────────────────────────────

export interface CollectionItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface BackendResult {
  success: boolean;
  message: string;
  id?: string;
}

// ── Backend operations ───────────────────────────────────────

/**
 * List all items for a collection type via WebSocket.
 */
export async function listItems(type: SupportedType): Promise<CollectionItem[]> {
  return wsCommand<CollectionItem[]>(`${type.domain}/list`);
}

/**
 * Get a single item by id (list + filter).
 */
export async function getItem(type: SupportedType, id: string): Promise<CollectionItem | null> {
  const items = await listItems(type);
  return items.find((i) => i.id === id) ?? null;
}

/**
 * Add a new item via WebSocket. Changes are immediate.
 */
export async function addItem(
  type: SupportedType,
  fields: Record<string, unknown>
): Promise<BackendResult> {
  try {
    const result = await wsCommand<CollectionItem>(`${type.domain}/create`, fields);
    return {
      success: true,
      message: `Created '${result.id}' in ${type.domain}`,
      id: result.id,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to create ${type.domain}: ${(err as Error).message}`,
    };
  }
}

/**
 * Update an existing item via WebSocket. Changes are immediate.
 */
export async function updateItem(
  type: SupportedType,
  id: string,
  fields: Record<string, unknown>
): Promise<BackendResult> {
  try {
    const idKey = `${type.domain}_id`;
    await wsCommand(`${type.domain}/update`, { [idKey]: id, ...fields });
    return {
      success: true,
      message: `Updated '${id}' in ${type.domain}`,
      id,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to update ${type.domain} '${id}': ${(err as Error).message}`,
    };
  }
}

/**
 * Remove an item via WebSocket. Changes are immediate.
 */
export async function removeItem(
  type: SupportedType,
  id: string
): Promise<BackendResult> {
  try {
    const idKey = `${type.domain}_id`;
    await wsCommand(`${type.domain}/delete`, { [idKey]: id });
    return {
      success: true,
      message: `Removed '${id}' from ${type.domain}`,
      id,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to remove ${type.domain} '${id}': ${(err as Error).message}`,
    };
  }
}
