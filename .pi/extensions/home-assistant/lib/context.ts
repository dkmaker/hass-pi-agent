/**
 * Gathers Home Assistant installation context.
 *
 * Primary: fetches pre-built structural context from the addon service (localhost:9199/context).
 * Fallback: gathers directly from HA APIs (dev mode / addon not available).
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

export interface HAContext {
  system: {
    hostname: string;
    ha_version: string;
    os_version: string;
    supervisor_version: string;
    arch: string;
    board: string;
    os_name: string;
  };
  entities: {
    total: number;
    domains: Record<string, number>;
  };
  addons: Array<{ name: string; version: string; running: boolean }>;
  areas?: string[];
  gathered_at: string;
}

let cachedContext: HAContext | null = null;
let usingMock = false;

/**
 * Returns true when running in local dev mode (not inside the add-on container).
 * Detected by absence of the container-injected SUPERVISOR_TOKEN env var.
 */
export function isDevMode(): boolean {
  return !process.env.SUPERVISOR_TOKEN;
}

/**
 * Mock context for development when HA is unreachable.
 */
function mockContext(): HAContext {
  return {
    system: {
      hostname: "dev-mock",
      ha_version: "2025.1.0 (mock)",
      os_version: "17.0",
      supervisor_version: "2025.01.0",
      arch: "amd64",
      board: "ova",
      os_name: "Home Assistant OS",
    },
    entities: {
      total: 42,
      domains: {
        light: 12, sensor: 10, switch: 6, automation: 4,
        binary_sensor: 3, climate: 2, cover: 2, media_player: 2, person: 1,
      },
    },
    addons: [
      { name: "Pi Agent (dev)", version: "0.0.0", running: true },
      { name: "File Editor", version: "5.8.0", running: true },
    ],
    areas: ["Living Room", "Kitchen", "Bedroom", "Office"],
    gathered_at: new Date().toISOString(),
  };
}

/**
 * Try to fetch context from the addon service, fall back to direct API calls.
 * In dev mode, returns mock data if all API calls fail.
 */
export async function gatherContext(): Promise<HAContext | null> {
  if (cachedContext) return cachedContext;

  // Try addon service first
  try {
    const res = await fetch("http://localhost:9199/context");
    if (res.ok) {
      cachedContext = (await res.json()) as HAContext;
      return cachedContext;
    }
  } catch {
    // Addon not available — fall back to direct gathering
  }

  // Fallback: gather directly (dev mode)
  try {
    if (!HA_TOKEN) return null;

    const [states, supInfo, osInfo, hostInfo, addonsInfo] = await Promise.allSettled([
      apiGet<HAState[]>("/api/states"),
      supervisorApi<Record<string, unknown>>("/supervisor/info"),
      supervisorApi<Record<string, unknown>>("/os/info"),
      supervisorApi<Record<string, unknown>>("/host/info"),
      supervisorApi<{ addons: any[] }>("/addons"),
    ]);

    const allStates = states.status === "fulfilled" ? states.value : [];
    const domainCounts: Record<string, number> = {};
    for (const s of allStates) {
      const domain = s.entity_id.split(".")[0];
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }

    const sup: any = supInfo.status === "fulfilled" ? supInfo.value : {};
    const os: any = osInfo.status === "fulfilled" ? osInfo.value : {};
    const host: any = hostInfo.status === "fulfilled" ? hostInfo.value : {};
    const addons: any = addonsInfo.status === "fulfilled" ? addonsInfo.value : {};

    const installedAddons = (addons.addons || [])
      .filter((a: any) => a.installed)
      .map((a: any) => ({
        name: a.name,
        version: a.version || "?",
        running: a.state === "started",
      }));

    // Try to get areas
    let areas: string[] = [];
    try {
      const areaList = (await wsSendCommand({
        type: "config/area_registry/list",
      })) as any[];
      areas = areaList.map((a: any) => a.name);
    } catch {}

    cachedContext = {
      system: {
        hostname: host.hostname || "unknown",
        ha_version: sup.homeassistant || "unknown",
        os_version: os.version || "unknown",
        supervisor_version: sup.version || "unknown",
        arch: sup.arch || "unknown",
        board: os.board || "unknown",
        os_name: host.operating_system || "unknown",
      },
      entities: {
        total: allStates.length,
        domains: domainCounts,
      },
      addons: installedAddons,
      areas: areas.length > 0 ? areas : undefined,
      gathered_at: new Date().toISOString(),
    };

    return cachedContext;
  } catch {
    // In dev mode, fall back to mock data so the UI still works
    if (isDevMode()) {
      cachedContext = mockContext();
      usingMock = true;
      return cachedContext;
    }
    return null;
  }
}

/**
 * Format context as markdown for the LLM system prompt.
 */
export function formatContextForLLM(ctx: HAContext): string {
  const topDomains = Object.entries(ctx.entities.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([d, c]) => `${d}: ${c}`)
    .join(", ");

  const automationCount = ctx.entities.domains["automation"] || 0;

  const addonLines = ctx.addons
    .map((a) => `- ${a.name} (v${a.version})${a.running ? " — running" : ""}`)
    .join("\n");

  const areaSection = ctx.areas?.length
    ? `\n### Areas (${ctx.areas.length})\n${ctx.areas.map((a) => `- ${a}`).join("\n")}`
    : "";

  return `# Home Assistant Installation Context

## System

| Property | Value |
|----------|-------|
| Hostname | ${ctx.system.hostname} |
| HA Core | ${ctx.system.ha_version} |
| HAOS | ${ctx.system.os_version} |
| Supervisor | ${ctx.system.supervisor_version} |
| Architecture | ${ctx.system.arch} |
| Board | ${ctx.system.board} |
| OS | ${ctx.system.os_name} |

## Scale

- **${ctx.entities.total}** entities total (${topDomains})
- **${automationCount}** automations

## Installed Add-ons

${addonLines || "- (none or unable to retrieve)"}
${areaSection}

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
}

/**
 * Get cached context (returns null if not yet gathered).
 */
export function getContext(): HAContext | null {
  return cachedContext;
}

/**
 * Returns true if the current context is mock data (no real HA connection).
 */
export function isMockContext(): boolean {
  return usingMock;
}

/**
 * Reset cached context (e.g., on reconnect).
 */
export function resetContext(): void {
  cachedContext = null;
}
