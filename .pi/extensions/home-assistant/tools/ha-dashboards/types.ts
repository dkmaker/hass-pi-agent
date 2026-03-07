/**
 * Shared types and helpers for dashboard management.
 */
import { wsCommand } from "../../lib/ws.js";

// ── Types ────────────────────────────────────────────────────

export interface DashboardInfo {
  id: string;
  url_path: string;
  title: string;
  icon?: string;
  require_admin: boolean;
  show_in_sidebar: boolean;
  mode: "storage" | "yaml";
  [key: string]: unknown;
}

export interface CardConfig {
  type: string;
  entity?: string;
  entities?: unknown[];
  title?: string;
  name?: string;
  cards?: CardConfig[];
  [key: string]: unknown;
}

export interface SectionConfig {
  type?: string;
  title?: string;
  cards?: CardConfig[];
  visibility?: unknown[];
  disabled?: boolean;
  column_span?: number;
  row_span?: number;
  [key: string]: unknown;
}

export interface ViewConfig {
  title?: string;
  path?: string;
  icon?: string;
  type?: string;
  theme?: string;
  panel?: boolean;
  background?: unknown;
  visible?: unknown;
  subview?: boolean;
  back_path?: string;
  max_columns?: number;
  cards?: CardConfig[];
  sections?: SectionConfig[];
  badges?: unknown[];
  header?: unknown;
  footer?: unknown;
  sidebar?: unknown;
  [key: string]: unknown;
}

export interface LovelaceConfig {
  background?: unknown;
  views: ViewConfig[];
  [key: string]: unknown;
}

// ── Config fetch/save ────────────────────────────────────────

export async function fetchDashboardConfig(urlPath?: string): Promise<LovelaceConfig> {
  const params: Record<string, unknown> = { force: true };
  if (urlPath !== undefined) {
    params.url_path = urlPath;
  } else {
    params.url_path = null;
  }
  try {
    return await wsCommand<LovelaceConfig>("lovelace/config", params);
  } catch (err: any) {
    // New dashboards have no config yet — return empty
    if (err.message?.includes("No config found") || err.message?.includes("config_not_found")) {
      return { views: [] };
    }
    throw err;
  }
}

export async function saveDashboardConfig(urlPath: string | undefined, config: LovelaceConfig): Promise<void> {
  const params: Record<string, unknown> = { config };
  if (urlPath !== undefined) {
    params.url_path = urlPath;
  } else {
    params.url_path = null;
  }
  await wsCommand("lovelace/config/save", params);
}

// ── View resolution ──────────────────────────────────────────

export function resolveViewIndex(
  views: ViewConfig[],
  viewIndex?: number,
  viewPath?: string
): number {
  if (viewIndex !== undefined) {
    if (viewIndex < 0 || viewIndex >= views.length) {
      throw new Error(`View index ${viewIndex} out of range (0-${views.length - 1})`);
    }
    return viewIndex;
  }

  if (viewPath !== undefined) {
    const idx = views.findIndex((v) => v.path === viewPath);
    if (idx === -1) {
      throw new Error(`View with path '${viewPath}' not found. Available: ${views.map((v, i) => v.path ? `${i}:${v.path}` : `${i}`).join(", ")}`);
    }
    return idx;
  }

  throw new Error("Provide 'view_index' or 'view_path' to identify a view");
}
