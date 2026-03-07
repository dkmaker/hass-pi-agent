/**
 * Home Assistant device management tool.
 *
 * Uses WebSocket API for live device data and mutations.
 * Enriches with entity registry, area registry, and config entries
 * for full context (integration names, entity lists, area names).
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiGet } from "../lib/api.js";
import type { HAState } from "../lib/types.js";

// ── Types ────────────────────────────────────────────────────

interface WSDevice {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  model_id: string | null;
  hw_version: string | null;
  sw_version: string | null;
  serial_number: string | null;
  area_id: string | null;
  config_entries: string[];
  connections: [string, string][];
  identifiers: [string, string][];
  labels: string[];
  disabled_by: string | null;
  entry_type: string | null;
  via_device_id: string | null;
  configuration_url: string | null;
  primary_config_entry: string | null;
}

interface ConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  source: string;
  [key: string]: unknown;
}

interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  original_name: string | null;
  name: string | null;
  disabled_by: string | null;
  [key: string]: unknown;
}

interface AreaRegistryEntry {
  id: string;
  name: string;
  floor_id: string | null;
  [key: string]: unknown;
}

// ── Registry loaders (WebSocket) ─────────────────────────────

async function loadConfigEntries(): Promise<Map<string, ConfigEntry>> {
  const map = new Map<string, ConfigEntry>();
  try {
    const entries = await wsCommand<ConfigEntry[]>("config_entries/get");
    for (const e of entries) {
      map.set(e.entry_id, e);
    }
  } catch { /* not available */ }
  return map;
}

async function loadEntityRegistry(): Promise<Map<string, EntityRegistryEntry[]>> {
  // Map device_id → entities
  const map = new Map<string, EntityRegistryEntry[]>();
  try {
    const entries = await wsCommand<EntityRegistryEntry[]>("config/entity_registry/list");
    for (const e of entries) {
      if (e.device_id) {
        const list = map.get(e.device_id) ?? [];
        list.push(e);
        map.set(e.device_id, list);
      }
    }
  } catch { /* not available */ }
  return map;
}

async function loadAreaRegistry(): Promise<Map<string, AreaRegistryEntry>> {
  const map = new Map<string, AreaRegistryEntry>();
  try {
    const areas = await wsCommand<AreaRegistryEntry[]>("config/area_registry/list");
    for (const a of areas) {
      map.set(a.area_id ?? a.id, a);
    }
  } catch { /* not available */ }
  return map;
}

// ── Helpers ──────────────────────────────────────────────────

function getDisplayName(device: WSDevice): string {
  return device.name_by_user || device.name || "(unnamed)";
}

function getIntegrations(device: WSDevice, configEntries: Map<string, ConfigEntry>): string[] {
  // Primary source: identifiers contain [integration, id] tuples
  const fromIdentifiers = device.identifiers.map(([integration]) => integration);
  if (fromIdentifiers.length > 0) return [...new Set(fromIdentifiers)];

  // Fallback: resolve config_entries → domain
  const fromEntries = device.config_entries
    .map((id) => configEntries.get(id)?.domain)
    .filter((d): d is string => !!d);
  return [...new Set(fromEntries)];
}

// ── Tool registration ────────────────────────────────────────

