import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icon } from "../icon.js";
import { mdiClose, mdiCheckCircle, mdiAlertCircleOutline, mdiKeyVariant, mdiRobotHappyOutline } from "@mdi/js";
import { lang, type Lang } from "../i18n.js";

interface Provider { id: string; name: string; models: Array<{ id: string; name: string }> }

// Self-contained localization (en base + da/no/sv/de). The setup screen must work
// on first run before anything else — keep its strings here, not threaded through.
type Dict = Record<string, string>;
const L: Record<Lang, Dict> = {
  en: {
    welcome: "Welcome to Pi Agent", welcome_sub: "Choose an AI provider and model, then paste its API key. Pi checks it works before saving — you're ready to chat the moment it succeeds.",
    title: "AI provider & model", provider: "Provider", model: "Model", api_key: "API key",
    choose_provider: "Choose a provider…", choose_model: "Choose a model…",
    key_ph: "Paste the provider's API key", key_hint: "Stored securely in the add-on. Leave blank to keep the existing key.",
    save: "Save & test", testing: "Testing the connection…", loading: "Loading providers…",
    ok: "Connection works — saved.", need_fields: "Pick a provider and model first.",
    ws_title: "Web search (optional)", ws_provider: "Search provider", ws_key: "API key",
    ws_key_ph: "Paste the search provider's API key", ws_hint: "When it validates, the agent gets a web_search tool and is told to check facts online instead of guessing.",
    ws_save: "Save & test", ws_disable: "Disable", ws_on: "Active", ws_off: "Off",
  },
  da: {
    welcome: "Velkommen til Pi Agent", welcome_sub: "Vælg en AI-udbyder og model, og indsæt API-nøglen. Pi tjekker at den virker før den gemmer — du kan chatte så snart det lykkes.",
    title: "AI-udbyder & model", provider: "Udbyder", model: "Model", api_key: "API-nøgle",
    choose_provider: "Vælg en udbyder…", choose_model: "Vælg en model…",
    key_ph: "Indsæt udbyderens API-nøgle", key_hint: "Gemmes sikkert i add-on'en. Lad stå tom for at beholde den nuværende nøgle.",
    save: "Gem & test", testing: "Tester forbindelsen…", loading: "Henter udbydere…",
    ok: "Forbindelsen virker — gemt.", need_fields: "Vælg udbyder og model først.",
    ws_title: "Websøgning (valgfri)", ws_provider: "Søge-udbyder", ws_key: "API-nøgle",
    ws_key_ph: "Indsæt søge-udbyderens API-nøgle", ws_hint: "Når den validerer, får agenten et web_search-værktøj og bliver bedt om at tjekke fakta online i stedet for at gætte.",
    ws_save: "Gem & test", ws_disable: "Slå fra", ws_on: "Aktiv", ws_off: "Fra",
  },
  no: {
    welcome: "Velkommen til Pi Agent", welcome_sub: "Velg en AI-leverandør og modell, og lim inn API-nøkkelen. Pi sjekker at den virker før den lagrer — du kan chatte så snart det lykkes.",
    title: "AI-leverandør & modell", provider: "Leverandør", model: "Modell", api_key: "API-nøkkel",
    choose_provider: "Velg en leverandør…", choose_model: "Velg en modell…",
    key_ph: "Lim inn leverandørens API-nøkkel", key_hint: "Lagres trygt i tillegget. La stå tom for å beholde nåværende nøkkel.",
    save: "Lagre & test", testing: "Tester tilkoblingen…", loading: "Henter leverandører…",
    ok: "Tilkoblingen virker — lagret.", need_fields: "Velg leverandør og modell først.",
  },
  sv: {
    welcome: "Välkommen till Pi Agent", welcome_sub: "Välj en AI-leverantör och modell och klistra in API-nyckeln. Pi kontrollerar att den fungerar innan den sparas — du kan chatta så snart det lyckas.",
    title: "AI-leverantör & modell", provider: "Leverantör", model: "Modell", api_key: "API-nyckel",
    choose_provider: "Välj en leverantör…", choose_model: "Välj en modell…",
    key_ph: "Klistra in leverantörens API-nyckel", key_hint: "Lagras säkert i tillägget. Lämna tomt för att behålla nuvarande nyckel.",
    save: "Spara & testa", testing: "Testar anslutningen…", loading: "Hämtar leverantörer…",
    ok: "Anslutningen fungerar — sparad.", need_fields: "Välj leverantör och modell först.",
  },
  de: {
    welcome: "Willkommen bei Pi Agent", welcome_sub: "Wähle einen KI-Anbieter und ein Modell und füge den API-Schlüssel ein. Pi prüft vor dem Speichern, ob es funktioniert — sobald es klappt, kannst du chatten.",
    title: "KI-Anbieter & Modell", provider: "Anbieter", model: "Modell", api_key: "API-Schlüssel",
    choose_provider: "Anbieter wählen…", choose_model: "Modell wählen…",
    key_ph: "API-Schlüssel des Anbieters einfügen", key_hint: "Sicher im Add-on gespeichert. Leer lassen, um den bestehenden Schlüssel zu behalten.",
    save: "Speichern & testen", testing: "Verbindung wird getestet…", loading: "Anbieter werden geladen…",
    ok: "Verbindung funktioniert — gespeichert.", need_fields: "Zuerst Anbieter und Modell wählen.",
  },
};
const tl = (k: string): string => L[lang]?.[k] ?? L.en[k] ?? k;

