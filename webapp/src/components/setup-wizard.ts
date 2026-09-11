import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icon } from "../icon.js";
import { mdiClose, mdiCheck, mdiArrowLeft, mdiCheckCircle } from "@mdi/js";

interface Opt { value: string; label: string; example?: string; }
interface Step { id: string; topic: string; title: string; help: string; options: Opt[]; }

/** The real /setup topics, rendered as a stepped first-class wizard (mock). */
const STEPS: Step[] = [
  {
    id: "language", topic: "Language", title: "How should things be named?",
    help: "Pick whether entity IDs and friendly names share one language or split (technical IDs in English, display names in your language).",
    options: [
      { value: "english", label: "English only", example: "sensor.kitchen_fridge_power → \u201cKitchen Fridge Power\u201d" },
      { value: "multilingual", label: "Multilingual (English IDs + Danish names)", example: "sensor.kitchen_fridge_power → \u201cKøkken Køleskab Effekt\u201d" },
    ],
  },
  {
    id: "entity_naming", topic: "Entity IDs", title: "Entity ID naming pattern",
    help: "Where should the location go in the entity_id?",
    options: [
      { value: "location_first", label: "Location first", example: "sensor.kitchen_fridge_power" },
      { value: "device_first", label: "Device first", example: "sensor.fridge_kitchen_power" },
    ],
  },
  {
    id: "metrics", topic: "Metric sensors", title: "Power vs energy naming",
    help: "Distinguish instantaneous (speedometer) from cumulative (odometer) so units stay clear.",
    options: [
      { value: "suffix", label: "Suffix _power / _energy", example: "…_power (W)  ·  …_energy (kWh)" },
      { value: "explicit", label: "Explicit unit in name", example: "…_watts  ·  …_kwh" },
    ],
  },
  {
    id: "friendly", topic: "Friendly names", title: "Friendly name style",
    help: "How verbose should display names be? Voice assistants prefer full, unambiguous names.",
    options: [
      { value: "voice", label: "Voice-optimized (full)", example: "\u201cKitchen Fridge Power\u201d" },
      { value: "short", label: "Short", example: "\u201cFridge Power\u201d" },
    ],
  },
  {
    id: "areas", topic: "Areas & floors", title: "Area structure",
    help: "How should rooms be organized?",
    options: [
      { value: "floors", label: "Floors → areas", example: "Ground floor › Kitchen, Living Room" },
      { value: "flat", label: "Flat areas", example: "Kitchen, Living Room, Bedroom" },
    ],
  },
  {
    id: "labels", topic: "Labels", title: "Label strategy",
    help: "Use labels to cross-cut areas (e.g. by function or automation).",
    options: [
      { value: "yes", label: "Use labels", example: "critical · energy · security · lighting" },
      { value: "no", label: "No labels", example: "Rely on areas only" },
    ],
  },
  {
    id: "automations", topic: "Automations", title: "Automation naming",
    help: "How should automations be named for easy scanning?",
    options: [
      { value: "descriptive", label: "Descriptive", example: "\u201cKitchen — Motion Lights\u201d" },
      { value: "prefixed", label: "Prefixed", example: "auto_kitchen_motion_lights" },
    ],
  },
];

@customElement("pi-setup-wizard")
export class PiSetupWizard extends LitElement {
  @property({ type: Boolean }) open = false;
  @state() private step = 0;
  @state() private answers: Record<string, string> = {};

  private reset(): void { this.step = 0; this.answers = {}; }

  private select(id: string, value: string): void {
    this.answers = { ...this.answers, [id]: value };
  }
  private back(): void { if (this.step > 0) this.step -= 1; }
  private next(): void { if (this.step < STEPS.length) this.step += 1; }
  private close(): void { this.reset(); this.dispatchEvent(new CustomEvent("wizard-close")); }
  private finish(): void {
    const summary = STEPS.map((s) => ({
      topic: s.topic,
      choice: s.options.find((o) => o.value === this.answers[s.id])?.label ?? "—",
    }));
    this.dispatchEvent(new CustomEvent("wizard-complete", { detail: { summary } }));
    this.reset();
  }

