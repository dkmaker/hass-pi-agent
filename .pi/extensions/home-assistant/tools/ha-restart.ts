/**
 * Home Assistant restart and reload tool.
 *
 * Provides all restart/reload options:
 * - restart: Full HA core restart (picks up storage changes, new integrations)
 * - reload-all: Reload all YAML config without restart
 * - reload-core: Reload core config (name, location, units, etc.)
 * - reload-templates: Reload custom Jinja2 templates
 * - reload-domain: Reload a specific domain (automations, scripts, scenes, etc.)
 * - validate: Check configuration.yaml for errors
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { requireToken, callService, apiPost } from "../lib/api.js";

const RELOADABLE_DOMAINS = [
  "automation",
  "conversation",
  "frontend",
  "input_boolean",
  "input_button",
  "input_datetime",
  "input_number",
  "input_select",
  "input_text",
  "person",
  "scene",
  "schedule",
  "script",
  "template",
  "timer",
  "zone",
];

export function registerRestartTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_restart",
    label: "HA Restart",
    description: `Restart or reload HA configuration. Actions: restart, reload-all, reload-core, reload-templates, reload-domain, validate. Use ha_tool_docs('ha_restart') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(
        ["restart", "reload-all", "reload-core", "reload-templates", "reload-domain", "validate"] as const,
        { description: "Action to perform" }
      ),
      domain: Type.Optional(
        Type.String({
          description: `Domain to reload (for reload-domain). Options: ${RELOADABLE_DOMAINS.join(", ")}`,
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

async function executeAction(params: { action: string; domain?: string }): Promise<string> {
  switch (params.action) {
    case "restart": {
      await callService("homeassistant", "restart");
      return "✅ Home Assistant restart initiated. Changes take effect once restart completes (~30-60s).";
    }

    case "reload-all": {
      await callService("homeassistant", "reload_all");
      return "✅ All YAML configuration reloaded.";
    }

    case "reload-core": {
      await callService("homeassistant", "reload_core_config");
      return "✅ Core configuration reloaded (name, location, units, customize).";
    }

    case "reload-templates": {
      await callService("homeassistant", "reload_custom_templates");
      return "✅ Custom Jinja2 templates reloaded.";
    }

    case "reload-domain": {
      if (!params.domain) {
        throw new Error(`'domain' is required for reload-domain.\nAvailable: ${RELOADABLE_DOMAINS.join(", ")}`);
      }
      const domain = params.domain.toLowerCase();
      if (!RELOADABLE_DOMAINS.includes(domain)) {
        throw new Error(`'${domain}' is not reloadable.\nAvailable: ${RELOADABLE_DOMAINS.join(", ")}`);
      }
      // frontend uses frontend.reload_themes
      if (domain === "frontend") {
        await callService("frontend", "reload_themes");
        return `✅ Frontend themes reloaded.`;
      }
      await callService(domain, "reload");
      return `✅ ${domain} configuration reloaded.`;
    }

    case "validate": {
      const data = await apiPost<{ result: string; errors: string | null; warnings: string | null }>(
        "/api/config/core/check_config"
      );
      if (data.result === "valid") {
        return "✅ Configuration is valid." + (data.warnings ? `\n⚠️ Warnings: ${data.warnings}` : "");
      }
      return `❌ Configuration errors:\n${data.errors}` + (data.warnings ? `\n⚠️ Warnings: ${data.warnings}` : "");
    }

    default:
      throw new Error(`Unknown action '${params.action}'.`);
  }
}
