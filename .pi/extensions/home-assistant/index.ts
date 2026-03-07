import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerHelperTool } from "./tools/ha-helpers.js";
import { registerTemplateTool } from "./tools/ha-template.js";
import { registerEntitiesTools } from "./tools/ha-entities.js";
import { registerRestartTool } from "./tools/ha-restart.js";
import { registerServicesTool } from "./tools/ha-services.js";

export default function (pi: ExtensionAPI) {
  registerHelperTool(pi);
  registerTemplateTool(pi);
  registerEntitiesTools(pi);
  registerRestartTool(pi);
  registerServicesTool(pi);
}
