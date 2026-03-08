/**
 * Home Assistant scene management tool.
 *
 * Supports: list, get, create, update, delete, activate, snapshot.
 * Scenes store entity state snapshots and restore them on activation.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import type { HAState } from "../lib/types.js";

// ── List ─────────────────────────────────────────────────────

async function handleList(params: Record<string, unknown>): Promise<string> {
  const allStates = await wsCommand<HAState[]>("get_states");
  const limit = (params.limit as number) || 50;
  const offset = (params.offset as number) || 0;
  const search = (params.search as string)?.toLowerCase();

  let scenes = allStates.filter((s) => s.entity_id.startsWith("scene."));

  if (search) {
    scenes = scenes.filter((s) => {
      const name = ((s.attributes.friendly_name as string) || "").toLowerCase();
      return s.entity_id.toLowerCase().includes(search) || name.includes(search);
    });
  }

  scenes.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const total = scenes.length;
  const page = scenes.slice(offset, offset + limit);

  if (total === 0) return "No scenes found.";

  const lines: string[] = [];
  for (const s of page) {
    const name = (s.attributes.friendly_name as string) || s.entity_id;
    const configId = s.attributes.id as string;
    const meta: string[] = [];
    if (configId) meta.push(`id: ${configId}`);
    meta.push(`entity: ${s.entity_id}`);
    lines.push(`🎬 ${name}`);
    lines.push(`  ${meta.join(" | ")}`);
  }

  const summary = total <= limit && offset === 0
    ? `${total} scenes`
    : `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} scenes`;

  return lines.join("\n") + "\n\n" + summary;
}

// ── Get ──────────────────────────────────────────────────────

async function handleGet(params: Record<string, unknown>): Promise<string> {
  const entityId = params.entity_id as string | undefined;
  const sceneId = params.scene_id as string | undefined;

  if (!entityId && !sceneId) {
    throw new Error("'entity_id' or 'scene_id' is required for get");
  }

  const resolvedEntityId = entityId || `scene.${sceneId}`;

  let state: HAState | undefined;
  try {
    state = await apiGet<HAState>(`/api/states/${resolvedEntityId}`);
  } catch { /* may not exist */ }

  const configId = sceneId || (state?.attributes.id as string);
  let config: Record<string, unknown> | null = null;
  if (configId) {
    try {
      config = await apiGet<Record<string, unknown>>(`/api/config/scene/config/${configId}`);
    } catch { /* may not exist */ }
  }

  if (!state && !config) {
    throw new Error("Scene not found. Provide a valid entity_id or scene_id.");
  }

  const result: Record<string, unknown> = {};
  if (state) {
    result.entity_id = state.entity_id;
    result.state = state.state;
    result.friendly_name = state.attributes.friendly_name;
  }
  if (config) {
    result.config = config;
  }

  return JSON.stringify(result, null, 2);
}

// ── Create ───────────────────────────────────────────────────

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const config = params.config as Record<string, unknown> | undefined;
  const sceneId = params.scene_id as string | undefined;
  if (!config) throw new Error("'config' is required. Include at least: name, entities");
  if (!sceneId) throw new Error("'scene_id' is required (e.g., 'movie_time')");
  if (!config.name) throw new Error("'config.name' is required");
  if (!config.entities) throw new Error("'config.entities' is required (entity state map)");

  await apiPost(`/api/config/scene/config/${sceneId}`, config);
  return `✅ Created scene '${config.name}' (id: ${sceneId})\nAuto-reloaded — active immediately.`;
}

// ── Update ───────────────────────────────────────────────────

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const sceneId = params.scene_id as string;
  if (!sceneId) throw new Error("'scene_id' is required for update");
  const config = params.config as Record<string, unknown> | undefined;
  if (!config) throw new Error("'config' is required for update");

  let existing: Record<string, unknown>;
  try {
    existing = await apiGet<Record<string, unknown>>(`/api/config/scene/config/${sceneId}`);
  } catch {
    throw new Error(`Scene '${sceneId}' not found`);
  }

  const { id: _id, ...rest } = existing;
  const merged = { ...rest, ...config };

  await apiPost(`/api/config/scene/config/${sceneId}`, merged);
  const name = (merged.name as string) || sceneId;
  return `✅ Updated scene '${name}' (id: ${sceneId})`;
}

// ── Delete ───────────────────────────────────────────────────

async function handleDelete(params: Record<string, unknown>): Promise<string> {
  const sceneId = params.scene_id as string;
  if (!sceneId) throw new Error("'scene_id' is required for delete");
  await apiDelete(`/api/config/scene/config/${sceneId}`);
  return `✅ Deleted scene '${sceneId}'`;
}

// ── Activate ─────────────────────────────────────────────────

async function handleActivate(params: Record<string, unknown>): Promise<string> {
  const entityId = params.entity_id as string | undefined;
  const sceneId = params.scene_id as string | undefined;
  if (!entityId && !sceneId) throw new Error("'entity_id' or 'scene_id' is required");
  const resolved = entityId || `scene.${sceneId}`;
  await apiPost("/api/services/scene/turn_on", { entity_id: resolved });
  return `✅ Activated ${resolved}`;
}

// ── Snapshot ─────────────────────────────────────────────────

async function handleSnapshot(params: Record<string, unknown>): Promise<string> {
  const sceneId = params.scene_id as string | undefined;
  if (!sceneId) throw new Error("'scene_id' is required for snapshot");
  const entityIds = params.snapshot_entities as string[] | undefined;
  if (!entityIds || entityIds.length === 0) {
    throw new Error("'snapshot_entities' is required — array of entity IDs to capture current states from");
  }

  await apiPost("/api/services/scene/create", {
    scene_id: sceneId,
    snapshot_entities: entityIds,
  });
  return `✅ Created snapshot scene '${sceneId}' from ${entityIds.length} entities`;
}

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = [
  "list", "get", "create", "update", "delete", "activate", "snapshot",
] as const;

export function registerScenesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_scenes",
    label: "HA Scenes",
    description: `Manage HA scenes — CRUD, activate, snapshot. Actions: list, get, create, update, delete, activate, snapshot. Use ha_tool_docs('ha_scenes') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(ALL_ACTIONS, { description: "Action to perform" }),
      scene_id: Type.Optional(
        Type.String({ description: "Scene config ID (e.g., 'movie_time')" })
      ),
      entity_id: Type.Optional(
        Type.String({ description: "Scene entity_id (e.g., scene.movie_time)" })
      ),
      config: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Scene config for create/update. Keys: name, icon, entities (state map), metadata",
        })
      ),
      snapshot_entities: Type.Optional(
        Type.Array(Type.String(), {
          description: "Entity IDs to capture current states from (for snapshot action)",
        })
      ),
      search: Type.Optional(Type.String({ description: "Search scene name/entity_id" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 50)" })),
      offset: Type.Optional(Type.Number({ description: "Pagination offset (default: 0)" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await dispatch(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function dispatch(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList(params);
    case "get": return handleGet(params);
    case "create": return handleCreate(params);
    case "update": return handleUpdate(params);
    case "delete": return handleDelete(params);
    case "activate": return handleActivate(params);
    case "snapshot": return handleSnapshot(params);
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
