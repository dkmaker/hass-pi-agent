/**
 * Central configuration for the Home Assistant Pi extension.
 *
 * Defaults target the add-on container (production):
 *   - Config at /homeassistant
 *   - API via supervisor internal proxy
 *   - SUPERVISOR_TOKEN auto-injected
 *
 * For local dev, set overrides via environment variables or a .env file
 * in cwd (loaded automatically, never overrides existing env vars).
 *
 * All paths, URLs, tokens, and tunables live here.
 * Nothing else in the codebase should hardcode these values.
 */
import { join, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── .env loader (local dev) ─────────────────────────────────
// Loads key=value pairs from .env. Does NOT override existing
// env vars, so container-injected values always win.
const dotenvPaths = [
  join(process.cwd(), ".env"),
  join(process.env.HOME ?? "", ".env"),
];

for (const p of dotenvPaths) {
  try {
    if (existsSync(p)) {
      for (const line of readFileSync(p, "utf-8").split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
      break; // use first .env found
    }
  } catch {
    /* ignore */
  }
}

// ── Helpers ──────────────────────────────────────────────────
function env(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]?.trim();
  return v ? parseInt(v, 10) : fallback;
}

// ── Paths ────────────────────────────────────────────────────

/** Root of the HA config directory. Default: /homeassistant (add-on container). */
export const HA_CONFIG_PATH = env("HA_CONFIG_PATH", "/homeassistant");

/** .storage directory inside the config mount. */
export const HA_STORAGE_DIR = join(HA_CONFIG_PATH, ".storage");

/** Directory where backups of storage files are kept. */
export const BACKUP_DIR = env("HA_BACKUP_DIR", join(HA_CONFIG_PATH, ".storage-backups"));

// ── Backup tunables ──────────────────────────────────────────

/** Maximum number of backup files to retain (oldest are pruned). */
export const MAX_BACKUPS = envInt("HA_MAX_BACKUPS", 50);

// ── Mutation backup tunables ─────────────────────────────────

/** Directory for pre-mutation snapshots and changelog. */
export const MUTATION_BACKUP_DIR = env(
  "HA_MUTATION_BACKUP_DIR",
  join(HA_CONFIG_PATH, ".pi-backups", "mutations")
);

/** Maximum number of mutation backup files to retain. */
export const MAX_MUTATION_BACKUPS = envInt("HA_MAX_MUTATION_BACKUPS", 200);

// ── Home Assistant API ───────────────────────────────────────

/**
 * Base URL for the HA REST API (without trailing /api).
 *   Container: http://supervisor/core  (proxy adds /api prefix)
 *   Local dev: http://10.99.0.13:8123  (direct access)
 * Code appends /api/... to this.
 */
export const HA_URL = env("HA_URL", "http://supervisor/core");

/** Auth token for the HA REST API. Default: SUPERVISOR_TOKEN (add-on container). */
export const HA_TOKEN = env("HA_TOKEN", env("SUPERVISOR_TOKEN", ""));

// ── Docs ─────────────────────────────────────────────────────

/** Persistent data directory for docs index + content cache.
 *  Add-on container: /data/ha-docs
 *  Local dev (HA_URL not supervisor): .pi/extensions/home-assistant/data/ha-docs */
export const DOCS_DATA_DIR = env(
  "HA_DOCS_DATA_DIR",
  HA_URL.includes("supervisor") ? "/data/ha-docs" : join(__dirname, "..", "data", "ha-docs")
);

/** Hour to auto-update docs (0-23). Default: 2 (2 AM). */
export const DOCS_UPDATE_HOUR = envInt("HA_DOCS_UPDATE_HOUR", 2);
