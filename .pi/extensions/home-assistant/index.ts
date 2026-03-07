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
import { wsClose } from "./lib/ws.js";

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

  // Clean up WebSocket connection on shutdown
  pi.on("session_shutdown", async () => {
    wsClose();
  });
}
