/**
 * Unified tool-render layer.
 *
 * Every HA tool returns ONE structured shape (`HaDetails`). `toolResult()` turns
 * it into the SDK tool result carrying BOTH:
 *   - `content`: compact markdown for the LLM (rendered centrally from the shape),
 *   - `details`: the structured payload for the web UI (rendered natively there).
 *
 * This replaces per-tool markdown assembly + per-tool render copy-paste. Tools
 * shrink to: parse args → fetch → return an HaDetails.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderMarkdownResult, renderToolCall } from "./format.js";

export type Col = { key: string; label: string };
export type Row = { cells: Record<string, string>; entity_id?: string; icon?: string; state?: string };
export type Field = { label: string; value: string };

export type HaDetails =
  | { kind: "table"; title?: string; columns: Col[]; rows: Row[]; page?: { offset: number; limit: number; total: number; hidden?: number }; note?: string }
  | { kind: "detail"; title?: string; fields: Field[] }
  | { kind: "list"; title?: string; items: string[]; note?: string }
  | { kind: "message"; text: string; ok?: boolean };

// ── HA entity icon resolution (mirrors the frontend's defaults) ──────────────
// Returns a bare MDI name (no "mdi:" prefix); the web UI resolves the SVG path
// from HA's own /static/mdi chunks. Kept small + common; unknowns fall back.
const DOMAIN_ICON: Record<string, string> = {
  light: "lightbulb", switch: "toggle-switch-variant", fan: "fan", climate: "thermostat",
  cover: "window-shutter", lock: "lock", camera: "video", media_player: "cast",
  sensor: "eye", binary_sensor: "radiobox-blank", automation: "robot", script: "script-text",
  scene: "palette", person: "account", device_tracker: "account", zone: "map-marker-radius",
  sun: "white-balance-sunny", weather: "weather-partly-cloudy", input_boolean: "toggle-switch-outline",
  input_number: "ray-vertex", input_text: "form-textbox", input_select: "format-list-bulleted",
  input_datetime: "calendar-clock", input_button: "gesture-tap-button", button: "gesture-tap-button",
  counter: "counter", timer: "timer-outline", number: "ray-vertex", select: "format-list-bulleted",
  text: "form-textbox", update: "package-up", vacuum: "robot-vacuum", siren: "bullhorn",
  alarm_control_panel: "shield-home", group: "google-circles-communities", notify: "bell",
  calendar: "calendar", todo: "clipboard-list", image: "image", event: "flash",
  valve: "pipe-valve", water_heater: "water-boiler", humidifier: "air-humidifier", remote: "remote",
  stt: "microphone-message", tts: "account-voice", conversation: "forum", ai_task: "robot-happy",
};

// device_class → mdi refinement for sensor / binary_sensor (common cases).
const SENSOR_DC_ICON: Record<string, string> = {
  temperature: "thermometer", humidity: "water-percent", pressure: "gauge", battery: "battery",
  power: "flash", energy: "lightning-bolt", current: "current-ac", voltage: "sine-wave",
  illuminance: "brightness-5", co2: "molecule-co2", pm25: "air-filter", timestamp: "clock-outline",
  gas: "meter-gas", water: "water", signal_strength: "wifi", carbon_monoxide: "molecule-co",
};
const BINARY_DC_ICON: Record<string, string> = {
  motion: "motion-sensor", door: "door", window: "window-open", opening: "square-outline",
  moisture: "water-alert", smoke: "smoke-detector", gas: "molecule-co2", occupancy: "home-account",
  presence: "home-account", lock: "lock", plug: "power-plug", connectivity: "lan-connect",
  battery: "battery-alert", problem: "alert-circle", safety: "shield-check", light: "brightness-5",
  sound: "music-note", vibration: "vibrate", cold: "snowflake", heat: "fire", power: "power-plug",
};

/** Resolve a bare MDI icon name for an entity. override → device_class → domain → generic. */
export function entityIcon(entityId: string, opts?: { override?: string | null; deviceClass?: string | null }): string {
  const ov = opts?.override;
  if (ov) return ov.replace(/^mdi:/, "");
  const domain = (entityId.split(".")[0] || "").toLowerCase();
  const dc = (opts?.deviceClass || "").toLowerCase();
  if (domain === "sensor" && dc && SENSOR_DC_ICON[dc]) return SENSOR_DC_ICON[dc];
  if (domain === "binary_sensor" && dc && BINARY_DC_ICON[dc]) return BINARY_DC_ICON[dc];
  return DOMAIN_ICON[domain] ?? "help-circle-outline";
}

