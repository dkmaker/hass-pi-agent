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
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { createAgentSession, ModelRuntime, SessionManager, type AgentSessionEvent } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const distDir = resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PI_ENGINE_PORT ?? 8771);

// ── repo .env → process.env (no override) so the HA extension resolves its API/config
for (const line of readFileSync(resolve(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

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
console.log("[engine] booting ModelRuntime…");
const modelRuntime = await ModelRuntime.create();
const sessionManager = SessionManager.inMemory(repoRoot);
const { session } = await createAgentSession({
  cwd: repoRoot,
  agentDir: resolve(process.env.HOME ?? "", ".pi", "agent"),
  sessionManager,
  modelRuntime,
});
console.log("[engine] ready — model=%s tools=%d (ha_*=%d)",
  session.model?.id ?? "(default)",
  session.agent.state.tools.length,
  session.agent.state.tools.filter((t) => t.name.startsWith("ha_")).length);

// ── WS clients + event fan-out ──────────────────────────────
const clients = new Set<WebSocket>();
let busy = false;

function broadcast(msg: unknown): void {
  const s = JSON.stringify(msg);
  for (const ws of clients) { try { ws.send(s); } catch { /* dropped */ } }
}

/** Map a real AgentSessionEvent → the frontend wire shape (src/types.ts ServerEvent). */
function toWire(e: AgentSessionEvent): void {
  switch (e.type) {
    case "agent_start": broadcast({ type: "agent_start" }); break;
    case "message_start": broadcast({ type: "message_start" }); break;
    case "message_update": {
      const a = (e as { assistantMessageEvent?: { type: string; delta?: string } }).assistantMessageEvent;
      if (a?.type === "text_delta" && a.delta) broadcast({ type: "text_delta", delta: a.delta });
      else if (a?.type === "thinking_delta" && a.delta) broadcast({ type: "thinking_delta", delta: a.delta });
      break;
    }
    case "message_end": broadcast({ type: "message_end" }); break;
    case "tool_execution_start": {
      const t = e as { toolName?: string; toolCallId?: string; id?: string; args?: unknown; input?: unknown };
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
session.subscribe(toWire);

async function handlePrompt(text: string): Promise<void> {
  if (busy) { broadcast({ type: "notice", text: "Busy — one turn at a time." }); return; }
  busy = true;
  try {
    await session.prompt(text);
  } catch (err) {
    broadcast({ type: "text_delta", delta: `\n[engine error: ${(err as Error).message}]` });
    broadcast({ type: "agent_end" });
  } finally {
    busy = false;
  }
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

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.add(ws);
  void fetchStats().then((s) => { if (s) { try { ws.send(JSON.stringify({ type: "stats", data: s })); } catch { /* dropped */ } } });
  ws.on("message", (raw) => {
    let cmd: { type?: string; text?: string };
    try { cmd = JSON.parse(String(raw)); } catch { return; }
    if (cmd.type === "prompt" && cmd.text) void handlePrompt(cmd.text);
    else if (cmd.type === "abort") void session.abort().then(() => broadcast({ type: "aborted" }));
  });
  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, "0.0.0.0", () => console.log(`[engine] http+ws on http://127.0.0.1:${PORT}`));
