/**
 * Mock server for the Pi Agent chat webapp.
 *
 * Serves the built static app (webapp/dist) and a WebSocket that REPLAYS
 * scripted scenarios shaped like pi's AgentSessionEvent stream — no real agent.
 * Lets the operator feel streaming, tool render blocks, the spinner, and the
 * stop button on a real device. One WS "run" at a time (single-flight), abortable.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 8770);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ── Static file server (SPA fallback to index.html) ──────────────
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let rel = normalize(url).replace(/^(\.\.[/\\])+/, "").replace(/^\/+/, "");
    if (rel === "" || rel === "/") rel = "index.html";
    let file = join(DIST, rel);
    if (!existsSync(file)) file = join(DIST, "index.html");
    if (!existsSync(file)) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("Build missing — run `npm run build` in webapp/.");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err));
  }
});

// ── WebSocket: scenario replay ───────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = { ev: unknown; wait?: number };

function words(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

/** Build a streamed assistant message as text_delta steps. */
function stream(text: string, chunk = 18): Step[] {
  const w = words(text);
  const out: Step[] = [];
  for (let i = 0; i < w.length; i += 1) {
    out.push({ ev: { type: "text_delta", delta: w[i] }, wait: chunk + Math.random() * 22 });
  }
  return out;
}
function thinking(text: string): Step[] {
  return words(text).map((d) => ({ ev: { type: "thinking_delta", delta: d }, wait: 12 }));
}

function scenario(prompt: string): Step[] {
  const p = prompt.toLowerCase();

  if (/entit|light|sensor|devices?/.test(p)) {
    return [
      { ev: { type: "agent_start" } },
      { ev: { type: "working", label: "Thinking" }, wait: 400 },
      { ev: { type: "message_start" } },
      ...stream("Let me pull the current entities for you.\n\n"),
      { ev: { type: "message_end" } },
      { ev: { type: "tool_start", id: "t1", toolName: "ha_entities", args: { action: "list", domain: "light" } }, wait: 700 },
      {
        ev: {
          type: "tool_end", id: "t1", toolName: "ha_entities", isError: false,
          result: {
            kind: "entities",
            data: {
              columns: ["Entity", "State", "Area"],
              rows: [
                ["light.kitchen", "on", "Kitchen"],
                ["light.living_room", "off", "Living Room"],
                ["light.hallway", "on", "Hallway"],
                ["light.bedroom", "off", "Bedroom"],
              ],
            },
          },
        }, wait: 500,
      },
      { ev: { type: "message_start" } },
      ...stream("You have **4 lights** — 2 are currently on (Kitchen, Hallway). Want me to turn any off?"),
      { ev: { type: "message_end" } },
      { ev: { type: "turn_end" } },
      { ev: { type: "agent_end" } },
    ];
  }

  if (/yaml|script|automation|edit|config/.test(p)) {
    return [
      { ev: { type: "agent_start" } },
      { ev: { type: "working", label: "Thinking" }, wait: 350 },
      ...([{ ev: { type: "message_start" } }] as Step[]),
      ...thinking("The user wants a small change to the porch light script — I'll update the brightness only, minimal diff. "),
      ...stream("I'll update the `porch_light` script's brightness. Here's the change:\n\n"),
      { ev: { type: "message_end" } },
      { ev: { type: "tool_start", id: "t2", toolName: "ha_yaml", args: { action: "update", key: "script.porch_light" } }, wait: 650 },
      {
        ev: {
          type: "tool_end", id: "t2", toolName: "ha_yaml", isError: false,
          result: {
            kind: "yaml_diff",
            data: {
              file: "scripts.yaml",
              diff: [
                { t: "ctx", s: "porch_light:" },
                { t: "ctx", s: "  alias: Porch Light" },
                { t: "ctx", s: "  sequence:" },
                { t: "ctx", s: "    - service: light.turn_on" },
                { t: "ctx", s: "      data:" },
                { t: "del", s: "        brightness_pct: 60" },
                { t: "add", s: "        brightness_pct: 85" },
              ],
            },
          },
        }, wait: 500,
      },
      { ev: { type: "message_start" } },
      ...stream("Done — brightness raised 60% → 85%. The YAML re-parsed cleanly (valid). Reload scripts to apply?"),
      { ev: { type: "message_end" } },
      { ev: { type: "turn_end" } },
      { ev: { type: "agent_end" } },
    ];
  }

  if (/turn on|turn off|lock|unlock|arm|call|service/.test(p)) {
    return [
      { ev: { type: "agent_start" } },
      { ev: { type: "working", label: "Thinking" }, wait: 300 },
      { ev: { type: "tool_start", id: "t3", toolName: "ha_services", args: { domain: "light", service: "turn_off", entity_id: "light.kitchen" } }, wait: 600 },
      {
        ev: {
          type: "tool_end", id: "t3", toolName: "ha_services", isError: false,
          result: { kind: "service", data: { domain: "light", service: "turn_off", target: "light.kitchen", ok: true } },
        }, wait: 500,
      },
      { ev: { type: "message_start" } },
      ...stream("✅ Turned off **light.kitchen**. Anything else?"),
      { ev: { type: "message_end" } },
      { ev: { type: "turn_end" } },
      { ev: { type: "agent_end" } },
    ];
  }

  // default: a plain streamed markdown answer
  return [
    { ev: { type: "agent_start" } },
    { ev: { type: "working", label: "Thinking" }, wait: 450 },
    { ev: { type: "message_start" } },
    ...thinking("A general question — answer concisely, offer a next step. "),
    ...stream(
      "I'm your **Home Assistant** agent. I can inspect and manage entities, automations, scripts, dashboards and more.\n\n" +
        "Try:\n- *\"show my lights\"*\n- *\"update the porch light script\"*\n- *\"turn off the kitchen light\"*\n\nWhat would you like to do?",
    ),
    { ev: { type: "message_end" } },
    { ev: { type: "turn_end" } },
    { ev: { type: "agent_end" } },
  ];
}

wss.on("connection", (ws: WebSocket) => {
  let aborted = false;
  let running = false;

  const send = (ev: unknown) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(ev)); };

  ws.on("message", async (raw) => {
    let cmd: { type: string; text?: string };
    try { cmd = JSON.parse(String(raw)); } catch { return; }

    if (cmd.type === "abort") { aborted = true; return; }
    if (cmd.type !== "prompt" || running) return;

    running = true;
    aborted = false;
    const steps = scenario(cmd.text ?? "");
    for (const step of steps) {
      if (aborted) { send({ type: "aborted" }); break; }
      send(step.ev);
      await sleep(step.wait ?? 30);
    }
    running = false;
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock] serving ${DIST}`);
  console.log(`[mock] http + ws on http://0.0.0.0:${PORT}  (ws path /ws)`);
});
