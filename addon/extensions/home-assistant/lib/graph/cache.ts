/**
 * Graph cache — serialize/deserialize to disk for fast reload.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Graph, SerializedGraph } from "./types.js";
import { createEmptyGraph, indexGraph } from "./types.js";

const DEFAULT_CACHE_PATH = "/tmp/ha-graph-cache.json";

export function saveGraph(graph: Graph, cachePath = DEFAULT_CACHE_PATH): void {
  const serialized: SerializedGraph = {
    nodes: [...graph.nodes.entries()],
    edges: graph.edges,
    buildTime: graph.buildTime,
    errors: graph.errors,
  };
  const dir = dirname(cachePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(serialized));
}

export function loadGraph(cachePath = DEFAULT_CACHE_PATH): Graph | null {
  if (!existsSync(cachePath)) return null;
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const data: SerializedGraph = JSON.parse(raw);
    const graph = createEmptyGraph();
    graph.nodes = new Map(data.nodes);
    graph.edges = data.edges;
    graph.buildTime = data.buildTime;
    graph.errors = data.errors ?? [];
    indexGraph(graph);
    return graph;
  } catch {
    return null;
  }
}

export function getCachePath(): string {
  return DEFAULT_CACHE_PATH;
}
