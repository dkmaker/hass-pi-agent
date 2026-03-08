/**
 * Home Assistant zone management tool.
 *
 * Full CRUD for zones via WebSocket collection API.
 * All changes take effect immediately.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

// ── Types ────────────────────────────────────────────────────

interface WSZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  icon: string;
  passive: boolean;
}

// ── Tool registration ────────────────────────────────────────

export function registerZonesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_zones",
    label: "HA Zones",
    description: `Manage HA zones (presence detection areas). Actions: list, get, create, update, delete. Use ha_tool_docs('ha_zones') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Zone ID (for get/update/delete)" })),
      name: Type.Optional(Type.String({ description: "Zone name" })),
      latitude: Type.Optional(Type.Number({ description: "Latitude" })),
      longitude: Type.Optional(Type.Number({ description: "Longitude" })),
      radius: Type.Optional(Type.Number({ description: "Radius in meters (default: 100)" })),
      icon: Type.Optional(Type.String({ description: "Icon (e.g., mdi:briefcase)" })),
      passive: Type.Optional(Type.Boolean({ description: "Passive zone (don't trigger enter/leave events)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Zones", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList();
    case "get": return handleGet(params.id as string | undefined);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params.id as string | undefined, params.confirm as boolean | undefined);
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const zones = await wsCommand<WSZone[]>("zone/list");
  if (zones.length === 0) return "No custom zones defined.";

  zones.sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [
    "| Name | Location | Radius | Icon | Passive | ID |",
    "|------|----------|--------|------|---------|-----|",
    ...zones.map((z) => {
      const loc = `${z.latitude.toFixed(4)}, ${z.longitude.toFixed(4)}`;
      return `| **${z.name}** | ${loc} | ${z.radius}m | ${z.icon || ""} | ${z.passive ? "yes" : ""} | ${z.id} |`;
    }),
    `\n${zones.length} zones`,
  ];
  return lines.join("\n");
}

async function handleGet(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for get");

  const zones = await wsCommand<WSZone[]>("zone/list");
  const zone = zones.find((z) => z.id === id);
  if (!zone) throw new Error(`Zone '${id}' not found`);

  return [
    `## ${zone.name}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| ID | ${zone.id} |`,
    `| Latitude | ${zone.latitude} |`,
    `| Longitude | ${zone.longitude} |`,
    `| Radius | ${zone.radius}m |`,
    `| Icon | ${zone.icon || "—"} |`,
    `| Passive | ${zone.passive} |`,
  ].join("\n");
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for create");
  if (params.latitude === undefined) throw new Error("'latitude' is required for create");
  if (params.longitude === undefined) throw new Error("'longitude' is required for create");

  const data: Record<string, unknown> = {
    name,
    latitude: params.latitude,
    longitude: params.longitude,
    radius: params.radius ?? 100,
    icon: params.icon ?? "mdi:map-marker",
    passive: params.passive ?? false,
  };

  const result = await wsCommand<WSZone>("zone/create", data);
  return `✅ Created zone '${result.name}' (id: ${result.id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const id = params.id as string | undefined;
  if (!id) throw new Error("'id' is required for update");

  const data: Record<string, unknown> = { id };
  if (params.name !== undefined) data.name = params.name;
  if (params.latitude !== undefined) data.latitude = params.latitude;
  if (params.longitude !== undefined) data.longitude = params.longitude;
  if (params.radius !== undefined) data.radius = params.radius;
  if (params.icon !== undefined) data.icon = params.icon;
  if (params.passive !== undefined) data.passive = params.passive;

  const result = await wsCommand<WSZone>("zone/update", data);
  return `✅ Updated zone '${result.name}' (id: ${result.id})`;
}

async function handleDelete(id?: string, confirm?: boolean): Promise<string> {
  if (!id) throw new Error("'id' is required for delete");
  if (!confirm) {
    return `⚠️ **Confirm delete**: zone \`${id}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }
  await wsCommand("zone/delete", { id });
  return `✅ Deleted zone '${id}'`;
}
