/**
 * Embed round-trip proof (issue #24KDA / #WSWMV foundation).
 *
 * Boots ModelRuntime + an AgentSession with cwd = repo root so the vendored HA
 * extension in .pi/extensions/home-assistant is auto-discovered, then asks the
 * agent to use its tools against the live dev VM. Not a server — just proof the
 * in-process embed works locally end-to-end before we wrap a WS server around it.
 *
 *   cd webapp && npx tsx server/probe-embed.ts
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

// Load repo-root .env into process.env (do not override already-set vars) so
// the HA extension's config.ts resolves HA_URL / HA_TOKEN / HA_CONFIG_PATH.
for (const line of readFileSync(resolve(repoRoot, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
console.log("[probe] HA_URL=%s HA_CONFIG_PATH=%s cwd=%s", process.env.HA_URL, process.env.HA_CONFIG_PATH, repoRoot);

const modelRuntime = await ModelRuntime.create();
const { session } = await createAgentSession({
  cwd: repoRoot,
  agentDir: resolve(process.env.HOME ?? "", ".pi", "agent"),
  sessionManager: SessionManager.inMemory(repoRoot),
  modelRuntime,
});

console.log("[probe] model=%s tools=%d", session.model?.id ?? "(default)", session.agent.state.tools.length);
console.log("[probe] HA tools present:", session.agent.state.tools.filter((t) => t.name.startsWith("ha_")).map((t) => t.name).slice(0, 6).join(", "), "…");

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  } else if (event.type === "tool_execution_start") {
    process.stdout.write(`\n[tool→ ${event.toolName}]\n`);
  } else if (event.type === "tool_execution_end") {
    process.stdout.write(`\n[tool✓ ${event.isError ? "ERROR" : "ok"}]\n`);
  }
});

console.log("\n[probe] prompting…\n" + "─".repeat(60));
await session.prompt(
  "Use your Home Assistant tools to tell me how many entities exist, and list exactly 3 of their entity_ids. Be brief.",
);
console.log("\n" + "─".repeat(60) + "\n[probe] done.");
session.dispose();
process.exit(0);
