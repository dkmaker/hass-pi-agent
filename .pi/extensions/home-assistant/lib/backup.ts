/**
 * Shared backup module for HA storage file modifications.
 * Creates timestamped backups before any write, rotates to keep max configured.
 */
import { mkdirSync, copyFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { BACKUP_DIR, MAX_BACKUPS, HA_STORAGE_DIR } from "./config.js";

export function getBackupDir(): string {
  return BACKUP_DIR;
}

/**
 * Create a backup of a storage file before modification.
 * Returns the backup file path.
 */
export function backupFile(storageFilePath: string): string {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const name = basename(storageFilePath);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `${name}__${ts}.json`;
  const backupPath = join(BACKUP_DIR, backupName);

  copyFileSync(storageFilePath, backupPath);
  rotateBackups();

  return backupPath;
}

/**
 * Rotate backups: keep only the newest MAX_BACKUPS files.
 */
function rotateBackups(): void {
  if (!existsSync(BACKUP_DIR)) return;

  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort(); // ISO timestamps sort lexicographically

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS);
    for (const f of toDelete) {
      unlinkSync(join(BACKUP_DIR, f));
    }
  }
}

/**
 * List all available backups, optionally filtered by storage key.
 */
export function listBackups(storageKey?: string): string[] {
  if (!existsSync(BACKUP_DIR)) return [];

  let files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  if (storageKey) {
    files = files.filter((f) => f.startsWith(storageKey + "__"));
  }

  return files;
}

/**
 * Restore a backup file to the original storage location.
 * Returns the storage file path that was restored.
 */
export function restoreBackup(backupFilename: string): string {
  const backupPath = join(BACKUP_DIR, backupFilename);
  if (!existsSync(backupPath)) {
    throw new Error(`Backup not found: ${backupFilename}`);
  }

  // Extract original storage key from backup name (everything before __)
  const storageKey = backupFilename.split("__")[0];
  const storagePath = join(HA_STORAGE_DIR, storageKey);

  // Backup the current file before restoring (so we can undo the undo)
  if (existsSync(storagePath)) {
    backupFile(storagePath);
  }

  copyFileSync(backupPath, storagePath);
  return storagePath;
}