export function registerDevicesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_devices",
    label: "HA Devices",
    description: `Discover, inspect, and manage Home Assistant devices.

Actions:
- list: List devices with filters. Filters: integration, area, manufacturer, model, search. Hides disabled by default. Paginated.
- get: Full detail for one device — hardware info, integrations, area, all entities with states.
- update: Update device properties — rename (name_by_user), move to area (area_id), set labels, disable/enable.
- tree: Show device hierarchy — hub/bridge devices and their children via via_device_id.

Uses WebSocket API for live data. Entity states come from REST API.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "update", "tree"] as const, {
        description: "Action to perform",
      }),
      device_id: Type.Optional(
        Type.String({ description: "Device ID for get/update actions" })
      ),
      integration: Type.Optional(
        Type.String({ description: "Filter by integration domain (e.g., zwave_js, mqtt, hue)" })
      ),
      area: Type.Optional(
        Type.String({ description: "Filter by area name (case-insensitive partial match)" })
      ),
      manufacturer: Type.Optional(
        Type.String({ description: "Filter by manufacturer (case-insensitive partial match)" })
      ),
      model: Type.Optional(
        Type.String({ description: "Filter by model (case-insensitive partial match)" })
      ),
      search: Type.Optional(
        Type.String({ description: "Search device name, manufacturer, and model" })
      ),
      include_disabled: Type.Optional(
        Type.Boolean({ description: "Include disabled devices (default: false)" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results for list (default: 50)" })
      ),
      offset: Type.Optional(
        Type.Number({ description: "Pagination offset (default: 0)" })
      ),
      // Update fields
      name_by_user: Type.Optional(
        Type.String({ description: "Set user-assigned device name (null to clear)" })
      ),
      area_id: Type.Optional(
        Type.String({ description: "Set area ID (null to unassign)" })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: "Set device labels (replaces all)" })
      ),
      disabled_by: Type.Optional(
        Type.String({ description: "Set to 'user' to disable, null to enable" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list":
      return handleList(params);
    case "get":
      return handleGet(params.device_id as string | undefined);
    case "update":
      return handleUpdate(params);
    case "tree":
      return handleTree(params);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: list, get, update, tree`);
  }
}

// ── List ─────────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const [devices, configEntries, areaReg] = await Promise.all([
    wsCommand<WSDevice[]>("config/device_registry/list"),
    loadConfigEntries(),
    loadAreaRegistry(),
  ]);

  const includeDisabled = (params.include_disabled as boolean) ?? false;
  const limit = (params.limit as number) ?? 50;
  const offset = (params.offset as number) ?? 0;
  const integration = (params.integration as string)?.toLowerCase();
  const areaFilter = (params.area as string)?.toLowerCase();
  const mfgFilter = (params.manufacturer as string)?.toLowerCase();
  const modelFilter = (params.model as string)?.toLowerCase();
  const search = (params.search as string)?.toLowerCase();

  let filtered = devices;
  let disabledCount = 0;

  // Count disabled
  disabledCount = filtered.filter((d) => d.disabled_by !== null).length;

  // Hide disabled by default
  if (!includeDisabled) {
    filtered = filtered.filter((d) => d.disabled_by === null);
  }

  // Integration filter
  if (integration) {
    filtered = filtered.filter((d) => {
      const integrations = getIntegrations(d, configEntries);
      return integrations.some((i) => i.toLowerCase() === integration);
    });
  }

  // Area filter
  if (areaFilter) {
    filtered = filtered.filter((d) => {
      if (!d.area_id) return false;
      const area = areaReg.get(d.area_id);
      return area?.name?.toLowerCase().includes(areaFilter) ?? false;
    });
  }

  // Manufacturer filter
  if (mfgFilter) {
    filtered = filtered.filter(
      (d) => d.manufacturer?.toLowerCase().includes(mfgFilter)
    );
  }

  // Model filter
  if (modelFilter) {
    filtered = filtered.filter(
      (d) => d.model?.toLowerCase().includes(modelFilter)
    );
  }

  // Search
  if (search) {
    filtered = filtered.filter((d) => {
      const name = getDisplayName(d).toLowerCase();
      const mfg = (d.manufacturer || "").toLowerCase();
      const model = (d.model || "").toLowerCase();
      return name.includes(search) || mfg.includes(search) || model.includes(search);
    });
  }

  // Sort by name
  filtered.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  // Format output
  const lines: string[] = [];
  for (const d of page) {
    const name = getDisplayName(d);
    const integrations = getIntegrations(d, configEntries);
    const area = d.area_id ? areaReg.get(d.area_id)?.name : null;
    const parts: string[] = [];

    // First line: name + basic info
    let line = `${name}`;
    if (d.manufacturer || d.model) {
      const hw = [d.manufacturer, d.model].filter(Boolean).join(" ");
      line += ` — ${hw}`;
    }
    parts.push(line);

    // Second line: details
    const details: string[] = [`id: ${d.id}`];
    if (integrations.length > 0) details.push(`via: ${integrations.join(", ")}`);
    if (area) details.push(`area: ${area}`);
    if (d.disabled_by) details.push(`disabled: ${d.disabled_by}`);
    if (d.via_device_id) details.push("has hub");
    parts.push(`  ${details.join(" | ")}`);

    lines.push(parts.join("\n"));
  }

  // Summary
  const disabledStr = !includeDisabled && disabledCount > 0
    ? ` (${disabledCount} disabled hidden)`
    : "";

  let summary: string;
  if (total <= limit && offset === 0) {
    summary = `Showing ${total} devices${disabledStr}`;
  } else {
    summary = `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} devices${disabledStr}`;
  }

  return lines.join("\n") + "\n\n" + summary;
}

