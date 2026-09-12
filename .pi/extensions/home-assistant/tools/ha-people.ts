/**
 * Home Assistant person management tool.
 *
 * Full CRUD for people via WebSocket collection API.
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

interface WSPerson {
  id: string;
  name: string;
  user_id: string | null;
  device_trackers: string[];
  picture: string | null;
}

// ── Tool registration ────────────────────────────────────────

export function registerPeopleTool(pi: ExtensionAPI): void {
  defineHaTool(pi, {
    name: "ha_people",
    label: "HA People",
    description: `Manage HA people (presence detection). Actions: list, get, create, update, delete.`,
    promptSnippet:
      "Manage people and their device trackers for presence detection: list, get, create, update, delete.",
    promptGuidelines: [
      "Use ha_people when the user asks to add or manage people or link device trackers for presence.",
    ],

    parameters: Type.Object({
      action: StringEnum(["list", "get", "create", "update", "delete"] as const, {
        description: "Action to perform",
      }),
      id: Type.Optional(Type.String({ description: "Person ID (for get/update/delete)" })),
      name: Type.Optional(Type.String({ description: "Person name" })),
      user_id: Type.Optional(Type.String({ description: "HA user ID to link (null to unlink)" })),
      device_trackers: Type.Optional(
        Type.Array(Type.String(), { description: "Device tracker entity IDs (e.g., ['device_tracker.phone'])" })
      ),
      picture: Type.Optional(Type.String({ description: "Picture URL path (e.g., /local/photos/john.jpg)" })),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    execute: (params) => executeAction(params),
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string | HaDetails> {
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

async function handleList(): Promise<string | HaDetails> {
  const raw = await wsCommand<{ storage: WSPerson[]; config: WSPerson[] } | WSPerson[]>("person/list");
  const people = Array.isArray(raw) ? raw : [...(raw.storage || []), ...(raw.config || [])];
  if (people.length === 0) return "No people defined.";

  people.sort((a, b) => a.name.localeCompare(b.name));
  const rows: Row[] = people.map((p) => ({
    icon: "account",
    cells: {
      name: p.name,
      userid: p.user_id || "",
      trackers: p.device_trackers.length > 0 ? p.device_trackers.join(", ") : "",
      id: p.id,
    },
  }));
  return {
    kind: "table",
    columns: [
      { key: "name", label: "Name" },
      { key: "userid", label: "User ID" },
      { key: "trackers", label: "Device Trackers" },
      { key: "id", label: "ID" },
    ],
    rows,
    page: { offset: 0, limit: people.length, total: people.length },
    note: `${people.length} people`,
  };
}

async function handleGet(id?: string): Promise<string> {
  if (!id) throw new Error("'id' is required for get");

  const raw = await wsCommand<{ storage: WSPerson[]; config: WSPerson[] } | WSPerson[]>("person/list");
  const people = Array.isArray(raw) ? raw : [...(raw.storage || []), ...(raw.config || [])];
  const person = people.find((p) => p.id === id);
  if (!person) throw new Error(`Person '${id}' not found`);

  const lines = [
    `## ${person.name}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| ID | ${person.id} |`,
    `| User ID | ${person.user_id || "—"} |`,
    `| Picture | ${person.picture || "—"} |`,
    `| Device trackers | ${person.device_trackers.length > 0 ? person.device_trackers.join(", ") : "none"} |`,
  ];

  return lines.join("\n");
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const name = params.name as string | undefined;
  if (!name) throw new Error("'name' is required for create");

  const data: Record<string, unknown> = { name };
  if (params.user_id !== undefined) data.user_id = params.user_id;
  if (params.device_trackers !== undefined) data.device_trackers = params.device_trackers;
  if (params.picture !== undefined) data.picture = params.picture;

  const result = await wsCommand<WSPerson>("person/create", data);
  return `✅ Created person '${result.name}' (id: ${result.id})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const id = params.id as string | undefined;
  if (!id) throw new Error("'id' is required for update");

  const data: Record<string, unknown> = { person_id: id };
  if (params.name !== undefined) data.name = params.name;
  if (params.user_id !== undefined) data.user_id = params.user_id;
  if (params.device_trackers !== undefined) data.device_trackers = params.device_trackers;
  if (params.picture !== undefined) data.picture = params.picture;

  try {
    const people = await wsCommand<WSPerson[]>("person/list");
    const current = people.find((p) => p.id === id);
    if (current) backupBeforeMutation("ha_people", "update", id, current);
  } catch { /* best-effort */ }

  const result = await wsCommand<WSPerson>("person/update", data);
  return `✅ Updated person '${result.name}' (id: ${result.id})`;
}

async function handleDelete(id?: string, confirm?: boolean): Promise<string> {
  if (!id) throw new Error("'id' is required for delete");
  if (!confirm) {
    return `⚠️ **Confirm delete**: person \`${id}\`\n\nCall again with \`confirm: true\` to proceed.`;
  }

  try {
    const people = await wsCommand<WSPerson[]>("person/list");
    const current = people.find((p) => p.id === id);
    if (current) backupBeforeMutation("ha_people", "delete", id, current);
  } catch { /* best-effort */ }

  await wsCommand("person/delete", { person_id: id });
  return `✅ Deleted person '${id}'`;
}
