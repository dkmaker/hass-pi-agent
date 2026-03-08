/**
 * Home Assistant template tool.
 *
 * Renders and validates Jinja2 templates against the live HA instance.
 * Uses POST /api/template to render templates with access to all
 * current entity states, attributes, and HA template functions.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { requireToken } from "../lib/api.js";
import { HA_URL, HA_TOKEN } from "../lib/config.js";

async function renderTemplate(template: string): Promise<{ success: boolean; result: string }> {
  requireToken();

  const resp = await fetch(`${HA_URL}/api/template`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ template }),
  });

  if (resp.ok) {
    const text = await resp.text();
    return { success: true, result: text };
  }

  const error = await resp.json().catch(() => ({ message: `HTTP ${resp.status}` }));
  return { success: false, result: (error as any).message || `HTTP ${resp.status}` };
}

export function registerTemplateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_template",
    label: "HA Template",
    description: `Render and validate HA Jinja2 templates. Actions: render, validate. Use ha_tool_docs('ha_template') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["render", "validate"] as const, {
        description: "Action to perform",
      }),
      template: Type.String({
        description: "Jinja2 template string, e.g. {{ states('sensor.temperature') }}",
      }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { action, template } = params;
      const { success, result } = await renderTemplate(template);

      const wrap = (label: string, body: string) =>
        `── ${label} ${"─".repeat(Math.max(0, 40 - label.length))}\n${body}\n${"─".repeat(44)}`;

      if (action === "validate") {
        if (success) {
          return { content: [{ type: "text" as const, text: `${wrap("Template", template)}\n\n✅ Valid — renders to:\n${result}` }] };
        }
        return { content: [{ type: "text" as const, text: `${wrap("Template", template)}\n\n❌ ${result}` }] };
      }

      // render
      if (success) {
        return { content: [{ type: "text" as const, text: `${wrap("Template", template)}\n\n${wrap("Result", result)}` }] };
      }
      throw new Error(result);
    },
  });
}
