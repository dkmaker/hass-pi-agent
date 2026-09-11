/**
 * Persistent agent notes — contextual annotations on any HA object.
 * Stored as JSON keyed by target ID (entity_id, device_id, etc.).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { PI_AGENT_DIR } from "./config.js";

const NOTES_PATH = join(PI_AGENT_DIR, "notes.json");

export interface AgentNote {
  note: string;
  updated: string; // ISO timestamp
}

type NotesStore = Record<string, AgentNote>;

function loadStore(): NotesStore {
  if (!existsSync(NOTES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(NOTES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveStore(store: NotesStore): void {
  const dir = dirname(NOTES_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(NOTES_PATH, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

export function getNote(targetId: string): AgentNote | null {
  const store = loadStore();
  return store[targetId] ?? null;
}

export function setNote(targetId: string, note: string): AgentNote {
  const store = loadStore();
  const entry: AgentNote = { note, updated: new Date().toISOString() };
  store[targetId] = entry;
  saveStore(store);
  return entry;
}

export function deleteNote(targetId: string): boolean {
  const store = loadStore();
  if (!(targetId in store)) return false;
  delete store[targetId];
  saveStore(store);
  return true;
}

export function listNotes(filter?: { search?: string; domain?: string }): Array<{ id: string } & AgentNote> {
  const store = loadStore();
  let entries = Object.entries(store).map(([id, n]) => ({ id, ...n }));

  if (filter?.domain) {
    const prefix = filter.domain + ".";
    entries = entries.filter((e) => e.id.startsWith(prefix));
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    entries = entries.filter(
      (e) => e.id.toLowerCase().includes(q) || e.note.toLowerCase().includes(q)
    );
  }

  entries.sort((a, b) => b.updated.localeCompare(a.updated));
  return entries;
}

/**
 * Returns a formatted note block to append to tool output, or empty string.
 */
export function appendNoteIfExists(targetId: string): string {
  const n = getNote(targetId);
  if (!n) return "";
  return `\n\n📝 **Agent note** (${n.updated.slice(0, 10)}):\n${n.note}`;
}
