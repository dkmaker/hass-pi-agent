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

// ── Model + provider config (in-app setup: issue #RPRNX) ────
// Persisted canonically to the add-on's Supervisor options (survives restart,
// update, and reinstall). The engine reads its own options on boot and writes
// them back on save via the Supervisor API. The API key applies to the live
// runtime via setRuntimeApiKey (in-memory) — re-applied on every boot from the
// stored option. Env (PI_DEFAULT_*/ambient key vars) is a local-dev fallback.
const API_KEY_PROVIDERS = ["anthropic", "openai", "google", "openrouter", "xai", "groq", "mistral", "cerebras", "huggingface"];
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google (Gemini)", openrouter: "OpenRouter",
  xai: "xAI (Grok)", groq: "Groq", mistral: "Mistral", cerebras: "Cerebras", huggingface: "Hugging Face",
};
const SUPERVISOR = "http://supervisor";
const supervisorToken = (): string | undefined => process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN;

async function readAddonOptions(): Promise<Record<string, unknown>> {
  const tok = supervisorToken();
  if (!tok) return {};
  try {
    const r = await fetch(`${SUPERVISOR}/addons/self/info`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return {};
    const j = (await r.json()) as { data?: { options?: Record<string, unknown> } };
    return j.data?.options ?? {};
  } catch { return {}; }
}
async function writeAddonOptions(patch: Record<string, unknown>): Promise<boolean> {
  const tok = supervisorToken();
  if (!tok) return false;
  try {
    const current = await readAddonOptions();
    const r = await fetch(`${SUPERVISOR}/addons/self/options`, {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ options: { ...current, ...patch } }),
    });
    return r.ok;
  } catch { return false; }
}
// AI config is grouped under the `ai` option (renders as a collapsed section in
// the Supervisor UI). Read/write it as a nested object.
async function readAi(): Promise<{ provider?: string; model?: string; api_key?: string }> {
  const ai = (await readAddonOptions()).ai;
  return ai && typeof ai === "object" ? (ai as { provider?: string; model?: string; api_key?: string }) : {};
}

// Web search config lives under the `websearch` option (app-managed, like `ai`).
// The in-app setup writes it; init-pi maps it to WEBSEARCH_* env at boot; the
// extension registers the web_search tool from that env at loader.reload().
const WS_PROVIDERS = ["perplexity", "perplexity_openrouter", "brave"] as const;
type WsProvider = typeof WS_PROVIDERS[number];
async function readWebsearch(): Promise<{ enabled?: boolean; provider?: string; api_key?: string }> {
  const ws = (await readAddonOptions()).websearch;
  return ws && typeof ws === "object" ? (ws as { enabled?: boolean; provider?: string; api_key?: string }) : {};
}
let wsEnabled = false;
let wsProvider = "perplexity";

