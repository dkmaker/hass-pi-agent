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
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HA_CONFIG_PATH, PI_AGENT_DIR, HA_URL } from "./config.js";
import { resolveYamlIncludes } from "./graph/yaml-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type WriteGuardMode = "strict" | "warn" | "off";

export function getMode(): WriteGuardMode {
  const raw = process.env.PI_WRITE_GUARD_MODE?.trim().toLowerCase();
  if (raw === "off" || raw === "warn" || raw === "strict") return raw;
  // No explicit mode configured. The write-guard is an add-on RUNTIME protection
  // for a live HA config — it only activates inside the add-on container (HA_URL
  // points at the supervisor proxy). In local dev / the extension author's own
  // session it stays OFF, so it never interferes with editing the extension
  // source or the repo. The add-on always sets PI_WRITE_GUARD_MODE explicitly.
  return HA_URL.includes("supervisor") ? "strict" : "off";
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

// ── allowlist ──────────────────────────────────────────────────
// Resolved FRESH on every check (never cached): the allowed set depends on the
// entire !include tree, and the agent must be able to add a new include and
// then create the file it points at (a cache keyed on configuration.yaml's
// mtime alone would miss both cases — a catch-22). Configs are small; resolving
// per tool-call is cheap enough for a guardrail.
export interface AllowSet {
  root: string; // resolved HA_CONFIG_PATH
  scratch: string; // resolved scratch dir
  files: Set<string>; // exact allowed file paths (config + existing + declared includes)
  dirPrefixes: string[]; // include_dir targets — anything under these is writable
  globs: RegExp[]; // extra user/maintainer globs (relative to root)
}

export function buildAllowSet(): AllowSet {
  const files = new Set<string>();
  const dirPrefixes: string[] = [];
  files.add(resolve(CONFIG_YAML));
  if (existsSync(CONFIG_YAML)) {
    const { sources, includeFiles, includeDirs } = resolveYamlIncludes(CONFIG_YAML);
    for (const s of sources) files.add(resolve(s.path));
    // Declared !include targets — allowed even if not created yet (so the agent
    // can add an include to configuration.yaml and then write the new file).
    for (const f of includeFiles) files.add(resolve(f));
    // Declared !include_dir_* targets — anything under them is writable, incl.
    // brand-new split-config files (and nested subdirs HA recurses into).
    for (const d of includeDirs) dirPrefixes.push(resolve(d));
  }
  return { root: resolve(HA_CONFIG_PATH), scratch: resolve(AGENT_CWD), files, dirPrefixes, globs: loadExtraGlobs() };
}

function isUnder(child: string, parent: string): boolean {
  const r = relative(parent, child);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** Resolve a (possibly relative) write path against the agent cwd. */
export function resolveWritePath(p: string): string {
  return isAbsolute(p) ? resolve(p) : resolve(AGENT_CWD, p);
}

/** Check a resolved path against a prebuilt allow set (no IO). */
export function isPathAllowed(absPath: string, set: AllowSet): boolean {
  const p = resolve(absPath);
  if (!isUnder(p, set.root)) return true; // out of scope (e.g. /data, /tmp, /root)
  if (isUnder(p, set.scratch)) return true; // scratch dir
  if (set.files.has(p)) return true;
  for (const prefix of set.dirPrefixes) if (isUnder(p, prefix)) return true;
  const rel = relative(set.root, p).split("\\").join("/");
  for (const re of set.globs) if (re.test(rel)) return true;
  return false;
}

/**
 * Decide whether a write to `absPath` is allowed. Resolves the allowlist fresh.
 * Paths outside /homeassistant are out of scope → allowed.
 */
export function isWriteAllowed(absPath: string): boolean {
  return isPathAllowed(absPath, buildAllowSet());
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
  const set = buildAllowSet(); // resolve once for the whole command
  for (const t of extractBashWriteTargets(command)) {
    const abs = resolveWritePath(t);
    if (!isPathAllowed(abs, set)) blocked.push(abs);
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