@customElement("pi-provider-setup")
export class PiProviderSetup extends LitElement {
  @property({ type: Boolean }) open = false;
  /** First-run: the panel cannot be dismissed until a working config is saved. */
  @property({ type: Boolean }) mustConfigure = false;
  /** Provider catalog + current selection + save state come from chat-app over WS. */
  @property({ attribute: false }) providers: Provider[] = [];
  @property() initialProvider = "";
  @property() initialModel = "";
  @property({ type: Boolean }) busy = false;
  @property() error = "";

  @state() private provider = "";
  @state() private model = "";
  @state() private apiKey = "";
  @state() private requested = false;

  /** Web search config status + save state (from chat-app over WS). */
  @property({ attribute: false }) websearch: { enabled: boolean; provider: string; providers: string[] } = { enabled: false, provider: "perplexity", providers: [] };
  @property({ type: Boolean }) wsBusy = false;
  @property() wsError = "";
  @state() private wsProvider = "";
  @state() private wsKey = "";

  updated(changed: Map<string, unknown>): void {
    if (changed.has("open")) {
      if (this.open) {
        // Ask chat-app to fetch the provider catalog over WS (same pattern as sessions).
        if (!this.requested) { this.dispatchEvent(new CustomEvent("request-providers")); this.requested = true; }
        if (this.initialProvider && !this.provider) this.provider = this.initialProvider;
        if (this.initialModel && !this.model) this.model = this.initialModel;
        if (!this.wsProvider) this.wsProvider = this.websearch.provider || "perplexity";
      } else {
        this.apiKey = ""; this.wsKey = ""; this.requested = false; // reset for next open
      }
    }
    if ((changed.has("initialProvider") || changed.has("initialModel")) && this.open) {
      if (this.initialProvider && !this.provider) this.provider = this.initialProvider;
      if (this.initialModel && !this.model) this.model = this.initialModel;
    }
  }

  private models(): Array<{ id: string; name: string }> {
    return this.providers.find((p) => p.id === this.provider)?.models ?? [];
  }

  private save(): void {
    if (!this.provider || !this.model || this.busy) return;
    this.dispatchEvent(new CustomEvent("save-config", { detail: { provider: this.provider, model: this.model, apiKey: this.apiKey } }));
  }

  private saveWs(): void {
    if (!this.wsProvider || this.wsBusy) return;
    this.dispatchEvent(new CustomEvent("save-websearch", { detail: { provider: this.wsProvider, apiKey: this.wsKey } }));
  }
  private disableWs(): void { if (!this.wsBusy) this.dispatchEvent(new CustomEvent("disable-websearch")); }
  private wsLabel(id: string): string {
    return id === "brave" ? "Brave Search" : id === "perplexity_openrouter" ? "Perplexity via OpenRouter" : "Perplexity (API)";
  }

  private close(): void { if (this.mustConfigure) return; this.dispatchEvent(new CustomEvent("setup-close")); }

