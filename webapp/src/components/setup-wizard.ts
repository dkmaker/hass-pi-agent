import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icon } from "../icon.js";
import { mdiClose, mdiCheck, mdiArrowLeft, mdiCheckCircle } from "@mdi/js";
import { t, lang, type Lang } from "../i18n.js";

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

// Localized step content (da/no/sv/de). English is the base STEPS above.
// Option examples are code/entity-IDs — language-neutral, kept as-is.
type StepTr = { topic: string; title: string; help: string; options: Record<string, string> };
const STEP_L10N: Partial<Record<Lang, Record<string, StepTr>>> = {
  da: {
    language: { topic: "Sprog", title: "Hvordan skal ting navngives?", help: "Vælg om entitets-ID'er og visningsnavne deler ét sprog eller opdeles (tekniske ID'er på engelsk, visningsnavne på dit sprog).", options: { english: "Kun engelsk", multilingual: "Flersproget (engelske ID'er + danske navne)" } },
    entity_naming: { topic: "Entitets-ID'er", title: "Navnemønster for entitets-ID", help: "Hvor skal placeringen stå i entity_id?", options: { location_first: "Placering først", device_first: "Enhed først" } },
    metrics: { topic: "Målesensorer", title: "Effekt vs. energi-navngivning", help: "Skeln øjeblikkelig (speedometer) fra akkumuleret (kilometertæller), så enheder forbliver klare.", options: { suffix: "Suffiks _power / _energy", explicit: "Eksplicit enhed i navnet" } },
    friendly: { topic: "Visningsnavne", title: "Stil for visningsnavne", help: "Hvor detaljerede skal visningsnavne være? Stemmeassistenter foretrækker fulde, entydige navne.", options: { voice: "Stemme-optimeret (fuld)", short: "Kort" } },
    areas: { topic: "Områder & etager", title: "Områdestruktur", help: "Hvordan skal rum organiseres?", options: { floors: "Etager → områder", flat: "Flade områder" } },
    labels: { topic: "Labels", title: "Label-strategi", help: "Brug labels til at gå på tværs af områder (fx efter funktion eller automatisering).", options: { yes: "Brug labels", no: "Ingen labels" } },
    automations: { topic: "Automatiseringer", title: "Navngivning af automatiseringer", help: "Hvordan skal automatiseringer navngives for nem overskuelighed?", options: { descriptive: "Beskrivende", prefixed: "Præfikset" } },
  },
  no: {
    language: { topic: "Språk", title: "Hvordan skal ting navngis?", help: "Velg om enhets-ID-er og visningsnavn deler ett språk eller deles (tekniske ID-er på engelsk, visningsnavn på ditt språk).", options: { english: "Kun engelsk", multilingual: "Flerspråklig (engelske ID-er + norske navn)" } },
    entity_naming: { topic: "Enhets-ID-er", title: "Navnemønster for enhets-ID", help: "Hvor skal plasseringen stå i entity_id?", options: { location_first: "Plassering først", device_first: "Enhet først" } },
    metrics: { topic: "Målesensorer", title: "Effekt vs. energi-navngivning", help: "Skill øyeblikkelig (speedometer) fra akkumulert (kilometerteller), så enheter forblir tydelige.", options: { suffix: "Suffiks _power / _energy", explicit: "Eksplisitt enhet i navnet" } },
    friendly: { topic: "Visningsnavn", title: "Stil for visningsnavn", help: "Hvor detaljerte skal visningsnavn være? Taleassistenter foretrekker fulle, entydige navn.", options: { voice: "Taleoptimalisert (fullt)", short: "Kort" } },
    areas: { topic: "Områder & etasjer", title: "Områdestruktur", help: "Hvordan skal rom organiseres?", options: { floors: "Etasjer → områder", flat: "Flate områder" } },
    labels: { topic: "Etiketter", title: "Etikett-strategi", help: "Bruk etiketter til å gå på tvers av områder (f.eks. etter funksjon eller automasjon).", options: { yes: "Bruk etiketter", no: "Ingen etiketter" } },
    automations: { topic: "Automasjoner", title: "Navngivning av automasjoner", help: "Hvordan skal automasjoner navngis for enkel oversikt?", options: { descriptive: "Beskrivende", prefixed: "Prefikset" } },
  },
  sv: {
    language: { topic: "Språk", title: "Hur ska saker namnges?", help: "Välj om entitets-ID:n och visningsnamn delar ett språk eller delas upp (tekniska ID:n på engelska, visningsnamn på ditt språk).", options: { english: "Endast engelska", multilingual: "Flerspråkig (engelska ID:n + svenska namn)" } },
    entity_naming: { topic: "Entitets-ID:n", title: "Namnmönster för entitets-ID", help: "Var ska platsen stå i entity_id?", options: { location_first: "Plats först", device_first: "Enhet först" } },
    metrics: { topic: "Mätsensorer", title: "Effekt vs. energi-namngivning", help: "Skilj momentant (hastighetsmätare) från ackumulerat (vägmätare) så att enheter förblir tydliga.", options: { suffix: "Suffix _power / _energy", explicit: "Explicit enhet i namnet" } },
    friendly: { topic: "Visningsnamn", title: "Stil för visningsnamn", help: "Hur utförliga ska visningsnamn vara? Röstassistenter föredrar fullständiga, entydiga namn.", options: { voice: "Röstoptimerad (fullständig)", short: "Kort" } },
    areas: { topic: "Områden & våningar", title: "Områdesstruktur", help: "Hur ska rum organiseras?", options: { floors: "Våningar → områden", flat: "Platta områden" } },
    labels: { topic: "Etiketter", title: "Etikettstrategi", help: "Använd etiketter för att korsa områden (t.ex. efter funktion eller automation).", options: { yes: "Använd etiketter", no: "Inga etiketter" } },
    automations: { topic: "Automationer", title: "Namngivning av automationer", help: "Hur ska automationer namnges för enkel överblick?", options: { descriptive: "Beskrivande", prefixed: "Prefixad" } },
  },
  de: {
    language: { topic: "Sprache", title: "Wie sollen Dinge benannt werden?", help: "Wähle, ob Entitäts-IDs und Anzeigenamen eine Sprache teilen oder getrennt sind (technische IDs auf Englisch, Anzeigenamen in deiner Sprache).", options: { english: "Nur Englisch", multilingual: "Mehrsprachig (englische IDs + deutsche Namen)" } },
    entity_naming: { topic: "Entitäts-IDs", title: "Namensschema für Entitäts-ID", help: "Wo soll der Ort in der entity_id stehen?", options: { location_first: "Ort zuerst", device_first: "Gerät zuerst" } },
    metrics: { topic: "Messsensoren", title: "Leistung vs. Energie-Benennung", help: "Unterscheide momentan (Tacho) von kumulativ (Kilometerzähler), damit Einheiten klar bleiben.", options: { suffix: "Suffix _power / _energy", explicit: "Explizite Einheit im Namen" } },
    friendly: { topic: "Anzeigenamen", title: "Stil der Anzeigenamen", help: "Wie ausführlich sollen Anzeigenamen sein? Sprachassistenten bevorzugen vollständige, eindeutige Namen.", options: { voice: "Sprachoptimiert (vollständig)", short: "Kurz" } },
    areas: { topic: "Bereiche & Etagen", title: "Bereichsstruktur", help: "Wie sollen Räume organisiert werden?", options: { floors: "Etagen → Bereiche", flat: "Flache Bereiche" } },
    labels: { topic: "Labels", title: "Label-Strategie", help: "Nutze Labels, um Bereiche zu überschneiden (z. B. nach Funktion oder Automation).", options: { yes: "Labels verwenden", no: "Keine Labels" } },
    automations: { topic: "Automationen", title: "Benennung von Automationen", help: "Wie sollen Automationen für einfache Übersicht benannt werden?", options: { descriptive: "Beschreibend", prefixed: "Mit Präfix" } },
  },
};
const trStep = (s: Step, f: "topic" | "title" | "help"): string => STEP_L10N[lang]?.[s.id]?.[f] ?? s[f];
const trOpt = (s: Step, o: Opt): string => STEP_L10N[lang]?.[s.id]?.options[o.value] ?? o.label;

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
    const summary = STEPS.map((s) => {
      const o = s.options.find((x) => x.value === this.answers[s.id]);
      return { topic: trStep(s, "topic"), choice: o ? trOpt(s, o) : "—" };
    });
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
            ${done ? nothing : html`<span class="step-of">${t("wiz_step_of", { n: this.step + 1, t: STEPS.length })}</span>`}
            <span class="t">${done ? t("wiz_review") : t("setup_conventions")}</span>
            <button class="iconbtn" @click=${() => this.close()} aria-label="${t("wiz_close")}">${icon(mdiClose, 22)}</button>
          </div>
          <div class="bar"><i style="width:${done ? 100 : pct}%"></i></div>

          ${done
            ? html`<div class="body">
                <div class="summary">
                  <div class="big">${icon(mdiCheckCircle, 48)}</div>
                  <h3>${t("wiz_done_title")}</h3>
                  <p>${t("wiz_done_sub")}</p>
                  <div class="rows">
                    ${STEPS.map((st) => { const o = st.options.find((x) => x.value === this.answers[st.id]); return html`<div class="r"><span class="k">${trStep(st, "topic")}</span><span class="v">${o ? trOpt(st, o) : "—"}</span></div>`; })}
                  </div>
                </div>
              </div>
              <div class="foot">
                <button class="btn" @click=${() => this.back()}>${icon(mdiArrowLeft, 18)} ${t("wiz_back")}</button>
                <span class="spacer"></span>
                <button class="btn primary" @click=${() => this.finish()}>${t("wiz_save")}</button>
              </div>`
            : html`<div class="body">
                <p class="q">${trStep(s, "title")}</p>
                <p class="help">${trStep(s, "help")}</p>
                <div class="opts">
                  ${s.options.map(
                    (o) => html`<button class="opt ${chosen === o.value ? "sel" : ""}" @click=${() => this.select(s.id, o.value)}>
                      <span class="radio">${chosen === o.value ? icon(mdiCheck, 15) : nothing}</span>
                      <span class="txt"><div class="lbl">${trOpt(s, o)}</div>${o.example ? html`<div class="ex">${o.example}</div>` : nothing}</span>
                    </button>`,
                  )}
                </div>
              </div>
              <div class="foot">
                <button class="btn" ?disabled=${this.step === 0} @click=${() => this.back()}>${icon(mdiArrowLeft, 18)} ${t("wiz_back")}</button>
                <span class="spacer"></span>
                <button class="btn primary" ?disabled=${!chosen} @click=${() => this.next()}>
                  ${this.step === STEPS.length - 1 ? t("wiz_review") : t("wiz_next")}
                </button>
              </div>`}
        </div>
      </div>`;
  }
}
