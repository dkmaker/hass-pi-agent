import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerHelperTool } from "./tools/ha-helpers.js";
import { registerTemplateTool } from "./tools/ha-template.js";
import { registerEntitiesTools } from "./tools/ha-entities.js";
import { registerRestartTool } from "./tools/ha-restart.js";
import { registerServicesTool } from "./tools/ha-services.js";
import { registerDevicesTool } from "./tools/ha-devices.js";
import { registerAreasTool } from "./tools/ha-areas.js";
import { registerLabelsTool } from "./tools/ha-labels.js";
import { registerAutomationsTool } from "./tools/ha-automations.js";
import { registerDashboardsTool } from "./tools/ha-dashboards.js";
import { registerAddonsTool } from "./tools/ha-addons.js";
import { registerDocsTool } from "./tools/ha-docs.js";
import { registerBackupsTool } from "./tools/ha-backups.js";
import { registerSystemTool } from "./tools/ha-system.js";
import { registerGraphTool } from "./tools/ha-graph.js";
import { registerHistoryTool } from "./tools/ha-history.js";
import { registerLogbookTool } from "./tools/ha-logbook.js";
import { registerStatsTool } from "./tools/ha-stats.js";
import { registerEventsTool } from "./tools/ha-events.js";
import { registerScriptsTool } from "./tools/ha-scripts.js";
import { registerScenesTool } from "./tools/ha-scenes.js";
import { registerNotificationsTool } from "./tools/ha-notifications.js";
import { registerLogsTool } from "./tools/ha-logs.js";
import { registerIntegrationsTool } from "./tools/ha-integrations.js";
import { registerZonesTool } from "./tools/ha-zones.js";
import { registerPeopleTool } from "./tools/ha-people.js";
import { registerTagsTool } from "./tools/ha-tags.js";
import { registerRecorderTool } from "./tools/ha-recorder.js";
import { registerBlueprintsTool } from "./tools/ha-blueprints.js";
import { registerCategoriesTool } from "./tools/ha-categories.js";
import { registerConversationTool } from "./tools/ha-conversation.js";
import { registerShoppingListTool } from "./tools/ha-shopping-list.js";
import { registerToolDocsTool } from "./tools/ha-tool-docs.js";
import { registerPoliciesTool } from "./tools/ha-policies.js";
import { registerQuestionnaireTool } from "./tools/questionnaire.js";
import { policiesExist, loadPolicies, formatPoliciesForPrompt } from "./lib/policies.js";
import { wsClose } from "./lib/ws.js";
import {
  gatherContext,
  getContext,
  formatContextForLLM,
  isMockContext,
  type HAContext,
} from "./lib/context.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";


// Load APPEND_SYSTEM.md from the extension directory
const __dirname = dirname(fileURLToPath(import.meta.url));
let systemPromptAppend = "";
try {
  systemPromptAppend = readFileSync(
    join(__dirname, "APPEND_SYSTEM.md"),
    "utf-8"
  );
} catch {
  // Not found — running outside the add-on container
}