// ── Get ──────────────────────────────────────────────────────

async function handleGet(deviceId?: string): Promise<string> {
  if (!deviceId) throw new Error("'device_id' is required for get");

  const devices = await wsCommand<WSDevice[]>("config/device_registry/list");
  const device = devices.find((d) => d.id === deviceId);
  if (!device) throw new Error(`Device '${deviceId}' not found`);

  const [configEntries, areaReg, entityByDevice] = await Promise.all([
    loadConfigEntries(),
    loadAreaRegistry(),
    loadEntityRegistry(),
  ]);

  // Build device detail
  const integrations = getIntegrations(device, configEntries);
  const area = device.area_id ? areaReg.get(device.area_id) : null;

  const result: Record<string, unknown> = {
    id: device.id,
    name: device.name,
    name_by_user: device.name_by_user,
    display_name: getDisplayName(device),
    manufacturer: device.manufacturer,
    model: device.model,
    model_id: device.model_id,
    hw_version: device.hw_version,
    sw_version: device.sw_version,
    serial_number: device.serial_number,
    integrations,
    area: area ? { id: area.id, name: area.name, floor_id: area.floor_id } : null,
    labels: device.labels,
    disabled_by: device.disabled_by,
    entry_type: device.entry_type,
    via_device_id: device.via_device_id,
    configuration_url: device.configuration_url,
    identifiers: device.identifiers,
    connections: device.connections,
  };

  // Add entities with current states
  const deviceEntities = entityByDevice.get(deviceId) ?? [];
  if (deviceEntities.length > 0) {
    try {
      const allStates = await apiGet<HAState[]>("/api/states");
      const stateMap = new Map(allStates.map((s) => [s.entity_id, s]));

      result.entities = deviceEntities.map((e) => {
        const state = stateMap.get(e.entity_id);
        return {
          entity_id: e.entity_id,
          platform: e.platform,
          name: e.name || e.original_name,
          state: state?.state ?? "unknown",
          disabled_by: e.disabled_by,
        };
      }).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
    } catch {
      // If REST API fails, still return entities without states
      result.entities = deviceEntities.map((e) => ({
        entity_id: e.entity_id,
        platform: e.platform,
        name: e.name || e.original_name,
        disabled_by: e.disabled_by,
      })).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
    }
  } else {
    result.entities = [];
  }

  // Add child devices (devices that have via_device_id pointing to this device)
  const children = devices.filter((d) => d.via_device_id === deviceId);
  if (children.length > 0) {
    result.child_devices = children.map((d) => ({
      id: d.id,
      name: getDisplayName(d),
      manufacturer: d.manufacturer,
      model: d.model,
    }));
  }

  return JSON.stringify(result, null, 2);
}

