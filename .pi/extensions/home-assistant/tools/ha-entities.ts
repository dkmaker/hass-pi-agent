/**
 * Home Assistant entity discovery, inspection, and management tool.
 *
 * Uses REST API for live state + WebSocket API for registry data.
 * Supports update (rename, move area, disable) and remove actions.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { apiGet } from "../lib/api.js";
import { wsCommand } from "../lib/ws.js";
import type { HAState } from "../lib/types.js";

// ── Types ────────────────────────────────────────────────────

interface WSEntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  platform: string;
  original_name: string | null;
  name: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
  area_id: string | null;
  labels: string[];
  icon: string | null;
  unique_id: string;
  config_entry_id: string | null;
  [key: string]: unknown;
}

interface WSDeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  [key: string]: unknown;
}

interface WSAreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id: string | null;
  [key: string]: unknown;
}

// ── Registry loaders (WebSocket) ─────────────────────────────

async function loadEntityRegistry(): Promise<Map<string, WSEntityRegistryEntry>> {
  const map = new Map<string, WSEntityRegistryEntry>();
  try {
    const entries = await wsCommand<WSEntityRegistryEntry[]>("config/entity_registry/list");
    for (const e of entries) {
      map.set(e.entity_id, e);
    }
  } catch { /* WS not available */ }
  return map;
}

async function loadDeviceRegistry(): Promise<Map<string, WSDeviceRegistryEntry>> {
  const map = new Map<string, WSDeviceRegistryEntry>();
  try {
    const devices = await wsCommand<WSDeviceRegistryEntry[]>("config/device_registry/list");
    for (const d of devices) {
      map.set(d.id, d);
    }
  } catch { /* WS not available */ }
  return map;
}

async function loadAreaRegistry(): Promise<Map<string, WSAreaRegistryEntry>> {
  const map = new Map<string, WSAreaRegistryEntry>();
  try {
    const areas = await wsCommand<WSAreaRegistryEntry[]>("config/area_registry/list");
    for (const a of areas) {
      map.set(a.area_id, a);
    }
  } catch { /* WS not available */ }
  return map;
}

// ── Tool registration ────────────────────────────────────────

