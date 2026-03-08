/**
 * Home Assistant long-term statistics tool.
 *
 * Queries aggregated statistics for sensors with state_class.
 * Uses recorder/statistics_during_period and recorder/list_statistic_ids.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { parseRelativeTime } from "../lib/format.js";

interface StatisticMetadata {
  statistic_id: string;
  display_unit_of_measurement?: string;
  has_mean: boolean;
  has_sum: boolean;
  name?: string;
  source: string;
  statistics_unit_of_measurement?: string;
  unit_class?: string;
}

interface StatisticRow {
  start: number;  // ms since epoch
  end: number;    // ms since epoch
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  sum?: number | null;
  state?: number | null;
  change?: number | null;
  last_reset?: number | null;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatStatsList(metadata: StatisticMetadata[]): string {
  if (!metadata.length) return "No statistics available.";

  const lines = [`**${metadata.length} statistic IDs available:**\n`];
  for (const m of metadata) {
    const unit = m.display_unit_of_measurement || m.statistics_unit_of_measurement || "";
    const types = [m.has_mean ? "mean" : "", m.has_sum ? "sum" : ""].filter(Boolean).join(", ");
    const name = m.name ? ` (${m.name})` : "";
    lines.push(`  ${m.statistic_id}${name} — ${unit || "unitless"} [${types}] source:${m.source}`);
  }
  return lines.join("\n");
}

function formatStats(data: Record<string, StatisticRow[]>): string {
  const ids = Object.keys(data);
  if (!ids.length) return "No statistics found for the given parameters.";

  const lines: string[] = [];

  for (const id of ids) {
    const rows = data[id];
    if (!rows?.length) {
      lines.push(`\n**${id}**: No data`);
      continue;
    }

    lines.push(`\n**${id}** (${rows.length} period${rows.length !== 1 ? "s" : ""}):`);

    // Determine which columns have data
    const hasMean = rows.some(r => r.mean != null);
    const hasMin = rows.some(r => r.min != null);
    const hasMax = rows.some(r => r.max != null);
    const hasSum = rows.some(r => r.sum != null);
    const hasState = rows.some(r => r.state != null);
    const hasChange = rows.some(r => r.change != null);

    // Header
    let header = "  Period Start          ";
    if (hasMean) header += "  Mean";
    if (hasMin) header += "    Min";
    if (hasMax) header += "    Max";
    if (hasSum) header += "    Sum";
    if (hasState) header += "  State";
    if (hasChange) header += "  Change";
    lines.push(header);

    for (const r of rows) {
      let line = `  ${formatTimestamp(r.start)}`;
      if (hasMean) line += `  ${formatNumber(r.mean).padStart(6)}`;
      if (hasMin) line += `  ${formatNumber(r.min).padStart(6)}`;
      if (hasMax) line += `  ${formatNumber(r.max).padStart(6)}`;
      if (hasSum) line += `  ${formatNumber(r.sum).padStart(6)}`;
      if (hasState) line += `  ${formatNumber(r.state).padStart(6)}`;
      if (hasChange) line += `  ${formatNumber(r.change).padStart(6)}`;
      lines.push(line);
    }
  }

  return lines.join("\n");
}

export function registerStatsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_stats",
    label: "HA Statistics",
    description: `Query Home Assistant long-term statistics for sensors with state_class.

Actions:
- list: List available statistic IDs with metadata (unit, type, source).
- get: Get aggregated statistics over a time range with period grouping.

Time can be relative (1h, 24h, 7d) or ISO datetime.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get"] as const, {
        description: "Action to perform",
      }),
      statistic_ids: Type.Optional(Type.Array(Type.String(), {
        description: "Statistic IDs to query (required for 'get')",
      })),
      statistic_type: Type.Optional(StringEnum(["mean", "sum"] as const, {
        description: "Filter list by statistic type",
      })),
      start_time: Type.Optional(Type.String({
        description: "Start time — relative (1h, 24h, 7d) or ISO datetime. Default: 24h",
      })),
      end_time: Type.Optional(Type.String({
        description: "End time — relative or ISO datetime. Default: now",
      })),
      period: Type.Optional(StringEnum(["5minute", "hour", "day", "week", "month", "year"] as const, {
        description: "Aggregation period (default: hour)",
      })),
      types: Type.Optional(Type.Array(
        StringEnum(["change", "last_reset", "max", "mean", "min", "state", "sum"] as const),
        { description: "Statistics types to include" }
      )),
    }),

    async execute(_toolCallId, params) {
      if (params.action === "list") {
        const wsParams: Record<string, unknown> = {};
        if (params.statistic_type) wsParams.statistic_type = params.statistic_type;

        const result = await wsCommand<StatisticMetadata[]>("recorder/list_statistic_ids", wsParams);
        return { content: [{ type: "text" as const, text: formatStatsList(result || []) }] };
      }

      // get
      if (!params.statistic_ids?.length) {
        throw new Error("statistic_ids is required for 'get' action");
      }

      const startTime = parseRelativeTime(params.start_time || "24h");
      const wsParams: Record<string, unknown> = {
        start_time: startTime,
        statistic_ids: params.statistic_ids,
        period: params.period || "hour",
      };
      if (params.end_time) wsParams.end_time = parseRelativeTime(params.end_time);
      if (params.types) wsParams.types = params.types;

      const result = await wsCommand<Record<string, StatisticRow[]>>(
        "recorder/statistics_during_period",
        wsParams
      );

      return { content: [{ type: "text" as const, text: formatStats(result || {}) }] };
    },
  });
}