let curProvider = "";
let curModel = "";
let model;
{
  const ai = await readAi();
  curProvider = ai.provider || process.env.PI_DEFAULT_PROVIDER || "";
  curModel = ai.model || process.env.PI_DEFAULT_MODEL || "";
  if (curProvider && ai.api_key) {
    try { await modelRuntime.setRuntimeApiKey(curProvider, ai.api_key); }
    catch (e) { console.error("[engine] apply stored key:", (e as Error).message); }
  }
  const spec = curProvider && curModel ? `${curProvider}/${curModel}` : (process.env.PI_DEFAULT_MODEL ?? "");
  if (spec) {
    const r = resolveCliModel({ cliModel: spec, modelRuntime });
    if (r.error) console.error("[engine] model resolve error:", r.error);
    else { model = r.model; if (r.warning) console.warn("[engine]", r.warning); }
  }
}
{
  const ws = await readWebsearch();
  wsProvider = ws.provider || "perplexity";
  wsEnabled = !!ws.enabled && !!ws.api_key;
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
      const t = e as { toolName?: string; toolCallId?: string; id?: string; isError?: boolean; result?: { content?: Array<{ type: string; text?: string }>; details?: unknown } };
      const text = (t.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      // Only treat as structured when details carries a real HaDetails `kind`.
      // A stray/empty `details: {}` must fall back to the markdown text, else the
      // UI renders an empty block (it has no kind to render).
      const details = t.result?.details as { kind?: string } | undefined;
      const result = details && details.kind ? { kind: "details", details, data: text } : { kind: "text", data: text };
      broadcast({ type: "tool_end", id: t.toolCallId ?? t.id ?? "", toolName: t.toolName ?? "tool", isError: !!t.isError, result });
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
    await s.prompt(`Give a very short topic title (3-5 words) for this Home Assistant conversation, written in the SAME language the user writes in (Danish if the user writes Danish, otherwise English). Do NOT use any tools. Reply with ONLY the title — no quotes, no punctuation.\n\n${excerpt}`);
  } catch { /* ignore */ } finally {
    clearTimeout(timer); off(); try { s.dispose(); } catch { /* ignore */ }
  }
  return out.trim().replace(/^["'#\s]+|["'\s]+$/g, "").split("\n")[0].slice(0, 64);
}

async function maybeGenerateTopic(): Promise<void> {
  try {
    if (!session || !currentSm || currentSm.getSessionName()) return;
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
  currentSm = sm;
  // Not configured yet (no provider/model/key) — defer session creation until the
  // in-app setup saves a working combo (saveCombo sets `model` then calls this).
  if (!model) return;
  const created = await createAgentSession({ resourceLoader: loader, cwd: agentCwd, sessionManager: sm, model, modelRuntime });
  session = created.session;
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
if (session) {
  console.log("[engine] ready — model=%s tools=%d (ha_*=%d)",
    session.model?.id ?? "(default)",
    session.agent.state.tools.length,
    session.agent.state.tools.filter((t) => t.name.startsWith("ha_")).length);
} else {
  console.log("[engine] ready — awaiting in-app provider/model/key setup");
}

// ── In-app config API (issue #RPRNX) ────────────────────────
// Lists api-key providers+models, validates a provider/model/key combo with a
// tiny live completion, and saves (persist key→auth.json + model→selection.json,
// then apply live by rebuilding the active session). The webapp welcome/COG UI
// drives these; the Supervisor add-on config no longer holds credentials.
async function listApiKeyProviders(): Promise<Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>> {
  // Refresh dynamic catalogs (e.g. OpenRouter) best-effort; static ones already present.
  try { await Promise.race([modelRuntime.refresh({ allowNetwork: true }), new Promise((r) => setTimeout(r, 15000))]); } catch { /* offline / partial — use static */ }
  const out: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> = [];
  for (const id of API_KEY_PROVIDERS) {
    if (!modelRuntime.getProvider(id)) continue;
    let models: Array<{ id: string; name: string }> = [];
    try { models = modelRuntime.getModels(id).map((m) => ({ id: m.id, name: (m as { name?: string }).name ?? m.id })); } catch { models = []; }
    if (!models.length) continue;
    out.push({ id, name: PROVIDER_LABELS[id] ?? id, models });
  }
  return out;
}

function configStatus(): { configured: boolean; provider?: string; model?: string } {
  let authed = false;
  try { authed = curProvider ? modelRuntime.getProviderAuthStatus(curProvider).configured : false; } catch { authed = false; }
  return { configured: !!model && authed, provider: curProvider, model: curModel };
}

// Re-apply the last-saved key for a provider (or clear it) so a FAILED validation
// never leaves the live runtime holding a bad key that breaks the active session.
async function restoreProviderKey(provider: string): Promise<void> {
  try {
    const ai = await readAi();
    if (ai.provider === provider && ai.api_key) await modelRuntime.setRuntimeApiKey(provider, ai.api_key);
    else await modelRuntime.removeRuntimeApiKey(provider);
  } catch { /* best-effort restore */ }
}

async function validateCombo(provider: string, modelId: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!API_KEY_PROVIDERS.includes(provider)) return { ok: false, error: "Unsupported provider" };
  let touchedKey = false;
  try {
    if (apiKey) { await modelRuntime.setRuntimeApiKey(provider, apiKey); touchedKey = true; }
    const r = resolveCliModel({ cliModel: `${provider}/${modelId}`, modelRuntime });
    if (r.error || !r.model) { if (touchedKey) await restoreProviderKey(provider); return { ok: false, error: r.error ?? "Model not found" }; }
    const test = modelRuntime.completeSimple(r.model, { messages: [{ role: "user", content: [{ type: "text", text: "Reply with the single word OK." }] }] }, { maxTokens: 8 });
    // completeSimple does NOT throw on auth/quota failure — it resolves with a
    // message whose stopReason is "error" (or empty content). Inspect it.
    const msg = (await Promise.race([test, new Promise((_, rej) => setTimeout(() => rej(new Error("Validation timed out")), 30000))])) as { stopReason?: string; errorMessage?: string; content?: Array<{ type: string; text?: string }> };
    const text = (msg?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (msg?.stopReason === "error" || !text) {
      if (touchedKey) await restoreProviderKey(provider);
      return { ok: false, error: msg?.errorMessage || "The provider rejected the request — check the API key and model." };
    }
    return { ok: true };
  } catch (err) {
    if (touchedKey) await restoreProviderKey(provider);
    return { ok: false, error: (err as Error).message };
  }
}

async function saveCombo(provider: string, modelId: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const v = await validateCombo(provider, modelId, apiKey);
  if (!v.ok) return v;
  // Persist canonically to Supervisor options under the `ai` group (only overwrite
  // the key when a new one was entered — blank keeps the existing stored key).
  const cur = await readAi();
  const wrote = await writeAddonOptions({ ai: { provider, model: modelId, api_key: apiKey || cur.api_key || "" } });
  if (!wrote && supervisorToken()) return { ok: false, error: "Could not save to Supervisor options" };
  curProvider = provider; curModel = modelId;
  const r = resolveCliModel({ cliModel: `${provider}/${modelId}`, modelRuntime });
  if (!r.error && r.model) model = r.model;
  await startSession(SessionManager.create(agentCwd));
  broadcast({ type: "config_status", data: configStatus() });
  return { ok: true };
}

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

// ── Web search config (mirrors the AI provider flow) ────────
// A tool can't be hot-swapped like a model key: it must re-register. reloadTools
// re-runs loader.reload() (re-executes the extension → registerWebSearchTool reads
// the new WEBSEARCH_* env) and rebuilds the active session so web_search appears
// live, with no add-on restart.
async function reloadTools(): Promise<void> {
  try { await loader.reload(); } catch (e) { console.error("[engine] loader.reload:", (e as Error).message); }
  if (currentSm && model) { try { await startSession(currentSm); } catch (e) { console.error("[engine] reload session:", (e as Error).message); } }
}
function websearchStatus(): { enabled: boolean; provider: string; providers: string[] } {
  return { enabled: wsEnabled, provider: wsProvider, providers: [...WS_PROVIDERS] };
}
async function validateWebsearch(provider: string, key: string): Promise<{ ok: boolean; error?: string }> {
  if (!WS_PROVIDERS.includes(provider as WsProvider)) return { ok: false, error: "Unsupported provider" };
  if (!key) return { ok: false, error: "Missing API key" };
  try {
    if (provider === "brave") {
      const r = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", { headers: { Accept: "application/json", "X-Subscription-Token": key } });
      return r.ok ? { ok: true } : { ok: false, error: `Brave HTTP ${r.status}` };
    }
    const endpoint = provider === "perplexity_openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.perplexity.ai/chat/completions";
    const m = provider === "perplexity_openrouter" ? "perplexity/sonar" : "sonar";
    const r = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: m, messages: [{ role: "user", content: "ping" }], max_tokens: 16 }) });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => "");
    return { ok: false, error: `HTTP ${r.status} ${t.slice(0, 140)}` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
async function saveWebsearch(provider: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const cur = await readWebsearch();
  const finalKey = key || cur.api_key || "";
  const v = await validateWebsearch(provider, finalKey);
  if (!v.ok) return v;
  const wrote = await writeAddonOptions({ websearch: { enabled: true, provider, api_key: finalKey } });
  if (!wrote) return { ok: false, error: "Failed to persist config" };
  process.env.WEBSEARCH_ENABLED = "true";
  process.env.WEBSEARCH_PROVIDER = provider;
  process.env.WEBSEARCH_API_KEY = finalKey;
  wsEnabled = true; wsProvider = provider;
  await reloadTools();
  broadcast({ type: "websearch_status", data: websearchStatus() });
  return { ok: true };
}
async function disableWebsearch(): Promise<void> {
  const cur = await readWebsearch();
  await writeAddonOptions({ websearch: { enabled: false, provider: cur.provider || "perplexity", api_key: cur.api_key || "" } });
  process.env.WEBSEARCH_ENABLED = "false";
  wsEnabled = false;
  await reloadTools();
  broadcast({ type: "websearch_status", data: websearchStatus() });
}

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  const sendTo = (msg: unknown) => { try { ws.send(JSON.stringify(msg)); } catch { /* dropped */ } };
  sendTo({ type: "config_status", data: configStatus() });
  sendTo({ type: "websearch_status", data: websearchStatus() });
  void fetchStats().then((s) => { if (s) sendTo({ type: "stats", data: s }); });
  void listSessions().then((s) => sendTo({ type: "sessions", data: s }));
  ws.on("message", (raw) => {
    let cmd: { type?: string; text?: string; path?: string; provider?: string; model?: string; apiKey?: string };
    try { cmd = JSON.parse(String(raw)); } catch { return; }
    switch (cmd.type) {
      case "prompt": if (cmd.text && session) void handlePrompt(cmd.text); break;
      case "abort": if (session) void session.abort().then(() => broadcast({ type: "aborted" })); break;
      case "list_sessions": void listSessions().then((s) => sendTo({ type: "sessions", data: s })); break;
      case "new_session": void startSession(SessionManager.create(agentCwd)).then(() => broadcast({ type: "session_cleared" })); break;
      case "open_session": if (cmd.path) void startSession(SessionManager.open(cmd.path)).then(() => broadcast({ type: "history", data: historyEntries() })); break;
      case "list_providers": void listApiKeyProviders().then((p) => sendTo({ type: "providers", data: p })); break;
      case "save_config": void saveCombo(cmd.provider ?? "", cmd.model ?? "", cmd.apiKey ?? "").then((r) => sendTo({ type: "config_result", data: r })); break;
      case "save_websearch": void saveWebsearch(cmd.provider ?? "", cmd.apiKey ?? "").then((r) => sendTo({ type: "websearch_result", data: r })); break;
      case "disable_websearch": void disableWebsearch(); break;
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
