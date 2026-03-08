/**
 * Home Assistant service/action tool.
 *
 * List, inspect, and call services via the HA REST API.
 * Service schemas (fields, targets, selectors) come directly from HA.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { apiGet, requireToken } from "../lib/api.js";
import { HA_URL, HA_TOKEN } from "../lib/config.js";

// ── Types ────────────────────────────────────────────────────

interface ServiceField {
  required?: boolean;
  selector?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ServiceInfo {
  fields: Record<string, ServiceField>;
  target?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ServiceDomain {
  domain: string;
  services: Record<string, ServiceInfo>;
}

// ── Tool registration ────────────────────────────────────────

export function registerServicesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_services",
    label: "HA Services",
    description: `Discover and call HA services. Actions: list, get, call. Use ha_tool_docs('ha_services') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(["list", "get", "call"] as const, {
        description: "Action to perform",
      }),
      domain: Type.Optional(
        Type.String({ description: "Service domain (e.g., light, input_number, automation)" })
      ),
      service: Type.Optional(
        Type.String({ description: "Service name (e.g., turn_on, set_value, reload)" })
      ),
      data: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: 'Service call data (fields + entity_id/target). e.g., {"entity_id": "light.x", "brightness": 255}',
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: {
  action: string;
  domain?: string;
  service?: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  switch (params.action) {
    case "list":
      return handleList(params.domain);
    case "get":
      return handleGet(params.domain, params.service);
    case "call":
      return handleCall(params.domain, params.service, params.data);
    default:
      throw new Error(`Unknown action '${params.action}'. Valid: list, get, call`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleList(domain?: string): Promise<string> {
  const allServices = await apiGet<ServiceDomain[]>("/api/services");

  let filtered = allServices;
  if (domain) {
    filtered = allServices.filter((s) => s.domain === domain);
    if (filtered.length === 0) {
      const available = allServices.map((s) => s.domain).sort();
      throw new Error(`No services found for domain '${domain}'.\nAvailable domains: ${available.join(", ")}`);
    }
  }

  const lines: string[] = [];
  for (const svc of filtered.sort((a, b) => a.domain.localeCompare(b.domain))) {
    const serviceEntries = Object.entries(svc.services).sort(([a], [b]) => a.localeCompare(b));
    const serviceList = serviceEntries.map(([name, info]) => {
      const fieldNames = Object.keys(info.fields || {});
      const hasTarget = !!info.target;
      const parts = [name];
      if (fieldNames.length > 0 || hasTarget) {
        const details: string[] = [];
        if (hasTarget) details.push("target");
        if (fieldNames.length > 0) details.push(fieldNames.join(", "));
        parts.push(`(${details.join("; ")})`);
      }
      return parts.join(" ");
    });
    lines.push(`${svc.domain}: ${serviceList.join(", ")}`);
  }

  const totalServices = filtered.reduce((n, s) => n + Object.keys(s.services).length, 0);
  lines.push("");
  lines.push(`${filtered.length} domains, ${totalServices} services`);

  return lines.join("\n");
}

async function handleGet(domain?: string, service?: string): Promise<string> {
  if (!domain || !service) {
    throw new Error("'domain' and 'service' are required for get. Example: domain='input_number', service='set_value'");
  }

  const allServices = await apiGet<ServiceDomain[]>("/api/services");
  const domainEntry = allServices.find((s) => s.domain === domain);
  if (!domainEntry) {
    throw new Error(`Domain '${domain}' not found.`);
  }

  const serviceInfo = domainEntry.services[service];
  if (!serviceInfo) {
    const available = Object.keys(domainEntry.services).sort();
    throw new Error(`Service '${service}' not found in domain '${domain}'.\nAvailable: ${available.join(", ")}`);
  }

  const lines: string[] = [`${domain}.${service}`, ""];

  // Fields
  const fields = Object.entries(serviceInfo.fields || {});
  if (fields.length > 0) {
    lines.push("Fields:");
    for (const [name, info] of fields.sort(([a], [b]) => a.localeCompare(b))) {
      const req = info.required ? "REQUIRED" : "optional";
      const parts = [`  ${name} (${req})`];

      // Describe selector
      if (info.selector) {
        const selectorType = Object.keys(info.selector)[0];
        const selectorConfig = info.selector[selectorType] as Record<string, unknown> | undefined;
        if (selectorType === "number" && selectorConfig) {
          const min = selectorConfig.min !== undefined ? `min=${selectorConfig.min}` : "";
          const max = selectorConfig.max !== undefined ? `max=${selectorConfig.max}` : "";
          const step = selectorConfig.step !== undefined ? `step=${selectorConfig.step}` : "";
          const mode = selectorConfig.mode ? `mode=${selectorConfig.mode}` : "";
          parts.push(`— number ${[min, max, step, mode].filter(Boolean).join(", ")}`);
        } else if (selectorType === "entity" && selectorConfig) {
          const entityDomain = selectorConfig.domain;
          parts.push(`— entity${entityDomain ? ` (domain: ${JSON.stringify(entityDomain)})` : ""}`);
        } else if (selectorType === "select" && selectorConfig) {
          const options = selectorConfig.options;
          if (Array.isArray(options)) {
            const optStr = options.length <= 10
              ? options.map((o: any) => typeof o === "string" ? o : o.value || o).join(", ")
              : `${options.length} options`;
            parts.push(`— select: ${optStr}`);
          }
        } else if (selectorType === "boolean") {
          parts.push("— boolean");
        } else if (selectorType === "text") {
          parts.push("— text");
        } else if (selectorType === "time") {
          parts.push("— time (HH:MM:SS)");
        } else if (selectorType === "color_temp") {
          parts.push("— color_temp");
        } else {
          parts.push(`— ${selectorType}`);
        }
      }

      lines.push(parts.join(" "));
    }
  } else {
    lines.push("No fields required.");
  }

  // Target
  if (serviceInfo.target) {
    lines.push("");
    lines.push("Target:");
    const target = serviceInfo.target as Record<string, unknown>;
    if (target.entity) {
      const entities = target.entity as Array<Record<string, unknown>>;
      for (const e of entities) {
        if (e.domain) {
          lines.push(`  entity domain: ${JSON.stringify(e.domain)}`);
        } else {
          lines.push(`  entity: any`);
        }
      }
    }
    if (target.device) {
      lines.push(`  device: yes`);
    }
    if (target.area) {
      lines.push(`  area: yes`);
    }
  }

  return lines.join("\n");
}

async function handleCall(
  domain?: string,
  service?: string,
  data?: Record<string, unknown>
): Promise<string> {
  if (!domain || !service) {
    throw new Error("'domain' and 'service' are required for call.");
  }

  requireToken();

  const url = `${HA_URL}/api/services/${domain}/${service}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Calling ${domain}.${service}: ${resp.status} ${errText}`);
  }

  const result = await resp.json().catch(() => null);

  if (Array.isArray(result) && result.length > 0) {
    // Service call returns affected entity states
    const affected = result.map((s: any) => `  ${s.entity_id}: ${s.state}`);
    return `✅ Called ${domain}.${service}\nAffected entities:\n${affected.join("\n")}`;
  }

  return `✅ Called ${domain}.${service}`;
}
