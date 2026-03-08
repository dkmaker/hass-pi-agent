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
import { wsClose } from "./lib/ws.js";
import { gatherContext, getContext } from "./lib/context.js";
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

  // Gather HA installation context at session start
  pi.on("session_start", async () => {
    await gatherContext();
  });

  let contextInjected = false;

  // Inject context as a persistent message on the first turn only
  pi.on("before_agent_start", async (event) => {
    const result: Record<string, unknown> = {};

    // Behavioral system prompt — appended every turn (it's not stored in history)
    if (systemPromptAppend) {
      result.systemPrompt = event.systemPrompt + "\n\n" + systemPromptAppend;
    }

    // Installation context — injected once as a persistent message
    if (!contextInjected) {
      const context = getContext();
      if (context) {
        result.message = {
          customType: "ha-context",
          content: context,
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
