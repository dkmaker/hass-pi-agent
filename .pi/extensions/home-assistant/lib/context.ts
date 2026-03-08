/**
 * Gathers Home Assistant installation context at session start
 * and injects it into the system prompt via before_agent_start.
 */
import { apiGet } from "./api.js";
import { HA_TOKEN } from "./config.js";
import { wsSendCommand } from "./ws.js";

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

interface SupervisorResponse<T> {
  result: string;
  data: T;
}

let cachedContext: string | null = null;

/**
 * Gather system info from HA APIs and build a context string.
 * Cached for the session lifetime — called once at session_start.
 */
export async function gatherContext(): Promise<string> {
  if (cachedContext) return cachedContext;

  try {
    if (!HA_TOKEN) {
      cachedContext = "⚠️ No HA_TOKEN configured — cannot gather system context.";
      return cachedContext;
    }

    // Parallel API calls
    const [states, supInfo, osInfo, hostInfo, addonsInfo] = await Promise.allSettled([
      apiGet<HAState[]>("/api/states"),
      supervisorGet<any>("/supervisor/info"),
      supervisorGet<any>("/os/info"),
      supervisorGet<any>("/host/info"),
      supervisorGet<any>("/addons"),
    ]);

    // Process states
    const allStates = states.status === "fulfilled" ? states.value : [];
    const entityCount = allStates.length;
    const automationCount = allStates.filter((s) =>
      s.entity_id.startsWith("automation.")
    ).length;
    const domainCounts: Record<string, number> = {};
    for (const s of allStates) {
      const domain = s.entity_id.split(".")[0];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
    const topDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([d, c]) => `${d}: ${c}`)
      .join(", ");

    // System info
    const sup = supInfo.status === "fulfilled" ? supInfo.value : {};
    const os = osInfo.status === "fulfilled" ? osInfo.value : {};
    const host = hostInfo.status === "fulfilled" ? hostInfo.value : {};
    const addons = addonsInfo.status === "fulfilled" ? addonsInfo.value : {};

    // HA version from states (sun entity has it)
    const haVersion = sup.homeassistant || "unknown";

    // Installed add-ons
    const installedAddons = (addons.addons || [])
      .filter((a: any) => a.installed)
      .map((a: any) => `- ${a.name} (v${a.version || "?"})${a.state === "started" ? " — running" : ""}`)
      .join("\n");

    // Areas (try via websocket)
    let areaInfo = "";
    try {
      const areas = await wsSendCommand({ type: "config/area_registry/list" }) as any[];
      if (areas.length > 0) {
        areaInfo = `\n### Areas (${areas.length})\n${areas.map((a: any) => `- ${a.name}`).join("\n")}`;
      }
    } catch {
      // WS not available yet, skip
    }

    cachedContext = `# Home Assistant Installation Context

## System

| Property | Value |
|----------|-------|
| Hostname | ${host.hostname || "unknown"} |
| HA Core | ${haVersion} |
| HAOS | ${os.version || "unknown"} |
| Supervisor | ${sup.version || "unknown"} |
| Architecture | ${sup.arch || "unknown"} |
| Board | ${os.board || "unknown"} |
| OS | ${host.operating_system || "unknown"} |

## Scale

- **${entityCount}** entities total (${topDomains})
- **${automationCount}** automations

## Installed Add-ons

${installedAddons || "- (none or unable to retrieve)"}
${areaInfo}

## Filesystem

| Path | Contents |
|------|----------|
| \`/homeassistant/\` | HA config — configuration.yaml, automations.yaml, .storage/, etc. |
| \`/homeassistant/.storage/\` | Internal state — entity/device/area registries |
| \`/addon_configs/\` | Add-on configurations |
| \`/ssl/\`, \`/share/\`, \`/media/\`, \`/backup/\` | Shared directories |

## Important

- Use the provided HA tools (ha_entities, ha_automations, ha_services, etc.) rather than editing files directly
- Service calls have real-world effects — lights, locks, climate, etc.
- Prefer reload over restart when possible
- Never delete entities, automations, or helpers without user confirmation`;

    return cachedContext;
  } catch (err: any) {
    cachedContext = `⚠️ Could not gather HA context: ${err.message}`;
    return cachedContext;
  }
}

/**
 * Get cached context (returns null if not yet gathered).
 */
export function getContext(): string | null {
  return cachedContext;
}

/**
 * Reset cached context (e.g., on reconnect).
 */
export function resetContext(): void {
  cachedContext = null;
}

/**
 * Helper to call Supervisor API endpoints.
 */
async function supervisorGet<T>(path: string): Promise<T> {
  const resp = await fetch(`http://supervisor${path}`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`Supervisor ${resp.status}`);
  const json = (await resp.json()) as SupervisorResponse<T>;
  return json.data;
}
