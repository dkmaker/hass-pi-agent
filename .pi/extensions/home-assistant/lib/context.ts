/**
 * Gathers Home Assistant installation context at session start
 * and injects it into the system prompt via before_agent_start.
 *
 * Reuses existing API helpers — supervisorApi (WebSocket) for Supervisor
 * endpoints, apiGet for Core REST API, wsSendCommand for registries.
 */
import { apiGet } from "./api.js";
import { HA_TOKEN } from "./config.js";
import { supervisorApi } from "./supervisor.js";
import { wsSendCommand } from "./ws.js";

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
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

    // Parallel API calls — reuse existing helpers
    const [states, supInfo, osInfo, hostInfo, addonsInfo] = await Promise.allSettled([
      apiGet<HAState[]>("/api/states"),
      supervisorApi<Record<string, unknown>>("/supervisor/info"),
      supervisorApi<Record<string, unknown>>("/os/info"),
      supervisorApi<Record<string, unknown>>("/host/info"),
      supervisorApi<{ addons: any[] }>("/addons"),
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
    const sup: any = supInfo.status === "fulfilled" ? supInfo.value : {};
    const os: any = osInfo.status === "fulfilled" ? osInfo.value : {};
    const host: any = hostInfo.status === "fulfilled" ? hostInfo.value : {};
    const addons: any = addonsInfo.status === "fulfilled" ? addonsInfo.value : {};

    const haVersion = sup.homeassistant || "unknown";

    // Installed add-ons
    const installedAddons = (addons.addons || [])
      .filter((a: any) => a.installed)
      .map(
        (a: any) =>
          `- ${a.name} (v${a.version || "?"})${a.state === "started" ? " — running" : ""}`
      )
      .join("\n");

    // Areas (via websocket registry)
    let areaInfo = "";
    try {
      const areas = (await wsSendCommand({
        type: "config/area_registry/list",
      })) as any[];
      if (areas.length > 0) {
        areaInfo = `\n### Areas (${areas.length})\n${areas.map((a: any) => `- ${a.name}`).join("\n")}`;
      }
    } catch {
      // skip if WS not ready
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
