/*
 * <ha-entity-chip entity="light.kitchen" label="Loftlampe">
 *
 * Inline clickable entity reference for markdown-rendered tool output. Tools emit
 * a plain, LLM-readable markdown link `[Loftlampe](entity:light.kitchen)`; the
 * markdown renderer (md.ts) rewrites it to this element. Deterministic — the tool
 * decides what to link; the UI renders it richly (domain icon + click → inspect).
 */
import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./ha-icons.js";

// Client-side domain → mdi default (chips only carry the entity_id; the exact
// per-entity icon lives on the structured `details` path). Bare names; ha-icons
// resolves the SVG from HA /static/mdi.
const DOMAIN_ICON: Record<string, string> = {
  light: "lightbulb", switch: "toggle-switch-variant", fan: "fan", climate: "thermostat",
  cover: "window-shutter", lock: "lock", camera: "video", media_player: "cast",
  sensor: "eye", binary_sensor: "radiobox-blank", automation: "robot", script: "script-text",
  scene: "palette", person: "account", device_tracker: "account", zone: "map-marker-radius",
  sun: "white-balance-sunny", weather: "weather-partly-cloudy", button: "gesture-tap-button",
  input_boolean: "toggle-switch-outline", input_number: "ray-vertex", input_select: "format-list-bulleted",
  number: "ray-vertex", select: "format-list-bulleted", counter: "counter", timer: "timer-outline",
  update: "package-up", vacuum: "robot-vacuum", siren: "bullhorn", alarm_control_panel: "shield-home",
  group: "google-circles-communities", calendar: "calendar", todo: "clipboard-list",
  tts: "account-voice", stt: "microphone-message", valve: "pipe-valve", humidifier: "air-humidifier",
};

function iconFor(entity: string): string {
  const d = (entity.split(".")[0] || "").toLowerCase();
  return "mdi:" + (DOMAIN_ICON[d] ?? "help-circle-outline");
}

@customElement("ha-entity-chip")
export class HaEntityChip extends LitElement {
  @property() entity = "";
  @property() label = "";

  static styles = css`
    :host { display: inline; }
    button {
      display: inline-flex; align-items: center; gap: 3px; vertical-align: baseline;
      border: none; background: transparent; color: var(--pi-primary); cursor: pointer;
      font: inherit; font-family: var(--pi-mono, inherit); padding: 0 2px; border-radius: 4px;
    }
    button:hover { text-decoration: underline; background: color-mix(in srgb, var(--pi-primary) 12%, transparent); }
    ha-mdi-icon { color: var(--pi-text); font-size: 0.95em; }
  `;

  private emit(): void {
    this.dispatchEvent(new CustomEvent("entity-click", { detail: { entityId: this.entity }, bubbles: true, composed: true }));
  }

  render(): TemplateResult | typeof nothing {
    if (!this.entity) return nothing;
    return html`<button title=${this.entity} @click=${() => this.emit()}><ha-mdi-icon icon=${iconFor(this.entity)}></ha-mdi-icon>${this.label || this.entity}</button>`;
  }
}
