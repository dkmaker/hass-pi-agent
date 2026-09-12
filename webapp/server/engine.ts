/**
 * Real embedded engine (issue #WSWMV / #AJAC6).
 *
 * One ModelRuntime + one AgentSession embedded in-process (no subprocess). Serves
 * the webapp dist/ statically and bridges the live AgentSession event stream to a
 * WebSocket in the same wire shape the frontend already consumes (see src/types.ts),
 * so the existing Lit UI drives the real agent against the dev VM. Single-flight:
 * one running turn at a time.
 *
 *   cd webapp && npx tsx server/engine.ts       # → http://127.0.0.1:8771
 *
 * Local dev config comes from the repo .env (HA_URL/HA_TOKEN/HA_CONFIG_PATH).
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, resolveCliModel, type AgentSession, type AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const distDir = resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PI_ENGINE_PORT ?? 8771);

// ── repo .env → process.env (local dev only; in the add-on, env comes from
// s6 container_environment so this file is absent — tolerate that).
try {
  for (const line of readFileSync(resolve(repoRoot, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env (container) */ }

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

// ── Stats overview (real, off the HA API) ───────────────────
interface StatsOverview { entities: number; automations: number; scripts: number; lights: number; sensors: number; areas: number; }
let statsCache: StatsOverview | null = null;
async function fetchStats(): Promise<StatsOverview | null> {
  if (statsCache) return statsCache;
  const url = process.env.HA_URL, token = process.env.HA_TOKEN;
  if (!url || !token) return null;
  const template = `{"entities": {{ states | list | count }}, "automations": {{ states.automation | list | count }}, "scripts": {{ states.script | list | count }}, "lights": {{ states.light | list | count }}, "sensors": {{ states.sensor | list | count }}, "areas": {{ areas() | list | count }}}`;
  try {
    const r = await fetch(`${url}/api/template`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ template }) });
    if (!r.ok) return null;
    statsCache = JSON.parse(await r.text()) as StatsOverview;
    return statsCache;
  } catch { return null; }
}

// ── Boot the embedded agent ─────────────────────────────────
// Load ONLY the Home Assistant extension, explicitly — no cwd/.pi auto-discovery,
// no dev-env tool leak. Configurable path so the add-on points at /opt/ha-extension.
const HA_EXTENSION = process.env.HA_EXTENSION_PATH || resolve(repoRoot, ".pi", "extensions", "home-assistant", "index.ts");
// Agent working dir = the HA agent scratch (mounted config in dev, /homeassistant/agent in prod).
const agentCwd = process.env.HA_CONFIG_PATH ? resolve(process.env.HA_CONFIG_PATH, "agent") : resolve(repoRoot, ".engine-scratch");
// Isolated agentDir/auth so nothing auto-discovers AND we never read the operator's
// global ~/.pi auth.json (which holds a subscription Anthropic rejects here). Auth
// comes ONLY from add-on-config env keys (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, …).
const engineAgentDir = process.env.PI_ENGINE_AGENTDIR || resolve(__dirname, "..", ".engine-agentdir");
mkdirSync(agentCwd, { recursive: true });
mkdirSync(engineAgentDir, { recursive: true });

console.log("[engine] booting ModelRuntime…");
const modelRuntime = await ModelRuntime.create({
  authPath: resolve(engineAgentDir, "auth.json"),
  modelsPath: resolve(engineAgentDir, "models.json"),
});

const loader = new DefaultResourceLoader({
  cwd: agentCwd,
  agentDir: engineAgentDir,
  additionalExtensionPaths: [HA_EXTENSION],
});
await loader.reload();

// Model comes from the add-on config ONLY: default_provider/default_model, surfaced
// as PI_DEFAULT_PROVIDER / PI_DEFAULT_MODEL (same env the ttyd entrypoint reads).
let model;
const modelSpec = process.env.PI_DEFAULT_PROVIDER && process.env.PI_DEFAULT_MODEL
  ? `${process.env.PI_DEFAULT_PROVIDER}/${process.env.PI_DEFAULT_MODEL}`
  : (process.env.PI_DEFAULT_MODEL ?? "");
if (modelSpec) {
  const r = resolveCliModel({ cliModel: modelSpec, modelRuntime });
  if (r.error) console.error("[engine] model resolve error:", r.error);
  else { model = r.model; if (r.warning) console.warn("[engine]", r.warning); }
}

// The active session is mutable — /new and resume replace it (re-subscribing toWire).
let session!: AgentSession;
let unsub: (() => void) | null = null;
let currentSm: ReturnType<typeof SessionManager.create> | null = null;
const TOPIC_MIN_MESSAGES = 10;

