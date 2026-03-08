/**
 * Home Assistant history tool.
 *
 * Queries entity state history over a time range using the
 * history/history_during_period WebSocket command.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { parseRelativeTime } from "../lib/format.js";

/** Compressed state keys from HA history API */
const S = "s";   // state
const A = "a";   // attributes
const LU = "lu"; // last_updated timestamp
const LC = "lc"; // last_changed timestamp

interface CompressedState {
  [S]: string;
  [A]?: Record<string, unknown>;
  [LU]: number;
  [LC]?: number;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function formatHistory(
  data: Record<string, CompressedState[]>,
  noAttributes: boolean,
  limit: number
): string {
  const entityIds = Object.keys(data);
  if (entityIds.length === 0) return "No state history found for the given time range.";

  const lines: string[] = [];

  for (const entityId of entityIds) {
    let states = data[entityId];
    if (!states || states.length === 0) {
      lines.push(`\n**${entityId}**: No state changes`);
      continue;
    }

    const total = states.length;
    if (states.length > limit) {
      states = states.slice(-limit);
    }

    lines.push(`\n**${entityId}** (${total} state change${total !== 1 ? "s" : ""}${total > limit ? `, showing last ${limit}` : ""}):`);

    for (const s of states) {
      const time = formatTimestamp(s[LU]);
      let line = `  ${time}  →  ${s[S]}`;

      if (!noAttributes && s[A]) {
        const attrs = Object.entries(s[A]!)
          .filter(([k]) => !k.startsWith("_") && k !== "friendly_name" && k !== "icon")
          .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join(", ");
        if (attrs) line += `  (${attrs})`;
      }

      lines.push(line);
    }
  }

  return lines.join("\n");
}

export function registerHistoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_history",
    label: "HA History",
    description: `Query entity state history over a time range. Actions: states. Use ha_tool_docs('ha_history') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["states"] as const, {
        description: "Action to perform",
      }),
      entity_ids: Type.Array(Type.String(), {
        description: "Entity IDs to query (e.g., ['light.kitchen', 'sensor.temp'])",
      }),
      start_time: Type.Optional(Type.String({
        description: "Start time — relative (1h, 24h, 7d) or ISO datetime. Default: 24h",
      })),
      end_time: Type.Optional(Type.String({
        description: "End time — relative or ISO datetime. Default: now",
      })),
      significant_changes_only: Type.Optional(Type.Boolean({
        description: "Only show significant state changes (default: true)",
      })),
      no_attributes: Type.Optional(Type.Boolean({
        description: "Exclude attributes from results (default: false)",
      })),
      limit: Type.Optional(Type.Number({
        description: "Max state changes per entity (default: 100)",
      })),
    }),

    async execute(_toolCallId, params) {
      const startTime = parseRelativeTime(params.start_time || "24h");
      const endTime = params.end_time ? parseRelativeTime(params.end_time) : undefined;
      const noAttributes = params.no_attributes ?? false;
      const limit = params.limit ?? 100;

      const wsParams: Record<string, unknown> = {
        start_time: startTime,
        entity_ids: params.entity_ids,
        significant_changes_only: params.significant_changes_only ?? true,
        no_attributes: noAttributes,
        minimal_response: false,
        include_start_time_state: true,
      };
      if (endTime) wsParams.end_time = endTime;

      const result = await wsCommand<Record<string, CompressedState[]>>(
        "history/history_during_period",
        wsParams
      );

      const text = formatHistory(result || {}, noAttributes, limit);
      return { content: [{ type: "text" as const, text }] };
    },
  });
}
