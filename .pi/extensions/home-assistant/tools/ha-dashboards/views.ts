/**
 * Dashboard view operations — get, add, update, remove, move.
 *
 * All modifications fetch the full config, modify views[], and save back.
 */
import { backupBeforeMutation } from "../../lib/mutation-log.js";
import {
  fetchDashboardConfig,
  saveDashboardConfig,
  resolveViewIndex,
  type ViewConfig,
} from "./types.js";
import { toYaml } from "../../lib/yaml.js";

// ── Get View ─────────────────────────────────────────────────

export async function handleGetView(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const idx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const view = views[idx];
  return `## View ${idx}: ${view.title || "(untitled)"}\n\n\`\`\`yaml\n${toYaml(view).trim()}\n\`\`\``;
}

// ── Add View ─────────────────────────────────────────────────

export async function handleAddView(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const viewConfig = params.view_config as ViewConfig | undefined;

  if (!viewConfig) {
    throw new Error("'view_config' is required for add-view. Include at least {title: '...'}");
  }

  const config = await fetchDashboardConfig(urlPath);
  if (!config.views) config.views = [];

  const position = params.position as number | undefined;

  if (position !== undefined) {
    if (position < 0 || position > config.views.length) {
      throw new Error(`Position ${position} out of range (0-${config.views.length})`);
    }
    config.views.splice(position, 0, viewConfig);
  } else {
    config.views.push(viewConfig);
  }

  await saveDashboardConfig(urlPath, config);

  const idx = position ?? config.views.length - 1;
  return `✅ Added view '${viewConfig.title || "(untitled)"}' at index ${idx}`;
}

// ── Update View ──────────────────────────────────────────────

export async function handleUpdateView(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const viewConfig = params.view_config as Record<string, unknown> | undefined;

  if (!viewConfig) {
    throw new Error("'view_config' is required for update-view");
  }

  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const idx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  // Snapshot view before mutation
  backupBeforeMutation("ha_dashboards", "update-view", `${urlPath ?? "default"}.view-${idx}`, config.views[idx]);

  // Merge: new config overrides existing fields
  config.views[idx] = { ...config.views[idx], ...viewConfig };

  await saveDashboardConfig(urlPath, config);

  return `✅ Updated view ${idx} '${config.views[idx].title || "(untitled)"}'`;
}

// ── Remove View ──────────────────────────────────────────────

export async function handleRemoveView(params: Record<string, unknown>, confirm?: boolean): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const idx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  const view = views[idx];
  if (!confirm) {
    return `⚠️ **Confirm remove-view**: view ${idx} '${view?.title || "(untitled)"}' (${view?.cards?.length ?? 0} cards)\n\nCall again with \`confirm: true\` to proceed.`;
  }

  // Snapshot view before deletion
  backupBeforeMutation("ha_dashboards", "remove-view", `${urlPath ?? "default"}.view-${idx}`, view);

  const removed = config.views.splice(idx, 1)[0];
  await saveDashboardConfig(urlPath, config);

  return `✅ Removed view ${idx} '${removed.title || "(untitled)"}' (${removed.cards?.length ?? 0} cards)`;
}

// ── Move View ────────────────────────────────────────────────

export async function handleMoveView(params: Record<string, unknown>): Promise<string> {
  const urlPath = params.url_path as string | undefined;
  const position = params.position as number | undefined;

  if (position === undefined) {
    throw new Error("'position' is required for move-view");
  }

  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const idx = resolveViewIndex(
    views,
    params.view_index as number | undefined,
    params.view_path as string | undefined
  );

  if (position < 0 || position >= views.length) {
    throw new Error(`Target position ${position} out of range (0-${views.length - 1})`);
  }

  const [view] = config.views.splice(idx, 1);
  config.views.splice(position, 0, view);

  await saveDashboardConfig(urlPath, config);

  return `✅ Moved view '${view.title || "(untitled)"}' from index ${idx} to ${position}`;
}