export function registerEntitiesTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_entities",
    label: "HA Entities",
    description: `Discover and inspect HA entities with device/area context. Actions: list, get, domains, update, remove, regenerate-ids. Use ha_tool_docs('ha_entities') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "domains", "update", "remove", "regenerate-ids"] as const, {
        description: "Action to perform",
      }),
      entity_ids: Type.Optional(
        Type.Array(Type.String(), { description: "Entity IDs for regenerate-ids action" })
      ),
      entity_id: Type.Optional(
        Type.String({ description: "Entity ID for get/update/remove (e.g., sensor.temperature)" })
      ),
      domain: Type.Optional(
        Type.String({ description: "Filter by domain (e.g., sensor, light, switch)" })
      ),
      device_id: Type.Optional(
        Type.String({ description: "Filter by device ID — show only entities belonging to this device" })
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
      // Update fields
      name: Type.Optional(
        Type.String({ description: "Set entity friendly name (null to clear)" })
      ),
      new_entity_id: Type.Optional(
        Type.String({ description: "Change the entity_id" })
      ),
      area_id: Type.Optional(
        Type.String({ description: "Set area ID (null to unassign)" })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: "Set entity labels (replaces all)" })
      ),
      icon: Type.Optional(
        Type.String({ description: "Set entity icon (e.g., mdi:thermometer)" })
      ),
      disabled_by: Type.Optional(
        Type.String({ description: "Set to 'user' to disable, null to enable" })
      ),
      hidden_by: Type.Optional(
        Type.String({ description: "Set to 'user' to hide, null to unhide" })
      ),
      confirm: Type.Optional(
        Type.Boolean({ description: "For regenerate-ids: set true to apply renames after previewing (default: false, preview only)" })
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
      return handleGet(params.entity_id as string | undefined);
    case "domains":
      return handleDomains(params.include_unavailable as boolean | undefined);
    case "update":
      return handleUpdate(params);
    case "remove":
      return handleRemove(params.entity_id as string | undefined);
    case "regenerate-ids":
      return handleRegenerateIds(params);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: list, get, domains, update, remove, regenerate-ids`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const allStates = await apiGet<HAState[]>("/api/states");
  const entityReg = await loadEntityRegistry();
  const deviceReg = await loadDeviceRegistry();
  const areaReg = await loadAreaRegistry();

  const includeUnavailable = (params.include_unavailable as boolean) ?? false;
  const limit = (params.limit as number) ?? 50;
  const offset = (params.offset as number) ?? 0;

  let filtered = allStates;
  let unavailableCount = 0;

  // Domain filter
  if (params.domain) {
    const d = (params.domain as string).toLowerCase();
    filtered = filtered.filter((s) => s.entity_id.startsWith(d + "."));
  }

  // Device filter
  if (params.device_id) {
    const deviceEntityIds = new Set<string>();
    for (const [entityId, entry] of entityReg) {
      if (entry.device_id === params.device_id) {
        deviceEntityIds.add(entityId);
      }
    }
    filtered = filtered.filter((s) => deviceEntityIds.has(s.entity_id));
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
    const sv = (params.state as string).toLowerCase();
    filtered = filtered.filter((s) => s.state.toLowerCase() === sv);
  }

  // Search filter
  if (params.search) {
    const q = (params.search as string).toLowerCase();
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

    const nameStr = friendlyName ? ` (${friendlyName})` : "";
    parts.push(`${s.entity_id}: ${s.state}${nameStr}`);

    if (regEntry?.device_id) {
      const device = deviceReg.get(regEntry.device_id);
      if (device) {
        const deviceName = device.name_by_user || device.name;
        if (deviceName) {
          const areaName = device.area_id ? areaReg.get(device.area_id)?.name : null;
          const deviceStr = areaName ? `${deviceName} @ ${areaName}` : deviceName;
          parts.push(`  device: ${deviceStr}`);
        }
      }
    } else if (regEntry?.area_id) {
      const areaName = areaReg.get(regEntry.area_id)?.name;
      if (areaName) parts.push(`  area: ${areaName}`);
    }

    lines.push(parts.join("\n"));
  }

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
  const entityReg = await loadEntityRegistry();
  const deviceReg = await loadDeviceRegistry();
  const areaReg = await loadAreaRegistry();

  const result: Record<string, unknown> = {
    entity_id: state.entity_id,
    state: state.state,
    attributes: state.attributes,
    last_changed: state.last_changed,
    last_updated: state.last_updated,
  };

  const regEntry = entityReg.get(entityId);
  if (regEntry) {
    result.platform = regEntry.platform;
    result.labels = regEntry.labels;
    result.icon = regEntry.icon;
    result.hidden_by = regEntry.hidden_by;
    result.disabled_by = regEntry.disabled_by;
    if (regEntry.area_id) {
      result.area = areaReg.get(regEntry.area_id)?.name ?? regEntry.area_id;
    }

    if (regEntry.device_id) {
      const device = deviceReg.get(regEntry.device_id);
      result.device = {
        id: regEntry.device_id,
        name: device?.name_by_user || (device?.name ?? null),
        manufacturer: device?.manufacturer ?? null,
        model: device?.model ?? null,
        area: device?.area_id ? areaReg.get(device.area_id)?.name ?? device.area_id : null,
      };
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

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const entityId = params.entity_id as string | undefined;
  if (!entityId) throw new Error("'entity_id' is required for update");

  const updateData: Record<string, unknown> = { entity_id: entityId };
  let hasUpdates = false;

  if ("name" in params) {
    updateData.name = params.name ?? null;
    hasUpdates = true;
  }
  if ("new_entity_id" in params) {
    updateData.new_entity_id = params.new_entity_id;
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
  if ("icon" in params) {
    updateData.icon = params.icon ?? null;
    hasUpdates = true;
  }
  if ("disabled_by" in params) {
    updateData.disabled_by = params.disabled_by ?? null;
    hasUpdates = true;
  }
  if ("hidden_by" in params) {
    updateData.hidden_by = params.hidden_by ?? null;
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw new Error(
      "No update fields provided. Use: name, new_entity_id, area_id, labels, icon, disabled_by, hidden_by"
    );
  }

  const updated = await wsCommand<WSEntityRegistryEntry>(
    "config/entity_registry/update",
    updateData
  );

  const changes: string[] = [];
  if ("name" in params) changes.push(`name: ${updated.name ?? "(cleared)"}`);
  if ("new_entity_id" in params) changes.push(`entity_id: ${updated.entity_id}`);
  if ("area_id" in params) changes.push(`area: ${updated.area_id ?? "(unassigned)"}`);
  if ("labels" in params) changes.push(`labels: [${updated.labels.join(", ")}]`);
  if ("icon" in params) changes.push(`icon: ${updated.icon ?? "(cleared)"}`);
  if ("disabled_by" in params) changes.push(`disabled: ${updated.disabled_by ?? "no"}`);
  if ("hidden_by" in params) changes.push(`hidden: ${updated.hidden_by ?? "no"}`);

  return `✅ Updated entity '${updated.entity_id}'\n${changes.map((c) => `  ${c}`).join("\n")}`;
}

async function handleRemove(entityId?: string): Promise<string> {
  if (!entityId) throw new Error("'entity_id' is required for remove");

  await wsCommand("config/entity_registry/remove", { entity_id: entityId });
  return `✅ Removed entity '${entityId}' from registry`;
}

// ── Regenerate Entity IDs ────────────────────────────────────

interface RelatedResult {
  automation?: string[];
  script?: string[];
  scene?: string[];
  group?: string[];
  [key: string]: string[] | undefined;
}

async function handleRegenerateIds(params: Record<string, unknown>): Promise<string> {
  let entityIds = params.entity_ids as string[] | undefined;
  const deviceId = params.device_id as string | undefined;
  const confirm = params.confirm as boolean | undefined;

  // If device_id provided, get all entities for that device
  if (!entityIds && deviceId) {
    const entityReg = await loadEntityRegistry();
    entityIds = [];
    for (const [eid, entry] of entityReg) {
      if (entry.device_id === deviceId) {
        entityIds.push(eid);
      }
    }
    if (entityIds.length === 0) {
      throw new Error(`No entities found for device '${deviceId}'`);
    }
  }

  if (!entityIds || entityIds.length === 0) {
    throw new Error("Provide 'entity_ids' array or 'device_id' to select entities for ID regeneration");
  }

  // Get suggested new IDs from HA
  const mapping = await wsCommand<Record<string, string | null>>(
    "config/entity_registry/get_automatic_entity_ids",
    { entity_ids: entityIds }
  );

  // Categorize results
  const willRename: [string, string][] = [];
  const cantRename: string[] = [];
  const noChange: string[] = [];

  for (const [oldId, newId] of Object.entries(mapping)) {
    if (newId === null) {
      cantRename.push(oldId);
    } else if (oldId === newId) {
      noChange.push(oldId);
    } else {
      willRename.push([oldId, newId]);
    }
  }

  if (willRename.length === 0) {
    const lines = ["No entities need renaming."];
    if (noChange.length > 0) lines.push(`\nAlready correct (${noChange.length}): ${noChange.join(", ")}`);
    if (cantRename.length > 0) lines.push(`\nCannot rename (${cantRename.length}): ${cantRename.join(", ")}`);
    return lines.join("\n");
  }

  // Find related automations/scripts/scenes for ALL entities that will be renamed
  const allRelated: Map<string, RelatedResult> = new Map();
  for (const [oldId] of willRename) {
    try {
      const related = await wsCommand<RelatedResult>("search/related", {
        item_type: "entity",
        item_id: oldId,
      });
      if (related && (related.automation?.length || related.script?.length || related.scene?.length || related.group?.length)) {
        allRelated.set(oldId, related);
      }
    } catch {
      // search component may not be loaded — continue without
    }
  }

  // Build output
  const lines: string[] = [];
  lines.push(`## Entity ID Regeneration Preview\n`);
  lines.push(`### Will rename (${willRename.length}):\n`);
  lines.push("| Old Entity ID | New Entity ID |");
  lines.push("|---|---|");
  for (const [oldId, newId] of willRename) {
    lines.push(`| ${oldId} | ${newId} |`);
  }

  if (noChange.length > 0) {
    lines.push(`\n### Already correct (${noChange.length}): ${noChange.join(", ")}`);
  }
  if (cantRename.length > 0) {
    lines.push(`\n### Cannot rename (${cantRename.length}): ${cantRename.join(", ")}`);
  }

  // Show related items that will need updating
  if (allRelated.size > 0) {
    lines.push(`\n### ⚠️ References found — these items use renamed entities:\n`);
    for (const [entityId, related] of allRelated) {
      const refs: string[] = [];
      if (related.automation?.length) refs.push(`automations: ${related.automation.join(", ")}`);
      if (related.script?.length) refs.push(`scripts: ${related.script.join(", ")}`);
      if (related.scene?.length) refs.push(`scenes: ${related.scene.join(", ")}`);
      if (related.group?.length) refs.push(`groups: ${related.group.join(", ")}`);
      lines.push(`**${entityId}** → ${refs.join("; ")}`);
    }
    lines.push(`\n⚠️ **ACTION REQUIRED**: After renaming, you MUST update the automations, scripts, scenes, and groups listed above to use the new entity IDs. Failure to do so will break them.`);
  }

  // If confirm not set, return preview only
  if (!confirm) {
    lines.push(`\n---\nThis is a **preview only**. To apply, call again with \`confirm: true\`.`);
    lines.push(`\n🔍 **Before confirming**: Review all referenced automations/scripts above and plan updates for the new entity IDs.`);
    return lines.join("\n");
  }

  // Apply renames
  const succeeded: [string, string][] = [];
  const failed: [string, string][] = [];

  for (const [oldId, newId] of willRename) {
    try {
      await wsCommand("config/entity_registry/update", {
        entity_id: oldId,
        new_entity_id: newId,
      });
      succeeded.push([oldId, newId]);
    } catch (err: any) {
      failed.push([oldId, err.message || "unknown error"]);
    }
  }

  lines.push(`\n---\n### Results\n`);
  if (succeeded.length > 0) {
    lines.push(`✅ Renamed ${succeeded.length} entities successfully.`);
  }
  if (failed.length > 0) {
    lines.push(`\n❌ Failed (${failed.length}):`);
    for (const [oldId, err] of failed) {
      lines.push(`  - ${oldId}: ${err}`);
    }
  }

  if (allRelated.size > 0) {
    lines.push(`\n⚠️ **IMPORTANT**: Now update the automations, scripts, scenes, and groups listed above to use the new entity IDs.`);
  }

  return lines.join("\n");
}
