/**
 * Home Assistant recorder management tool.
 *
 * Statistics adjustment, unit changes, clearing, and database purge.
 * Uses WebSocket API for recorder commands.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import { apiPost } from "../lib/api.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { backupBeforeMutation } from "../lib/mutation-log.js";

// ── Tool registration ────────────────────────────────────────

export function registerRecorderTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_recorder",
    label: "HA Recorder",
    description: `Manage HA recorder and statistics. Actions: adjust, change-unit, clear, purge, info. Use ha_tool_docs('ha_recorder') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["adjust", "change-unit", "clear", "purge", "info"] as const, {
        description: "Action to perform",
      }),
      statistic_id: Type.Optional(
        Type.String({ description: "Statistic ID (for adjust/change-unit/clear)" })
      ),
      sum: Type.Optional(
        Type.Number({ description: "Adjustment value to add to sum (for adjust)" })
      ),
      adjustment_unit: Type.Optional(
        Type.String({ description: "Unit for the adjustment value (for adjust)" })
      ),
      unit_of_measurement: Type.Optional(
        Type.String({ description: "New unit of measurement (for change-unit)" })
      ),
      keep_days: Type.Optional(
        Type.Number({ description: "Days of history to keep (for purge, default: 10)" })
      ),
      repack: Type.Optional(
        Type.Boolean({ description: "Repack database after purge to free disk space (default: false)" })
      ),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Recorder", args, theme);
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
    case "adjust": return handleAdjust(params);
    case "change-unit": return handleChangeUnit(params);
    case "clear": return handleClear(params);
    case "purge": return handlePurge(params);
    case "info": return handleInfo();
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleAdjust(params: Record<string, unknown>): Promise<string> {
  const statisticId = params.statistic_id as string | undefined;
  if (!statisticId) throw new Error("'statistic_id' is required for adjust");
  if (params.sum === undefined) throw new Error("'sum' is required for adjust");

  const data: Record<string, unknown> = {
    statistic_id: statisticId,
    sum: params.sum,
  };
  if (params.adjustment_unit !== undefined) data.adjustment_unit_of_measurement = params.adjustment_unit;

  backupBeforeMutation("ha_recorder", "adjust", statisticId, data, `Adjust sum by ${params.sum}`);

  await wsCommand("recorder/adjust_sum_statistics", data);
  return `✅ Adjusted statistics for '${statisticId}' by ${params.sum}`;
}

async function handleChangeUnit(params: Record<string, unknown>): Promise<string> {
  const statisticId = params.statistic_id as string | undefined;
  if (!statisticId) throw new Error("'statistic_id' is required for change-unit");
  if (!params.unit_of_measurement) throw new Error("'unit_of_measurement' is required for change-unit");

  backupBeforeMutation("ha_recorder", "change-unit", statisticId, { statistic_id: statisticId, new_unit: params.unit_of_measurement }, `Change unit to ${params.unit_of_measurement}`);

  await wsCommand("recorder/update_statistics_metadata", {
    statistic_id: statisticId,
    unit_of_measurement: params.unit_of_measurement,
  });
  return `✅ Changed unit for '${statisticId}' to '${params.unit_of_measurement}'`;
}

async function handleClear(params: Record<string, unknown>): Promise<string> {
  const statisticId = params.statistic_id as string | undefined;
  if (!statisticId) throw new Error("'statistic_id' is required for clear");

  backupBeforeMutation("ha_recorder", "clear", statisticId, { statistic_id: statisticId }, `Clear all statistics`);

  await wsCommand("recorder/clear_statistics", {
    statistic_ids: [statisticId],
  });
  return `✅ Cleared all statistics for '${statisticId}'`;
}

async function handlePurge(params: Record<string, unknown>): Promise<string> {
  const keepDays = (params.keep_days as number | undefined) ?? 10;
  const repack = (params.repack as boolean | undefined) ?? false;

  await apiPost("/api/services/recorder/purge", {
    keep_days: keepDays,
    repack,
  });
  return `✅ Purge started — keeping ${keepDays} days of history${repack ? " (with repack)" : ""}`;
}

async function handleInfo(): Promise<string> {
  const info = await wsCommand<Record<string, unknown>>("recorder/info");
  const lines = Object.entries(info).map(([k, v]) => `| ${k} | ${JSON.stringify(v)} |`);
  return [`| Field | Value |`, `|-------|-------|`, ...lines].join("\n");
}
