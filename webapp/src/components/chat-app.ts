import { LitElement, html, css, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/text-button.js";
import "./tool-block.js";
import { renderMarkdown } from "../md.js";
import type { Entry, ServerEvent, ToolResult } from "../types.js";

let idc = 0;
const nid = () => `e${++idc}`;

@customElement("pi-chat-app")
export class PiChatApp extends LitElement {
  @state() private entries: Entry[] = [];
  @state() private busy = false;
  @state() private working = "";
  @state() private connected = false;
  @state() private draft = "";
  @query(".scroll") private scroller?: HTMLElement;

  private ws?: WebSocket;

  connectedCallback(): void {
    super.connectedCallback();
    this.connect();
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
    this.busy = true;
    this.bump();
    this.ws.send(JSON.stringify({ type: "prompt", text: t }));
  }

  private stop(): void {
    this.ws?.send(JSON.stringify({ type: "abort" }));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.send((e.target as HTMLTextAreaElement).value);
    }
  }

  static styles = css`
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
      padding: 11px 16px; font: 15px/1.4 var(--pi-font); background: var(--pi-bg); color: var(--pi-text);
      max-height: 140px; outline: none;
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
      <header>
        <div class="logo">π</div>
        <div>
          <div class="title">Pi Agent</div>
          <div class="sub">Home Assistant · mock</div>
        </div>
        <div class="spacer"></div>
        <div class="dot ${this.connected ? "" : "off"}" title=${this.connected ? "connected" : "reconnecting"}></div>
      </header>

      <div class="scroll">
        ${empty
          ? html`<div class="empty">
              <div class="logo" style="margin:0 auto 12px">π</div>
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
          @input=${(e: Event) => { const t = e.target as HTMLTextAreaElement; this.draft = t.value; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 140)}px`; }}
          @keydown=${this.onKey}
        ></textarea>
        ${this.busy
          ? html`<button class="sendbtn stop" @click=${this.stop} title="Stop">
              <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>`
          : html`<button class="sendbtn" ?disabled=${!this.draft.trim()} @click=${() => this.send(this.draft)} title="Send">
              <svg viewBox="0 0 24 24"><path d="M4 20l16-8L4 4v6l10 2-10 2z" /></svg>
            </button>`}
      </div>`;
  }
}