// ── Markdown projection for the LLM ──────────────────────────────────────────
function mdEscape(s: string): string { return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " "); }

function renderTableMd(d: Extract<HaDetails, { kind: "table" }>): string {
  const lines: string[] = [];
  if (d.title) lines.push(`**${d.title}**`, "");
  lines.push(`| ${d.columns.map((c) => c.label).join(" | ")} |`);
  lines.push(`|${d.columns.map(() => "---").join("|")}|`);
  for (const r of d.rows) lines.push(`| ${d.columns.map((c) => mdEscape(r.cells[c.key] ?? "")).join(" | ")} |`);
  const summary = d.note
    ?? (d.page && d.page.total > d.rows.length
      ? `Showing ${d.page.offset + 1}-${Math.min(d.page.offset + d.page.limit, d.page.total)} of ${d.page.total}`
      : `${d.rows.length} row${d.rows.length === 1 ? "" : "s"}`);
  lines.push("", summary);
  return lines.join("\n");
}

function renderDetailMd(d: Extract<HaDetails, { kind: "detail" }>): string {
  const lines: string[] = [];
  if (d.title) lines.push(`**${d.title}**`, "");
  lines.push("| Property | Value |", "|---|---|");
  for (const f of d.fields) lines.push(`| ${mdEscape(f.label)} | ${mdEscape(f.value)} |`);
  return lines.join("\n");
}

function renderListMd(d: Extract<HaDetails, { kind: "list" }>): string {
  const lines: string[] = [];
  if (d.title) lines.push(`**${d.title}**`, "");
  for (const it of d.items) lines.push(`- ${it}`);
  if (d.note) lines.push("", d.note);
  return lines.join("\n");
}

export function renderDetailsMarkdown(d: HaDetails): string {
  switch (d.kind) {
    case "table": return renderTableMd(d);
    case "detail": return renderDetailMd(d);
    case "list": return renderListMd(d);
    case "message": return d.text;
  }
}

/** Build the SDK tool result: markdown for the LLM + structured details for the UI. */
export function toolResult(details: HaDetails): { content: Array<{ type: "text"; text: string }>; details: HaDetails } {
  return { content: [{ type: "text" as const, text: renderDetailsMarkdown(details) }], details };
}

// ── Unified tool registrar ───────────────────────────────────────────────────
// One definition for every HA tool. Centralizes renderCall/renderResult + the
// execute wrapper: a handler returns EITHER a plain string (legacy) or an
// HaDetails (structured); both become the correct SDK result shape.
export interface HaToolSpec {
  name: string;
  /** Human label shown in the tool-call header (e.g. "HA Devices"). */
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: unknown;
  execute: (params: Record<string, unknown>, ctx?: unknown) => Promise<HaDetails | string>;
}

export function defineHaTool(pi: ExtensionAPI, spec: HaToolSpec): void {
  pi.registerTool({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    promptSnippet: spec.promptSnippet,
    promptGuidelines: spec.promptGuidelines,
    parameters: spec.parameters as never,
    renderCall(args: Record<string, unknown>, theme: unknown) { return renderToolCall(spec.label, args, theme as never); },
    renderResult(result: unknown) { return renderMarkdownResult(result as { content: Array<{ type: string; text?: string }> }); },
    async execute(_id: string, params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: unknown) {
      const out = await spec.execute(params, ctx);
      if (out && typeof out === "object" && "kind" in out) return toolResult(out);
      return { content: [{ type: "text" as const, text: out as string }] };
    },
  });
}
