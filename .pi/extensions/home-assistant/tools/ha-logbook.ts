/**
 * Home Assistant logbook tool.
 *
 * Queries the activity log (logbook) for human-readable event timeline.
 * Uses the logbook/get_events WebSocket command.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { parseRelativeTime , renderMarkdownResult, renderToolCall } from "../lib/format.js";

interface LogbookEvent {
  when: number;       // timestamp
  name?: string;      // entity/device name
  message?: string;   // human-readable message
  entity_id?: string;
  domain?: string;
  state?: string;
  context_user_id?: string;
  context_event_type?: string;
  context_domain?: string;
  context_entity_id?: string;
  context_message?: string;
  context_name?: string;
  icon?: string;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function formatEvents(events: LogbookEvent[], limit: number): string {
  if (!events || events.length === 0) return "No activity found for the given time range.";

  const total = events.length;
  const shown = events.slice(0, limit);

  const lines: string[] = [
    "| Time | Entity | Event | State | Triggered by |",
    "|------|--------|-------|-------|-------------|",
  ];

  for (const e of shown) {
    const time = formatTimestamp(e.when);
    const name = e.name || e.entity_id || "Unknown";
    const message = e.message ? e.message.replace(/\|/g, "\\|") : "";
    const state = e.state || "";
    const entity = e.entity_id || "";

    let context = "";
    if (e.context_name || e.context_entity_id) {
      const ctx = e.context_name || e.context_entity_id;
      const ctxMsg = e.context_message ? ` ${e.context_message}` : "";
      context = `${ctx}${ctxMsg}`;
    }

    lines.push(`| ${time} | **${name}**${entity && entity !== name ? ` (${entity})` : ""} | ${message} | ${state} | ${context} |`);
  }

  const countLine = total > limit ? `Showing ${limit} of ${total} events` : `${total} events`;
  lines.push(`\n${countLine}`);
  return lines.join("\n");
}

export function registerLogbookTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_logbook",
    label: "HA Logbook",
    description: `Query HA activity log for event timeline. Actions: events. Use ha_tool_docs('ha_logbook') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["events"] as const, {
        description: "Action to perform",
      }),
      entity_ids: Type.Optional(Type.Array(Type.String(), {
        description: "Filter by entity IDs",
      })),
      device_ids: Type.Optional(Type.Array(Type.String(), {
        description: "Filter by device IDs",
      })),
      start_time: Type.Optional(Type.String({
        description: "Start time — relative (1h, 24h, 7d) or ISO datetime. Default: 24h",
      })),
      end_time: Type.Optional(Type.String({
        description: "End time — relative or ISO datetime. Default: now",
      })),
      context_id: Type.Optional(Type.String({
        description: "Filter by context ID to trace related events",
      })),
      limit: Type.Optional(Type.Number({
        description: "Max events to return (default: 50)",
      })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Logbook", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(_toolCallId, params) {
      const startTime = parseRelativeTime(params.start_time || "24h");
      const endTime = params.end_time ? parseRelativeTime(params.end_time) : undefined;
      const limit = params.limit ?? 50;

      const wsParams: Record<string, unknown> = {
        start_time: startTime,
      };
      if (endTime) wsParams.end_time = endTime;
      if (params.entity_ids?.length) wsParams.entity_ids = params.entity_ids;
      if (params.device_ids?.length) wsParams.device_ids = params.device_ids;
      if (params.context_id) wsParams.context_id = params.context_id;

      const result = await wsCommand<LogbookEvent[]>("logbook/get_events", wsParams);

      const text = formatEvents(result || [], limit);
      return { content: [{ type: "text" as const, text }] };
    },
  });
}
