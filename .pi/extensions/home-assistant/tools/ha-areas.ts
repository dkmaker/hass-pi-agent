/**
 * Home Assistant area and floor management tool.
 *
 * Full CRUD for areas and floors via WebSocket API.
 * All changes take effect immediately.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { defineHaTool, type HaDetails, type Row } from "../lib/tool-render.js";
import { backupBeforeMutation } from "../lib/mutation-log.js";

// ── Types ────────────────────────────────────────────────────

interface WSArea {
  area_id: string;
  name: string;
  aliases: string[];
  floor_id: string | null;
  icon: string | null;
  labels: string[];
  picture: string | null;
}

interface WSFloor {
  floor_id: string;
  name: string;
  aliases: string[];
  icon: string | null;
  level: number | null;
}

interface WSDevice {
  id: string;
  area_id: string | null;
  name: string | null;
  name_by_user: string | null;
  [key: string]: unknown;
}

interface WSEntity {
  entity_id: string;
  area_id: string | null;
  device_id: string | null;
  [key: string]: unknown;
}

// ── Tool registration ────────────────────────────────────────

export function registerAreasTool(pi: ExtensionAPI): void {
  defineHaTool(pi, {
    name: "ha_areas",
    label: "HA Areas",
    description: `Manage HA areas and floors. Actions: list, get, create-area, update-area, delete-area, list-floors, create-floor, update-floor, delete-floor.`,
    promptSnippet:
      "Manage HA areas and floors: create/update/delete, list grouped by floor with device/entity counts.",
    promptGuidelines: [
      "Use ha_areas when the user asks to create, rename, delete, or list areas and floors, or assign areas to floors.",
      "Use ha_areas action:list to see areas grouped by floor with device/entity counts before reorganizing.",
    ],

    parameters: Type.Object({
      action: StringEnum(
        ["list", "get", "create-area", "update-area", "delete-area",
         "list-floors", "create-floor", "update-floor", "delete-floor"] as const,
        { description: "Action to perform" }
      ),
      area_id: Type.Optional(
        Type.String({ description: "Area ID for get/update-area/delete-area" })
      ),
      floor_id: Type.Optional(
        Type.String({ description: "Floor ID for update-floor/delete-floor, or to assign area to floor" })
      ),
      name: Type.Optional(
        Type.String({ description: "Name for create/update" })
      ),
      icon: Type.Optional(
        Type.String({ description: "Icon (e.g., mdi:sofa)" })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: "Labels for the area" })
      ),
      aliases: Type.Optional(
        Type.Array(Type.String(), { description: "Alternative names" })
      ),
      level: Type.Optional(
        Type.Number({ description: "Floor level (0=ground, negative=basement, positive=upper)" })
      ),
      confirm: Type.Optional(
        Type.Boolean({ description: "Set true to confirm delete-area/delete-floor (default: false, preview only)" })
      ),
    }),


    execute: (params) => executeAction(params),
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string | HaDetails> {
  switch (params.action as string) {
    case "list": return handleList();
    case "get": return handleGet(params.area_id as string | undefined);
    case "create-area": return handleCreateArea(params);
    case "update-area": return handleUpdateArea(params);
    case "delete-area": return handleDeleteArea(params.area_id as string | undefined, params.confirm as boolean | undefined);
    case "list-floors": return handleListFloors();
    case "create-floor": return handleCreateFloor(params);
    case "update-floor": return handleUpdateFloor(params);
    case "delete-floor": return handleDeleteFloor(params.floor_id as string | undefined, params.confirm as boolean | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Area handlers ────────────────────────────────────────────

async function handleList(): Promise<HaDetails> {
  const [areas, floors, devices, entities] = await Promise.all([
    wsCommand<WSArea[]>("config/area_registry/list"),
    wsCommand<WSFloor[]>("config/floor_registry/list"),
    wsCommand<WSDevice[]>("config/device_registry/list"),
    wsCommand<WSEntity[]>("config/entity_registry/list"),
  ]);

  // Count devices/entities per area
  const deviceCounts = new Map<string, number>();
  const entityCounts = new Map<string, number>();
  for (const d of devices) {
    if (d.area_id) deviceCounts.set(d.area_id, (deviceCounts.get(d.area_id) ?? 0) + 1);
  }
  for (const e of entities) {
    if (e.area_id) entityCounts.set(e.area_id, (entityCounts.get(e.area_id) ?? 0) + 1);
  }

  const floorMap = new Map(floors.map((f) => [f.floor_id, f]));
  floors.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const floorOrder = new Map(floors.map((f, i) => [f.floor_id, i]));

  const sorted = [...areas].sort((a, b) => {
    const fa = a.floor_id ? floorOrder.get(a.floor_id) ?? 998 : 1000;
    const fb = b.floor_id ? floorOrder.get(b.floor_id) ?? 998 : 1000;
    return fa - fb || a.name.localeCompare(b.name);
  });

  const rows: Row[] = sorted.map((a) => ({
    cells: {
      name: a.name,
      floor: a.floor_id ? floorMap.get(a.floor_id)?.name || "" : "",
      devices: String(deviceCounts.get(a.area_id) ?? 0),
      entities: String(entityCounts.get(a.area_id) ?? 0),
      id: a.area_id,
    },
  }));

  return {
    kind: "table",
    columns: [
      { key: "name", label: "Area" },
      { key: "floor", label: "Floor" },
      { key: "devices", label: "Devices" },
      { key: "entities", label: "Entities" },
      { key: "id", label: "ID" },
    ],
    rows,
    note: `${areas.length} areas, ${floors.length} floors`,
  };
}

async function handleGet(areaId?: string): Promise<string> {
  if (!areaId) throw new Error("'area_id' is required for get");

  const [areas, devices, entities] = await Promise.all([
    wsCommand<WSArea[]>("config/area_registry/list"),
    wsCommand<WSDevice[]>("config/device_registry/list"),
    wsCommand<WSEntity[]>("config/entity_registry/list"),
  ]);

  const area = areas.find((a) => a.area_id === areaId);
  if (!area) throw new Error(`Area '${areaId}' not found`);

  const areaDevices = devices
    .filter((d) => d.area_id === areaId)
    .map((d) => ({ id: d.id, name: d.name_by_user || d.name }));

  const areaEntities = entities
    .filter((e) => e.area_id === areaId)
    .map((e) => e.entity_id);

  const lines: string[] = [];
  lines.push(`## ${area.name}`);
  lines.push("");
  lines.push("| Property | Value |");
  lines.push("|----------|-------|");
  lines.push(`| ID | ${area.area_id} |`);
  if (area.floor_id) lines.push(`| Floor | ${area.floor_id} |`);
  if (area.icon) lines.push(`| Icon | ${area.icon} |`);
  if (area.aliases?.length) lines.push(`| Aliases | ${area.aliases.join(", ")} |`);
  if (area.labels?.length) lines.push(`| Labels | ${area.labels.join(", ")} |`);

  if (areaDevices.length > 0) {
    lines.push("");
    lines.push(`### Devices (${areaDevices.length})`);
    for (const d of areaDevices) { lines.push(`- ${d.name} (${d.id})`); }
  }

  if (areaEntities.length > 0) {
    lines.push("");
    lines.push(`### Entities (${areaEntities.length})`);
    for (const e of areaEntities) { lines.push(`- ${e}`); }
  }

  if (areaDevices.length === 0 && areaEntities.length === 0) {
    lines.push("");
    lines.push("*No devices or entities assigned.*");
  }

  return lines.join("\n");
}

async function handleCreateArea(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for create-area");

  const data: Record<string, unknown> = { name };
  if (params.floor_id !== undefined) data.floor_id = params.floor_id;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.labels !== undefined) data.labels = params.labels;
  if (params.aliases !== undefined) data.aliases = params.aliases;

  const result = await wsCommand<WSArea>("config/area_registry/create", data);
  return `✅ Created area '${result.name}' (id: ${result.area_id})`;
}

async function handleUpdateArea(params: Record<string, unknown>): Promise<string> {
  const areaId = params.area_id as string | undefined;
  if (!areaId) throw new Error("'area_id' is required for update-area");

  const data: Record<string, unknown> = { area_id: areaId };
  if (params.name !== undefined) data.name = params.name;
  if (params.floor_id !== undefined) data.floor_id = params.floor_id;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.labels !== undefined) data.labels = params.labels;
  if (params.aliases !== undefined) data.aliases = params.aliases;

  // Snapshot current state before mutation
  try {
    const areas = await wsCommand<WSArea[]>("config/area_registry/list");
    const current = areas.find((a) => a.area_id === areaId);
    if (current) backupBeforeMutation("ha_areas", "update-area", areaId, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSArea>("config/area_registry/update", data);
  return `✅ Updated area '${result.name}' (id: ${result.area_id})`;
}

async function handleDeleteArea(areaId?: string, confirm?: boolean): Promise<string> {
  if (!areaId) throw new Error("'area_id' is required for delete-area");
  if (!confirm) {
    return `⚠️ **Confirm delete**: area \`${areaId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  // Snapshot current state before deletion
  try {
    const areas = await wsCommand<WSArea[]>("config/area_registry/list");
    const current = areas.find((a) => a.area_id === areaId);
    if (current) backupBeforeMutation("ha_areas", "delete-area", areaId, current);
  } catch { /* best-effort */ }

  await wsCommand("config/area_registry/delete", { area_id: areaId });
  return `✅ Deleted area '${areaId}'`;
}

