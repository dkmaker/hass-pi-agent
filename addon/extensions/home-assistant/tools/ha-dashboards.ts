/**
 * Home Assistant dashboard (Lovelace) management tool.
 *
 * Dashboard metadata (list/create/update/delete) uses WS collection API.
 * Dashboard content (views/cards) uses atomic config save — fetch full config,
 * modify in memory, save back.
 *
 * Custom cards (from HACS or manual installs) use the "custom:" prefix
 * (e.g., type: "custom:mushroom-entity-card") and accept freeform config.
 * They work with all actions — no special handling needed.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";
import {
  fetchDashboardConfig,
  saveDashboardConfig,
  type DashboardInfo,
  type LovelaceConfig,
  type ViewConfig,
  type CardConfig,
} from "./ha-dashboards/types.js";
import {
  handleGetView,
  handleAddView,
  handleUpdateView,
  handleRemoveView,
  handleMoveView,
} from "./ha-dashboards/views.js";
import {
  handleAddCard,
  handleUpdateCard,
  handleRemoveCard,
  handleMoveCard,
} from "./ha-dashboards/cards.js";
import { handleListCardTypes } from "./ha-dashboards/card-types.js";

// ── Tool registration ────────────────────────────────────────

const ALL_ACTIONS = [
  "list", "get", "create", "update", "delete",
  "get-view", "add-view", "update-view", "remove-view", "move-view",
  "add-card", "update-card", "remove-card", "move-card",
  "list-card-types",
] as const;

export function registerDashboardsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_dashboards",
    label: "HA Dashboards",
    description: `Manage Home Assistant dashboards (Lovelace UI).

Actions:
- list: List all dashboards with view counts.
- get: Get full dashboard config (all views and cards). Use url_path (null for default).
- create: Create a new dashboard (title + url_path required).
- update: Update dashboard metadata (title, icon, sidebar, require_admin).
- delete: Delete a dashboard by dashboard_id.
- get-view: Get a specific view config by index or path.
- add-view: Add a new view to a dashboard.
- update-view: Update a view's config (merges with existing).
- remove-view: Remove a view by index.
- move-view: Move a view to a new position.
- add-card: Add a card to a view.
- update-card: Update a card's config at a specific index.
- remove-card: Remove a card from a view by index.
- move-card: Move a card to a different position or view.
- list-card-types: Show available built-in card types with field schemas.

Dashboard content is atomic — views/cards are fetched, modified in memory, and saved back as a whole config.
Custom cards use "custom:" prefix (e.g., type: "custom:mushroom-entity-card") with freeform config fields.`,

    parameters: Type.Object({
      action: StringEnum([...ALL_ACTIONS], {
        description: "Action to perform",
      }),
      // Dashboard identification
      url_path: Type.Optional(
        Type.String({ description: "Dashboard URL path (null or omit for default dashboard)" })
      ),
      dashboard_id: Type.Optional(
        Type.String({ description: "Dashboard ID for update/delete (from list)" })
      ),
      // Dashboard create/update fields
      title: Type.Optional(
        Type.String({ description: "Dashboard title" })
      ),
      icon: Type.Optional(
        Type.String({ description: "Dashboard sidebar icon (e.g., mdi:view-dashboard)" })
      ),
      require_admin: Type.Optional(
        Type.Boolean({ description: "Require admin access to view dashboard" })
      ),
      show_in_sidebar: Type.Optional(
        Type.Boolean({ description: "Show dashboard in sidebar" })
      ),
      // View identification
      view_index: Type.Optional(
        Type.Number({ description: "View index (0-based)" })
      ),
      view_path: Type.Optional(
        Type.String({ description: "View path (alternative to view_index)" })
      ),
      // Card identification
      card_index: Type.Optional(
        Type.Number({ description: "Card index within a view (0-based)" })
      ),
      // View/card config
      view_config: Type.Optional(
        Type.Object({}, { additionalProperties: true, description: "View config: title, path, icon, theme, type, etc." })
      ),
      card_config: Type.Optional(
        Type.Object({}, { additionalProperties: true, description: "Card config: type (required), plus card-specific fields" })
      ),
      // Move targets
      position: Type.Optional(
        Type.Number({ description: "Target position index for move actions" })
      ),
      target_view_index: Type.Optional(
        Type.Number({ description: "Target view index for move-card across views" })
      ),
      // Card type filter
      search: Type.Optional(
        Type.String({ description: "Filter card types by name (for list-card-types)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  const action = params.action as string;

  switch (action) {
    // Dashboard CRUD
    case "list":
      return handleList();
    case "get":
      return handleGet(params.url_path as string | undefined);
    case "create":
      return handleCreate(params);
    case "update":
      return handleUpdate(params);
    case "delete":
      return handleDelete(params.dashboard_id as string | undefined);

    // View operations
    case "get-view":
      return handleGetView(params);
    case "add-view":
      return handleAddView(params);
    case "update-view":
      return handleUpdateView(params);
    case "remove-view":
      return handleRemoveView(params);
    case "move-view":
      return handleMoveView(params);

    // Card operations
    case "add-card":
      return handleAddCard(params);
    case "update-card":
      return handleUpdateCard(params);
    case "remove-card":
      return handleRemoveCard(params);
    case "move-card":
      return handleMoveCard(params);

    // Card types
    case "list-card-types":
      return handleListCardTypes(params.search as string | undefined);

    default:
      throw new Error(`Unknown action '${action}'. Valid: ${ALL_ACTIONS.join(", ")}`);
  }
}

// ── Dashboard CRUD handlers ──────────────────────────────────

async function handleList(): Promise<string> {
  const dashboards = await wsCommand<DashboardInfo[]>("lovelace/dashboards/list");

  if (dashboards.length === 0) {
    return "No custom dashboards. The default dashboard exists at url_path: null.";
  }

  const lines: string[] = ["## Dashboards\n"];

  // Always mention the default dashboard
  try {
    const defaultConfig = await fetchDashboardConfig(undefined);
    const viewCount = defaultConfig.views?.length ?? 0;
    lines.push(`**Default Dashboard** (url_path: null)`);
    lines.push(`  ${viewCount} views\n`);
  } catch {
    lines.push(`**Default Dashboard** (url_path: null)`);
    lines.push(`  auto-generated (no custom config)\n`);
  }

  for (const d of dashboards) {
    const icon = d.icon ? ` ${d.icon}` : "";
    const admin = d.require_admin ? " [admin]" : "";
    const sidebar = d.show_in_sidebar ? "" : " [hidden from sidebar]";
    const mode = d.mode === "yaml" ? " (YAML)" : "";
    lines.push(`**${d.title}**${icon}${admin}${sidebar}${mode}`);
    lines.push(`  id: ${d.id} | url_path: ${d.url_path}`);

    if (d.mode === "storage") {
      try {
        const config = await fetchDashboardConfig(d.url_path);
        lines.push(`  ${config.views?.length ?? 0} views`);
      } catch {
        lines.push(`  no config yet`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function handleGet(urlPath?: string): Promise<string> {
  const config = await fetchDashboardConfig(urlPath);
  const views = config.views || [];

  const lines: string[] = [];
  const dashLabel = urlPath ? `Dashboard '${urlPath}'` : "Default Dashboard";
  lines.push(`## ${dashLabel}\n`);

  if (config.background) {
    lines.push(`Background: ${JSON.stringify(config.background)}\n`);
  }

  if (views.length === 0) {
    lines.push("No views configured.");
    return lines.join("\n");
  }

  for (let vi = 0; vi < views.length; vi++) {
    const view = views[vi];
    const path = view.path ? ` (path: ${view.path})` : "";
    const icon = view.icon ? ` ${view.icon}` : "";
    const viewType = view.type ? ` [${view.type}]` : "";
    const title = view.title || `View ${vi}`;
    lines.push(`### View ${vi}: ${title}${icon}${path}${viewType}`);

    // Show sections if present (newer layout)
    if (view.sections?.length) {
      lines.push(`  ${view.sections.length} sections`);
      for (let si = 0; si < view.sections.length; si++) {
        const section = view.sections[si];
        const sCards = section.cards?.length ?? 0;
        const sTitle = section.title ? ` — ${section.title}` : "";
        lines.push(`  Section ${si}${sTitle}: ${sCards} cards`);
        if (section.cards) {
          for (let ci = 0; ci < section.cards.length; ci++) {
            const card = section.cards[ci];
            lines.push(`    [${ci}] ${formatCardSummary(card)}`);
          }
        }
      }
    }

    // Show cards if present (classic layout)
    if (view.cards?.length) {
      lines.push(`  ${view.cards.length} cards:`);
      for (let ci = 0; ci < view.cards.length; ci++) {
        const card = view.cards[ci];
        lines.push(`  [${ci}] ${formatCardSummary(card)}`);
      }
    }

    if (view.badges?.length) {
      lines.push(`  ${view.badges.length} badges`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function formatCardSummary(card: CardConfig): string {
  const parts: string[] = [card.type];
  if (card.entity) parts.push(`entity: ${card.entity}`);
  if (card.title) parts.push(`"${card.title}"`);
  if (card.name) parts.push(`name: "${card.name}"`);
  if (card.entities) {
    const count = Array.isArray(card.entities) ? card.entities.length : "?";
    parts.push(`${count} entities`);
  }
  if (card.cards) {
    parts.push(`${card.cards.length} sub-cards`);
  }
  return parts.join(" | ");
}

async function handleCreate(params: Record<string, unknown>): Promise<string> {
  const title = params.title as string | undefined;
  const urlPath = params.url_path as string | undefined;

  if (!title) throw new Error("'title' is required for create");
  if (!urlPath) throw new Error("'url_path' is required for create (e.g., 'my-dashboard')");

  const createData: Record<string, unknown> = {
    title,
    url_path: urlPath,
    mode: "storage",
  };

  if (params.icon !== undefined) createData.icon = params.icon;
  if (params.require_admin !== undefined) createData.require_admin = params.require_admin;
  if (params.show_in_sidebar !== undefined) createData.show_in_sidebar = params.show_in_sidebar;

  const result = await wsCommand<DashboardInfo>("lovelace/dashboards/create", createData);
  return `✅ Created dashboard '${result.title}' (id: ${result.id}, url_path: ${result.url_path})`;
}

async function handleUpdate(params: Record<string, unknown>): Promise<string> {
  const dashboardId = params.dashboard_id as string | undefined;
  if (!dashboardId) throw new Error("'dashboard_id' is required for update");

  const updateData: Record<string, unknown> = { dashboard_id: dashboardId };
  let hasUpdates = false;

  for (const field of ["title", "icon", "require_admin", "show_in_sidebar"]) {
    if (field in params) {
      updateData[field] = params[field];
      hasUpdates = true;
    }
  }

  if (!hasUpdates) {
    throw new Error("No update fields provided. Use: title, icon, require_admin, show_in_sidebar");
  }

  const result = await wsCommand<DashboardInfo>("lovelace/dashboards/update", updateData);
  return `✅ Updated dashboard '${result.title}' (id: ${result.id})`;
}

async function handleDelete(dashboardId?: string): Promise<string> {
  if (!dashboardId) throw new Error("'dashboard_id' is required for delete");

  await wsCommand("lovelace/dashboards/delete", { dashboard_id: dashboardId });
  return `✅ Deleted dashboard '${dashboardId}'`;
}
