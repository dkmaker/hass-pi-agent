/**
 * Home Assistant entity discovery and inspection tool.
 *
 * Read-only — uses REST API for live state + storage files for
 * device/entity registry data. Provides the agent with full
 * visibility into what exists in the HA instance.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { apiGet } from "../lib/api.js";
import { readStorage } from "../lib/storage.js";

// ── Types ────────────────────────────────────────────────────

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  original_name: string | null;
  name: string | null;
  disabled_by: string | null;
  area_id: string | null;
  labels: string[];
  [key: string]: unknown;
}

interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  identifiers: unknown[];
  [key: string]: unknown;
}

interface AreaRegistryEntry {
  id: string;
  name: string;
  [key: string]: unknown;
}

// ── Registry loaders (from storage files) ────────────────────

function loadEntityRegistry(): Map<string, EntityRegistryEntry> {
  const map = new Map<string, EntityRegistryEntry>();
  try {
    const storage = readStorage<{ entities: EntityRegistryEntry[] }>("core.entity_registry");
    if (storage) {
      for (const e of storage.data.entities) {
        map.set(e.entity_id, e);
      }
    }
  } catch { /* storage not available */ }
  return map;
}

function loadDeviceRegistry(): Map<string, DeviceRegistryEntry> {
  const map = new Map<string, DeviceRegistryEntry>();
  try {
    const storage = readStorage<{ devices: DeviceRegistryEntry[] }>("core.device_registry");
    if (storage) {
      for (const d of storage.data.devices) {
        map.set(d.id, d);
      }
    }
  } catch { /* storage not available */ }
  return map;
}

function loadAreaRegistry(): Map<string, AreaRegistryEntry> {
  const map = new Map<string, AreaRegistryEntry>();
  try {
    const storage = readStorage<{ areas: AreaRegistryEntry[] }>("core.area_registry");
    if (storage) {
      for (const a of storage.data.areas) {
        map.set(a.id, a);
      }
    }
  } catch { /* storage not available */ }
  return map;
}

// ── Tool registration ────────────────────────────────────────

export function registerEntitiesTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_entities",
    label: "HA Entities",
    description: `Discover and inspect Home Assistant entities with device and area context.

Actions:
- list: List entities with state. Filters: domain, search, state. Hides unavailable by default (reports count). Paginated.
- get: Full detail for one entity — state, attributes, device, area.
- domains: Overview of all domains with entity counts.

Entity listings include device name and area when available.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "domains"] as const, {
        description: "Action to perform",
      }),
      entity_id: Type.Optional(
        Type.String({ description: "Entity ID for 'get' action (e.g., sensor.temperature)" })
      ),
      domain: Type.Optional(
        Type.String({ description: "Filter by domain (e.g., sensor, light, switch)" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search entity_id and friendly_name" })
      ),
      state: Type.Optional(
        Type.String({ description: "Filter by state value (e.g., on, off, home)" })
      ),
      include_unavailable: Type.Optional(
        Type.Boolean({ description: "Include unavailable/unknown entities (default: false)" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results for list (default: 50)" })
      ),
      offset: Type.Optional(
        Type.Number({ description: "Pagination offset (default: 0)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: {
  action: string;
  entity_id?: string;
  domain?: string;
  search?: string;
  state?: string;
  include_unavailable?: boolean;
  limit?: number;
  offset?: number;
}): Promise<string> {
  switch (params.action) {
    case "list":
      return handleList(params);
    case "get":
      return handleGet(params.entity_id);
    case "domains":
      return handleDomains(params.include_unavailable);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: list, get, domains`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(params: {
  domain?: string;
  search?: string;
  state?: string;
  include_unavailable?: boolean;
  limit?: number;
  offset?: number;
}): Promise<string> {
  const allStates = await apiGet<HAState[]>("/api/states");
  const entityReg = loadEntityRegistry();
  const deviceReg = loadDeviceRegistry();
  const areaReg = loadAreaRegistry();

  const includeUnavailable = params.include_unavailable ?? false;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  let filtered = allStates;
  let unavailableCount = 0;

  // Domain filter
  if (params.domain) {
    const d = params.domain.toLowerCase();
    filtered = filtered.filter((s) => s.entity_id.startsWith(d + "."));
  }

  // Count and optionally filter unavailable
  unavailableCount = filtered.filter(
    (s) => s.state === "unavailable" || s.state === "unknown"
  ).length;

  if (!includeUnavailable) {
    filtered = filtered.filter(
      (s) => s.state !== "unavailable" && s.state !== "unknown"
    );
  }

  // State filter
  if (params.state) {
    const sv = params.state.toLowerCase();
    filtered = filtered.filter((s) => s.state.toLowerCase() === sv);
  }

  // Search filter
  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((s) => {
      const friendlyName = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return s.entity_id.toLowerCase().includes(q) || friendlyName.includes(q);
    });
  }

  // Sort by entity_id
  filtered.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  // Format output
  const lines: string[] = [];
  for (const s of page) {
    const friendlyName = s.attributes.friendly_name as string | undefined;
    const regEntry = entityReg.get(s.entity_id);
    const parts: string[] = [];

    // Entity and state
    const nameStr = friendlyName ? ` (${friendlyName})` : "";
    parts.push(`${s.entity_id}: ${s.state}${nameStr}`);

    // Device + area context
    if (regEntry?.device_id) {
      const device = deviceReg.get(regEntry.device_id);
      if (device?.name) {
        const areaName = device.area_id ? areaReg.get(device.area_id)?.name : null;
        const deviceStr = areaName ? `${device.name} @ ${areaName}` : device.name;
        parts.push(`  device: ${deviceStr}`);
      }
    } else if (regEntry?.area_id) {
      const areaName = areaReg.get(regEntry.area_id)?.name;
      if (areaName) parts.push(`  area: ${areaName}`);
    }

    lines.push(parts.join("\n"));
  }

  // Summary
  const domainStr = params.domain ? `${params.domain} ` : "";
  const filterStr = !includeUnavailable && unavailableCount > 0
    ? ` (${unavailableCount} unavailable/unknown hidden)`
    : "";

  let summary: string;
  if (total <= limit && offset === 0) {
    summary = `Showing ${total} ${domainStr}entities${filterStr}`;
  } else {
    summary = `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} ${domainStr}entities${filterStr}`;
  }

  return lines.join("\n") + "\n\n" + summary;
}