// ── Floor handlers ───────────────────────────────────────────

async function handleListFloors(): Promise<string> {
  const floors = await wsCommand<WSFloor[]>("config/floor_registry/list");
  floors.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

  if (floors.length === 0) return "No floors defined.";

  const lines: string[] = [
    "| Name | Level | Icon | ID |",
    "|------|-------|------|----|",
    ...floors.map((f) => `| **${f.name}** | ${f.level ?? ""} | ${f.icon || ""} | ${f.floor_id} |`),
    `\n${floors.length} floors`,
  ];
  return lines.join("\n");
}

async function handleCreateFloor(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for create-floor");

  const data: Record<string, unknown> = { name };
  if (params.level !== undefined) data.level = params.level;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.aliases !== undefined) data.aliases = params.aliases;

  const result = await wsCommand<WSFloor>("config/floor_registry/create", data);
  return `✅ Created floor '${result.name}' (id: ${result.floor_id})`;
}

async function handleUpdateFloor(params: Record<string, unknown>): Promise<string> {
  const floorId = params.floor_id as string | undefined;
  if (!floorId) throw new Error("'floor_id' is required for update-floor");

  const data: Record<string, unknown> = { floor_id: floorId };
  if (params.name !== undefined) data.name = params.name;
  if (params.level !== undefined) data.level = params.level;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.aliases !== undefined) data.aliases = params.aliases;

  try {
    const floors = await wsCommand<WSFloor[]>("config/floor_registry/list");
    const current = floors.find((f) => f.floor_id === floorId);
    if (current) backupBeforeMutation("ha_areas", "update-floor", floorId, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSFloor>("config/floor_registry/update", data);
  return `✅ Updated floor '${result.name}' (id: ${result.floor_id})`;
}

async function handleDeleteFloor(floorId?: string, confirm?: boolean): Promise<string> {
  if (!floorId) throw new Error("'floor_id' is required for delete-floor");
  if (!confirm) {
    return `⚠️ **Confirm delete**: floor \`${floorId}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  try {
    const floors = await wsCommand<WSFloor[]>("config/floor_registry/list");
    const current = floors.find((f) => f.floor_id === floorId);
    if (current) backupBeforeMutation("ha_areas", "delete-floor", floorId, current);
  } catch { /* best-effort */ }

  await wsCommand("config/floor_registry/delete", { floor_id: floorId });
  return `✅ Deleted floor '${floorId}'`;
}
