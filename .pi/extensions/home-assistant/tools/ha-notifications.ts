/**
 * Home Assistant persistent notification management tool.
 *
 * Supports: list, create, dismiss, dismiss_all.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiPost } from "../lib/api.js";
import { timeSince , renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { defineHaTool, type HaDetails, type Row } from "../lib/tool-render.js";

interface PersistentNotification {
  notification_id: string;
  title: string | null;
  message: string;
  created_at: string;
  [key: string]: unknown;
}

// ── List ─────────────────────────────────────────────────────

async function handleList(): Promise<string | HaDetails> {
  const notifications = await wsCommand<PersistentNotification[]>("persistent_notification/get");

  if (notifications.length === 0) return "No persistent notifications.";

  notifications.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const rows: Row[] = notifications.map((n) => ({
    cells: {
      title: n.title || "(no title)",
      id: n.notification_id,
      message: n.message.slice(0, 80).replace(/\n/g, " "),
      created: n.created_at,
    },
  }));
  return {
    kind: "table",
    columns: [
      { key: "title", label: "Title" },
      { key: "id", label: "ID" },
      { key: "message", label: "Message" },
      { key: "created", label: "Created", type: "reltime" },
    ],
    rows,
    page: { offset: 0, limit: notifications.length, total: notifications.length },
    note: `${notifications.length} notifications`,
  };
}

// ── Create ───────────────────────────────────────────────────

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const message = params.message as string;
  if (!message) throw new Error("'message' is required");
  const data: Record<string, unknown> = { message };
  if (params.title) data.title = params.title;
  if (params.notification_id) data.notification_id = params.notification_id;

  await apiPost("/api/services/persistent_notification/create", data);
  return `✅ Created notification${params.title ? `: ${params.title}` : ""}`;
}

// ── Dismiss ──────────────────────────────────────────────────

async function handleDismiss(params: Record<string, unknown>): Promise<string> {
  const notificationId = params.notification_id as string;
  if (!notificationId) throw new Error("'notification_id' is required");
  await apiPost("/api/services/persistent_notification/dismiss", {
    notification_id: notificationId,
  });
  return `✅ Dismissed notification '${notificationId}'`;
}

// ── Dismiss All ──────────────────────────────────────────────

async function handleDismissAll(): Promise<string> {
  await apiPost("/api/services/persistent_notification/dismiss_all", {});
  return `✅ Dismissed all notifications`;
}

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = ["list", "create", "dismiss", "dismiss_all"] as const;

export function registerNotificationsTool(pi: ExtensionAPI): void {
  defineHaTool(pi, {
    name: "ha_notifications",
    label: "HA Notifications",
    description: `Manage HA persistent notifications. Actions: list, create, dismiss, dismiss_all.`,
    promptSnippet:
      "Manage persistent notifications in the HA UI panel: list, create, dismiss, dismiss all.",
    promptGuidelines: [
      "Use ha_notifications to surface a message in the HA UI, or to list/dismiss existing persistent notifications.",
    ],

    parameters: Type.Object({
      action: StringEnum(ALL_ACTIONS, { description: "Action to perform" }),
      notification_id: Type.Optional(
        Type.String({ description: "Notification ID (for create/dismiss)" })
      ),
      title: Type.Optional(
        Type.String({ description: "Notification title (for create)" })
      ),
      message: Type.Optional(
        Type.String({ description: "Notification message (for create)" })
      ),
    }),


    execute: (params) => dispatch(params),
  });
}

async function dispatch(params: Record<string, unknown>): Promise<string | HaDetails> {
  switch (params.action as string) {
    case "list": return handleList();
    case "create": return handleCreate(params);
    case "dismiss": return handleDismiss(params);
    case "dismiss_all": return handleDismissAll();
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
