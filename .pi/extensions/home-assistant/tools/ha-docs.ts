/**
 * Home Assistant documentation lookup tool.
 *
 * Pure local reader — all data is pre-fetched by update-docs.py.
 * No GitHub calls at runtime.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

export function registerDocsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_docs",
    label: "HA Docs",
    description: `Look up HA integration and configuration documentation. Actions: list, get, search, update, status. Use ha_tool_docs('ha_docs') for full usage.`,

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
      offset: Type.Optional(Type.Number({
        description: "Line offset for 'get' action — start reading from this line (0-based, default: 0)",
      })),
      max_lines: Type.Optional(Type.Number({
        description: "Max lines to return for 'get' action (default: 200)",
      })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

function paginate(content: string, offset: number, maxLines: number): string {
  const lines = content.split("\n");
  const total = lines.length;
  const start = Math.min(offset, total);
  const end = Math.min(start + maxLines, total);
  const page = lines.slice(start, end).join("\n");
  const remaining = total - end;

  if (start === 0 && remaining <= 0) return page; // Fits in one page

  let footer = `\n\n---\n*Lines ${start + 1}–${end} of ${total}.*`;
  if (remaining > 0) {
    footer += ` Use \`offset: ${end}\` to continue reading (${remaining} lines remaining).`;
  }
  return page + footer;
}

async function executeAction(params: {
  action: string;
  domain?: string;
  doc?: string;
  search?: string;
  category?: string;
  platform?: string;
  iot_class?: string;
  integration_type?: string;
  limit?: number;
  offset?: number;
  max_lines?: number;
}): Promise<string> {
  switch (params.action) {
    case "list": {
      const { loadIndex } = await import("../lib/docs/cache.js");
      const index = await loadIndex();
      const limit = params.limit ?? 30;

      let entries = Object.entries(index.integrations);

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
        const { readIntegrationDoc } = await import("../lib/docs/content.js");

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

        const content = await readIntegrationDoc(params.domain);
        const full = header + content;
        return paginate(full, params.offset ?? 0, params.max_lines ?? 200);
      }

      if (params.doc) {
        const { readDoc } = await import("../lib/docs/content.js");
        const content = await readDoc(params.doc);
        return paginate(content, params.offset ?? 0, params.max_lines ?? 200);
      }

      throw new Error("Provide 'domain' for integration docs or 'doc' for general docs.");
    }

    case "search": {
      if (!params.search) throw new Error("'search' parameter is required.");
      const { loadIndex } = await import("../lib/docs/cache.js");
      const index = await loadIndex();
      const s = params.search.toLowerCase();
      const limit = params.limit ?? 30;

      const integrationResults = Object.entries(index.integrations)
        .filter(([domain, m]) =>
          domain.includes(s) ||
          m.title.toLowerCase().includes(s) ||
          m.description.toLowerCase().includes(s) ||
          m.category.some((c) => c.toLowerCase().includes(s)) ||
          m.platforms.some((p) => p.includes(s))
        )
        .sort((a, b) => {
          const aExact = a[0] === s ? 0 : a[0].includes(s) ? 1 : 2;
          const bExact = b[0] === s ? 0 : b[0].includes(s) ? 1 : 2;
          return aExact - bExact || a[1].title.localeCompare(b[1].title);
        });

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
      const { DOCS_DATA_DIR } = await import("../lib/config.js");
      return `Run update-docs.py to update the docs index.\nData dir: ${DOCS_DATA_DIR}`;
    }

    case "status": {
      const { loadIndex } = await import("../lib/docs/cache.js");
      const { DOCS_DATA_DIR } = await import("../lib/config.js");
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
          `Commit: ${index.commit ?? "unknown"}`,
          `Integrations: ${iCount}`,
          `Docs: ${dCount}`,
          `Data dir: ${DOCS_DATA_DIR}`,
        ].join("\n");
      } catch {
        return `❌ No docs index found. Run update-docs.py to fetch from GitHub.\nData dir: ${DOCS_DATA_DIR}`;
      }
    }

    default:
      throw new Error(`Unknown action '${params.action}'.`);
  }
}
