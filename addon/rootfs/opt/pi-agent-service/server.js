#!/usr/bin/env node
/**
 * Pi Agent HTTP service — receives questions from the HA custom component
 * and spawns Pi processes to handle them.
 */
"use strict";

const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const fs = require("fs");

const PORT = 9199;
const MAX_CONCURRENT = 3;
const CONTEXT_REFRESH_MS = 60 * 60 * 1000; // 1 hour

let activeProcesses = 0;
let cachedContext = null;
let contextLastUpdated = null;

/** Load environment from s6 container_environment */
function loadEnv() {
  const env = { ...process.env };
  const s6Dir = "/var/run/s6/container_environment";
  if (fs.existsSync(s6Dir)) {
    for (const file of fs.readdirSync(s6Dir)) {
      if (file.startsWith(".")) continue;
      try {
        env[file] = fs.readFileSync(`${s6Dir}/${file}`, "utf8").trim();
      } catch {}
    }
  }
  return env;
}

const piEnv = loadEnv();

/** Fire a logbook_entry event in Home Assistant */
function fireLogbookEntry(name, message, entityId) {
  const token = piEnv.SUPERVISOR_TOKEN || piEnv.HA_TOKEN;
  if (!token) {
    console.error("[pi-service] No token available for logbook entry");
    return;
  }

  const payload = JSON.stringify({
    name,
    message,
    entity_id: entityId || undefined,
    domain: "pi_agent",
  });

  const req = http.request(
    {
      hostname: "supervisor",
      port: 80,
      path: "/core/api/events/logbook_entry",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () =>
          console.error(`[pi-service] Logbook entry failed (${res.statusCode}): ${body}`)
        );
      }
    }
  );

  req.on("error", (err) =>
    console.error(`[pi-service] Logbook entry error: ${err.message}`)
  );
  req.write(payload);
  req.end();
}

