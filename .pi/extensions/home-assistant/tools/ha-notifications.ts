/**
 * Home Assistant persistent notification management tool.
 *
 * Supports: list, create, dismiss, dismiss_all.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiPost } from "../lib/api.js";
import { timeSince , renderMarkdownResult, renderToolCall } from "../lib/format.js";

interface PersistentNotification {
  notification_id: string;
  title: string | null;
  message: string;
  created_at: string;
  [key: string]: unknown;
}

// ── List ─────────────────────────────────────────────────────

async function handleList(): Promise<string> {
  const notifications = await wsCommand<PersistentNotification[]>("persistent_notification/get");

  if (notifications.length === 0) return "No persistent notifications.";

  notifications.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const lines: string[] = [
    "| Title | ID | Message | Created |",
    "|-------|-----|---------|---------|",
  ];
  for (const n of notifications) {
    const title = n.title || "(no title)";
    const ago = timeSince(n.created_at);
    const msg = n.message.slice(0, 80).replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| **${title}** | ${n.notification_id} | ${msg} | ${ago} |`);
  }

  lines.push(`\n${notifications.length} notifications`);
  return lines.join("\n");
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
  pi.registerTool({
    name: "ha_notifications",
    label: "HA Notifications",
    description: `Manage HA persistent notifications. Actions: list, create, dismiss, dismiss_all. Use ha_tool_docs('ha_notifications') for full usage.`,

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


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Notifications", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await dispatch(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

async function dispatch(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list": return handleList();
    case "create": return handleCreate(params);
    case "dismiss": return handleDismiss(params);
    case "dismiss_all": return handleDismissAll();
    default:
      throw new Error(`Unknown action '${params.action}'`);
  }
}
