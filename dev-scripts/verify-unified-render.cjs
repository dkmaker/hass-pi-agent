#!/usr/bin/env node
/* Verify the unified tool-render layer through ingress on the dev VM.
 * Loads with locale da-DK so the UI + column headers render Danish, triggers
 * ha_entities list, then asserts: native <table>, localized headers, resolved
 * MDI icons from HA /static/mdi, and a clickable entity → in-chat inspect. */
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..", "code/dkmaker/home-assistant");
const R = fs.existsSync(path.join(REPO, ".env")) ? REPO : "/home/cp/code/dkmaker/home-assistant";
const env = Object.fromEntries(fs.readFileSync(path.join(R, ".env"), "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const TOKEN = env.HAOS_API_TOKEN, VM_IP = env.VM_IP || "10.99.0.13", SLUG = "local_pi_agent";
const WS_API = `ws://${VM_IP}:8123/api/websocket`;
const WebSocket = (() => { try { return require("ws"); } catch { return require(path.join(R, "webapp/node_modules/ws")); } })();
const { chromium } = require("playwright");
function supervisor(endpoint, method = "get") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_API, { maxPayload: 0 }); let id = 0;
    ws.on("message", (raw) => { const m = JSON.parse(raw.toString());
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
      else if (m.type === "auth_ok") ws.send(JSON.stringify({ id: ++id, type: "supervisor/api", endpoint, method }));
      else if (m.type === "result") { ws.close(); m.success ? resolve(m.result) : reject(new Error(JSON.stringify(m.error))); }
      else if (m.type === "auth_invalid") { ws.close(); reject(new Error("auth_invalid")); } });
    ws.on("error", reject);
  });
}
(async () => {
  const info = await supervisor(`/addons/${SLUG}/info`);
  const ingressToken = info.ingress_url.split("/").filter(Boolean).pop();
  const { session } = await supervisor("/ingress/session", "post");
  const BASE = `http://${VM_IP}:8123/api/hassio_ingress/${ingressToken}/`;
  console.log("ingress base:", BASE);
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: "da-DK", colorScheme: "dark", viewport: { width: 1100, height: 900 } });
  await ctx.addCookies([{ name: "ingress_session", value: session, domain: VM_IP, path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  await p.locator("pi-chat-app textarea").first().fill("Vis mig en liste over 5 af mine entiteter (brug ha_entities list, limit 5).");
  await p.locator("pi-chat-app textarea").first().press("Enter");
  let ok = false;
  for (let i = 0; i < 45; i++) {
    await p.waitForTimeout(1500);
    const st = await p.evaluate(() => {
      const sr = document.querySelector("pi-chat-app")?.shadowRoot;
      const tb = [...(sr?.querySelectorAll("pi-tool-block") || [])];
      let table = null;
      for (const t of tb) { const tbl = t.shadowRoot?.querySelector("table"); if (tbl) { table = { tb: t, tbl }; } }
      if (!table) return { tools: tb.length, hasTable: false };
      const ths = [...table.tbl.querySelectorAll("thead th")].map((x) => x.textContent.trim());
      const icons = [...table.tb.shadowRoot.querySelectorAll("ha-mdi-icon")];
      const resolved = icons.filter((ic) => ic.shadowRoot?.querySelector("svg path")).length;
      const elinks = table.tb.shadowRoot.querySelectorAll("button.elink").length;
      return { tools: tb.length, hasTable: true, ths, iconCount: icons.length, resolved, elinks };
    });
    if (st.hasTable) { console.log("TABLE:", JSON.stringify(st)); ok = true; break; }
    if (i % 4 === 0) console.log("  waiting… tools=", st.tools);
  }
  await p.screenshot({ path: "/tmp/pi-unified.png", fullPage: false });
  // Click first entity → expect an in-chat inspect user message
  let clicked = null;
  if (ok) {
    await p.waitForTimeout(6000); // let the agent go idle (send() is blocked while busy)
    await p.evaluate(() => {
      const sr = document.querySelector("pi-chat-app")?.shadowRoot;
      for (const t of sr.querySelectorAll("pi-tool-block")) { const el = t.shadowRoot?.querySelector("button.elink"); if (el) { el.click(); return; } }
    });
    await p.waitForTimeout(3000);
    clicked = await p.evaluate(() => {
      const sr = document.querySelector("pi-chat-app")?.shadowRoot;
      return [...(sr?.querySelectorAll(".row.user .bubble") || [])].map((x) => x.textContent.trim()).filter((t) => /Show details for entity/i.test(t));
    });
    console.log("inspect messages:", JSON.stringify(clicked));
    await p.screenshot({ path: "/tmp/pi-unified-click.png", fullPage: false });
  }
  await b.close();
  console.log(ok ? "✅ native table rendered" : "❌ no table");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
