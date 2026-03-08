/**
 * Home Assistant live event capture tool.
 *
 * Subscribes to events for a limited duration and returns captured events.
 * Uses the subscribe_events WebSocket command.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsSubscribe } from "../lib/ws.js";

interface HAEvent {
  event_type: string;
  data: Record<string, unknown>;
  origin: string;
  time_fired: string;
  context: {
    id: string;
    parent_id?: string | null;
    user_id?: string | null;
  };
}

function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+[+-].*$/, "");
}

function summarizeData(data: Record<string, unknown>, maxLen: number = 120): string {
  if (!data || Object.keys(data).length === 0) return "";
  const json = JSON.stringify(data);
  if (json.length <= maxLen) return json;
  // Show key fields
  const keys = Object.keys(data);
  const parts: string[] = [];
  for (const k of keys) {
    const v = data[k];
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${val.length > 40 ? val.slice(0, 37) + "..." : val}`);
    if (parts.join(", ").length > maxLen) break;
  }
  return parts.join(", ");
}

function formatEvents(events: HAEvent[], limit: number): string {
  if (!events.length) return "No events captured during the listening period.";

  const shown = events.slice(0, limit);
  const lines: string[] = [];

  if (events.length > limit) {
    lines.push(`Showing ${limit} of ${events.length} captured events:\n`);
  } else {
    lines.push(`Captured ${events.length} event${events.length !== 1 ? "s" : ""}:\n`);
  }

  // Group by event_type for summary
  const typeCounts = new Map<string, number>();
  for (const e of events) {
    typeCounts.set(e.event_type, (typeCounts.get(e.event_type) || 0) + 1);
  }
  if (typeCounts.size > 1) {
    lines.push("Event types: " + [...typeCounts.entries()].map(([t, c]) => `${t} (${c})`).join(", ") + "\n");
  }

  for (const e of shown) {
    const time = formatTimestamp(e.time_fired);
    const data = summarizeData(e.data);
    lines.push(`  ${time}  ${e.event_type}${data ? "  " + data : ""}`);
  }

  return lines.join("\n");
}

export function registerEventsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_events",
    label: "HA Events",
    description: `Capture live HA events for a limited duration. Actions: capture. Use ha_tool_docs('ha_events') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["capture"] as const, {
        description: "Action to perform",
      }),
      event_type: Type.Optional(Type.String({
        description: "Event type to filter (e.g., 'state_changed'). Default: all events",
      })),
      timeout: Type.Optional(Type.Number({
        description: "Seconds to listen for events (default: 10, max: 60)",
      })),
      limit: Type.Optional(Type.Number({
        description: "Max events to capture before stopping (default: 100)",
      })),
    }),

    async execute(_toolCallId, params, _signal, onUpdate) {
      const timeout = Math.min(params.timeout ?? 10, 60);
      const limit = params.limit ?? 100;

      const wsParams: Record<string, unknown> = {};
      if (params.event_type) wsParams.event_type = params.event_type;

      const typeLabel = params.event_type || "all";
      onUpdate?.(`Listening for ${typeLabel} events for ${timeout}s...`);

      const events = await wsSubscribe<HAEvent>(
        "subscribe_events",
        wsParams,
        timeout * 1000,
        limit
      );

      const text = formatEvents(events, limit);
      return { content: [{ type: "text" as const, text }] };
    },
  });
}