/** Make an HTTP request to the Supervisor/Core API and return parsed JSON */
function supervisorRequest(path) {
  const token = piEnv.SUPERVISOR_TOKEN || piEnv.HA_TOKEN;
  if (!token) return Promise.reject(new Error("No token"));

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "supervisor",
        port: 80,
        path,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            // Supervisor API wraps in { result, data }
            resolve(parsed.data || parsed);
          } catch (e) {
            reject(new Error(`Parse error: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

/** Gather stable, structural HA context (no transient state) */
async function gatherContext() {
  try {
    const [states, supInfo, osInfo, hostInfo, coreInfo, addonsInfo] = await Promise.allSettled([
      supervisorRequest("/core/api/states"),
      supervisorRequest("/supervisor/info"),
      supervisorRequest("/os/info"),
      supervisorRequest("/host/info"),
      supervisorRequest("/core/info"),
      supervisorRequest("/addons"),
    ]);

    // Domain counts from states (structural — not individual values)
    const allStates = states.status === "fulfilled" ? states.value : [];
    const domainCounts = {};
    for (const s of allStates) {
      if (!s.entity_id) continue;
      const domain = s.entity_id.split(".")[0];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
    const entityCount = allStates.length;

    // System info
    const sup = supInfo.status === "fulfilled" ? supInfo.value : {};
    const os = osInfo.status === "fulfilled" ? osInfo.value : {};
    const host = hostInfo.status === "fulfilled" ? hostInfo.value : {};
    const core = coreInfo.status === "fulfilled" ? coreInfo.value : {};
    const addons = addonsInfo.status === "fulfilled" ? addonsInfo.value : {};

    // Installed add-ons
    const installedAddons = (addons.addons || [])
      .filter((a) => a.installed)
      .map((a) => ({
        name: a.name,
        version: a.version || "?",
        running: a.state === "started",
      }));

    // Areas via Core API
    let areas = [];
    try {
      // Use WebSocket-style via REST isn't available, use template endpoint
      const areaStates = Array.isArray(allStates) ? allStates : [];
      // We can't easily get areas without WS, so we'll try the REST API
      const areaData = await supervisorRequest("/core/api/config");
      // areas aren't in config API — skip for now, extension can supplement
    } catch {}

    cachedContext = {
      system: {
        hostname: host.hostname || "unknown",
        ha_version: core.version || sup.homeassistant || "unknown",
        os_version: os.version || "unknown",
        supervisor_version: sup.version || "unknown",
        arch: sup.arch || "unknown",
        board: os.board || "unknown",
        os_name: host.operating_system || "unknown",
      },
      entities: {
        total: entityCount,
        domains: domainCounts,
      },
      addons: installedAddons,
      gathered_at: new Date().toISOString(),
    };

    contextLastUpdated = Date.now();
    console.log(`[pi-service] Context gathered: ${entityCount} entities, ${installedAddons.length} add-ons`);
  } catch (err) {
    console.error(`[pi-service] Context gather failed: ${err.message}`);
  }
}

// Gather context at startup (with a short delay for HA to be ready) and hourly
setTimeout(() => {
  gatherContext();
  setInterval(gatherContext, CONTEXT_REFRESH_MS);
}, 5000);

function spawnPi(question, overrides = {}) {
  activeProcesses++;

  const args = ["--print", "--extension", "/opt/ha-extension"];

  const validStr = (s) => s && s.trim() && s.trim() !== "null";

  // Provider priority: per-call override > service config > default
  const provider = [overrides.provider, piEnv.PI_SERVICE_PROVIDER, piEnv.PI_DEFAULT_PROVIDER].find(validStr);
  if (provider) {
    args.push("--provider", provider);
  }

  // Model priority: per-call override > service config > default
  const model = [overrides.model, piEnv.PI_SERVICE_MODEL, piEnv.PI_DEFAULT_MODEL].find(validStr);
  if (model) {
    args.push("--model", model);
  }

  // Instruct Pi to respond in plain text for the logbook
  args.push(
    "--append-system-prompt",
    "Your response will be shown in the Home Assistant logbook which only supports plain text. " +
    "NEVER use markdown formatting (no **, no #, no `, no bullet points). " +
    "Write short, plain text sentences. " +
    "When mentioning entities, use their entity_id (e.g. light.kitchen, sensor.temperature) " +
    "as the logbook automatically makes these clickable links. " +
    "Keep responses concise — ideally one or two sentences summarizing what you did."
  );

  args.push(question);

  console.log(`[pi-service] Spawning Pi (active: ${activeProcesses})`);

  // Log the question to the logbook
  fireLogbookEntry("Pi Agent", `asked: ${question}`);

  const pi = spawn("pi", args, {
    cwd: "/homeassistant",
    env: piEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  pi.stdout.on("data", (d) => (stdout += d));
  pi.stderr.on("data", (d) => (stderr += d));

  pi.on("close", (code) => {
    activeProcesses--;

    // Trim and truncate response for logbook
    const response = stdout.trim();
    const maxLen = 1000;
    const truncated =
      response.length > maxLen ? response.slice(0, maxLen) + "…" : response;

    if (code === 0) {
      console.log(`[pi-service] Pi completed successfully (active: ${activeProcesses})`);
      fireLogbookEntry(
        "Pi Agent",
        truncated ? `responded: ${truncated}` : "completed (no output)"
      );
    } else {
      console.error(`[pi-service] Pi exited with code ${code} (active: ${activeProcesses})`);
      const errMsg = stderr.trim().slice(0, 500);
      fireLogbookEntry("Pi Agent", `failed (exit ${code}): ${errMsg || "unknown error"}`);
    }
  });

  pi.on("error", (err) => {
    activeProcesses--;
    console.error(`[pi-service] Failed to spawn Pi: ${err.message}`);
    fireLogbookEntry("Pi Agent", `error: ${err.message}`);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/ask") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { question, provider, model } = JSON.parse(body);
        if (!question || typeof question !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'question' field" }));
          return;
        }

        if (activeProcesses >= MAX_CONCURRENT) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Too many concurrent requests" }));
          return;
        }

        spawnPi(question, { provider, model });
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  } else if (req.method === "GET" && req.url === "/context") {
    if (cachedContext) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cachedContext));
    } else {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Context not yet available" }));
    }
  } else if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", active: activeProcesses }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[pi-service] Listening on port ${PORT}`);
});