  static styles = css`
    * { box-sizing: border-box; }
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 20; display: grid; place-items: end center; }
    @media (min-width: 560px) { .scrim { place-items: center; } }
    .panel { width: 100%; max-width: 480px; max-height: 94dvh; display: flex; flex-direction: column;
      background: var(--pi-surface); color: var(--pi-text); border-radius: 20px 20px 0 0; overflow: hidden; }
    @media (min-width: 560px) { .panel { border-radius: 20px; } }
    .head { display: flex; align-items: center; gap: 10px; padding: 16px 16px 6px; }
    .head .t { font-weight: 700; font-size: 17px; flex: 1; }
    .iconbtn { display: grid; place-items: center; width: 36px; height: 36px; border: none; background: transparent; color: var(--pi-text-2); border-radius: 10px; cursor: pointer; }
    .iconbtn:hover { background: var(--pi-surface-2); color: var(--pi-text); }
    .iconbtn svg { width: 22px; height: 22px; }
    .body { padding: 8px 16px 16px; overflow-y: auto; }
    .welcome { display: flex; gap: 12px; align-items: flex-start; margin: 4px 0 14px; }
    .welcome .ic { color: var(--pi-primary); flex: 0 0 auto; }
    .welcome .ic svg { width: 34px; height: 34px; }
    .welcome h3 { margin: 0 0 4px; font-size: 16px; }
    .welcome p { margin: 0; color: var(--pi-text-2); font-size: 13.5px; line-height: 1.5; }
    label.field { display: block; margin: 12px 0 0; }
    .field .lbl { font-size: 12.5px; font-weight: 600; color: var(--pi-text-2); margin-bottom: 5px; display: block; }
    select, input {
      width: 100%; padding: 12px 13px; border: 1.5px solid var(--pi-divider); border-radius: 12px;
      background: var(--pi-bg); color: var(--pi-text); font: 14.5px var(--pi-font); outline: none;
    }
    select:focus, input:focus { border-color: var(--pi-primary); }
    select:disabled { opacity: 0.5; }
    .key-wrap { position: relative; }
    .key-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--pi-text-2); }
    .key-wrap input { padding-left: 38px; }
    .hint { font-size: 12px; color: var(--pi-text-2); margin-top: 5px; line-height: 1.45; }
    .msg { display: flex; align-items: flex-start; gap: 8px; margin-top: 14px; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45; }
    .msg svg { width: 18px; height: 18px; flex: 0 0 auto; margin-top: 1px; }
    .msg.err { background: color-mix(in srgb, var(--pi-danger) 12%, var(--pi-bg)); color: var(--pi-text); }
    .msg.err svg { color: var(--pi-danger); }
    .foot { display: flex; gap: 10px; padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); border-top: 1px solid var(--pi-divider); }
    .foot .spacer { flex: 1; }
    button.btn { border-radius: 22px; padding: 12px 22px; font: 600 14px var(--pi-font); cursor: pointer; border: 1px solid var(--pi-divider); background: var(--pi-surface); color: var(--pi-text); display: inline-flex; align-items: center; gap: 8px; }
    button.btn.primary { background: var(--pi-primary); color: #fff; border-color: var(--pi-primary); }
    button.btn:disabled { opacity: 0.5; cursor: default; }
    md-circular-progress { --md-circular-progress-size: 18px; }
    .spin { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: sp 0.7s linear infinite; }
    @keyframes sp { to { transform: rotate(360deg); } }
    .ws-sep { border-top: 1px solid var(--pi-divider); margin: 20px 0 12px; }
    .ws-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; }
    .ws-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--pi-surface-2); color: var(--pi-text-2); }
    .ws-status.on { background: color-mix(in srgb, var(--pi-ok) 18%, transparent); color: var(--pi-ok); }
    .ws-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
    .ws-actions .spacer { flex: 1; }
  `;

