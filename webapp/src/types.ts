/**
 * Mock protocol — a pragmatic subset of pi's AgentSessionEvent, shaped so the
 * timeline reducer here maps 1:1 onto the real events later (message_update /
 * tool_execution_* / turn_end / agent_end).
 */

export type ToolResultKind = "entities" | "yaml_diff" | "service" | "automation_trace" | "text";

/** System overview shown on the new-chat / session screen only. */
export interface StatsOverview {
  entities: number;
  automations: number;
  scripts: number;
  lights: number;
  sensors: number;
  areas: number;
}

/** A persisted past session, for the /sessions drawer. */
export interface SessionMeta {
  path: string;
  id: string;
  title: string;
  when: string;
  count: number;
}

export interface ToolResult {
  kind: ToolResultKind;
  /** Freeform payload rendered per kind by <pi-tool-block>. */
  data: unknown;
}

/** Server → client events (mock). */
export type ServerEvent =
  | { type: "agent_start" }
  | { type: "stats"; data: StatsOverview }
  | { type: "sessions"; data: SessionMeta[] }
  | { type: "session_cleared" }
  | { type: "history"; data: Entry[] }
  | { type: "working"; label: string }
  | { type: "message_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "message_end" }
  | { type: "tool_start"; id: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; id: string; toolName: string; isError: boolean; result: ToolResult }
  | { type: "turn_end" }
  | { type: "agent_end" }
  | { type: "aborted" };

/** Client → server commands (mock). */
export type ClientCommand =
  | { type: "prompt"; text: string; scenario?: string }
  | { type: "abort" }
  | { type: "list_sessions" }
  | { type: "new_session" }
  | { type: "open_session"; path: string };

/** Timeline model (client-side). */
export type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; thinking: string; streaming: boolean }
  | { kind: "tool"; id: string; toolName: string; args: Record<string, unknown>; running: boolean; isError: boolean; result?: ToolResult }
  | { kind: "notice"; id: string; text: string };
