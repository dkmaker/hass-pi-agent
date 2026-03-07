/**
 * Shared TypeScript types for the Home Assistant Pi extension.
 *
 * Central type definitions used across multiple tools — avoids
 * duplicating interfaces in every tool file.
 */

/** HA entity state from REST API / WS get_states */
export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

/** Automation config as returned by REST config API */
export interface AutomationConfig {
  id?: string;
  alias?: string;
  description?: string;
  triggers?: unknown[];
  trigger?: unknown[];
  conditions?: unknown[];
  condition?: unknown[];
  actions?: unknown[];
  action?: unknown[];
  mode?: string;
  max?: number;
  max_exceeded?: string;
  variables?: Record<string, unknown>;
  trace?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Automation trace list entry from WS trace/list */
export interface TraceListEntry {
  run_id: string;
  state: string;
  script_execution: string;
  timestamp: { start: string; finish: string | null };
  domain: string;
  item_id: string;
  last_step: string | null;
  [key: string]: unknown;
}

/** In-progress automation draft stored on disk */
export interface DraftConfig {
  alias: string;
  description: string;
  triggers: unknown[];
  conditions: unknown[];
  actions: unknown[];
  mode: string;
  max?: number;
  variables?: Record<string, unknown>;
  _meta: {
    created: string;
    modified: string;
    source_id?: string;
  };
}

/** Single field in the automation element schema */
export interface SchemaField {
  type: string;
  required: boolean;
  description?: string;
}

/** Schema for one trigger/condition/action type */
export interface ElementSchema {
  description: string;
  fields: Record<string, SchemaField>;
  default?: Record<string, unknown>;
}

/** Full automation elements schema (from automation-elements.json) */
export interface AutomationSchema {
  triggers: Record<string, ElementSchema>;
  conditions: Record<string, ElementSchema>;
  actions: Record<string, ElementSchema>;
  repeat_variants: Record<string, { fields: Record<string, SchemaField> }>;
  base_fields: {
    trigger: Record<string, SchemaField>;
    condition: Record<string, SchemaField>;
    action: Record<string, SchemaField>;
  };
  automation_modes: Record<string, string>;
  duration_format: { description: string; examples: unknown[] };
  target_format: { description: string; examples: unknown[] };
}
