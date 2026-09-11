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
import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync, rmdirSync, statSync } from "node:fs";
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

// ── Pi Agent data directory ──────────────────────────────────

/** Root directory for all Pi Agent persistent data. */
export const PI_AGENT_DIR = join(HA_CONFIG_PATH, ".pi-agent");

/** Directory where backups of storage files are kept. */
export const BACKUP_DIR = env("HA_BACKUP_DIR", join(PI_AGENT_DIR, "backups", "storage"));

// ── Legacy migration ────────────────────────────────────────

/**
 * Migrate data from legacy locations into the unified .pi-agent directory.
 * Runs once at import time — moves files then removes old directories.
 */
function migrateLegacy(): void {
  const legacyMap: Array<{ from: string; to: string }> = [
    { from: join(HA_CONFIG_PATH, ".storage-backups"), to: join(PI_AGENT_DIR, "backups", "storage") },
    { from: join(HA_CONFIG_PATH, ".pi-backups", "mutations"), to: join(PI_AGENT_DIR, "backups", "mutations") },
    { from: join(HA_CONFIG_PATH, "pi-agent", "policies.yaml"), to: join(PI_AGENT_DIR, "policies.yaml") },
  ];

  for (const { from, to } of legacyMap) {
    if (!existsSync(from)) continue;
    try {
      const stat = statSync(from);
      if (stat.isDirectory()) {
        mkdirSync(to, { recursive: true });
        for (const file of readdirSync(from)) {
          const src = join(from, file);
          const dst = join(to, file);
          if (!existsSync(dst)) copyFileSync(src, dst);
        }
        // Remove legacy dir (only if we copied everything)
        for (const file of readdirSync(from)) unlinkSync(join(from, file));
        rmdirSync(from);
      } else {
        mkdirSync(dirname(to), { recursive: true });
        if (!existsSync(to)) copyFileSync(from, to);
        unlinkSync(from);
      }
    } catch { /* best-effort — don't block startup */ }
  }

  // Clean up empty legacy parent dirs
  for (const dir of [join(HA_CONFIG_PATH, ".pi-backups"), join(HA_CONFIG_PATH, "pi-agent")]) {
    try { if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir); } catch {}
  }
}

migrateLegacy();

// ── Backup tunables ──────────────────────────────────────────

/** Maximum number of backup files to retain (oldest are pruned). */
export const MAX_BACKUPS = envInt("HA_MAX_BACKUPS", 50);

// ── Mutation backup tunables ─────────────────────────────────

/** Directory for pre-mutation snapshots and changelog. */
export const MUTATION_BACKUP_DIR = env(
  "HA_MUTATION_BACKUP_DIR",
  join(PI_AGENT_DIR, "backups", "mutations")
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
