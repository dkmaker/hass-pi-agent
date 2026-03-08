/**
 * ha_graph — Entity & Configuration Relationship Graph
 *
 * Builds and queries a complete relationship graph of all HA configuration.
 * Parses YAML (with !include resolution) and .storage JSON files to find
 * every entity reference across automations, scripts, dashboards, helpers, etc.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { HA_CONFIG_PATH } from "../lib/config.js";
import { buildGraph } from "../lib/graph/graph-builder.js";
import { saveGraph, loadGraph } from "../lib/graph/cache.js";
import type { Graph, GraphEdge, NodeType } from "../lib/graph/types.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

export function registerGraphTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ha_graph",
    description: `Entity & configuration relationship graph engine. Actions: build, status, query, impact, orphans, unused-labels, unused-areas, summary, export. Use ha_tool_docs('ha_graph') for full usage.`,
    parameters: Type.Object({
      action: StringEnum(
        ["build", "status", "query", "impact", "orphans", "unused-labels", "unused-areas", "summary", "export"] as const,
        { description: "Action to perform" }
      ),
      target: Type.Optional(Type.String({
        description: "Entity ID, area ID, or label ID for query/impact actions"
      })),
      direction: Type.Optional(StringEnum(["to", "from", "both"] as const, {
        description: "Query direction: 'to' (what references target), 'from' (what target references), 'both' (default)"
      })),
      node_type: Type.Optional(Type.String({
        description: "Filter by node type: entity, automation, script, scene, dashboard, helper, area, label, device"
      })),
    }),

    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("ha_graph", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "build": return doBuild();
    case "status": return doStatus();
    case "query": return doQuery(params.target as string | undefined, params.direction as string | undefined, params.node_type as string | undefined);
    case "impact": return doImpact(params.target as string | undefined);
    case "orphans": return doOrphans(params.node_type as string | undefined);
    case "unused-labels": return doUnused("label");
    case "unused-areas": return doUnused("area");
    case "summary": return doSummary();
    case "export": return doExport();
    default: throw new Error(`Unknown action: ${params.action}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function getGraph(): Graph {
  const graph = loadGraph();
  if (!graph) throw new Error("No graph cached. Run `build` first.");
  return graph;
}

function formatEdge(edge: GraphEdge, graph: Graph, showFrom: boolean): string {
  const nodeId = showFrom ? edge.from : edge.to;
  const node = graph.nodes.get(nodeId);
  const name = node?.name && node.name !== nodeId ? ` (${node.name})` : "";
  const type = node?.type ? `[${node.type}]` : "";
  return `  ${edge.type}: ${nodeId}${name} ${type}`;
}

function countByType(graph: Graph): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of graph.nodes.values()) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
}

// ── Actions ──────────────────────────────────────────────────

function doBuild(): string {
  const t0 = Date.now();
  const graph = buildGraph(HA_CONFIG_PATH);
  saveGraph(graph);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  const counts = countByType(graph);

  const lines = [`✅ Graph built in ${elapsed}s`];
  lines.push(`\n**Nodes**: ${graph.nodes.size}`);
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count}`);
  }
  lines.push(`\n**Edges**: ${graph.edges.length}`);
  if (graph.errors.length) {
    lines.push(`\n⚠️ **Errors** (${graph.errors.length}):`);
    for (const e of graph.errors.slice(0, 10)) lines.push(`  - ${e}`);
    if (graph.errors.length > 10) lines.push(`  ... and ${graph.errors.length - 10} more`);
  }
  return lines.join("\n");
}

function doStatus(): string {
  const graph = loadGraph();
  if (!graph) return "No graph cached. Run `build` first.";

  const counts = countByType(graph);
  const lines = [
    "## Graph Status",
    "",
    "| Property | Value |",
    "|----------|-------|",
    `| Last built | ${graph.buildTime} |`,
    `| Nodes | ${graph.nodes.size} |`,
    `| Edges | ${graph.edges.length} |`,
  ];
  if (graph.errors.length) lines.push(`| Errors | ${graph.errors.length} |`);
  lines.push("", "### Nodes by type", "", "| Type | Count |", "|------|-------|");
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${type} | ${count} |`);
  }
  return lines.join("\n");
}

function doQuery(target?: string, direction?: string, nodeType?: string): string {
  if (!target) throw new Error("'target' is required for query action");
  const graph = getGraph();
  const dir = direction ?? "both";

  const lines: string[] = [];
  const node = graph.nodes.get(target);
  if (node) {
    lines.push(`**${target}** [${node.type}]${node.name && node.name !== target ? ` — ${node.name}` : ""}`);
    if (node.source) lines.push(`Defined in: ${node.source}`);
  } else {
    lines.push(`**${target}** (not found as a node — showing references only)`);
  }

  if (dir === "to" || dir === "both") {
    const inbound = (graph.refsTo.get(target) ?? [])
      .filter(e => !nodeType || graph.nodes.get(e.from)?.type === nodeType);
    lines.push(`\n**Referenced by** (${inbound.length}):`);
    if (inbound.length === 0) lines.push("  (none)");
    for (const e of inbound) lines.push(formatEdge(e, graph, true));
  }

  if (dir === "from" || dir === "both") {
    const outbound = (graph.refsFrom.get(target) ?? [])
      .filter(e => !nodeType || graph.nodes.get(e.to)?.type === nodeType);
    lines.push(`\n**References** (${outbound.length}):`);
    if (outbound.length === 0) lines.push("  (none)");
    for (const e of outbound) lines.push(formatEdge(e, graph, false));
  }

  return lines.join("\n");
}

function doImpact(target?: string): string {
  if (!target) throw new Error("'target' is required for impact action");
  const graph = getGraph();

  const inbound = graph.refsTo.get(target) ?? [];
  if (inbound.length === 0) {
    return `**${target}** — no references found. Safe to rename/delete.`;
  }

  // Group by source file
  const byFile = new Map<string, GraphEdge[]>();
  for (const e of inbound) {
    const ctx = e.context ?? "unknown";
    let list = byFile.get(ctx);
    if (!list) { list = []; byFile.set(ctx, list); }
    list.push(e);
  }

  const lines = [`⚠️ **Impact analysis for ${target}**`, `${inbound.length} reference(s) across ${byFile.size} source(s):`];
  for (const [file, edges] of byFile) {
    lines.push(`\n📄 ${file}:`);
    for (const e of edges) {
      const fromNode = graph.nodes.get(e.from);
      const name = fromNode?.name && fromNode.name !== e.from ? ` (${fromNode.name})` : "";
      lines.push(`  ${e.type}: ${e.from}${name}`);
    }
  }

  return lines.join("\n");
}

function doOrphans(nodeType?: string): string {
  const graph = getGraph();
  const filterType = (nodeType as NodeType) ?? "entity";

  const orphans: Array<{ id: string; name?: string }> = [];
  for (const [id, node] of graph.nodes) {
    if (node.type !== filterType) continue;
    const inbound = graph.refsTo.get(id) ?? [];
    // Exclude self-referencing edges and "defined_in" edges — those don't count as "used"
    const meaningful = inbound.filter(e => e.from !== id && e.type !== "defined_in");
    if (meaningful.length === 0) {
      orphans.push({ id, name: node.name });
    }
  }

  if (orphans.length === 0) return `No orphaned ${filterType === "entity" ? "entities" : filterType + "s"} found.`;

  const shown = orphans.slice(0, 50);
  const lines: string[] = [
    "| ID | Name |",
    "|----|------|",
    ...shown.map((o) => `| ${o.id} | ${o.name && o.name !== o.id ? o.name : ""} |`),
  ];
  const countLine = orphans.length > 50
    ? `Showing 50 of ${orphans.length} orphaned ${filterType}s`
    : `${orphans.length} orphaned ${filterType}s`;
  lines.push(`\n${countLine}`);
  return lines.join("\n");
}

function doUnused(type: "label" | "area"): string {
  const graph = getGraph();

  const unused: Array<{ id: string; name?: string }> = [];
  for (const [id, node] of graph.nodes) {
    if (node.type !== type) continue;
    const inbound = graph.refsTo.get(id) ?? [];
    if (inbound.length === 0) {
      unused.push({ id, name: node.name });
    }
  }

  if (unused.length === 0) return `No unused ${type}s found.`;

  const lines: string[] = [
    "| ID | Name |",
    "|----|------|",
    ...unused.map((u) => `| ${u.id} | ${u.name && u.name !== u.id ? u.name : ""} |`),
    `\n${unused.length} unused ${type}s`,
  ];
  return lines.join("\n");
}

function doSummary(): string {
  const graph = getGraph();
  const counts = countByType(graph);

  // Edge type counts
  const edgeCounts: Record<string, number> = {};
  for (const e of graph.edges) {
    edgeCounts[e.type] = (edgeCounts[e.type] ?? 0) + 1;
  }

  // Most-referenced entities (top 10)
  const refCounts: Array<{ id: string; name?: string; count: number }> = [];
  for (const [id, edges] of graph.refsTo) {
    const node = graph.nodes.get(id);
    if (node?.type === "entity" || node?.type === "helper") {
      refCounts.push({ id, name: node.name, count: edges.length });
    }
  }
  refCounts.sort((a, b) => b.count - a.count);

  const lines = [`**Graph Summary** (built ${graph.buildTime})`];
  lines.push(`\n**Nodes** (${graph.nodes.size}):`);
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count}`);
  }
  lines.push(`\n**Edges** (${graph.edges.length}):`);
  for (const [type, count] of Object.entries(edgeCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${type}: ${count}`);
  }

  if (refCounts.length > 0) {
    lines.push(`\n**Most referenced** (top 10):`);
    for (const r of refCounts.slice(0, 10)) {
      lines.push(`  ${r.id}${r.name && r.name !== r.id ? ` (${r.name})` : ""} — ${r.count} reference(s)`);
    }
  }

  if (graph.errors.length) {
    lines.push(`\n⚠️ **Parse errors**: ${graph.errors.length}`);
  }

  return lines.join("\n");
}

function doExport(): string {
  const graph = getGraph();
  const exported = {
    buildTime: graph.buildTime,
    nodes: Object.fromEntries(graph.nodes),
    edges: graph.edges,
    errors: graph.errors,
  };
  const json = JSON.stringify(exported, null, 2);
  return `## Graph Export\n\n${exported.nodes ? Object.keys(exported.nodes).length : 0} nodes, ${exported.edges?.length ?? 0} edges\n\n\`\`\`json\n${json}\n\`\`\``;
}
