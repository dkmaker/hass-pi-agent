/**
 * Filesystem write-guard — a pragmatic guardrail (NOT a security sandbox).
 *
 * The agent runs with cwd = /homeassistant/agent. This module decides whether a
 * given write target under /homeassistant is allowed. Allowed targets:
 *   1. anything under the scratch dir (/homeassistant/agent)
 *   2. configuration.yaml and every file reachable from it via !include*
 *   3. new files inside !include_dir_* directories
 *   4. extra globs from the shipped write-guard.json + user config (write_guard_allow)
 *
 * Anything else under /homeassistant is blocked for the built-in write/edit tools
 * and for OBVIOUS bash write patterns. Paths outside /homeassistant are out of
 * scope (the concern is HA config integrity) and always pass.
 *
 * This only gates the built-in write/edit/bash tools. Custom ha_* tools (incl.
 * ha_yaml) have their own sanctioned IO + backups and are never gated here.
 */
import { resolve, dirname, relative, isAbsolute, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HA_CONFIG_PATH, PI_AGENT_DIR } from "./config.js";
import { resolveYamlIncludes } from "./graph/yaml-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type WriteGuardMode = "strict" | "warn" | "off";

export function getMode(): WriteGuardMode {
  const m = (process.env.PI_WRITE_GUARD_MODE || "strict").trim().toLowerCase();
  return m === "off" || m === "warn" ? m : "strict";
}

/** Agent cwd — relative write paths resolve against this. */
const AGENT_CWD = PI_AGENT_DIR; // /homeassistant/agent
const CONFIG_YAML = join(HA_CONFIG_PATH, "configuration.yaml");

