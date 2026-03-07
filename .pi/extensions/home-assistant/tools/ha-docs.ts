/**
 * Home Assistant documentation lookup tool.
 *
 * Provides on-demand access to HA integration and general documentation.
 * Ships with a pre-built index; content is fetched from GitHub on demand and cached.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { IntegrationMeta } from "../lib/docs/builder.js";

export function registerDocsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_docs",
    label: "HA Docs",
    description: `Look up Home Assistant integration and configuration documentation.

Actions:
- list: List integrations with filters. Filters: category, platform, iot_class, integration_type, search. Shows matching integrations with key metadata.
- get: Get full documentation for a specific integration or doc page. Fetches from GitHub and caches locally.
- search: Search integration index by keyword (title, description, domain).
- update: Refresh the docs index from GitHub (fetches latest integration metadata).
- status: Show index info — version, source, integration/doc counts.

Index is auto-fetched on first startup and refreshed daily. Content is fetched on demand from GitHub and cached persistently.`,

    parameters: Type.Object({
      action: StringEnum(
        ["list", "get", "search", "update", "status"] as const,
        { description: "Action to perform" }
      ),
      domain: Type.Optional(Type.String({
        description: "Integration domain for 'get' action (e.g., mqtt, zwave_js, light)",
      })),
      doc: Type.Optional(Type.String({
        description: "Doc path for 'get' action (e.g., automation/trigger, scripts/perform-actions)",
      })),
      search: Type.Optional(Type.String({
        description: "Search term for list/search actions",
      })),
      category: Type.Optional(Type.String({
        description: "Filter by category (e.g., Light, Climate, Hub)",
      })),
      platform: Type.Optional(Type.String({
        description: "Filter by platform (e.g., sensor, binary_sensor, switch)",
      })),
      iot_class: Type.Optional(Type.String({
        description: "Filter by IoT class (e.g., Local Push, Cloud Polling)",
      })),
      integration_type: Type.Optional(Type.String({
        description: "Filter by type (e.g., service, device, hub, entity, helper)",
      })),
      limit: Type.Optional(Type.Number({
        description: "Max results for list/search (default: 30)",
      })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params, (msg) => {
        onUpdate?.({ type: "text", text: msg + "\n" });
      });
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

async function executeAction(
  params: {
    action: string;
    domain?: string;
    doc?: string;
    search?: string;
    category?: string;
    platform?: string;
    iot_class?: string;
    integration_type?: string;
    limit?: number;
  },
  onProgress?: (msg: string) => void
): Promise<string> {
  switch (params.action) {
    case "list": {
      const { loadIndex } = await import("../lib/docs/cache.js");
      const index = await loadIndex();
      const limit = params.limit ?? 30;

      let entries = Object.entries(index.integrations);

      // Apply filters
      if (params.category) {
        const cat = params.category.toLowerCase();
        entries = entries.filter(([, m]) =>
          m.category.some((c) => c.toLowerCase().includes(cat))
        );
      }
      if (params.platform) {
        const plat = params.platform.toLowerCase();
        entries = entries.filter(([, m]) =>
          m.platforms.some((p) => p.toLowerCase().includes(plat))
        );
      }
      if (params.iot_class) {
        const cls = params.iot_class.toLowerCase();
        entries = entries.filter(([, m]) =>
          m.iot_class?.toLowerCase().includes(cls)
        );
      }
      if (params.integration_type) {
        const t = params.integration_type.toLowerCase();
        entries = entries.filter(([, m]) =>
          m.integration_type?.toLowerCase().includes(t)
        );
      }
      if (params.search) {
        const s = params.search.toLowerCase();
        entries = entries.filter(([domain, m]) =>
          domain.includes(s) ||
          m.title.toLowerCase().includes(s) ||
          m.description.toLowerCase().includes(s)
        );
      }

      if (!entries.length) return "No integrations matched the filters.";

      entries.sort((a, b) => a[1].title.localeCompare(b[1].title));
      const total = entries.length;
      const limited = entries.slice(0, limit);

      const lines = limited.map(([domain, m]) => {
        const tags: string[] = [];
        if (m.integration_type) tags.push(m.integration_type);
        if (m.iot_class) tags.push(m.iot_class);
        if (m.config_flow) tags.push("config_flow");
        if (m.featured) tags.push("⭐");
        const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
        return `\`${domain}\` — **${m.title}**${tagStr}`;
      });

      const suffix = total > limit ? `\n\n… and ${total - limit} more. Use filters or increase 'limit'.` : "";
      return `**Integrations (${total} matches):**\n\n${lines.join("\n")}${suffix}`;
    }

    case "get": {
      if (params.domain) {
        const { loadIndex } = await import("../lib/docs/cache.js");
        const { fetchIntegrationDoc } = await import("../lib/docs/content.js");

        // Get metadata from index if available
        let header = "";
        try {
          const index = await loadIndex();
          const meta = index.integrations[params.domain];
          if (meta) {
            const parts = [`# ${meta.title} (\`${params.domain}\`)`];
            if (meta.description) parts.push(`*${meta.description}*`);
            const info: string[] = [];
            if (meta.integration_type) info.push(`Type: ${meta.integration_type}`);
            if (meta.iot_class) info.push(`IoT class: ${meta.iot_class}`);
            if (meta.category.length) info.push(`Category: ${meta.category.join(", ")}`);
            if (meta.platforms.length) info.push(`Platforms: ${meta.platforms.join(", ")}`);
            if (meta.quality_scale) info.push(`Quality: ${meta.quality_scale}`);
            if (info.length) parts.push(info.join(" | "));
            parts.push("---");
            header = parts.join("\n\n") + "\n\n";
          }
        } catch {
          // No index, just show content
        }

        const content = await fetchIntegrationDoc(params.domain);
        return header + content;
      }

      if (params.doc) {
        const { fetchDoc } = await import("../lib/docs/content.js");
        const content = await fetchDoc(params.doc);
        return content;
      }

      throw new Error("Provide 'domain' for integration docs or 'doc' for general docs.");
    }

    case "search": {
      if (!params.search) throw new Error("'search' parameter is required.");
      const { loadIndex } = await import("../lib/docs/cache.js");
      const index = await loadIndex();
      const s = params.search.toLowerCase();
      const limit = params.limit ?? 30;

      // Search integrations
      const integrationResults = Object.entries(index.integrations)
        .filter(([domain, m]) =>
          domain.includes(s) ||
          m.title.toLowerCase().includes(s) ||
          m.description.toLowerCase().includes(s) ||
          m.category.some((c) => c.toLowerCase().includes(s)) ||
          m.platforms.some((p) => p.includes(s))
        )
        .sort((a, b) => {
          // Exact domain match first, then title match, then rest
          const aExact = a[0] === s ? 0 : a[0].includes(s) ? 1 : 2;
          const bExact = b[0] === s ? 0 : b[0].includes(s) ? 1 : 2;
          return aExact - bExact || a[1].title.localeCompare(b[1].title);
        });

      // Search docs
      const docResults = Object.entries(index.docs)
        .filter(([path, d]) =>
          path.includes(s) ||
          d.title.toLowerCase().includes(s) ||
          d.description.toLowerCase().includes(s)
        );

      const parts: string[] = [];

      if (integrationResults.length) {
        const shown = integrationResults.slice(0, limit);
        parts.push(`**Integrations (${integrationResults.length} matches):**\n`);
        for (const [domain, m] of shown) {
          parts.push(`\`${domain}\` — **${m.title}**: ${m.description.slice(0, 100)}`);
        }
        if (integrationResults.length > limit) {
          parts.push(`… and ${integrationResults.length - limit} more`);
        }
      }

      if (docResults.length) {
        parts.push(`\n**Docs (${docResults.length} matches):**\n`);
        for (const [path, d] of docResults.slice(0, 20)) {
          parts.push(`\`${path}\` — **${d.title}**`);
        }
      }

      if (!parts.length) return `No results for "${params.search}".`;
      return parts.join("\n");
    }

    case "update": {
      const { buildFromGitHub } = await import("../lib/docs/builder.js");
      const { saveIndex, clearIndexCache } = await import("../lib/docs/cache.js");
      const { clearCache } = await import("../lib/docs/content.js");

      onProgress?.("Starting docs index update from GitHub...");
      const index = await buildFromGitHub(onProgress);
      await saveIndex(index);
      await clearCache();
      clearIndexCache();

      const iCount = Object.keys(index.integrations).length;
      const dCount = Object.keys(index.docs).length;
      return `✅ Docs index updated from GitHub.\n\nIntegrations: ${iCount}\nDocs: ${dCount}\nUpdated: ${index.updated}`;
    }

    case "status": {
      const { loadIndex } = await import("../lib/docs/cache.js");
      const { DOCS_DATA_DIR, DOCS_UPDATE_HOUR } = await import("../lib/config.js");
      try {
        const index = await loadIndex();
        const iCount = Object.keys(index.integrations).length;
        const dCount = Object.keys(index.docs).length;
        return [
          "**Docs Index Status**",
          "",
          `Source: ${index.source}`,
          `Version: ${index.version}`,
          `Updated: ${index.updated}`,
          `Integrations: ${iCount}`,
          `Docs: ${dCount}`,
          `Data dir: ${DOCS_DATA_DIR}`,
          `Auto-update: daily at ${DOCS_UPDATE_HOUR}:00`,
        ].join("\n");
      } catch {
        return `❌ No docs index loaded yet. Index will be fetched automatically on first startup.\nData dir: ${DOCS_DATA_DIR}\nAuto-update: daily at ${DOCS_UPDATE_HOUR}:00`;
      }
    }

    default:
      throw new Error(`Unknown action '${params.action}'.`);
  }
}
