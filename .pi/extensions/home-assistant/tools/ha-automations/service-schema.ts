/**
 * Service schema lookup — get field definitions for a specific HA service.
 *
 * Used when building service call actions to know what data fields
 * are available (e.g., brightness for light.turn_on).
 */
import { apiGet } from "../../lib/api.js";

export async function handleGetServiceSchema(params: Record<string, unknown>): Promise<string> {
  const service = params.service as string | undefined;
  if (!service) throw new Error("'service' is required (e.g., 'light.turn_on')");

  if (!service.includes(".")) {
    throw new Error(`Service should be in 'domain.service' format (e.g., 'light.turn_on')`);
  }

  const [domain, svcName] = service.split(".", 2);

  const allServices = await apiGet<Record<string, Record<string, unknown>>>("/api/services");

  const domainEntry = (allServices as unknown as Array<{ domain: string; services: Record<string, unknown> }>)
    .find(d => d.domain === domain);

  if (!domainEntry) {
    throw new Error(`Domain '${domain}' not found. Use ha_services list to see available domains.`);
  }

  const svcInfo = domainEntry.services[svcName] as Record<string, unknown> | undefined;
  if (!svcInfo) {
    const available = Object.keys(domainEntry.services).join(", ");
    throw new Error(`Service '${svcName}' not found in domain '${domain}'. Available: ${available}`);
  }

  const lines: string[] = [];
  lines.push(`Service: ${service}`);
  if (svcInfo.description) lines.push(`Description: ${svcInfo.description}`);

  if (svcInfo.target) {
    lines.push(`\nTarget: entity_id, device_id, or area_id`);
  }

  const fields = svcInfo.fields as Record<string, Record<string, unknown>> | undefined;
  if (fields && Object.keys(fields).length > 0) {
    lines.push(`\nFields:`);
    for (const [fname, finfo] of Object.entries(fields)) {
      const required = finfo.required ? " (required)" : "";
      const desc = finfo.description ? ` — ${finfo.description}` : "";
      let typeStr = "";
      if (finfo.selector) {
        const sel = finfo.selector as Record<string, unknown>;
        const selType = Object.keys(sel)[0];
        typeStr = ` [${selType}]`;
      }
      lines.push(`  ${fname}${typeStr}${required}${desc}`);

      if (finfo.selector) {
        const sel = finfo.selector as Record<string, unknown>;
        const selType = Object.keys(sel)[0];
        const selConfig = sel[selType] as Record<string, unknown> | null;
        if (selConfig && Object.keys(selConfig).length > 0) {
          if (selConfig.min !== undefined || selConfig.max !== undefined) {
            lines.push(`    range: ${selConfig.min ?? "—"} to ${selConfig.max ?? "—"}${selConfig.unit_of_measurement ? ` ${selConfig.unit_of_measurement}` : ""}`);
          }
          if (selConfig.options) {
            lines.push(`    options: ${JSON.stringify(selConfig.options)}`);
          }
        }
      }

      if (finfo.default !== undefined) {
        lines.push(`    default: ${JSON.stringify(finfo.default)}`);
      }
    }
  }

  lines.push(`\nExample action config:\n\`\`\`json`);
  lines.push(JSON.stringify({
    action: service,
    target: { entity_id: `${domain}.example` },
    data: {},
  }, null, 2));
  lines.push("```");

  return lines.join("\n");
}