// ── glob matching (minimal) ──────────────────────────────────
function globToRe(glob: string): RegExp {
  let g = glob.trim().replace(/^\.?\//, "");
  if (g.endsWith("/")) g += "**";
  const re = g
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp("^" + re + "$");
}

function loadExtraGlobs(): RegExp[] {
  const patterns: string[] = [];
  // Shipped maintainer baseline (write-guard.json next to index.ts)
  try {
    const raw = readFileSync(join(__dirname, "..", "write-guard.json"), "utf-8");
    const j = JSON.parse(raw);
    if (Array.isArray(j.allow)) patterns.push(...j.allow.filter((x: unknown) => typeof x === "string"));
  } catch { /* no shipped file — fine */ }
  // User additions (add-on option -> env, delimited by , : or newline)
  const user = (process.env.PI_WRITE_GUARD_ALLOW || "").split(/[,:\n]/).map((s) => s.trim()).filter(Boolean);
  patterns.push(...user);
  return patterns.map(globToRe);
}

// ── allowlist (cached, invalidated on configuration.yaml mtime) ──
interface AllowSet {
  files: Set<string>; // exact allowed file paths (config + includes)
  dirs: Set<string>; // include_dir_* target dirs (new files allowed within)
  globs: RegExp[]; // extra user/maintainer globs (relative to HA_CONFIG_PATH)
}

let cache: { mtime: number; set: AllowSet } | null = null;

function configMtime(): number {
  try { return statSync(CONFIG_YAML).mtimeMs; } catch { return 0; }
}

function buildAllowSet(): AllowSet {
  const files = new Set<string>();
  const dirs = new Set<string>();
  files.add(resolve(CONFIG_YAML));
  const configDir = resolve(HA_CONFIG_PATH);
  if (existsSync(CONFIG_YAML)) {
    const { sources } = resolveYamlIncludes(CONFIG_YAML);
    for (const s of sources) {
      const p = resolve(s.path);
      files.add(p);
      // The containing dir of an included file is an include target dir —
      // allow creating sibling split-config files there. Never the config root.
      const d = dirname(p);
      if (d !== configDir) dirs.add(d);
    }
  }
  return { files, dirs, globs: loadExtraGlobs() };
}

function getAllowSet(): AllowSet {
  const mtime = configMtime();
  if (!cache || cache.mtime !== mtime) {
    cache = { mtime, set: buildAllowSet() };
  }
  return cache.set;
}

function isUnder(child: string, parent: string): boolean {
  const r = relative(parent, child);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** Resolve a (possibly relative) write path against the agent cwd. */
export function resolveWritePath(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(AGENT_CWD, p);
}

/**
 * Decide whether a write to `absPath` is allowed.
 * Paths outside /homeassistant are out of scope → allowed.
 */
export function isWriteAllowed(absPath: string): boolean {
  const p = resolve(absPath);
  const root = resolve(HA_CONFIG_PATH);
  if (!isUnder(p, root)) return true; // out of scope (e.g. /data, /tmp, /root)
  if (isUnder(p, resolve(AGENT_CWD))) return true; // scratch dir
  const set = getAllowSet();
  if (set.files.has(p)) return true;
  if (set.dirs.has(dirname(p))) return true;
  const rel = relative(root, p).split("\\").join("/");
  for (const re of set.globs) if (re.test(rel)) return true;
  return false;
}

// ── bash heuristics (obvious write patterns only) ───────────────
// Split on shell operators, then scan each segment for write targets.
const SEG_SPLIT = /[;|]|&&|\|\||\n/;

/** Extract obvious write-target paths from a bash command. Best-effort. */
export function extractBashWriteTargets(command: string): string[] {
  const targets: string[] = [];
  const push = (t?: string) => {
    if (!t) return;
    const tok = t.replace(/^["']|["']$/g, "");
    if (!tok || tok.startsWith("-")) return;
    targets.push(tok);
  };
  for (const seg of command.split(SEG_SPLIT)) {
    // redirections: >, >>, N>, >|  (capture following token)
    for (const m of seg.matchAll(/\d*>>?\|?\s*("[^"]+"|'[^']+'|[^\s;|&>]+)/g)) push(m[1]);
    const tokens = seg.trim().split(/\s+/);
    if (tokens.length === 0) continue;
    const cmd = tokens[0].replace(/^.*\//, ""); // strip path to binary
    const args = tokens.slice(1);
    const nonFlag = args.filter((a) => !a.startsWith("-"));
    switch (cmd) {
      case "tee":
        nonFlag.forEach(push);
        break;
      case "rm":
      case "touch":
      case "mkdir":
      case "rmdir":
      case "truncate":
      case "unlink":
        nonFlag.forEach(push);
        break;
      case "sed":
        if (args.some((a) => a === "-i" || a.startsWith("-i") || a === "--in-place")) {
          // last non-flag token is the file
          push(nonFlag[nonFlag.length - 1]);
        }
        break;
      case "mv":
      case "cp":
      case "install":
      case "ln":
        // destination = last non-flag token
        push(nonFlag[nonFlag.length - 1]);
        break;
      case "dd":
        for (const a of args) if (a.startsWith("of=")) push(a.slice(3));
        break;
      default:
        break;
    }
  }
  return targets;
}

export interface BashCheck { allowed: boolean; blocked: string[]; }

/** Check a bash command's obvious write targets against the allowlist. */
export function checkBashCommand(command: string): BashCheck {
  const blocked: string[] = [];
  for (const t of extractBashWriteTargets(command)) {
    const abs = resolveWritePath(t);
    if (!isWriteAllowed(abs)) blocked.push(abs);
  }
  return { allowed: blocked.length === 0, blocked };
}

/** Build a clear, actionable block reason. */
export function blockReason(target: string): string {
  return (
    `Write blocked by the Home Assistant write-guard: "${target}" is outside the ` +
    `allowed set. The agent may write to its scratch dir (${AGENT_CWD}), to ` +
    `configuration.yaml, and to files it !includes. For registry/state changes ` +
    `use the ha_* tools; to edit YAML config use ha_yaml. To permanently allow a ` +
    `path, add a glob to the add-on option "write_guard_allow" (e.g. "custom_components/**").`
  );
}