// ── WS clients + event fan-out ──────────────────────────────
const clients = new Set<WebSocket>();
let busy = false;

// Global single-flight lock: interactive prompts acquire immediately (reject if
// held); pi_agent.ask calls QUEUE behind whatever is running (never concurrent).
let lockHeld = false;
const askWaiters: Array<() => void> = [];
function acquireNow(): boolean { if (lockHeld) return false; lockHeld = true; return true; }
function releaseLock(): void { lockHeld = false; const next = askWaiters.shift(); if (next) { lockHeld = true; next(); } }
function acquireQueued(): Promise<void> { return new Promise((res) => { if (!lockHeld) { lockHeld = true; res(); } else askWaiters.push(res); }); }

function broadcast(msg: unknown): void {
  const s = JSON.stringify(msg);
  for (const ws of clients) { try { ws.send(s); } catch { /* dropped */ } }
}

/** Map a real AgentSessionEvent → the frontend wire shape (src/types.ts ServerEvent). */
function toWire(e: AgentSessionEvent): void {
  switch (e.type) {
    case "agent_start": broadcast({ type: "agent_start" }); broadcast({ type: "working", label: "Thinking" }); break;
    case "message_start": broadcast({ type: "working", label: "" }); broadcast({ type: "message_start" }); break;
    case "message_update": {
      const a = (e as { assistantMessageEvent?: { type: string; delta?: string } }).assistantMessageEvent;
      if (a?.type === "text_delta" && a.delta) broadcast({ type: "text_delta", delta: a.delta });
      else if (a?.type === "thinking_delta" && a.delta) broadcast({ type: "thinking_delta", delta: a.delta });
      break;
    }
    case "message_end": broadcast({ type: "message_end" }); break;
    case "tool_execution_start": {
      const t = e as { toolName?: string; toolCallId?: string; id?: string; args?: unknown; input?: unknown };
      broadcast({ type: "working", label: "" });
      broadcast({ type: "tool_start", id: t.toolCallId ?? t.id ?? "", toolName: t.toolName ?? "tool", args: (t.args ?? t.input ?? {}) as Record<string, unknown> });
      break;
    }
    case "tool_execution_end": {
      const t = e as { toolName?: string; toolCallId?: string; id?: string; isError?: boolean; result?: { content?: Array<{ type: string; text?: string }> } };
      const text = (t.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      broadcast({ type: "tool_end", id: t.toolCallId ?? t.id ?? "", toolName: t.toolName ?? "tool", isError: !!t.isError, result: { kind: "text", data: text } });
      break;
    }
    case "turn_end": broadcast({ type: "turn_end" }); break;
    case "agent_end": broadcast({ type: "agent_end" }); busy = false; break;
    default: break; // queue_update / compaction_* / auto_retry_* — not surfaced yet
  }
}
async function handlePrompt(text: string): Promise<void> {
  if (!acquireNow()) { broadcast({ type: "notice", text: "Busy — one turn at a time." }); return; }
  busy = true;
  try {
    await session.prompt(text);
  } catch (err) {
    broadcast({ type: "text_delta", delta: `\n[engine error: ${(err as Error).message}]` });
    broadcast({ type: "agent_end" });
  } finally {
    busy = false;
    releaseLock();
  }
  void maybeGenerateTopic();
}

// ── Auto-topic: once a chat has ~10 messages, generate a short session title
// via a one-shot model call and persist it into the transcript (appendSessionInfo),
// so the header/list stop saying "New chat". Runs single-flight; best-effort.
function msgText(m: Record<string, unknown>): string {
  return ((m.content ?? []) as Array<Record<string, unknown>>)
    .filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join(" ").trim();
}

async function generateTopic(msgs: Array<Record<string, unknown>>): Promise<string> {
  const s = (await createAgentSession({ resourceLoader: loader, cwd: agentCwd, sessionManager: SessionManager.inMemory(agentCwd), model, modelRuntime })).session;
  const excerpt = msgs.filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, 8).map((m) => `${m.role}: ${msgText(m)}`).join("\n").slice(0, 2000);
  let out = "";
  const off = s.subscribe((e) => {
    const a = (e as { assistantMessageEvent?: { type: string; delta?: string } }).assistantMessageEvent;
    if (e.type === "message_update" && a?.type === "text_delta" && a.delta) out += a.delta;
  });
  const timer = setTimeout(() => { void s.abort().catch(() => {}); }, 60_000);
  try {
    await s.prompt(`Give a very short topic title (3-5 words; use the chat's language, e.g. Danish) for this Home Assistant conversation. Do NOT use any tools. Reply with ONLY the title — no quotes, no punctuation.\n\n${excerpt}`);
  } catch { /* ignore */ } finally {
    clearTimeout(timer); off(); try { s.dispose(); } catch { /* ignore */ }
  }
  return out.trim().replace(/^["'#\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 64);
}

async function maybeGenerateTopic(): Promise<void> {
  try {
    if (!currentSm || currentSm.getSessionName()) return;
    if ((session.messages ?? []).length < TOPIC_MIN_MESSAGES) return;
    if (!acquireNow()) return; // user busy — retry after the next turn
    busy = true;
    let title = "";
    try { title = await generateTopic((session.messages ?? []) as Array<Record<string, unknown>>); }
    finally { busy = false; releaseLock(); }
    if (title && currentSm && !currentSm.getSessionName()) {
      currentSm.appendSessionInfo(title);
      broadcast({ type: "session_title", title });
    }
  } catch { /* best-effort */ }
}

// ── pi_agent.ask: queued fresh-context one-shot (voice/automation entry) ──
const ASK_TIMEOUT_MS = 10 * 60 * 1000;
const ASK_MAX_PENDING = 5;
let askPending = 0;

async function fireLogbook(name: string, message: string): Promise<void> {
  const url = process.env.HA_URL, token = process.env.HA_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/api/events/logbook_entry`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, message, domain: "pi_agent" }) });
  } catch { /* best-effort */ }
}

async function handleAsk(question: string, overrides: { provider?: string; model?: string }): Promise<void> {
  await acquireQueued(); // wait behind any running interactive/ask turn
  let askModel = model;
  if (overrides.provider && overrides.model) {
    const r = resolveCliModel({ cliModel: `${overrides.provider}/${overrides.model}`, modelRuntime });
    if (!r.error) askModel = r.model;
  }
  const askSession = (await createAgentSession({ resourceLoader: loader, cwd: agentCwd, sessionManager: SessionManager.inMemory(agentCwd), model: askModel, modelRuntime })).session;
  let answer = "";
  const unsub = askSession.subscribe((e) => {
    const a = (e as { assistantMessageEvent?: { type: string; delta?: string } }).assistantMessageEvent;
    if (e.type === "message_update" && a?.type === "text_delta" && a.delta) answer += a.delta;
  });
  const timer = setTimeout(() => { void askSession.abort().catch(() => {}); }, ASK_TIMEOUT_MS);
  try {
    await askSession.prompt(question);
  } catch (err) {
    if (!answer) answer = `(error: ${(err as Error).message})`;
  } finally {
    clearTimeout(timer);
    unsub();
    try { askSession.dispose(); } catch { /* ignore */ }
    releaseLock();
  }
  await fireLogbook("Pi Agent", answer.trim() || "(no answer)");
}

// ── Session lifecycle: /new, /sessions list, resume ───────
async function startSession(sm: ReturnType<typeof SessionManager.create>): Promise<void> {
  if (unsub) { unsub(); unsub = null; }
  if (session) { try { session.dispose(); } catch { /* ignore */ } }
  const created = await createAgentSession({ resourceLoader: loader, cwd: agentCwd, sessionManager: sm, model, modelRuntime });
  session = created.session;
  currentSm = sm;
  unsub = session.subscribe(toWire);
  busy = false;
}

function relTime(iso?: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

async function listSessions(): Promise<Array<{ path: string; id: string; title: string; when: string; count: number }>> {
  const list = (await SessionManager.list(agentCwd)) as Array<Record<string, unknown>>;
  return list
    .map((s) => ({
      path: String(s.path ?? ""),
      id: String(s.id ?? ""),
      title: (String(s.name ?? "").trim() || String(s.firstMessage ?? "").trim() || "Chat").slice(0, 64),
      when: relTime((s.modified ?? s.created) as string),
      count: Number(s.messageCount ?? 0),
      _t: new Date(String(s.modified ?? s.created ?? 0)).getTime(),
    }))
    .filter((s) => s.count > 0 && s.path)
    .sort((a, b) => b._t - a._t)
    .map(({ _t, ...s }) => s);
}

/** Reconstruct the frontend timeline (src/types.ts Entry[]) from a resumed session's messages. */
function historyEntries(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const toolById: Record<string, Record<string, unknown>> = {};
  let n = 0;
  const nid = () => `h${n++}`;
  for (const m of (session.messages ?? []) as Array<Record<string, unknown>>) {
    const role = m.role as string;
    const content = (m.content ?? []) as Array<Record<string, unknown>>;
    if (role === "user") {
      const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
      if (text) out.push({ kind: "user", id: nid(), text });
    } else if (role === "assistant") {
      let text = "";
      for (const c of content) {
        if (c.type === "text") text += (c.text as string) ?? "";
        else if (c.type === "toolCall") {
          const id = String(c.toolCallId ?? c.id ?? nid());
          const entry = { kind: "tool", id, toolName: String(c.toolName ?? c.name ?? "tool"), args: (c.args ?? c.input ?? {}) as Record<string, unknown>, running: false, isError: false, result: { kind: "text", data: "" } };
          toolById[id] = entry;
          out.push(entry);
        }
      }
      if (text.trim()) out.push({ kind: "assistant", id: nid(), text: text.trim(), thinking: "", streaming: false });
    } else if (role === "toolResult") {
      const id = String(m.toolCallId ?? content[0]?.toolCallId ?? "");
      const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      const e = toolById[id];
      if (e) { e.result = { kind: "text", data: text }; e.isError = !!m.isError; }
    }
  }
  return out;
}

await startSession(SessionManager.create(agentCwd));
console.log("[engine] ready — model=%s tools=%d (ha_*=%d)",
  session.model?.id ?? "(default)",
  session.agent.state.tools.length,
  session.agent.state.tools.filter((t) => t.name.startsWith("ha_")).length);

// ── HTTP static (webapp/dist) ───────────────────────────────
const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? "/").split("?")[0];
    let file = join(distDir, url === "/" ? "index.html" : url.replace(/^\/+/, ""));
    try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { file = join(distDir, "index.html"); }
    if (!file.startsWith(distDir)) { res.writeHead(403).end(); return; }
    let body: Buffer;
    try { body = await readFile(file); } catch { body = await readFile(join(distDir, "index.html")); file = join(distDir, "index.html"); }
    const ext = extname(file);
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable" });
    res.end(body);
  } catch { res.writeHead(500).end("server error"); }
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  const sendTo = (msg: unknown) => { try { ws.send(JSON.stringify(msg)); } catch { /* dropped */ } };
  void fetchStats().then((s) => { if (s) sendTo({ type: "stats", data: s }); });
  void listSessions().then((s) => sendTo({ type: "sessions", data: s }));
  ws.on("message", (raw) => {
    let cmd: { type?: string; text?: string; path?: string };
    try { cmd = JSON.parse(String(raw)); } catch { return; }
    switch (cmd.type) {
      case "prompt": if (cmd.text) void handlePrompt(cmd.text); break;
      case "abort": void session.abort().then(() => broadcast({ type: "aborted" })); break;
      case "list_sessions": void listSessions().then((s) => sendTo({ type: "sessions", data: s })); break;
      case "new_session": void startSession(SessionManager.create(agentCwd)).then(() => broadcast({ type: "session_cleared" })); break;
      case "open_session": if (cmd.path) void startSession(SessionManager.open(cmd.path)).then(() => broadcast({ type: "history", data: historyEntries() })); break;
    }
  });
  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, "0.0.0.0", () => console.log(`[engine] http+ws on http://127.0.0.1:${PORT}`));

// ── pi_agent.ask API (internal, port 9199) — preserves the HA component contract ──
const ASK_PORT = Number(process.env.PI_ASK_PORT ?? 9199);
const askServer = createServer((req, res) => {
  const j = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "POST" && req.url === "/ask") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let parsed: { question?: unknown; provider?: string; model?: string };
      try { parsed = JSON.parse(body); } catch { j(400, { error: "Invalid JSON" }); return; }
      if (!parsed.question || typeof parsed.question !== "string") { j(400, { error: "Missing 'question' field" }); return; }
      if (askPending >= ASK_MAX_PENDING) { j(429, { error: "Too many pending requests" }); return; }
      askPending += 1;
      void handleAsk(parsed.question, { provider: parsed.provider, model: parsed.model }).finally(() => { askPending -= 1; });
      j(202, { status: "accepted" });
    });
  } else if (req.method === "GET" && req.url === "/health") {
    j(200, { status: "ok", pending: askPending, busy: lockHeld });
  } else {
    res.writeHead(404).end();
  }
});
askServer.listen(ASK_PORT, "0.0.0.0", () => console.log(`[engine] ask API on :${ASK_PORT}/ask`));