export default function (pi: ExtensionAPI) {
  registerHelperTool(pi);
  registerTemplateTool(pi);
  registerEntitiesTools(pi);
  registerRestartTool(pi);
  registerServicesTool(pi);
  registerDevicesTool(pi);
  registerAreasTool(pi);
  registerLabelsTool(pi);
  registerAutomationsTool(pi);
  registerDashboardsTool(pi);
  registerAddonsTool(pi);
  registerDocsTool(pi);
  registerBackupsTool(pi);
  registerSystemTool(pi);
  registerGraphTool(pi);
  registerHistoryTool(pi);
  registerLogbookTool(pi);
  registerStatsTool(pi);
  registerEventsTool(pi);
  registerScriptsTool(pi);
  registerScenesTool(pi);
  registerNotificationsTool(pi);
  registerLogsTool(pi);
  registerIntegrationsTool(pi);
  registerZonesTool(pi);
  registerPeopleTool(pi);
  registerTagsTool(pi);
  registerRecorderTool(pi);
  registerBlueprintsTool(pi);
  registerCategoriesTool(pi);
  registerConversationTool(pi);
  registerShoppingListTool(pi);
  registerToolDocsTool(pi);
  registerPoliciesTool(pi);
  registerQuestionnaireTool(pi);

  // /setup slash command — triggers the guided policy setup wizard
  pi.registerCommand("setup", {
    description: "Start the guided Home Assistant naming & organization setup wizard",
    handler: async (_args, _ctx) => {
      pi.sendUserMessage("/setup");
    },
  });

  // Show HA status as a visible chat message at startup (like project extension)
  pi.on("session_start", async (_event, ctx) => {
    await gatherContext();

    const haCtx = getContext();
    if (!haCtx) return;

    const devTag = isMockContext() ? " *(mock data — dev mode)*" : "";

    // Build a visible markdown status dashboard
    const sys = haCtx.system;
    const domainEntries = Object.entries(haCtx.entities.domains)
      .sort((a, b) => b[1] - a[1]);
    const domainList = domainEntries.map(([d, c]) => `${d}: ${c}`).join(", ");
    const automationCount = haCtx.entities.domains["automation"] || 0;

    const addonLines = haCtx.addons
      .map((a) => `- ${a.running ? "🟢" : "⚪"} ${a.name} v${a.version}`)
      .join("\n");

    const areaLine = haCtx.areas?.length
      ? `\n**Areas:** ${haCtx.areas.join(" · ")}`
      : "";

    const brief = `# 🏠 Home Assistant${devTag}

| Property | Value |
|----------|-------|
| Hostname | ${sys.hostname} |
| HA Core | ${sys.ha_version} |
| OS | ${sys.os_name} ${sys.os_version} |
| Supervisor | ${sys.supervisor_version} (${sys.arch} · ${sys.board}) |

**${haCtx.entities.total}** entities (${domainList}) · **${automationCount}** automations

${addonLines || "No add-ons installed"}${areaLine}`;

    pi.sendMessage(
      { customType: "ha-status", content: brief, display: true },
      { triggerTurn: false },
    );

    // Persistent status line in TUI footer
    const dim = (s: string) => ctx.ui.theme.fg("dim", s);
    const accent = (s: string) => ctx.ui.theme.fg("accent", s);
    const areaCount = haCtx.areas?.length || 0;
    const runningAddons = haCtx.addons.filter((a) => a.running).length;
    const ver = sys.ha_version.replace(/^(\d+\.\d+).*/, "$1");

    const statusParts = [
      `🏠 HA ${accent(ver)}`,
      `${accent(String(haCtx.entities.total))} entities`,
      `${accent(String(automationCount))} automations`,
      `${accent(String(areaCount))} areas`,
      `${accent(String(runningAddons))} add-ons`,
    ];
    ctx.ui.setStatus("ha", statusParts.join(dim(" · ")));

    // First-run: suggest policy setup if no policies file exists
    if (!policiesExist()) {
      pi.sendMessage(
        {
          customType: "ha-policies-suggestion",
          content:
            "💡 **No naming/organization policies configured yet.**\n\n" +
            "I can help you set up conventions for entity naming, areas, labels, and automations. " +
            "This helps me follow your preferences consistently.\n\n" +
            "Say **`/setup`** to start the guided setup wizard, or ignore this to configure later.",
          display: true,
        },
        { triggerTurn: false },
      );
    }
  });

  let contextInjected = false;

  // Inject context for LLM only (hidden from user — header shows it visually)
  pi.on("before_agent_start", async (event) => {
    const result: Record<string, unknown> = {};

    // Behavioral system prompt — appended every turn
    let appendedPrompt = systemPromptAppend;

    // Inject user policies into system prompt
    if (policiesExist()) {
      const policies = loadPolicies();
      const policyPrompt = formatPoliciesForPrompt(policies);
      if (policyPrompt) {
        appendedPrompt = appendedPrompt
          ? appendedPrompt + "\n\n" + policyPrompt
          : policyPrompt;
      }
    }

    if (appendedPrompt) {
      result.systemPrompt = event.systemPrompt + "\n\n" + appendedPrompt;
    }

    // Installation context — injected once, hidden (user sees the header instead)
    if (!contextInjected) {
      const ctx = getContext();
      if (ctx) {
        result.message = {
          customType: "ha-context",
          content: formatContextForLLM(ctx),
          display: false,
        };
        contextInjected = true;
      }
    }

    return result;
  });

  // Clean up WebSocket connection on shutdown
  pi.on("session_shutdown", async () => {
    wsClose();
  });
}
