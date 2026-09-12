/**
 * YAML entity manager — structured CRUD for YAML-defined entities and config blocks.
 *
 * Thin registration + dispatch layer. All logic in sub-modules:
 *   ./ha-yaml/read.ts   — list, get, files
 *   ./ha-yaml/write.ts  — update, create, delete (with automatic backups)
 *
 * Shared libraries:
 *   ../lib/yaml-entity-parser.ts — parser, indexer, types
 *   ../lib/yaml.ts               — YAML serializer
 *   ../lib/mutation-log.ts       — backup-before-mutation system
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { handleList, handleGet, handleFiles } from "./ha-yaml/read.js";
import { handleUpdate, handleCreate, handleDelete } from "./ha-yaml/write.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";
import { coerceJsonParams } from "../lib/tool-args.js";

export function registerYamlTool(ctx: ExtensionAPI) {
  ctx.registerTool({
    name: "ha_yaml",
    prepareArguments: (args) => coerceJsonParams(args, ["config"]),
    label: "HA YAML",
    description:
      "Manage YAML-defined entities and config blocks in Home Assistant configuration files. " +
      "Parses configuration.yaml and all included files. " +
      "All write operations automatically backup the file before modifying it. " +
      "Actions: list, get, files, update, create, delete.",
    promptSnippet:
      "Inspect and edit YAML-defined entities + config blocks across configuration.yaml and !includes — list/get/files, and update/create/delete with backup.",
    promptGuidelines: [
      "Use ha_yaml when the user asks about entities or config defined in YAML files (not the UI/registry).",
      "Use ha_yaml action:list first to discover keys, then action:get for one block's config.",
      "Use ha_yaml write actions (update/create/delete) for YAML entities — each backs up the file first; reload/restart to apply.",
    ],
    parameters: Type.Object({
      action: StringEnum(["list", "get", "files", "update", "create", "delete"] as const, {
        description: "Action to perform",
      }),
      key: Type.Optional(
        Type.String({ description: "Entity key from list output (for get/update/delete)" })
      ),
      domain: Type.Optional(
        Type.String({ description: "Filter by domain (for list), or target domain (for create)" })
      ),
      config: Type.Optional(
        Type.Unknown({ description: "Config object for update/create. For update: merged with existing. For create: full entity config." })
      ),
      confirm: Type.Optional(
        Type.Boolean({ description: "Confirm destructive actions like delete (default: false, preview only)" })
      ),
    }),

    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA YAML", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const text = await executeAction(params as Record<string, unknown>);
      return { content: [{ type: "text" as const, text }] };
    },
  });
}

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "list":
      return handleList(params.domain as string | undefined);
    case "get":
      return handleGet(params.key as string | undefined);
    case "files":
      return handleFiles();
    case "update":
      return handleUpdate(params.key as string | undefined, params.config as Record<string, unknown> | undefined);
    case "create":
      return handleCreate(params.domain as string | undefined, params.config as Record<string, unknown> | undefined);
    case "delete":
      return handleDelete(params.key as string | undefined, params.confirm as boolean | undefined);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: list, get, files, update, create, delete`);
  }
}
