/**
 * Home Assistant add-on management tool.
 *
 * Provides full lifecycle management for HA add-ons via the Supervisor API:
 * list, get, start/stop/restart, install/uninstall/update, logs, stats,
 * config management, and add-on store browsing.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { supervisorApi } from "../lib/supervisor.js";
import { apiGet } from "../lib/api.js";

interface AddonSummary {
  name: string;
  slug: string;
  state: string;
  version: string;
  version_latest?: string;
  update_available?: boolean;
  description?: string;
  installed?: boolean;
  repository?: string;
}

interface AddonInfo extends AddonSummary {
  url?: string;
  arch?: string[];
  options?: Record<string, unknown>;
  schema?: unknown;
  ingress?: boolean;
  ingress_url?: string;
  hostname?: string;
  auto_update?: boolean;
  boot?: string;
  startup?: string;
  stage?: string;
  network?: Record<string, unknown>;
  ports?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AddonStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  blk_read: number;
  blk_write: number;
}

interface StoreRepo {
  slug: string;
  name: string;
  source: string;
  url: string;
  maintainer?: string;
}

export function registerAddonsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_addons",
    label: "HA Add-ons",
    description: `Manage Home Assistant add-ons via the Supervisor API.

Actions:
- list: List installed add-ons with state and version.
- get: Get full add-on details — config schema, options, state.
- start: Start an add-on.
- stop: Stop an add-on.
- restart: Restart an add-on.
- install: Install an add-on from the store.
- uninstall: Uninstall an add-on.
- update: Update an add-on to latest version.
- logs: Get add-on logs (plain text, last N lines).
- stats: Get add-on CPU/memory usage.
- config: View current add-on configuration.
- set-config: Update add-on configuration.
- store: Browse available add-ons in the store (with optional search filter).
- store-refresh: Refresh the add-on store cache.
- list-repos: List configured add-on repositories.
- add-repo: Add a new repository URL.
- remove-repo: Remove a repository.`,

    parameters: Type.Object({
      action: StringEnum(
        [
          "list", "get", "start", "stop", "restart",
          "install", "uninstall", "update",
          "logs", "stats", "config", "set-config",
          "store", "store-refresh",
          "list-repos", "add-repo", "remove-repo",
        ] as const,
        { description: "Action to perform" }
      ),
      slug: Type.Optional(Type.String({ description: "Add-on slug (e.g., core_ssh, local_pi_agent)" })),
      options: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Add-on configuration options for set-config" })),
      url: Type.Optional(Type.String({ description: "Repository URL for add-repo/remove-repo" })),
      search: Type.Optional(Type.String({ description: "Filter store add-ons by name/slug" })),
      lines: Type.Optional(Type.Number({ description: "Number of log lines to return (default: 100)" })),
    }),

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function executeAction(params: {
  action: string;
  slug?: string;
  options?: Record<string, unknown>;
  url?: string;
  search?: string;
  lines?: number;
}): Promise<string> {
  switch (params.action) {
    // ── Installed add-ons ────────────────────────────────────
    case "list": {
      const data = await supervisorApi<{ addons: AddonSummary[] }>("/addons");
      const addons = (data.addons ?? data as unknown as AddonSummary[]);
      if (!addons.length) return "No add-ons installed.";

      const sorted = [...addons].sort((a, b) => a.name.localeCompare(b.name));
      const lines = sorted.map((a) => {
        const update = a.update_available ? ` → ${a.version_latest}` : "";
        return `${a.state === "started" ? "🟢" : "⚪"} ${a.slug} — ${a.name} (v${a.version}${update}) [${a.state}]`;
      });
      return `**Installed add-ons (${addons.length}):**\n\n${lines.join("\n")}`;
    }

    case "get": {
      const slug = requireSlug(params.slug);
      const info = await supervisorApi<AddonInfo>(`/addons/${slug}/info`);
      const parts = [
        `**${info.name}** (${info.slug})`,
        "",
        `State: ${info.state}`,
        `Version: ${info.version}${info.update_available ? ` → ${info.version_latest} (update available)` : ""}`,
        `Boot: ${info.boot} | Auto-update: ${info.auto_update ?? false}`,
      ];
      if (info.description) parts.push(`Description: ${info.description}`);
      if (info.url) parts.push(`URL: ${info.url}`);
      if (info.ingress) parts.push(`Ingress: ${info.ingress_url || "yes"}`);
      if (info.arch) parts.push(`Architectures: ${info.arch.join(", ")}`);
      if (info.ports && Object.keys(info.ports).length) {
        parts.push(`Ports: ${Object.entries(info.ports).map(([k, v]) => `${k}→${v}`).join(", ")}`);
      }
      if (info.options && Object.keys(info.options).length) {
        parts.push("", "**Current options:**", "```json", JSON.stringify(info.options, null, 2), "```");
      }
      if (info.schema) {
        parts.push("", "**Config schema:**", "```json", JSON.stringify(info.schema, null, 2), "```");
      }
      return parts.join("\n");
    }

    // ── Lifecycle ────────────────────────────────────────────
    case "start": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/start`, "post");
      return `✅ Add-on \`${slug}\` started.`;
    }

    case "stop": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/stop`, "post");
      return `✅ Add-on \`${slug}\` stopped.`;
    }

    case "restart": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/restart`, "post");
      return `✅ Add-on \`${slug}\` restarted.`;
    }

    case "install": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/install`, "post");
      return `✅ Add-on \`${slug}\` installed.`;
    }

    case "uninstall": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/uninstall`, "post");
      return `✅ Add-on \`${slug}\` uninstalled.`;
    }

    case "update": {
      const slug = requireSlug(params.slug);
      await supervisorApi(`/addons/${slug}/update`, "post");
      return `✅ Add-on \`${slug}\` updated.`;
    }

    // ── Logs & stats ─────────────────────────────────────────
    case "logs": {
      const slug = requireSlug(params.slug);
      // Logs endpoint returns plain text — must use REST API, not WS proxy
      const { HA_URL, HA_TOKEN } = await import("../lib/config.js");
      const resp = await fetch(`${HA_URL}/api/hassio/addons/${slug}/logs`, {
        headers: { Authorization: `Bearer ${HA_TOKEN}` },
      });
      if (!resp.ok) throw new Error(`Failed to fetch logs: ${resp.status} ${await resp.text()}`);
      const text = await resp.text();
      const allLines = text.split("\n");
      const limit = params.lines ?? 100;
      const trimmed = allLines.length > limit ? allLines.slice(-limit) : allLines;
      return `**Logs for \`${slug}\`** (last ${trimmed.length} lines):\n\n\`\`\`\n${trimmed.join("\n")}\n\`\`\``;
    }

    case "stats": {
      const slug = requireSlug(params.slug);
      const s = await supervisorApi<AddonStats>(`/addons/${slug}/stats`);
      return [
        `**Stats for \`${slug}\`:**`,
        "",
        `CPU: ${s.cpu_percent.toFixed(1)}%`,
        `Memory: ${formatBytes(s.memory_usage)} / ${formatBytes(s.memory_limit)} (${s.memory_percent.toFixed(1)}%)`,
        `Network: ↓ ${formatBytes(s.network_rx)} / ↑ ${formatBytes(s.network_tx)}`,
        `Disk: R ${formatBytes(s.blk_read)} / W ${formatBytes(s.blk_write)}`,
      ].join("\n");
    }

    // ── Configuration ────────────────────────────────────────
    case "config": {
      const slug = requireSlug(params.slug);
      const info = await supervisorApi<AddonInfo>(`/addons/${slug}/info`);
      const opts = info.options ?? {};
      if (!Object.keys(opts).length) return `Add-on \`${slug}\` has no configuration options set.`;
      return `**Configuration for \`${slug}\`:**\n\n\`\`\`json\n${JSON.stringify(opts, null, 2)}\n\`\`\``;
    }

    case "set-config": {
      const slug = requireSlug(params.slug);
      if (!params.options || !Object.keys(params.options).length) {
        throw new Error("'options' is required for set-config.");
      }
      await supervisorApi(`/addons/${slug}/options`, "post", { options: params.options });
      return `✅ Configuration updated for \`${slug}\`. Restart the add-on for changes to take effect.`;
    }

    // ── Store ────────────────────────────────────────────────
    case "store": {
      const data = await supervisorApi<{ addons: AddonSummary[] }>("/store/addons");
      let addons = data.addons ?? (data as unknown as AddonSummary[]);
      if (params.search) {
        const s = params.search.toLowerCase();
        addons = addons.filter(
          (a) => a.name?.toLowerCase().includes(s) || a.slug?.toLowerCase().includes(s)
        );
      }
      if (!addons.length) return params.search ? `No store add-ons matching "${params.search}".` : "Store is empty.";

      const sorted = [...addons].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
      const limited = sorted.slice(0, 50);
      const lines = limited.map((a) => {
        const installed = a.installed ? " ✓" : "";
        return `${a.slug} — ${a.name}${installed}`;
      });
      const suffix = sorted.length > 50 ? `\n\n… and ${sorted.length - 50} more. Use 'search' to filter.` : "";
      return `**Add-on store (${sorted.length} add-ons):**\n\n${lines.join("\n")}${suffix}`;
    }

    case "store-refresh": {
      await supervisorApi("/store", "post");
      return "✅ Add-on store refreshed.";
    }

    // ── Repositories ─────────────────────────────────────────
    case "list-repos": {
      const data = await supervisorApi<{ repositories: StoreRepo[] }>("/store/repositories");
      const repos = data.repositories ?? (data as unknown as StoreRepo[]);
      if (!repos.length) return "No repositories configured.";
      const lines = repos.map((r) => `- **${r.name || r.slug}**: ${r.source || r.url}`);
      return `**Add-on repositories (${repos.length}):**\n\n${lines.join("\n")}`;
    }

    case "add-repo": {
      if (!params.url) throw new Error("'url' is required for add-repo.");
      // Get current repos, append new one
      const data = await supervisorApi<{ repositories: StoreRepo[] }>("/store/repositories");
      const repos = data.repositories ?? (data as unknown as StoreRepo[]);
      const urls = repos.map((r) => r.source || r.url).filter(Boolean);
      if (urls.includes(params.url)) return `Repository already configured: ${params.url}`;
      urls.push(params.url);
      await supervisorApi("/store/repositories", "post", { repositories: urls });
      return `✅ Repository added: ${params.url}`;
    }

    case "remove-repo": {
      if (!params.url) throw new Error("'url' is required for remove-repo.");
      const data = await supervisorApi<{ repositories: StoreRepo[] }>("/store/repositories");
      const repos = data.repositories ?? (data as unknown as StoreRepo[]);
      const urls = repos.map((r) => r.source || r.url).filter((u) => u !== params.url);
      await supervisorApi("/store/repositories", "post", { repositories: urls });
      return `✅ Repository removed: ${params.url}`;
    }

    default:
      throw new Error(`Unknown action '${params.action}'.`);
  }
}