  static styles = css`
    * { box-sizing: border-box; }
    .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 10; display: grid; place-items: end center; }
    @media (min-width: 560px) { .scrim { place-items: center; } }
    .panel {
      width: 100%; max-width: 520px; max-height: 92dvh; display: flex; flex-direction: column;
      background: var(--pi-surface); color: var(--pi-text);
      border-radius: 20px 20px 0 0; overflow: hidden;
    }
    @media (min-width: 560px) { .panel { border-radius: 20px; } }
    .head { display: flex; align-items: center; gap: 10px; padding: 16px 16px 8px; }
    .head .t { font-weight: 700; font-size: 17px; flex: 1; }
    .step-of { font-size: 12px; color: var(--pi-text-2); }
    .iconbtn { display: grid; place-items: center; width: 36px; height: 36px; border: none; background: transparent; color: var(--pi-text-2); border-radius: 10px; cursor: pointer; }
    .iconbtn:hover { background: var(--pi-surface-2); color: var(--pi-text); }
    .iconbtn svg { width: 22px; height: 22px; }
    .bar { height: 3px; background: var(--pi-surface-2); }
    .bar > i { display: block; height: 100%; background: var(--pi-primary); transition: width 0.25s ease; }

    .body { padding: 16px; overflow-y: auto; }
    .q { font-weight: 600; font-size: 16px; margin: 0 0 4px; }
    .help { color: var(--pi-text-2); font-size: 13.5px; margin: 0 0 14px; line-height: 1.5; }
    .opts { display: flex; flex-direction: column; gap: 10px; }
    .opt {
      display: flex; align-items: center; gap: 12px; text-align: left; width: 100%; cursor: pointer;
      padding: 14px; border: 1.5px solid var(--pi-divider); background: var(--pi-bg); color: var(--pi-text); border-radius: 14px;
    }
    .opt:hover { border-color: var(--pi-primary); }
    .opt.sel { border-color: var(--pi-primary); background: color-mix(in srgb, var(--pi-primary) 10%, var(--pi-bg)); }
    .opt .txt { flex: 1; }
    .opt .lbl { font-weight: 600; font-size: 14.5px; }
    .opt .ex { font-size: 12.5px; color: var(--pi-text-2); font-family: var(--pi-mono); margin-top: 3px; }
    .radio { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--pi-divider); display: grid; place-items: center; flex: 0 0 auto; color: #fff; }
    .opt.sel .radio { background: var(--pi-primary); border-color: var(--pi-primary); }
    .radio svg { width: 15px; height: 15px; }

    .foot { display: flex; gap: 10px; padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); border-top: 1px solid var(--pi-divider); }
    .foot .spacer { flex: 1; }
    button.btn { border-radius: 22px; padding: 11px 20px; font: 600 14px var(--pi-font); cursor: pointer; border: 1px solid var(--pi-divider); background: var(--pi-surface); color: var(--pi-text); display: inline-flex; align-items: center; gap: 6px; }
    button.btn.primary { background: var(--pi-primary); color: #fff; border-color: var(--pi-primary); }
    button.btn:disabled { opacity: 0.45; cursor: default; }
    button.btn svg { width: 18px; height: 18px; }

    .summary { text-align: center; padding: 8px 0 4px; }
    .summary .big { color: var(--pi-ok); }
    .summary .big svg { width: 48px; height: 48px; }
    .summary h3 { margin: 8px 0 2px; }
    .summary p { color: var(--pi-text-2); font-size: 13.5px; margin: 0 0 14px; }
    .rows { text-align: left; border: 1px solid var(--pi-divider); border-radius: 12px; overflow: hidden; }
    .rows .r { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; font-size: 13.5px; }
    .rows .r + .r { border-top: 1px solid var(--pi-divider); }
    .rows .r .k { color: var(--pi-text-2); }
    .rows .r .v { font-weight: 600; text-align: right; }
  `;

  render() {
    if (!this.open) return nothing;
    const done = this.step >= STEPS.length;
    const s = STEPS[this.step];
    const pct = Math.round((this.step / STEPS.length) * 100);
    const chosen = s ? this.answers[s.id] : undefined;

    return html`
      <div class="scrim" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="panel">
          <div class="head">
            ${done ? nothing : html`<span class="step-of">Step ${this.step + 1} of ${STEPS.length}</span>`}
            <span class="t">${done ? "Review" : "Set up conventions"}</span>
            <button class="iconbtn" @click=${() => this.close()} aria-label="Close">${icon(mdiClose, 22)}</button>
          </div>
          <div class="bar"><i style="width:${done ? 100 : pct}%"></i></div>

          ${done
            ? html`<div class="body">
                <div class="summary">
                  <div class="big">${icon(mdiCheckCircle, 48)}</div>
                  <h3>You're all set</h3>
                  <p>These conventions will guide how I name and organize things.</p>
                  <div class="rows">
                    ${STEPS.map((st) => html`<div class="r"><span class="k">${st.topic}</span><span class="v">${st.options.find((o) => o.value === this.answers[st.id])?.label ?? "—"}</span></div>`)}
                  </div>
                </div>
              </div>
              <div class="foot">
                <button class="btn" @click=${() => this.back()}>${icon(mdiArrowLeft, 18)} Back</button>
                <span class="spacer"></span>
                <button class="btn primary" @click=${() => this.finish()}>Save & finish</button>
              </div>`
            : html`<div class="body">
                <p class="q">${s.title}</p>
                <p class="help">${s.help}</p>
                <div class="opts">
                  ${s.options.map(
                    (o) => html`<button class="opt ${chosen === o.value ? "sel" : ""}" @click=${() => this.select(s.id, o.value)}>
                      <span class="radio">${chosen === o.value ? icon(mdiCheck, 15) : nothing}</span>
                      <span class="txt"><div class="lbl">${o.label}</div>${o.example ? html`<div class="ex">${o.example}</div>` : nothing}</span>
                    </button>`,
                  )}
                </div>
              </div>
              <div class="foot">
                <button class="btn" ?disabled=${this.step === 0} @click=${() => this.back()}>${icon(mdiArrowLeft, 18)} Back</button>
                <span class="spacer"></span>
                <button class="btn primary" ?disabled=${!chosen} @click=${() => this.next()}>
                  ${this.step === STEPS.length - 1 ? "Review" : "Next"}
                </button>
              </div>`}
        </div>
      </div>`;
  }
}