// ── Update ───────────────────────────────────────────────────

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const deviceId = params.device_id as string | undefined;
  if (!deviceId) throw new Error("'device_id' is required for update");

  // Build update payload — only include fields that were explicitly provided
  const updateData: Record<string, unknown> = { device_id: deviceId };
  let hasUpdates = false;

  if ("name_by_user" in params) {
    updateData.name_by_user = params.name_by_user ?? null;
    hasUpdates = true;
  }
  if ("area_id" in params) {
    updateData.area_id = params.area_id ?? null;
    hasUpdates = true;
  }
  if ("labels" in params) {
    updateData.labels = params.labels;
    hasUpdates = true;
  }
  if ("disabled_by" in params) {
    updateData.disabled_by = params.disabled_by ?? null;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw new Error(
      "No update fields provided. Use: name_by_user, area_id, labels, disabled_by"
    );
  }

  const updated = await wsCommand<WSDevice>("config/device_registry/update", updateData);

  const name = getDisplayName(updated);
  const changes: string[] = [];
  if ("name_by_user" in params) changes.push(`name: ${updated.name_by_user ?? "(cleared)"}`);
  if ("area_id" in params) changes.push(`area: ${updated.area_id ?? "(unassigned)"}`);
  if ("labels" in params) changes.push(`labels: [${updated.labels.join(", ")}]`);
  if ("disabled_by" in params) changes.push(`disabled: ${updated.disabled_by ?? "no"}`);

  return `✅ Updated device '${name}' (${deviceId})\n${changes.map((c) => `  ${c}`).join("\n")}`;
}

// ── Tree ─────────────────────────────────────────────────────

async function handleTree(params: Record<string, unknown>): Promise<string> {
  const [devices, configEntries, areaReg] = await Promise.all([
    wsCommand<WSDevice[]>("config/device_registry/list"),
    loadConfigEntries(),
    loadAreaRegistry(),
  ]);

  const includeDisabled = (params.include_disabled as boolean) ?? false;
  const integration = (params.integration as string)?.toLowerCase();

  let filtered = devices;

  if (!includeDisabled) {
    filtered = filtered.filter((d) => d.disabled_by === null);
  }

  if (integration) {
    // Include both hub devices and their children for the integration
    const integrationDeviceIds = new Set<string>();
    for (const d of filtered) {
      const integrations = getIntegrations(d, configEntries);
      if (integrations.some((i) => i.toLowerCase() === integration)) {
        integrationDeviceIds.add(d.id);
      }
    }
    filtered = filtered.filter(
      (d) => integrationDeviceIds.has(d.id) || (d.via_device_id && integrationDeviceIds.has(d.via_device_id))
    );
  }

  // Build tree: find root devices (no via_device_id or via_device_id not in our set)
  const deviceMap = new Map(filtered.map((d) => [d.id, d]));
  const childrenOf = new Map<string, WSDevice[]>();
  const roots: WSDevice[] = [];

  for (const d of filtered) {
    if (d.via_device_id && deviceMap.has(d.via_device_id)) {
      const children = childrenOf.get(d.via_device_id) ?? [];
      children.push(d);
      childrenOf.set(d.via_device_id, children);
    } else {
      roots.push(d);
    }
  }

  // Sort
  roots.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

  // Render tree
  const lines: string[] = [];

  function renderDevice(device: WSDevice, prefix: string, isLast: boolean): void {
    const connector = prefix === "" ? "" : (isLast ? "└── " : "├── ");
    const integrations = getIntegrations(device, configEntries);
    const area = device.area_id ? areaReg.get(device.area_id)?.name : null;

    let line = `${prefix}${connector}${getDisplayName(device)}`;
    const meta: string[] = [];
    if (device.manufacturer || device.model) {
      meta.push([device.manufacturer, device.model].filter(Boolean).join(" "));
    }
    if (integrations.length > 0 && prefix === "") meta.push(integrations.join(", "));
    if (area) meta.push(area);
    if (meta.length > 0) line += ` (${meta.join(" — ")})`;

    lines.push(line);

    const children = (childrenOf.get(device.id) ?? [])
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

    const childPrefix = prefix === "" ? "" : prefix + (isLast ? "    " : "│   ");
    for (let i = 0; i < children.length; i++) {
      renderDevice(children[i], childPrefix, i === children.length - 1);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    renderDevice(roots[i], "", i === roots.length - 1);
  }

  // Summary
  const hubCount = [...childrenOf.keys()].length;
  const childCount = filtered.length - roots.length;
  lines.push("");
  lines.push(`${filtered.length} devices: ${roots.length} root, ${hubCount} hubs, ${childCount} via hub`);

  return lines.join("\n");
}
