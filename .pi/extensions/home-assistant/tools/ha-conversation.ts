/**
 * Home Assistant conversation/assist tool.
 *
 * Process natural language text and list conversation agents.
 * Uses WebSocket API.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { wsCommand } from "../lib/ws.js";

// ── Types ────────────────────────────────────────────────────

interface ConversationResult {
  response: {
    response_type: string;
    speech: { plain: { speech: string } };
    card?: Record<string, unknown>;
    data?: { targets?: unknown[]; success?: unknown[]; failed?: unknown[] };
  };
  conversation_id: string | null;
}

interface ConversationAgent {
  id: string;
  name: string;
}

// ── Tool registration ────────────────────────────────────────

export function registerConversationTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ha_conversation",
    label: "HA Conversation",
    description: `Interact with Home Assistant's conversation/assist system.

Actions:
- process: Send text to the conversation agent and get a response (like talking to Assist).
- agents: List available conversation agents.

Useful for testing voice/assist commands and verifying intent handling.`,

    parameters: Type.Object({
      action: StringEnum(["process", "agents"] as const, {
        description: "Action to perform",
      }),
      text: Type.Optional(
        Type.String({ description: "Text to process (for process action)" })
      ),
      agent_id: Type.Optional(
        Type.String({ description: "Conversation agent ID (default: homeassistant)" })
      ),
      language: Type.Optional(
        Type.String({ description: "Language code (e.g., en, nl)" })
      ),
      conversation_id: Type.Optional(
        Type.String({ description: "Continue an existing conversation" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executeAction(params);
      return { content: [{ type: "text" as const, text: result }] };
    },
  });
}

// ── Action dispatch ──────────────────────────────────────────

async function executeAction(params: Record<string, unknown>): Promise<string> {
  switch (params.action as string) {
    case "process": return handleProcess(params);
    case "agents": return handleAgents();
    default: throw new Error(`Unknown action '${params.action}'`);
  }
}

// ── Handlers ─────────────────────────────────────────────────

async function handleProcess(params: Record<string, unknown>): Promise<string> {
  const text = params.text as string | undefined;
  if (!text) throw new Error("'text' is required for process");

  const data: Record<string, unknown> = { text };
  if (params.agent_id) data.agent_id = params.agent_id;
  if (params.language) data.language = params.language;
  if (params.conversation_id) data.conversation_id = params.conversation_id;

  const result = await wsCommand<ConversationResult>("conversation/process", data);
  const speech = result.response?.speech?.plain?.speech ?? "(no response)";
  const type = result.response?.response_type ?? "unknown";

  const lines = [
    `**Response:** ${speech}`,
    `**Type:** ${type}`,
  ];

  if (result.conversation_id) {
    lines.push(`**Conversation ID:** ${result.conversation_id}`);
  }

  const respData = result.response?.data;
  if (respData?.targets && Array.isArray(respData.targets) && respData.targets.length > 0) {
    lines.push(`**Targets:** ${JSON.stringify(respData.targets)}`);
  }
  if (respData?.failed && Array.isArray(respData.failed) && respData.failed.length > 0) {
    lines.push(`**Failed:** ${JSON.stringify(respData.failed)}`);
  }

  return lines.join("\n");
}

async function handleAgents(): Promise<string> {
  const result = await wsCommand<{ agents: ConversationAgent[] }>("conversation/agent/list");
  const agents = result.agents ?? [];
  if (agents.length === 0) return "No conversation agents available.";

  const lines = agents.map((a) => `**${a.name}** (id: ${a.id})`);
  lines.push("");
  lines.push(`${agents.length} agents`);
  return lines.join("\n");
}
