/**
 * Automation config validation.
 *
 * Validates triggers, conditions, and actions against the extracted
 * schema catalog. Used by both the builder (add/update element) and
 * direct CRUD (create/update automation).
 */
import { loadSchema } from "./schema.js";
import { getActionType } from "./format.js";

/**
 * Validate a single automation element (trigger, condition, or action)
 * against the schema catalog. Returns an array of error messages.
 */
export function validateElement(
  config: Record<string, unknown>,
  category: "triggers" | "conditions" | "actions",
): string[] {
  const schema = loadSchema();
  const errors: string[] = [];

  if (category === "triggers") {
    const type = (config.trigger || config.platform) as string | undefined;
    if (!type) {
      errors.push("Missing 'trigger' field — specify the trigger type (e.g., 'state', 'time', 'sun')");
      return errors;
    }
    const typeSchema = schema.triggers[type];
    if (!typeSchema) {
      const valid = Object.keys(schema.triggers).join(", ");
      errors.push(`Unknown trigger type '${type}'. Valid types: ${valid}`);
      return errors;
    }
    for (const [fname, finfo] of Object.entries(typeSchema.fields)) {
      if (finfo.required && !(fname in config)) {
        errors.push(`Missing required field '${fname}' (${finfo.type}) for ${type} trigger`);
      }
    }
  } else if (category === "conditions") {
    const type = config.condition as string | undefined;
    if (!type) {
      errors.push("Missing 'condition' field — specify the condition type (e.g., 'state', 'time', 'sun')");
      return errors;
    }
    const typeSchema = schema.conditions[type];
    if (!typeSchema) {
      const valid = Object.keys(schema.conditions).join(", ");
      errors.push(`Unknown condition type '${type}'. Valid types: ${valid}`);
      return errors;
    }
    for (const [fname, finfo] of Object.entries(typeSchema.fields)) {
      if (finfo.required && !(fname in config)) {
        errors.push(`Missing required field '${fname}' (${finfo.type}) for ${type} condition`);
      }
    }
  } else if (category === "actions") {
    const actionType = getActionType(config);
    if (actionType === "unknown") {
      errors.push("Cannot determine action type. An action must contain one of: action (service call), delay, wait_template, wait_for_trigger, event, choose, if, repeat, sequence, parallel, stop, variables, set_conversation_response");
      return errors;
    }
    if (actionType.startsWith("service:")) {
      const svc = config.action as string;
      if (svc && !svc.includes(".")) {
        errors.push(`Service action '${svc}' should be in 'domain.service' format (e.g., 'light.turn_on')`);
      }
    }
  }

  return errors;
}

/**
 * Validate a full automation config — mode, all triggers, conditions, actions.
 * Returns an array of error messages with path prefixes (e.g., "triggers[0]: ...").
 */
export function validateAutomationConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (config.mode) {
    const validModes = ["single", "restart", "queued", "parallel"];
    if (!validModes.includes(config.mode as string)) {
      errors.push(`Invalid mode '${config.mode}'. Valid: ${validModes.join(", ")}`);
    }
  }

  const triggers = (config.triggers || config.trigger) as unknown[] | undefined;
  if (triggers && Array.isArray(triggers)) {
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i];
      if (t && typeof t === "object") {
        const errs = validateElement(t as Record<string, unknown>, "triggers");
        errors.push(...errs.map(e => `triggers[${i}]: ${e}`));
      }
    }
  }

  const conditions = (config.conditions || config.condition) as unknown[] | undefined;
  if (conditions && Array.isArray(conditions)) {
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (c && typeof c === "object") {
        const errs = validateElement(c as Record<string, unknown>, "conditions");
        errors.push(...errs.map(e => `conditions[${i}]: ${e}`));
      }
    }
  }

  const actions = (config.actions || config.action) as unknown[] | undefined;
  if (actions && Array.isArray(actions)) {
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a && typeof a === "object") {
        const errs = validateElement(a as Record<string, unknown>, "actions");
        errors.push(...errs.map(e => `actions[${i}]: ${e}`));
      }
    }
  }

  return errors;
}
