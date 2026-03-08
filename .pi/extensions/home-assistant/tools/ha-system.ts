/**
 * Home Assistant system information tool.
 *
 * Read-only system info: supervisor, host, OS, network, resolution center.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { supervisorApi } from "../lib/supervisor.js";
import { renderMarkdownResult, renderToolCall } from "../lib/format.js";

export function registerSystemTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_system",
    label: "HA System",
    description: `View HA system information. Actions: info, host, os, network, resolution. Use ha_tool_docs('ha_system') for full usage.`,

    parameters: Type.Object({
      action: StringEnum(
        ["info", "host", "os", "network", "resolution"] as const,
        { description: "Action to perform" }
      ),
    }),


    renderCall(args: Record<string, unknown>, theme: any) {
      return renderToolCall("HA System", args, theme);
    },

    renderResult(result: any) {
      return renderMarkdownResult(result);
    },

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params.action);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function executeAction(action: string): Promise<string> {
  switch (action) {
    case "info": {
      const d = await supervisorApi<Record<string, unknown>>("/supervisor/info");
      const rows = [
        "## Supervisor Info",
        "",
        "| Property | Value |",
        "|----------|-------|",
        `| Version | ${d.version} |`,
        `| Channel | ${d.channel} |`,
        `| Architecture | ${d.arch} |`,
        `| Supported | ${d.supported ? "✅" : "❌"} |`,
        `| Healthy | ${d.healthy ? "✅" : "❌"} |`,
      ];
      if (d.update_available) rows.push(`| Update available | ${d.version_latest} |`);
      rows.push(`| Timezone | ${d.timezone} |`);
      rows.push(`| Logging | ${d.logging} |`);
      return rows.join("\n");
    }

    case "host": {
      const d = await supervisorApi<Record<string, unknown>>("/host/info");
      const rows = [
        "## Host Info",
        "",
        "| Property | Value |",
        "|----------|-------|",
        `| Hostname | ${d.hostname} |`,
        `| Operating System | ${d.operating_system} |`,
        `| Kernel | ${d.kernel} |`,
        `| CPUs | ${d.cpe ?? "?"} |`,
      ];
      if (d.disk_total) rows.push(`| Disk | ${formatBytes(d.disk_used as number)} / ${formatBytes(d.disk_total as number)} used |`);
      if (d.disk_free) rows.push(`| Disk free | ${formatBytes(d.disk_free as number)} |`);
      if (Array.isArray(d.features) && d.features.length) rows.push(`| Features | ${d.features.join(", ")} |`);
      return rows.join("\n");
    }

    case "os": {
      const d = await supervisorApi<Record<string, unknown>>("/os/info");
      const rows = [
        "## HAOS Info",
        "",
        "| Property | Value |",
        "|----------|-------|",
        `| Version | ${d.version} |`,
      ];
      if (d.update_available) rows.push(`| Update available | ${d.version_latest} |`);
      rows.push(`| Board | ${d.board} |`);
      rows.push(`| Boot slot | ${d.boot_slot ?? d.boot ?? "?"} |`);
      if (d.data_disk) rows.push(`| Data disk | ${d.data_disk} |`);
      return rows.join("\n");
    }

    case "network": {
      const d = await supervisorApi<Record<string, unknown>>("/network/info");
      const interfaces = d.interfaces as Array<Record<string, unknown>> | undefined;
      if (!interfaces?.length) return "No network interfaces found.";

      const parts = ["## Network Interfaces", ""];
      for (const iface of interfaces) {
        parts.push(`### ${iface.interface ?? iface.name ?? "?"} (${iface.type ?? "?"})`);
        parts.push("");
        parts.push("| Property | Value |");
        parts.push("|----------|-------|");
        if (iface.enabled !== undefined) parts.push(`| Enabled | ${iface.enabled} |`);
        if (iface.connected !== undefined) parts.push(`| Connected | ${iface.connected} |`);
        const ipv4 = iface.ipv4 as Record<string, unknown> | undefined;
        if (ipv4?.address) parts.push(`| IPv4 | ${Array.isArray(ipv4.address) ? ipv4.address.join(", ") : ipv4.address} |`);
        if (ipv4?.gateway) parts.push(`| Gateway | ${ipv4.gateway} |`);
        if (ipv4?.nameservers) parts.push(`| DNS | ${Array.isArray(ipv4.nameservers) ? ipv4.nameservers.join(", ") : ipv4.nameservers} |`);
        parts.push("");
      }
      return parts.join("\n");
    }

    case "resolution": {
      const d = await supervisorApi<Record<string, unknown>>("/resolution/info");
      const issues = d.issues as Array<Record<string, unknown>> | undefined;
      const suggestions = d.suggestions as Array<Record<string, unknown>> | undefined;
      const unhealthy = d.unhealthy as string[] | undefined;
      const unsupported = d.unsupported as string[] | undefined;

      const parts = ["**Resolution Center**", ""];

      if (unhealthy?.length) {
        parts.push(`❌ **Unhealthy reasons:** ${unhealthy.join(", ")}`);
      }
      if (unsupported?.length) {
        parts.push(`⚠️ **Unsupported reasons:** ${unsupported.join(", ")}`);
      }

      if (issues?.length) {
        parts.push("", `**Issues (${issues.length}):**`);
        for (const i of issues) {
          parts.push(`- [${i.type}] ${i.context}: ${i.reference ?? ""} ${i.uuid ? `(${i.uuid})` : ""}`);
        }
      } else {
        parts.push("✅ No issues found.");
      }

      if (suggestions?.length) {
        parts.push("", `**Suggestions (${suggestions.length}):**`);
        for (const s of suggestions) {
          parts.push(`- [${s.type}] ${s.context}: ${s.reference ?? ""} ${s.uuid ? `(${s.uuid})` : ""}`);
        }
      }

      return parts.join("\n");
    }

    default:
      throw new Error(`Unknown action '${action}'.`);
  }
}
