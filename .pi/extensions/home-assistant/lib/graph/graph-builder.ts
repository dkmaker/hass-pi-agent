/**
 * Build the relationship graph from collected config sources.
 *
 * 1. Collects all sources (YAML + .storage JSON)
 * 2. Creates nodes from registries and known config structures
 * 3. Extracts references from all sources
 * 4. Builds bidirectional indexes
 */
import { basename } from "node:path";
import type { Graph, GraphNode, GraphEdge, ConfigSource, NodeType } from "./types.js";
import { createEmptyGraph, indexGraph } from "./types.js";
import { collectSources } from "./source-collector.js";
import { extractReferences, extractAutomationReferences } from "./reference-extractor.js";

/**
 * Build the complete relationship graph.
 * @param configDir Root HA config directory
 */
export function buildGraph(configDir: string): Graph {
  const graph = createEmptyGraph();
  const { sources, errors } = collectSources(configDir);
  graph.errors.push(...errors);

  // ── Pass 1: Create nodes from structured data ──────────────
  for (const source of sources) {
    if (source.format === "json" && source.parsed) {
      processStorageFile(graph, source);
    } else if (source.format === "yaml") {
      // Add yaml file as a node
      addNode(graph, source.path, "yaml_file", basename(source.path), source.path);
      processYamlFile(graph, source);
    }
  }

  // ── Pass 2: Extract references from ALL sources ────────────
  for (const source of sources) {
    const refs = extractReferences(source.raw, source.path);
    for (const ref of refs) {
      // Ensure target node exists (may be external/unknown)
      if (!graph.nodes.has(ref.target)) {
        addNode(graph, ref.target, ref.targetType, ref.target);
      }
      addEdge(graph, source.path, ref.target, ref.edgeType, ref.context);
    }
  }

  // ── Pass 3: Build indexes ──────────────────────────────────
  indexGraph(graph);
  return graph;
}

// ── Storage file processors ──────────────────────────────────

function processStorageFile(graph: Graph, source: ConfigSource): void {
  const data = source.parsed as Record<string, unknown>;
  const storageData = data?.data as Record<string, unknown> | undefined;
  if (!storageData) return;

  const fileName = basename(source.path);
  addNode(graph, source.path, "storage_file", fileName, source.path);

  // Entity registry
  if (fileName === "core.entity_registry") {
    const entities = (storageData.entities ?? []) as Array<Record<string, unknown>>;
    for (const e of entities) {
      const entityId = e.entity_id as string;
      if (!entityId) continue;
      addNode(graph, entityId, "entity", (e.name as string) ?? entityId, source.path);

      if (e.area_id) {
        addEdge(graph, entityId, e.area_id as string, "located_in", source.path);
      }
      if (e.device_id) {
        addEdge(graph, entityId, e.device_id as string, "references", source.path);
      }
      if (e.labels && Array.isArray(e.labels)) {
        for (const label of e.labels) {
          addEdge(graph, entityId, label as string, "labeled_with", source.path);
        }
      }
    }
  }

  // Device registry
  if (fileName === "core.device_registry") {
    const devices = (storageData.devices ?? []) as Array<Record<string, unknown>>;
    for (const d of devices) {
      const deviceId = d.id as string;
      if (!deviceId) continue;
      const name = (d.name_by_user ?? d.name ?? deviceId) as string;
      addNode(graph, deviceId, "device", name, source.path);

      if (d.area_id) {
        addEdge(graph, deviceId, d.area_id as string, "located_in", source.path);
      }
      if (d.labels && Array.isArray(d.labels)) {
        for (const label of d.labels) {
          addEdge(graph, deviceId, label as string, "labeled_with", source.path);
        }
      }
    }
  }

  // Area registry
  if (fileName === "core.area_registry") {
    const areas = (storageData.areas ?? []) as Array<Record<string, unknown>>;
    for (const a of areas) {
      const areaId = a.id as string;
      if (!areaId) continue;
      addNode(graph, areaId, "area", (a.name as string) ?? areaId, source.path);

      if (a.floor_id) {
        addEdge(graph, areaId, a.floor_id as string, "on_floor", source.path);
      }
      if (a.labels && Array.isArray(a.labels)) {
        for (const label of a.labels) {
          addEdge(graph, areaId, label as string, "labeled_with", source.path);
        }
      }
    }
  }

  // Label registry
  if (fileName === "core.label_registry") {
    const labels = (storageData.labels ?? []) as Array<Record<string, unknown>>;
    for (const l of labels) {
      addNode(graph, l.label_id as string, "label", (l.name as string) ?? (l.label_id as string), source.path);
    }
  }

  // Floor registry (may be inside area registry or separate)
  if (fileName === "core.floor_registry") {
    const floors = (storageData.floors ?? []) as Array<Record<string, unknown>>;
    for (const f of floors) {
      addNode(graph, f.floor_id as string, "floor", (f.name as string) ?? (f.floor_id as string), source.path);
    }
  }

  // Lovelace dashboards
  if (fileName === "lovelace_dashboards") {
    const dashboards = (storageData.items ?? []) as Array<Record<string, unknown>>;
    for (const d of dashboards) {
      addNode(graph, d.id as string, "dashboard", (d.title as string) ?? (d.id as string), source.path);
    }
  }

  // Lovelace dashboard content (lovelace, lovelace.dashboard_*, etc.)
  if (fileName.startsWith("lovelace") && fileName !== "lovelace_dashboards" && fileName !== "lovelace.map") {
    // Dashboard content — entity references extracted in pass 2 (raw text scan)
    addNode(graph, source.path, "dashboard", fileName, source.path);
  }

  // Person registry
  if (fileName === "person") {
    const items = (storageData.items ?? []) as Array<Record<string, unknown>>;
    for (const p of items) {
      if (p.id) addNode(graph, `person.${p.id}`, "entity", (p.name as string) ?? (p.id as string), source.path);
    }
  }

  // Helper collections (input_boolean, input_number, input_text, input_select, input_datetime, counter, timer, schedule)
  const helperDomains = ["input_boolean", "input_number", "input_text", "input_select", "input_datetime", "counter", "timer", "schedule"];
  if (helperDomains.includes(fileName)) {
    const items = (storageData.items ?? []) as Array<Record<string, unknown>>;
    for (const item of items) {
      const id = item.id as string;
      if (id) {
        addNode(graph, `${fileName}.${id}`, "helper", (item.name as string) ?? id, source.path);
        addEdge(graph, `${fileName}.${id}`, source.path, "defined_in", source.path);
      }
    }
  }

  // Config entries (template sensors, utility meters, etc.)
  if (fileName === "core.config_entries") {
    const entries = (storageData.entries ?? []) as Array<Record<string, unknown>>;
    for (const entry of entries) {
      const entryId = entry.entry_id as string;
      const domain = entry.domain as string;
      const title = entry.title as string;
      if (entryId && domain) {
        addNode(graph, entryId, "helper", `${domain}: ${title ?? entryId}`, source.path);
        // Config entry options may contain entity references — extracted in pass 2
      }
    }
  }
}