async function handleGet(entityId?: string): Promise<string> {
  if (!entityId) throw new Error("'entity_id' is required for get");

  const state = await apiGet<HAState>(`/api/states/${entityId}`);
  const entityReg = loadEntityRegistry();
  const deviceReg = loadDeviceRegistry();
  const areaReg = loadAreaRegistry();

  const result: Record<string, unknown> = {
    entity_id: state.entity_id,
    state: state.state,
    attributes: state.attributes,
    last_changed: state.last_changed,
    last_updated: state.last_updated,
  };

  // Enrich with registry data
  const regEntry = entityReg.get(entityId);
  if (regEntry) {
    result.platform = regEntry.platform;
    result.labels = regEntry.labels;
    if (regEntry.area_id) {
      result.area = areaReg.get(regEntry.area_id)?.name ?? regEntry.area_id;
    }

    if (regEntry.device_id) {
      const device = deviceReg.get(regEntry.device_id);
      if (device) {
        result.device = {
          id: device.id,
          name: device.name,
          manufacturer: device.manufacturer,
          model: device.model,
          area: device.area_id ? areaReg.get(device.area_id)?.name ?? device.area_id : null,
        };
      }
    }
  }

  return JSON.stringify(result, null, 2);
}

async function handleDomains(includeUnavailable?: boolean): Promise<string> {
  const states = await apiGet<HAState[]>("/api/states");

  const domains: Record<string, { total: number; unavailable: number }> = {};
  for (const s of states) {
    const domain = s.entity_id.split(".")[0];
    if (!domains[domain]) domains[domain] = { total: 0, unavailable: 0 };
    domains[domain].total++;
    if (s.state === "unavailable" || s.state === "unknown") {
      domains[domain].unavailable++;
    }
  }

  const sorted = Object.entries(domains).sort((a, b) => b[1].total - a[1].total);
  const lines = sorted.map(([domain, counts]) => {
    const unavailStr = counts.unavailable > 0 ? ` (${counts.unavailable} unavailable)` : "";
    return `${domain}: ${counts.total}${unavailStr}`;
  });

  const totalUnavail = states.filter(
    (s) => s.state === "unavailable" || s.state === "unknown"
  ).length;

  lines.push("");
  lines.push(`Total: ${states.length} entities (${totalUnavail} unavailable/unknown)`);

  return lines.join("\n");
}
