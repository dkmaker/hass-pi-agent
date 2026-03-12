/**
 * Tool for querying and managing pre-mutation backups and changelog.
 * Actions: log, list, show, purge
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import {
  readChangelog,
  listMutationBackups,
  showMutationBackup,
  purgeMutationBackups,
} from "../lib/mutation-log.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

export function registerMutationsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_mutations",
    label: "HA Mutations",
    description:
      "Query and manage pre-mutation backups and changelog. Actions: log, list, show, purge. " +
      "Every write/update/delete action automatically snapshots the previous state before applying changes.",
    parameters: Type.Object({
      action: StringEnum(["log", "list", "show", "purge"] as const, {
        description: "Action to perform",
      }),
      tool: Type.Optional(
        Type.String({ description: "Filter by tool name (e.g. ha_entities, ha_automations)" })
      ),
      action_filter: Type.Optional(
        Type.String({ description: "Filter by action (e.g. update, delete, remove)" })
      ),
      target: Type.Optional(
        Type.String({ description: "Filter by target (partial match, e.g. entity_id)" })
      ),
      filename: Type.Optional(
        Type.String({ description: "Backup filename for 'show' action" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "Max results (default: 30)" })
      ),
      keep_count: Type.Optional(
        Type.Number({ description: "For purge: number of backups to keep (default: configured max)" })
      ),
    }),

    renderToolCall(args, theme) {
      return renderToolCall("HA Mutations", args, theme);
    },

    renderResult(result) {
      return renderMarkdownResult(result);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const text = await executeAction(params);
      return {
        content: [{ type: "text" as const, text }],
        details: {},
      };
    },
  });
}

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action) {
    case "log":
      return handleLog(params);
    case "list":
      return handleList(params);
    case "show":
      return handleShow(params.filename as string | undefined);
    case "purge":
      return handlePurge(params.keep_count as number | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: log, list, show, purge`);
  }
}

function handleLog(params: Record<string, unknown>): string {
  const entries = readChangelog({
    tool: params.tool as string | undefined,
    action: params.action_filter as string | undefined,
    target: params.target as string | undefined,
    limit: (params.limit as number | undefined) ?? 30,
  });

  if (entries.length === 0) {
    return "No mutation log entries found.";
  }

  const lines: string[] = ["## Mutation Changelog (newest first)\n"];
  lines.push("| Timestamp | Tool | Action | Target | Summary |");
  lines.push("|-----------|------|--------|--------|---------|");

  for (const e of entries) {
    const ts = e.ts.replace("T", " ").replace(/\.\d+Z$/, "Z");
    lines.push(`| ${ts} | ${e.tool} | ${e.action} | \`${e.target}\` | ${e.summary} |`);
  }

  lines.push(`\n${entries.length} entries shown`);
  return lines.join("\n");
}

function handleList(params: Record<string, unknown>): string {
  const files = listMutationBackups({
    tool: params.tool as string | undefined,
    target: params.target as string | undefined,
  });

  const limit = (params.limit as number | undefined) ?? 30;
  const shown = files.slice(0, limit);

  if (shown.length === 0) {
    return "No mutation backup files found.";
  }

  const lines: string[] = ["## Mutation Backups (newest first)\n"];
  for (const f of shown) {
    lines.push(`- \`${f}\``);
  }

  if (files.length > limit) {
    lines.push(`\n…and ${files.length - limit} more`);
  }
  lines.push(`\n${files.length} total backup files`);
  return lines.join("\n");
}

function handleShow(filename?: string): string {
  if (!filename) throw new Error("'filename' is required for show action");

  const data = showMutationBackup(filename);
  return `## Backup: ${filename}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

function handlePurge(keepCount?: number): string {
  const removed = purgeMutationBackups(keepCount);
  return removed > 0
    ? `✅ Purged ${removed} old backup files`
    : "No backups to purge — within configured limit.";
}