// ── YAML file processors ─────────────────────────────────────

function processYamlFile(graph: Graph, source: ConfigSource): void {
  // Try to detect automations list (array of objects with alias + trigger)
  // We parse the raw text to find automation blocks for semantic edge types
  try {
    // Simple heuristic: if file contains "- id:" + "alias:" + "trigger", it's automations
    if (source.raw.includes("- id:") && source.raw.includes("alias:") &&
        (source.raw.includes("trigger:") || source.raw.includes("triggers:"))) {
      processAutomationsYaml(graph, source);
    }
  } catch {
    // Fall through — references still extracted in pass 2
  }
}

function processAutomationsYaml(graph: Graph, source: ConfigSource): void {
  // Split by "- id:" to get individual automations
  const blocks = source.raw.split(/^- id:/m);
  for (let i = 1; i < blocks.length; i++) {
    const block = "- id:" + blocks[i];
    const idMatch = block.match(/id:\s*['"]?(\S+?)['"]?\s*\n/);
    const aliasMatch = block.match(/alias:\s*['"]?(.+?)['"]?\s*\n/);

    if (idMatch) {
      const autoId = idMatch[1];
      const entityId = `automation.${autoId}`;
      const name = aliasMatch?.[1] ?? autoId;
      addNode(graph, entityId, "automation", name, source.path);
      addEdge(graph, entityId, source.path, "defined_in", source.path);

      // Extract semantic references from this automation block
      // Use a simple approach: split block into trigger/condition/action sections
      const triggerIdx = block.search(/^\s*(triggers?:)/m);
      const conditionIdx = block.search(/^\s*(conditions?:)/m);
      const actionIdx = block.search(/^\s*(actions?:)/m);

      const sections: Array<{ text: string; edgeType: "triggers_on" | "condition_on" | "controls" }> = [];

      // Build sections from detected indices
      const indices = [
        { idx: triggerIdx, type: "triggers_on" as const },
        { idx: conditionIdx, type: "condition_on" as const },
        { idx: actionIdx, type: "controls" as const },
      ].filter(s => s.idx >= 0).sort((a, b) => a.idx - b.idx);

      for (let j = 0; j < indices.length; j++) {
        const start = indices[j].idx;
        const end = j + 1 < indices.length ? indices[j + 1].idx : block.length;
        sections.push({ text: block.slice(start, end), edgeType: indices[j].type });
      }

      // Extract references from each section with appropriate edge type
      for (const section of sections) {
        const refs = extractReferences(section.text, source.path, section.edgeType);
        for (const ref of refs) {
          if (!graph.nodes.has(ref.target)) {
            addNode(graph, ref.target, ref.targetType, ref.target);
          }
          addEdge(graph, entityId, ref.target, ref.edgeType, `${source.path} (${section.edgeType})`);
        }
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function addNode(graph: Graph, id: string, type: NodeType, name?: string, source?: string): void {
  if (!graph.nodes.has(id)) {
    graph.nodes.set(id, { id, type, name, source });
  }
}

function addEdge(graph: Graph, from: string, to: string, type: GraphEdge["type"], context?: string): void {
  // Don't add self-references
  if (from === to) return;
  graph.edges.push({ from, to, type, context });
}
