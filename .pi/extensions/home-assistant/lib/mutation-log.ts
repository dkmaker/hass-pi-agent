/**
 * Pre-mutation backup system.
 *
 * Before any write/update/delete action, tools call backupBeforeMutation()
 * to snapshot the current state. Snapshots are stored as JSON files and
 * every mutation is logged to a JSONL changelog for audit trail & rollback.
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { MUTATION_BACKUP_DIR, MAX_MUTATION_BACKUPS } from "./config.js";

// ── Types ────────────────────────────────────────────────────

export interface MutationLogEntry {
  ts: string;
  tool: string;
  action: string;
  target: string;
  backupFile: string;
  summary: string;
}

// ── Paths ────────────────────────────────────────────────────

function ensureDir(): void {
  mkdirSync(MUTATION_BACKUP_DIR, { recursive: true });
}

function changelogPath(): string {
  return join(MUTATION_BACKUP_DIR, "changelog.jsonl");
}

// ── Core: backup before mutation ─────────────────────────────

/**
 * Snapshot the current state before a mutation.
 * Writes a JSON backup file and appends a JSONL changelog entry.
 *
 * @param tool   - Tool name (e.g. "ha_entities")
 * @param action - Action name (e.g. "update", "delete")
 * @param target - Target identifier (e.g. entity_id, area_id)
 * @param state  - Current state object to snapshot
 * @param summary - Optional human-readable summary of what's about to change
 * @returns The backup filename
 */
export function backupBeforeMutation(
  tool: string,
  action: string,
  target: string,
  state: unknown,
  summary?: string
): string {
  ensureDir();

  const ts = new Date().toISOString();
  const safeName = `${target}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const tsFile = ts.replace(/[:.]/g, "-");
  const backupName = `${tsFile}__${tool}__${action}__${safeName}.json`;
  const backupPath = join(MUTATION_BACKUP_DIR, backupName);

  // Write snapshot
  writeFileSync(backupPath, JSON.stringify(state, null, 2), "utf-8");

  // Append changelog entry
  const entry: MutationLogEntry = {
    ts,
    tool,
    action,
    target,
    backupFile: backupName,
    summary: summary ?? `${action} ${target}`,
  };
  appendFileSync(changelogPath(), JSON.stringify(entry) + "\n", "utf-8");

  // Rotate old backups
  rotateBackups();

  return backupName;
}

// ── Read changelog ───────────────────────────────────────────

export interface ChangelogFilter {
  tool?: string;
  action?: string;
  target?: string;
  limit?: number;
}

/**
 * Read changelog entries, newest first.
 */
export function readChangelog(filter?: ChangelogFilter): MutationLogEntry[] {
  const path = changelogPath();
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  let entries: MutationLogEntry[] = lines.map((l) => JSON.parse(l));

  // Reverse for newest-first
  entries.reverse();

  if (filter?.tool) {
    entries = entries.filter((e) => e.tool === filter.tool);
  }
  if (filter?.action) {
    entries = entries.filter((e) => e.action === filter.action);
  }
  if (filter?.target) {
    const t = filter.target.toLowerCase();
    entries = entries.filter((e) => e.target.toLowerCase().includes(t));
  }

  const limit = filter?.limit ?? 50;
  return entries.slice(0, limit);
}

// ── List / show / purge backups ──────────────────────────────

/**
 * List backup snapshot files, newest first.
 */
export function listMutationBackups(filter?: { tool?: string; target?: string }): string[] {
  if (!existsSync(MUTATION_BACKUP_DIR)) return [];

  let files = readdirSync(MUTATION_BACKUP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (filter?.tool) {
    files = files.filter((f) => f.includes(`__${filter.tool}__`));
  }
  if (filter?.target) {
    const t = filter.target.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
    files = files.filter((f) => f.toLowerCase().includes(t));
  }

  return files;
}

/**
 * Read a backup snapshot file and return its contents.
 */
export function showMutationBackup(filename: string): unknown {
  const path = join(MUTATION_BACKUP_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Backup not found: ${filename}`);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Purge old backups beyond the configured limit.
 * Returns the number of files removed.
 */
export function purgeMutationBackups(keepCount?: number): number {
  if (!existsSync(MUTATION_BACKUP_DIR)) return 0;

  const max = keepCount ?? MAX_MUTATION_BACKUPS;
  const files = readdirSync(MUTATION_BACKUP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort(); // oldest first

  if (files.length <= max) return 0;

  const toDelete = files.slice(0, files.length - max);
  for (const f of toDelete) {
    unlinkSync(join(MUTATION_BACKUP_DIR, f));
  }
  return toDelete.length;
}

// ── Internal: rotate ─────────────────────────────────────────

function rotateBackups(): void {
  purgeMutationBackups();
}
