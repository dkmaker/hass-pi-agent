import { LitElement, html, css, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/text-button.js";
import "./tool-block.js";
import { icon } from "../icon.js";
import { mdiRobot, mdiMenu, mdiPlus, mdiSend, mdiStop, mdiThemeLightDark, mdiWeatherSunny, mdiWeatherNight } from "@mdi/js";
import { renderMarkdown } from "../md.js";
import type { Entry, ServerEvent, ToolResult } from "../types.js";

let idc = 0;
const nid = () => `e${++idc}`;

interface MockSession { id: string; title: string; when: string; entries: Entry[]; }

/** Canned past sessions for the /sessions drawer (mock). */
function cannedSessions(): MockSession[] {
  return [
    {
      id: "s1", title: "Kitchen lights", when: "2h ago",
      entries: [
        { kind: "user", id: nid(), text: "Turn off the kitchen light" },
        { kind: "tool", id: nid(), toolName: "ha_services", args: { domain: "light", service: "turn_off", entity_id: "light.kitchen" }, running: false, isError: false, result: { kind: "service", data: { domain: "light", service: "turn_off", target: "light.kitchen", ok: true } } },
        { kind: "assistant", id: nid(), text: "Turned off **light.kitchen**.", thinking: "", streaming: false },
      ],
    },
    {
      id: "s2", title: "Porch light script", when: "Yesterday",
      entries: [
        { kind: "user", id: nid(), text: "Raise the porch light brightness" },
        { kind: "assistant", id: nid(), text: "Updated the `porch_light` script \u2014 brightness **60% \u2192 85%**. YAML re-parsed cleanly.", thinking: "", streaming: false },
      ],
    },
  ];
}

@customElement("pi-chat-app")
export class PiChatApp extends LitElement {
  @state() private entries: Entry[] = [];
  @state() private busy = false;
  @state() private working = "";
  @state() private connected = false;
  @state() private draft = "";
  @state() private drawerOpen = false;
  @state() private sessionTitle = "New chat";
  @state() private themeMode: "auto" | "light" | "dark" =
    ((typeof localStorage !== "undefined" && localStorage.getItem("pi-theme")) as "auto" | "light" | "dark") || "auto";
  private sessions = cannedSessions();
  @query(".scroll") private scroller?: HTMLElement;
  @query("textarea") private ta?: HTMLTextAreaElement;

  private ws?: WebSocket;

  connectedCallback(): void {
    super.connectedCallback();
    this.applyTheme();
    this.connect();
  }

  private themeIcon(): string {
    return this.themeMode === "light" ? mdiWeatherSunny : this.themeMode === "dark" ? mdiWeatherNight : mdiThemeLightDark;
  }
  private applyTheme(): void {
    const el = document.documentElement;
    if (this.themeMode === "auto") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", this.themeMode);
  }
  private cycleTheme(): void {
    const order: Array<"auto" | "light" | "dark"> = ["auto", "light", "dark"];
    this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
    try { localStorage.setItem("pi-theme", this.themeMode); } catch { /* ignore */ }
    this.applyTheme();
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; };
    ws.onclose = () => { this.connected = false; this.busy = false; setTimeout(() => this.connect(), 1500); };
    ws.onmessage = (m) => { try { this.onEvent(JSON.parse(m.data) as ServerEvent); } catch { /* ignore */ } };
  }

  private get last(): Entry | undefined { return this.entries[this.entries.length - 1]; }
  private bump(): void { this.entries = [...this.entries]; this.scrollSoon(); }
  private scrollSoon(): void {
    requestAnimationFrame(() => { if (this.scroller) this.scroller.scrollTop = this.scroller.scrollHeight; });
  }

  private onEvent(ev: ServerEvent): void {
    switch (ev.type) {
      case "agent_start": this.busy = true; break;
      case "working": this.working = ev.label; break;
      case "message_start":
        this.entries.push({ kind: "assistant", id: nid(), text: "", thinking: "", streaming: true });
        this.working = ""; this.bump(); break;
      case "text_delta":
        if (this.last?.kind === "assistant") { this.last.text += ev.delta; this.bump(); } break;
      case "thinking_delta":
        if (this.last?.kind === "assistant") { this.last.thinking += ev.delta; this.bump(); } break;
      case "message_end":
        if (this.last?.kind === "assistant") { this.last.streaming = false; this.bump(); } break;
      case "tool_start":
        this.working = "";
        this.entries.push({ kind: "tool", id: ev.id, toolName: ev.toolName, args: ev.args, running: true, isError: false });
        this.bump(); break;
      case "tool_end": {
        const e = this.entries.find((x) => x.kind === "tool" && x.id === ev.id) as Extract<Entry, { kind: "tool" }> | undefined;
        if (e) { e.running = false; e.isError = ev.isError; e.result = ev.result as ToolResult; this.bump(); }
        break;
      }
      case "turn_end": break;
      case "agent_end": this.busy = false; this.working = ""; this.bump(); break;
      case "aborted":
        this.entries.push({ kind: "notice", id: nid(), text: "Stopped" });
        if (this.last?.kind === "assistant") (this.entries[this.entries.length - 2] as any).streaming = false;
        this.busy = false; this.working = ""; this.bump(); break;
    }
  }

  private send(text: string): void {
    const t = text.trim();
    if (!t || this.busy || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.entries.push({ kind: "user", id: nid(), text: t });
    this.draft = "";
    if (this.ta) this.ta.style.height = "44px";
    this.busy = true;
    this.bump();
    this.ws.send(JSON.stringify({ type: "prompt", text: t }));
  }

  private stop(): void {
    this.ws?.send(JSON.stringify({ type: "abort" }));
  }

  private newSession(): void {
    this.stop();
    this.entries = [];
    this.sessionTitle = "New chat";
    this.busy = false; this.working = "";
    this.drawerOpen = false;
  }

  private openSession(s: MockSession): void {
    this.entries = s.entries.map((e) => ({ ...e }));
    this.sessionTitle = s.title;
    this.drawerOpen = false;
    this.scrollSoon();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.send((e.target as HTMLTextAreaElement).value);
    }
  }

  static styles = css`
    * { box-sizing: border-box; }
    :host { display: flex; flex-direction: column; height: 100dvh; max-width: var(--pi-maxw); margin: 0 auto; }
    header {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px calc(12px);
      border-bottom: 1px solid var(--pi-divider);
      background: var(--pi-surface);
      position: sticky; top: 0; z-index: 2;
    }
    .logo { width: 30px; height: 30px; border-radius: 8px; background: var(--pi-primary); display: grid; place-items: center; color: #fff; font-weight: 700; }
    header .title { font-weight: 600; font-size: 16px; }
    header .sub { font-size: 12px; color: var(--pi-text-2); }
    header .spacer { flex: 1; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pi-ok); }
    .dot.off { background: var(--pi-danger); }
    .iconbtn { display: grid; place-items: center; width: 38px; height: 38px; border: none; background: transparent; color: var(--pi-text-2); border-radius: 10px; cursor: pointer; }
    .iconbtn:hover { background: var(--pi-surface-2); color: var(--pi-text); }
    .iconbtn svg { width: 22px; height: 22px; }

    .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 5; }
    .drawer {
      position: fixed; top: 0; left: 0; bottom: 0; width: 82%; max-width: 320px; z-index: 6;
      background: var(--pi-surface); border-right: 1px solid var(--pi-divider);
      padding: 16px 12px calc(16px + env(safe-area-inset-bottom));
      display: flex; flex-direction: column; gap: 4px; box-shadow: 2px 0 24px rgba(0, 0, 0, 0.25);
    }
    .drawer-head { font: 600 12px var(--pi-font); color: var(--pi-text-2); text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 8px 8px; }
    .newchat { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--pi-divider); background: var(--pi-bg); color: var(--pi-text); border-radius: 12px; cursor: pointer; font: 600 14px var(--pi-font); margin-bottom: 8px; }
    .newchat svg { width: 18px; height: 18px; }
    .newchat:hover { border-color: var(--pi-primary); }
    .sess { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 11px 14px; border: none; background: transparent; color: var(--pi-text); border-radius: 12px; cursor: pointer; text-align: left; width: 100%; }
    .sess:hover { background: var(--pi-surface-2); }
    .sess-t { font-size: 14px; font-weight: 500; }
    .sess-w { font-size: 12px; color: var(--pi-text-2); }

    .scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .row { display: flex; }
    .row.user { justify-content: flex-end; }
    .bubble { max-width: 86%; padding: 10px 14px; border-radius: var(--pi-radius); font-size: 15px; line-height: 1.55; }
    .user .bubble { background: var(--pi-user-bubble); color: var(--pi-text); border-bottom-right-radius: 6px; }
    .assistant .bubble { background: var(--pi-surface); border: 1px solid var(--pi-divider); border-bottom-left-radius: 6px; width: 100%; }
    .assistant .bubble p:first-child { margin-top: 0; } .assistant .bubble p:last-child { margin-bottom: 0; }
    .bubble :is(pre.code) { background: var(--pi-code-bg); padding: 10px 12px; border-radius: 8px; overflow-x: auto; font: 13px/1.5 var(--pi-mono); }
    .bubble code { font-family: var(--pi-mono); font-size: 0.92em; background: var(--pi-code-bg); padding: 1px 5px; border-radius: 5px; }
    .bubble a { color: var(--pi-primary); }
    .thinking { font-size: 12.5px; color: var(--pi-text-2); font-style: italic; border-left: 3px solid var(--pi-divider); padding-left: 8px; margin-bottom: 8px; white-space: pre-wrap; }
    .notice { align-self: center; font-size: 12px; color: var(--pi-text-2); background: var(--pi-surface-2); padding: 4px 12px; border-radius: 999px; }
    .working { display: flex; align-items: center; gap: 10px; color: var(--pi-text-2); font-size: 14px; padding-left: 4px; }
    md-circular-progress { --md-circular-progress-size: 20px; }

    .empty { margin: auto; text-align: center; color: var(--pi-text-2); max-width: 420px; }
    .empty h2 { color: var(--pi-text); font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 14px; }
    .chip { border: 1px solid var(--pi-divider); background: var(--pi-surface); color: var(--pi-text); border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
    .chip:hover { border-color: var(--pi-primary); }

    .composer {
      border-top: 1px solid var(--pi-divider); background: var(--pi-surface);
      padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
      display: flex; align-items: flex-end; gap: 10px;
    }
    textarea {
      flex: 1; resize: none; border: 1px solid var(--pi-divider); border-radius: 22px;
      height: 44px; min-height: 44px; max-height: 140px;
      padding: 10px 16px; line-height: 22px;
      font-family: var(--pi-font); font-size: 15px; background: var(--pi-bg); color: var(--pi-text);
      outline: none;
    }
    textarea:focus { border-color: var(--pi-primary); }
    .sendbtn {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
      display: grid; place-items: center; background: var(--pi-primary); color: #fff;
    }
    .sendbtn.stop { background: var(--pi-danger); }
    .sendbtn:disabled { opacity: 0.4; cursor: default; }
    .sendbtn svg { width: 20px; height: 20px; fill: currentColor; }
  `;

  private renderEntry(e: Entry) {
    if (e.kind === "user") return html`<div class="row user"><div class="bubble">${e.text}</div></div>`;
    if (e.kind === "notice") return html`<div class="notice">${e.text}</div>`;
    if (e.kind === "tool")
      return html`<div class="row assistant"><div style="width:100%"><pi-tool-block
        .toolName=${e.toolName} .args=${e.args} .running=${e.running} .isError=${e.isError} .result=${e.result}
      ></pi-tool-block></div></div>`;
    // assistant
    return html`<div class="row assistant"><div class="bubble">
      ${e.thinking ? html`<div class="thinking">${e.thinking}</div>` : nothing}
      ${unsafeHTML(renderMarkdown(e.text || (e.streaming ? "…" : "")))}
    </div></div>`;
  }

  render() {
    const empty = this.entries.length === 0;
    return html`
      ${this.drawerOpen
        ? html`
            <div class="scrim" @click=${() => { this.drawerOpen = false; }}></div>
            <aside class="drawer">
              <div class="drawer-head">Sessions</div>
              <button class="newchat" @click=${() => this.newSession()}>
                ${icon(mdiPlus, 18)}
                New chat
              </button>
              ${this.sessions.map(
                (s) => html`<button class="sess" @click=${() => this.openSession(s)}>
                  <span class="sess-t">${s.title}</span><span class="sess-w">${s.when}</span>
                </button>`,
              )}
            </aside>`
        : nothing}

      <header>
        <button class="iconbtn" @click=${() => { this.drawerOpen = true; }} title="Sessions" aria-label="Sessions">
          ${icon(mdiMenu, 22)}
        </button>
        <div class="logo">${icon(mdiRobot, 20)}</div>
        <div>
          <div class="title">Pi Agent</div>
          <div class="sub">${this.sessionTitle}</div>
        </div>
        <div class="spacer"></div>
        <button class="iconbtn" @click=${() => this.cycleTheme()} title="Theme: ${this.themeMode}" aria-label="Toggle theme">
          ${icon(this.themeIcon(), 22)}
        </button>
        <button class="iconbtn" @click=${() => this.newSession()} title="New chat" aria-label="New chat">
          ${icon(mdiPlus, 22)}
        </button>
        <div class="dot ${this.connected ? "" : "off"}" title=${this.connected ? "connected" : "reconnecting"}></div>
      </header>

      <div class="scroll">
        ${empty
          ? html`<div class="empty">
              <div class="logo" style="margin:0 auto 12px">${icon(mdiRobot, 20)}</div>
              <h2>How can I help with your home?</h2>
              <div>Ask about entities, automations, scripts, or the dashboard.</div>
              <div class="chips">
                ${["Show my lights", "Update the porch light script", "Turn off the kitchen light", "What can you do?"].map(
                  (c) => html`<button class="chip" @click=${() => this.send(c)}>${c}</button>`,
                )}
              </div>
            </div>`
          : this.entries.map((e) => this.renderEntry(e))}
        ${this.working
          ? html`<div class="working"><md-circular-progress indeterminate></md-circular-progress>${this.working}…</div>`
          : nothing}
      </div>

      <div class="composer">
        <textarea
          rows="1"
          placeholder="Message Pi Agent…"
          .value=${this.draft}
          @input=${(e: Event) => { const t = e.target as HTMLTextAreaElement; this.draft = t.value; t.style.height = "auto"; t.style.height = `${Math.min(Math.max(t.scrollHeight + 2, 44), 140)}px`; }}
          @keydown=${this.onKey}
        ></textarea>
        ${this.busy
          ? html`<button class="sendbtn stop" @click=${this.stop} title="Stop">${icon(mdiStop, 22)}</button>`
          : html`<button class="sendbtn" ?disabled=${!this.draft.trim()} @click=${() => this.send(this.draft)} title="Send">${icon(mdiSend, 20)}</button>`}
      </div>`;
  }
}
