/**
 * Graph data model — nodes, edges, and the in-memory graph with bidirectional indexes.
 */

export type NodeType =
  | "entity" | "automation" | "script" | "scene" | "dashboard"
  | "helper" | "area" | "label" | "device" | "floor" | "yaml_file" | "storage_file";

export type EdgeType =
  | "references"      // generic: X mentions Y
  | "triggers_on"     // automation trigger uses entity
  | "controls"        // automation/script action targets entity
  | "condition_on"    // automation/script condition checks entity
  | "member_of"       // entity is member of group
  | "labeled_with"    // entity/device/area has label
  | "located_in"      // entity/device assigned to area
  | "on_floor"        // area assigned to floor
  | "defined_in"      // entity/automation defined in this file
  | "included_by";    // yaml file included by another

export interface GraphNode {
  id: string;
  type: NodeType;
  name?: string;
  /** Source file where this node was found */
  source?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  /** Where the reference was found (file:line or description) */
  context?: string;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** Precomputed: edges pointing TO a node id */
  refsTo: Map<string, GraphEdge[]>;
  /** Precomputed: edges pointing FROM a node id */
  refsFrom: Map<string, GraphEdge[]>;
  buildTime: string;
  errors: string[];
}

/** Serializable version for cache */
export interface SerializedGraph {
  nodes: [string, GraphNode][];
  edges: GraphEdge[];
  buildTime: string;
  errors: string[];
}

/** A config source discovered during collection */
export interface ConfigSource {
  /** Absolute path or identifier */
  path: string;
  /** "yaml" or "json" */
  format: "yaml" | "json";
  /** Raw file content */
  raw: string;
  /** Parsed content (object/array) */
  parsed: unknown;
}

/** A reference found by the extractor */
export interface FoundReference {
  /** The referenced entity/area/label id */
  target: string;
  /** What type of reference (entity_id, area, label, etc.) */
  targetType: NodeType;
  /** Edge type to create */
  edgeType: EdgeType;
  /** Context string (file + location) */
  context: string;
}

export function createEmptyGraph(): Graph {
  return {
    nodes: new Map(),
    edges: [],
    refsTo: new Map(),
    refsFrom: new Map(),
    buildTime: new Date().toISOString(),
    errors: [],
  };
}

/** Build bidirectional indexes from edges */
export function indexGraph(graph: Graph): void {
  graph.refsTo.clear();
  graph.refsFrom.clear();
  for (const edge of graph.edges) {
    let to = graph.refsTo.get(edge.to);
    if (!to) { to = []; graph.refsTo.set(edge.to, to); }
    to.push(edge);
    let from = graph.refsFrom.get(edge.from);
    if (!from) { from = []; graph.refsFrom.set(edge.from, from); }
    from.push(edge);
  }
}
