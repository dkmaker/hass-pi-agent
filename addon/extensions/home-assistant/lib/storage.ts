/**
 * Shared HA storage file read/write with mandatory backup.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { backupFile } from "./backup.js";
import { HA_STORAGE_DIR } from "./config.js";

export interface StorageFile<T = unknown> {
  version: number;
  minor_version: number;
  key: string;
  data: T;
}

export function storagePath(key: string): string {
  return join(HA_STORAGE_DIR, key);
}

export function storageExists(key: string): boolean {
  return existsSync(storagePath(key));
}

/**
 * Read a storage file. Returns null if it doesn't exist.
 */
export function readStorage<T = unknown>(key: string): StorageFile<T> | null {
  const p = storagePath(key);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

/**
 * Write a storage file. ALWAYS creates a backup first.
 * If the file already exists, backs it up. Then writes the new content.
 */
export function writeStorage<T = unknown>(key: string, data: StorageFile<T>): string {
  const p = storagePath(key);
  let backupPath: string | null = null;

  if (existsSync(p)) {
    backupPath = backupFile(p);
  }

  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");

  return backupPath
    ? `Backup created: ${backupPath}`
    : `New file created: ${p} (no prior backup needed)`;
}