  render() {
    if (!this.open) return nothing;
    const canClose = !this.mustConfigure;
    return html`
      <div class="scrim" @click=${(e: Event) => { if (canClose && e.target === e.currentTarget) this.close(); }}>
        <div class="panel">
          <div class="head">
            <span class="t">${tl("title")}</span>
            ${canClose ? html`<button class="iconbtn" @click=${() => this.close()} aria-label="close">${icon(mdiClose, 22)}</button>` : nothing}
          </div>
          <div class="body">
            ${this.mustConfigure
              ? html`<div class="welcome"><span class="ic">${icon(mdiRobotHappyOutline, 34)}</span>
                  <div><h3>${tl("welcome")}</h3><p>${tl("welcome_sub")}</p></div></div>`
              : nothing}

            <label class="field">
              <span class="lbl">${tl("provider")}</span>
              <select .value=${this.provider} ?disabled=${!this.providers.length}
                @change=${(e: Event) => { this.provider = (e.target as HTMLSelectElement).value; this.model = ""; }}>
                <option value="" ?selected=${!this.provider}>${this.providers.length ? tl("choose_provider") : tl("loading")}</option>
                ${this.providers.map((p) => html`<option value=${p.id} ?selected=${this.provider === p.id}>${p.name}</option>`)}
              </select>
            </label>

            <label class="field">
              <span class="lbl">${tl("model")}</span>
              <select .value=${this.model} ?disabled=${!this.provider}
                @change=${(e: Event) => { this.model = (e.target as HTMLSelectElement).value; }}>
                <option value="" ?selected=${!this.model}>${tl("choose_model")}</option>
                ${this.models().map((m) => html`<option value=${m.id} ?selected=${this.model === m.id}>${m.name}</option>`)}
              </select>
            </label>

            <label class="field">
              <span class="lbl">${tl("api_key")}</span>
              <div class="key-wrap">
                ${icon(mdiKeyVariant, 18)}
                <input type="password" autocomplete="off" spellcheck="false" placeholder=${tl("key_ph")}
                  .value=${this.apiKey} @input=${(e: Event) => { this.apiKey = (e.target as HTMLInputElement).value; }} />
              </div>
              <div class="hint">${tl("key_hint")}</div>
            </label>

            ${this.error
              ? html`<div class="msg err">${icon(mdiAlertCircleOutline, 18)}<span>${this.error}</span></div>`
              : this.busy
                ? html`<div class="msg">${icon(mdiCheckCircle, 18)}<span>${tl("testing")}</span></div>`
                : nothing}

            ${!this.mustConfigure ? html`
              <div class="ws-sep"></div>
              <div class="ws-head">${tl("ws_title")}
                <span class="ws-status ${this.websearch.enabled ? "on" : ""}">${this.websearch.enabled ? tl("ws_on") : tl("ws_off")}</span></div>
              <label class="field">
                <span class="lbl">${tl("ws_provider")}</span>
                <select .value=${this.wsProvider} @change=${(e: Event) => { this.wsProvider = (e.target as HTMLSelectElement).value; }}>
                  ${(this.websearch.providers.length ? this.websearch.providers : ["perplexity", "perplexity_openrouter", "brave"]).map((pp) => html`<option value=${pp} ?selected=${this.wsProvider === pp}>${this.wsLabel(pp)}</option>`)}
                </select>
              </label>
              <label class="field">
                <span class="lbl">${tl("ws_key")}</span>
                <div class="key-wrap">${icon(mdiKeyVariant, 18)}
                  <input type="password" autocomplete="off" spellcheck="false" placeholder=${tl("ws_key_ph")}
                    .value=${this.wsKey} @input=${(e: Event) => { this.wsKey = (e.target as HTMLInputElement).value; }} /></div>
                <div class="hint">${tl("ws_hint")}</div>
              </label>
              ${this.wsError ? html`<div class="msg err">${icon(mdiAlertCircleOutline, 18)}<span>${this.wsError}</span></div>` : nothing}
              <div class="ws-actions">
                ${this.websearch.enabled ? html`<button class="btn" ?disabled=${this.wsBusy} @click=${() => this.disableWs()}>${tl("ws_disable")}</button>` : nothing}
                <span class="spacer"></span>
                <button class="btn primary" ?disabled=${this.wsBusy || !this.wsProvider} @click=${() => this.saveWs()}>
                  ${this.wsBusy ? html`<span class="spin"></span>` : nothing}${this.wsBusy ? tl("testing") : tl("ws_save")}
                </button>
              </div>` : nothing}
          </div>
          <div class="foot">
            <span class="spacer"></span>
            <button class="btn primary" ?disabled=${this.busy || !this.provider || !this.model}
              @click=${() => this.save()}>
              ${this.busy ? html`<span class="spin"></span>` : nothing}
              ${this.busy ? tl("testing") : tl("save")}
            </button>
          </div>
        </div>
      </div>`;
  }
}
