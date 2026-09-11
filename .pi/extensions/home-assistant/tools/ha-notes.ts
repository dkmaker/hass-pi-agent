/**
 * Agent notes tool — persistent contextual annotations on any HA object.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { getNote, setNote, deleteNote, listNotes } from "../lib/agent-notes.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

export function registerNotesTool(ctx: ExtensionAPI) {
  ctx.registerTool({
    name: "ha_notes",
    label: "HA Notes",
    description:
      "Manage persistent agent notes on HA objects (entities, devices, automations, etc.). " +
      "Notes are automatically shown when inspecting objects. " +
      "Actions: get, set, list, delete. Use ha_tool_docs('ha_notes') for full usage.",
    parameters: Type.Object({
      action: StringEnum(["get", "set", "list", "delete"] as const, {
        description: "Action to perform",
      }),
      target: Type.Optional(
        Type.String({ description: "Target ID — entity_id, device_id, etc. (required for get/set/delete)" })
      ),
      note: Type.Optional(
        Type.String({ description: "Note text (required for set). Write the full note — replaces any existing note." })
      ),
      search: Type.Optional(
        Type.String({ description: "Search notes by target ID or content (for list)" })
      ),
      domain: Type.Optional(
        Type.String({ description: "Filter by domain prefix, e.g. 'sensor', 'automation' (for list)" })
      ),
      confirm: Type.Optional(
        Type.Boolean({ description: "Confirm delete (default: false, preview only)" })
      ),
    }),
    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Notes", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const text = await executeAction(params as Record<string, unknown>);
      return { content: [{ type: "text" as const, text }], details: {} };
    },
  });
}

async function executeAction(params: Record<string, unknown>): Promise<string> {
  const action = params.action as string;
  const target = params.target as string | undefined;

  switch (action) {
    case "get": {
      if (!target) throw new Error("'target' is required for get");
      const n = getNote(target);
      if (!n) return `No note found for \`${target}\`.`;
      return `## 📝 Note: ${target}\n\n${n.note}\n\n*Updated: ${n.updated}*`;
    }

    case "set": {
      if (!target) throw new Error("'target' is required for set");
      const noteText = params.note as string | undefined;
      if (!noteText) throw new Error("'note' is required for set");
      const entry = setNote(target, noteText);
      return `✅ Note saved for \`${target}\` (${entry.updated.slice(0, 10)}).`;
    }

    case "list": {
      const entries = listNotes({
        search: params.search as string | undefined,
        domain: params.domain as string | undefined,
      });
      if (entries.length === 0) return "No notes found.";

      const lines: string[] = [
        `## 📝 Agent Notes (${entries.length})`,
        "",
        "| Target | Note (preview) | Updated |",
        "|--------|---------------|---------|",
      ];
      for (const e of entries) {
        const preview = e.note.length > 80 ? e.note.slice(0, 77) + "..." : e.note;
        const clean = preview.replace(/\n/g, " ").replace(/\|/g, "\\|");
        lines.push(`| ${e.id} | ${clean} | ${e.updated.slice(0, 10)} |`);
      }
      return lines.join("\n");
    }

    case "delete": {
      if (!target) throw new Error("'target' is required for delete");
      if (!params.confirm) {
        const n = getNote(target);
        if (!n) return `No note found for \`${target}\`.`;
        return `⚠️ Will delete note for \`${target}\`:\n\n> ${n.note.slice(0, 200)}\n\nSet \`confirm: true\` to proceed.`;
      }
      const deleted = deleteNote(target);
      return deleted
        ? `✅ Note deleted for \`${target}\`.`
        : `No note found for \`${target}\`.`;
    }

    default:
      throw new Error(`Unknown action '${action}'. Valid: get, set, list, delete`);
  }
}
