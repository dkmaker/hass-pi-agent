/**
 * Home Assistant backup management tool.
 *
 * Create, list, restore, and delete HA backups via the Supervisor API.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { supervisorApi } from "../lib/supervisor.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

interface BackupSummary {
  slug: string;
  name: string;
  date: string;
  type: string;
  size?: number;
  protected?: boolean;
  compressed?: boolean;
  content?: { homeassistant?: boolean; addons?: string[]; folders?: string[] };
}

interface BackupInfo extends BackupSummary {
  homeassistant?: string;
  addons?: { slug: string; name: string; version: string }[];
  folders?: string[];
  repositories?: string[];
}

export function registerBackupsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_backups",
    label: "HA Backups",
    description: `Manage HA backups. Actions: list, get, create-full, create-partial, restore-full, restore-partial, delete. Use ha_tool_docs('ha_backups') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(
        ["list", "get", "create-full", "create-partial", "restore-full", "restore-partial", "delete"] as const,
        { description: "Action to perform" }
      ),
      slug: Type.Optional(Type.String({ description: "Backup slug (for get/restore/delete)" })),
      name: Type.Optional(Type.String({ description: "Backup name (for create)" })),
      addons: Type.Optional(Type.Array(Type.String(), { description: "Add-on slugs (for partial create/restore)" })),
      folders: Type.Optional(Type.Array(Type.String(), { description: "Folders to include: ssl, share, media, addons/local (for partial create/restore)" })),
      homeassistant: Type.Optional(Type.Boolean({ description: "Include Home Assistant config (for partial create/restore, default: true)" })),
      password: Type.Optional(Type.String({ description: "Password for encrypted backup" })),
      confirm: Type.Optional(Type.Boolean({ description: "Set true to confirm destructive actions (default: false, preview only)" })),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA Backups", args, theme);
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

function requireSlug(slug?: string): string {
  if (!slug) throw new Error("'slug' is required for this action.");
  return slug;
}

function formatSize(mb?: number): string {
  if (mb === undefined) return "?";
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

async function executeAction(params: {
  action: string;
  slug?: string;
  name?: string;
  addons?: string[];
  folders?: string[];
  homeassistant?: boolean;
  password?: string;
}): Promise<string> {
  switch (params.action) {
    case "list": {
      const data = await supervisorApi<{ backups: BackupSummary[] }>("/backups");
      const backups = data.backups ?? (data as unknown as BackupSummary[]);
      if (!backups.length) return "No backups found.";

      const sorted = [...backups].sort((a, b) => b.date.localeCompare(a.date));
      const lines: string[] = [
        "| Name | Slug | Date | Type | Size | Protected |",
        "|------|------|------|------|------|-----------|",
        ...sorted.map((b) => {
          const date = b.date.slice(0, 19).replace("T", " ");
          const prot = b.protected ? "🔒" : "";
          return `| **${b.name}** | \`${b.slug}\` | ${date} | ${b.type} | ${formatSize(b.size)} | ${prot} |`;
        }),
        `\n${backups.length} backups`,
      ];
      return lines.join("\n");
    }

    case "get": {
      const slug = requireSlug(params.slug);
      const info = await supervisorApi<BackupInfo>(`/backups/${slug}/info`);
      const rows = [
        `## ${info.name}`,
        "",
        "| Property | Value |",
        "|----------|-------|",
        `| Slug | \`${info.slug}\` |`,
        `| Type | ${info.type} |`,
        `| Date | ${info.date.slice(0, 19).replace("T", " ")} |`,
        `| Size | ${formatSize(info.size)} |`,
        `| Protected | ${info.protected ? "yes 🔒" : "no"} |`,
      ];
      if (info.homeassistant) rows.push(`| HA version | ${info.homeassistant} |`);
      if (info.addons?.length) {
        rows.push("", "### Add-ons", "");
        rows.push("| Name | Slug | Version |");
        rows.push("|------|------|---------|");
        for (const a of info.addons) rows.push(`| ${a.name} | ${a.slug} | ${a.version} |`);
      }
      if (info.folders?.length) rows.push("", `**Folders:** ${info.folders.join(", ")}`);
      if (info.repositories?.length) rows.push("", `**Repositories:** ${info.repositories.length}`);
      return rows.join("\n");
    }

    case "create-full": {
      const body: Record<string, unknown> = {};
      if (params.name) body.name = params.name;
      if (params.password) body.password = params.password;
      const result = await supervisorApi<{ slug: string }>("/backups/new/full", "post", body);
      return `✅ Full backup created: \`${result.slug ?? "done"}\``;
    }

    case "create-partial": {
      const body: Record<string, unknown> = {};
      if (params.name) body.name = params.name;
      if (params.password) body.password = params.password;
      if (params.addons) body.addons = params.addons;
      if (params.folders) body.folders = params.folders;
      if (params.homeassistant !== undefined) body.homeassistant = params.homeassistant;
      const result = await supervisorApi<{ slug: string }>("/backups/new/partial", "post", body);
      return `✅ Partial backup created: \`${result.slug ?? "done"}\``;
    }

    case "restore-full": {
      const slug = requireSlug(params.slug);
      const body: Record<string, unknown> = {};
      if (params.password) body.password = params.password;
      await supervisorApi(`/backups/${slug}/restore/full`, "post", body);
      return `✅ Full restore from \`${slug}\` initiated. Home Assistant will restart.`;
    }

    case "restore-partial": {
      const slug = requireSlug(params.slug);
      const body: Record<string, unknown> = {};
      if (params.password) body.password = params.password;
      if (params.addons) body.addons = params.addons;
      if (params.folders) body.folders = params.folders;
      if (params.homeassistant !== undefined) body.homeassistant = params.homeassistant;
      await supervisorApi(`/backups/${slug}/restore/partial`, "post", body);
      return `✅ Partial restore from \`${slug}\` initiated.`;
    }

    case "delete": {
      const slug = requireSlug(params.slug);
      if (!params.confirm) {
        return `⚠️ **Confirm delete**: backup \`${slug}\`\n\nCall again with \`confirm: true\` to proceed.`;
      }
      await supervisorApi(`/backups/${slug}`, "delete");
      return `✅ Backup \`${slug}\` deleted.`;
    }

    default:
      throw new Error(`Unknown action '${params.action}'.`);
  }
}
