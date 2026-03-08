/**
 * Config entry API backend.
 *
 * Manages helper types that are stored as config entries (template, derivative,
 * utility_meter, threshold, trend, tod, statistics, min_max, filter,
 * integration, generic_thermostat, generic_hygrostat, switch_as_x, random,
 * history_stats, mold_indicator, group).
 *
 * Uses the HA config flow REST API for create/update and WebSocket for list/get.
 * Changes take effect immediately — no restart needed.
 *
 * Create: POST /api/config/config_entries/flow (start flow)
 *         POST /api/config/config_entries/flow/{flowId} (submit form)
 * Update: POST /api/config/config_entries/options/flow (start options flow)
 *         POST /api/config/config_entries/options/flow/{flowId} (submit form)
 * Delete: DELETE /api/config/config_entries/entry/{entryId}
 * List:   REST GET /api/config/config_entries/entry (filtered by domain)
 * Get:    REST GET /api/config/config_entries/entry (filtered by entry_id)
 */
import { apiGet, apiPost, apiDelete } from "../api.js";
import type { SupportedType } from "../registry.js";

export interface BackendResult {
  success: boolean;
  message: string;
  id?: string;
}

// ── Types ────────────────────────────────────────────────────

export interface ConfigEntry {
  entry_id: string;
  domain: string;
  title: string;
  source: string;
  state: string;
  supports_options: boolean;
  disabled_by: string | null;
  options?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

interface FlowStep {
  type: "form" | "menu" | "create_entry" | "abort" | "external" | "progress";
  flow_id: string;
  handler: string;
  step_id?: string;
  data_schema?: unknown[];
  menu_options?: string[];
  errors?: Record<string, string> | null;
  result?: { entry_id: string; title: string } | null;
  reason?: string;
  last_step?: boolean;
}

// ── Backend operations ───────────────────────────────────────

/**
 * List all config entries for a given helper domain.
 */
export async function listEntries(type: SupportedType): Promise<ConfigEntry[]> {
  const entries = await apiGet<ConfigEntry[]>("/api/config/config_entries/entry");
  return entries.filter((e) => e.domain === type.domain);
}

/**
 * Get a single config entry by entry_id.
 */
export async function getEntry(type: SupportedType, entryId: string): Promise<ConfigEntry | null> {
  const entries = await apiGet<ConfigEntry[]>("/api/config/config_entries/entry");
  return entries.find((e) => e.entry_id === entryId && e.domain === type.domain) ?? null;
}

/**
 * Add a new config entry via the config flow API.
 *
 * Flow patterns:
 * - Simple helpers (derivative, threshold, etc.): single "form" step
 * - Multi-subtype helpers (template, group): "menu" step to select sub-type, then "form" step
 */
export async function addEntry(
  type: SupportedType,
  fields: Record<string, unknown>
): Promise<BackendResult> {
  try {
    // Step 1: Start the config flow
    let step = await apiPost<FlowStep>("/api/config/config_entries/flow", {
      handler: type.domain,
      show_advanced_options: true,
    });

    // Step 2: Handle menu step (for multi-subtype helpers like template, group)
    if (step.type === "menu" && step.menu_options) {
      const subTypeKey = type.schema.sub_type_key;
      const subType = subTypeKey ? (fields[subTypeKey] as string) : undefined;

      if (!subType || !step.menu_options.includes(subType)) {
        // Abort the flow
        await abortFlow(step.flow_id);
        const options = step.menu_options.join(", ");
        return {
          success: false,
          message: subTypeKey
            ? `Field '${subTypeKey}' is required and must be one of: ${options}`
            : `This helper requires a sub-type selection. Available: ${options}`,
        };
      }

      step = await apiPost<FlowStep>(
        `/api/config/config_entries/flow/${step.flow_id}`,
        { next_step_id: subType }
      );
    }

    // Step 3: Submit the form
    if (step.type === "form") {
      // Remove sub_type_key from fields since it was used for menu selection
      const formData = { ...fields };
      if (type.schema.sub_type_key) {
        delete formData[type.schema.sub_type_key];
      }

      step = await apiPost<FlowStep>(
        `/api/config/config_entries/flow/${step.flow_id}`,
        formData
      );
    }

    // Check result
    if (step.type === "create_entry" && step.result) {
      return {
        success: true,
        message: `Created ${type.domain} helper '${step.result.title}' (entry_id: ${step.result.entry_id})`,
        id: step.result.entry_id,
      };
    }

    if (step.type === "abort") {
      return {
        success: false,
        message: `Config flow aborted: ${step.reason || "unknown reason"}`,
      };
    }

    if (step.type === "form" && step.errors) {
      await abortFlow(step.flow_id);
      const errorDetails = Object.entries(step.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return {
        success: false,
        message: `Validation errors: ${errorDetails}`,
      };
    }

    // Unexpected flow state
    await abortFlow(step.flow_id);
    return {
      success: false,
      message: `Unexpected flow state: ${step.type} (step: ${step.step_id})`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to create ${type.domain}: ${(err as Error).message}`,
    };
  }
}

/**
 * Update a config entry via the options flow API.
 */
export async function updateEntry(
  type: SupportedType,
  entryId: string,
  fields: Record<string, unknown>
): Promise<BackendResult> {
  try {
    // Step 1: Start the options flow
    let step = await apiPost<FlowStep>("/api/config/config_entries/options/flow", {
      handler: entryId,
      show_advanced_options: true,
    });

    // Step 2: Submit the form
    if (step.type === "form") {
      step = await apiPost<FlowStep>(
        `/api/config/config_entries/options/flow/${step.flow_id}`,
        fields
      );
    }

    if (step.type === "create_entry") {
      return {
        success: true,
        message: `Updated ${type.domain} config entry (entry_id: ${entryId})`,
        id: entryId,
      };
    }

    if (step.type === "form" && step.errors) {
      await abortOptionsFlow(step.flow_id);
      const errorDetails = Object.entries(step.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return {
        success: false,
        message: `Validation errors: ${errorDetails}`,
      };
    }

    if (step.type === "abort") {
      return {
        success: false,
        message: `Options flow aborted: ${step.reason || "unknown reason"}`,
      };
    }

    await abortOptionsFlow(step.flow_id);
    return {
      success: false,
      message: `Unexpected options flow state: ${step.type}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to update ${type.domain} '${entryId}': ${(err as Error).message}`,
    };
  }
}

/**
 * Remove a config entry via the REST API.
 */
export async function removeEntry(type: SupportedType, entryId: string): Promise<BackendResult> {
  try {
    await apiDelete(`/api/config/config_entries/entry/${entryId}`);
    return {
      success: true,
      message: `Removed ${type.domain} config entry (entry_id: ${entryId})`,
      id: entryId,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to remove ${type.domain} '${entryId}': ${(err as Error).message}`,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function abortFlow(flowId: string): Promise<void> {
  try {
    await apiDelete(`/api/config/config_entries/flow/${flowId}`);
  } catch {
    // Ignore — flow may have already ended
  }
}

async function abortOptionsFlow(flowId: string): Promise<void> {
  try {
    await apiDelete(`/api/config/config_entries/options/flow/${flowId}`);
  } catch {
    // Ignore — flow may have already ended
  }
}
