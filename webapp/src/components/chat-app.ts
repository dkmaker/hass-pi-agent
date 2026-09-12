import { LitElement, html, css, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import "../entity-chip.js";
import "@material/web/progress/circular-progress.js";
import "@material/web/button/filled-button.js";
import "@material/web/button/text-button.js";
import "./tool-block.js";
import "./policy-wizard.js";
import "./provider-setup.js";
import { icon } from "../icon.js";
import { mdiRobot, mdiMenu, mdiPlus, mdiSend, mdiStop, mdiThemeLightDark, mdiWeatherSunny, mdiWeatherNight, mdiCog, mdiHistory, mdiShapeOutline, mdiRobotOutline, mdiScriptTextOutline, mdiLightbulbOutline, mdiGauge, mdiFloorPlan } from "@mdi/js";
import { renderMarkdown } from "../md.js";
import { t as tr } from "../i18n.js";
import type { Entry, ServerEvent, ToolResult, StatsOverview, SessionMeta } from "../types.js";

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

/** Slash commands surfaced when the composer holds just "/". */
const COMMANDS: { cmd: string; desc: string; icon: string }[] = [
  { cmd: "/new", desc: tr("cmd_new"), icon: mdiPlus },
  { cmd: "/sessions", desc: tr("cmd_sessions"), icon: mdiHistory },
  { cmd: "/setup", desc: tr("cmd_setup"), icon: mdiCog },
];

@customElement("pi-chat-app")
export class PiChatApp extends LitElement {
  @state() private entries: Entry[] = [];
  @state() private busy = false;
  @state() private working = "";
  @state() private connected = false;
  @state() private draft = "";
  @state() private drawerOpen = false;
  @state() private sessionTitle = tr("new_chat");
  @state() private themeMode: "auto" | "light" | "dark" =
    ((typeof localStorage !== "undefined" && localStorage.getItem("pi-theme")) as "auto" | "light" | "dark") || "auto";
  @state() private policyOpen = false;
  @state() private configured?: boolean;
  @state() private configOpen = false;
  @state() private providers: import("../types.js").ProviderInfo[] = [];
  @state() private configProvider = "";
  @state() private configModel = "";
  @state() private configBusy = false;
  @state() private configError = "";
  @state() private stats?: StatsOverview;
  @state() private sessions: SessionMeta[] = [];
  @state() private sessionLimit = 12;
  @query(".scroll") private scroller?: HTMLElement;
  @query("textarea") private ta?: HTMLTextAreaElement;

  private ws?: WebSocket;

  private themePoll?: ReturnType<typeof setInterval>;

  connectedCallback(): void {
    super.connectedCallback();
    this.applyTheme();
    // Re-mirror HA's theme periodically while in auto, so it tracks HA theme
    // switches live. No-op when not embedded in HA (standalone mock).
    this.themePoll = setInterval(() => { if (this.themeMode === "auto") this.applyHaBridge(); }, 3000);
    this.connect();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.themePoll) clearInterval(this.themePoll);
  }

  private themeIcon(): string {
    return this.themeMode === "light" ? mdiWeatherSunny : this.themeMode === "dark" ? mdiWeatherNight : mdiThemeLightDark;
  }
  private static readonly BRIDGE_VARS = ["--pi-primary", "--pi-accent", "--pi-bg", "--pi-surface", "--pi-surface-2", "--pi-text", "--pi-text-2", "--pi-divider", "--pi-code-bg"];

  /**
   * Mirror Home Assistant's active theme into our tokens by reading the parent
   * ingress frame's CSS custom properties (same-origin). Returns false when not
   * embedded in HA or the frame isn't readable (standalone mock / cross-origin)
   * so the caller falls back to the built-in light/dark palette.
   */
  private applyHaBridge(): boolean {
    try {
      if (window.parent === window) return false; // not iframed
      const cs = getComputedStyle(window.parent.document.documentElement);
      const g = (v: string): string => cs.getPropertyValue(v).trim();
      const primary = g("--primary-color");
      if (!primary) return false; // no HA theme present
      const map: Record<string, string> = {
        "--pi-primary": primary,
        "--pi-accent": g("--accent-color") || primary,
        "--pi-bg": g("--primary-background-color") || g("--lovelace-background"),
        "--pi-surface": g("--card-background-color") || g("--ha-card-background"),
        "--pi-surface-2": g("--secondary-background-color"),
        "--pi-text": g("--primary-text-color"),
        "--pi-text-2": g("--secondary-text-color"),
        "--pi-divider": g("--divider-color"),
        "--pi-code-bg": g("--markdown-code-background-color") || g("--secondary-background-color"),
        "--pi-header-h": g("--header-height"),
      };
      const el = document.documentElement;
      for (const [k, v] of Object.entries(map)) if (v) el.style.setProperty(k, v);
      return true;
    } catch {
      return false; // cross-origin frame
    }
  }

  private applyTheme(): void {
    const el = document.documentElement;
    for (const k of PiChatApp.BRIDGE_VARS) el.style.removeProperty(k);
    if (this.themeMode === "auto") {
      el.removeAttribute("data-theme");
      this.applyHaBridge(); // follow HA when embedded; else CSS system fallback
    } else {
      el.setAttribute("data-theme", this.themeMode);
    }
  }
  private cycleTheme(): void {
    const order: Array<"auto" | "light" | "dark"> = ["auto", "light", "dark"];
    this.themeMode = order[(order.indexOf(this.themeMode) + 1) % order.length];
    try { localStorage.setItem("pi-theme", this.themeMode); } catch { /* ignore */ }
    this.applyTheme();
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Ingress-relative: the app may be served under /api/hassio_ingress/<token>/,
    // so build the WS URL from the current directory, not the host root.
    const base = location.pathname.replace(/\/[^/]*$/, "/");
    const url = `${proto}://${location.host}${base}ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.wsSend({ type: "list_sessions" }); };
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
      case "stats": this.stats = ev.data; break;
      case "config_status":
        this.configured = ev.data.configured;
        this.configProvider = ev.data.provider ?? this.configProvider;
        this.configModel = ev.data.model ?? this.configModel;
        break;
      case "providers": this.providers = ev.data; break;
      case "config_result":
        this.configBusy = false;
        if (ev.data.ok) { this.configOpen = false; this.configError = ""; }
        else this.configError = ev.data.error || "error";
        break;
      case "sessions": this.sessions = ev.data; break;
      case "session_title": this.sessionTitle = ev.title; this.wsSend({ type: "list_sessions" }); break;
      case "session_cleared": this.entries = []; this.sessionTitle = tr("new_chat"); this.busy = false; this.working = ""; this.bump(); break;
      case "history": this.entries = ev.data.map((e) => ({ ...e })); this.busy = false; this.working = ""; this.bump(); this.scrollSoon(); break;
      case "working": this.working = ev.label; break;
      case "message_start":
        this.entries.push({ kind: "assistant", id: nid(), text: "", thinking: "", streaming: true });
        this.working = ""; this.bump(); break;
      case "text_delta":
        if (this.last?.kind === "assistant") { this.last.text += ev.delta; this.bump(); } break;
      case "thinking_delta": break; // thinking content is hidden — the streaming bubble shows a "Thinking …" indicator
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
        this.entries.push({ kind: "notice", id: nid(), text: tr("stopped") });
        if (this.last?.kind === "assistant") (this.entries[this.entries.length - 2] as any).streaming = false;
        this.busy = false; this.working = ""; this.bump(); break;
    }
  }

  private clearDraft(): void {
    this.draft = "";
    if (this.ta) this.ta.style.height = "44px";
  }

  private onWizardComplete(e: CustomEvent): void {
    this.policyOpen = false;
    const summary = (e.detail?.summary as { topic: string; choice: string }[]) ?? [];
    const lines = summary.map((s) => `- ${s.topic}: ${s.choice}`).join("\n");
    // Persist the chosen conventions for real: ask the agent to map them onto the
    // correct ha_policies categories (naming / organization / automations / language)
    // and save them via ha_policies action:set.
    const prompt =
      "Save these Home Assistant conventions to my policies using the ha_policies tool " +
      "(action:set), mapping each choice onto the correct category (naming, organization, " +
      "automations, language). Then confirm briefly what you saved.\n\n" + lines;
    this.send(prompt);
  }

  private onEntityClick(e: CustomEvent): void {
    const id = e.detail?.entityId as string | undefined;
    if (id) this.send(`Show details for entity ${id}`);
  }

  private send(text: string): void {
    const t = text.trim();
    if (!t) return;
    const cmd = t.toLowerCase();
    if (cmd === "/setup") { this.policyOpen = true; this.clearDraft(); return; }
    if (cmd === "/new") { this.newSession(); this.clearDraft(); return; }
    if (cmd === "/sessions") { this.openDrawer(); this.clearDraft(); return; }
    if (this.busy || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.entries.push({ kind: "user", id: nid(), text: t });
    if (this.sessionTitle === tr("new_chat")) this.sessionTitle = t.length > 60 ? t.slice(0, 60) + "\u2026" : t;
    this.clearDraft();
    this.busy = true;
    this.bump();
    this.ws.send(JSON.stringify({ type: "prompt", text: t }));
  }

  private stop(): void {
    this.ws?.send(JSON.stringify({ type: "abort" }));
  }

  private wsSend(o: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }

  private openDrawer(): void {
    this.drawerOpen = true;
    this.sessionLimit = 12;
    this.wsSend({ type: "list_sessions" });
  }

  private newSession(): void {
    this.stop();
    this.entries = [];
    this.sessionTitle = tr("new_chat");
    this.busy = false; this.working = "";
    this.drawerOpen = false;
    this.wsSend({ type: "new_session" });
  }

  private openSession(s: SessionMeta): void {
    this.stop();
    this.entries = [];
    this.sessionTitle = s.title;
    this.drawerOpen = false;
    this.wsSend({ type: "open_session", path: s.path });
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
      height: var(--pi-header-h, 56px); box-sizing: border-box;
      padding: 0 16px;
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

    .scroll { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
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
    .thinking-ind { display: inline-flex; align-items: baseline; gap: 1px; padding: 2px 6px; font-size: 13px; color: var(--pi-text-2); font-style: italic; }
    .thinking-ind .dots { display: inline-flex; font-style: normal; }
    .thinking-ind .dots i { animation: pi-blink 1.2s infinite both; }
    .thinking-ind .dots i:nth-child(2) { animation-delay: .2s; }
    .thinking-ind .dots i:nth-child(3) { animation-delay: .4s; }
    @keyframes pi-blink { 0%, 80%, 100% { opacity: .2 } 40% { opacity: 1 } }

    .bubble h1, .bubble h2, .bubble h3, .bubble h4 { margin: 12px 0 4px; line-height: 1.25; font-weight: 700; color: var(--pi-text); }
    .bubble h1 { font-size: 1.35em; } .bubble h2 { font-size: 1.18em; } .bubble h3 { font-size: 1.05em; } .bubble h4 { font-size: 1em; }
    .bubble h1:first-child, .bubble h2:first-child, .bubble h3:first-child, .bubble h4:first-child { margin-top: 0; }
    .bubble table { border-collapse: collapse; font-size: 12.5px; display: block; overflow-x: auto; max-width: 100%; margin: 4px 0; }
    .bubble th, .bubble td { text-align: left; padding: 5px 9px; border-bottom: 1px solid var(--pi-divider); white-space: nowrap; }
    .bubble th { color: var(--pi-text-2); font-weight: 600; }
    .bubble td:first-child { font-family: var(--pi-mono); }
    .empty { margin: auto; text-align: center; color: var(--pi-text-2); max-width: 420px; }
    .empty h2 { color: var(--pi-text); font-weight: 600; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 14px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--pi-divider); background: var(--pi-surface); color: var(--pi-text); border-radius: 999px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
    .chip svg { width: 16px; height: 16px; }
    .chip:hover { border-color: var(--pi-primary); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 22px; }
    .stat { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 6px; background: var(--pi-surface-2); border: 1px solid var(--pi-divider); border-radius: 12px; }
    .stat .ic { color: var(--pi-text-2); display: grid; }
    .stat .ic svg { width: 18px; height: 18px; }
    .stat .num { font-size: 21px; font-weight: 700; color: var(--pi-text); line-height: 1.05; }
    .stat .lbl { font-size: 11px; color: var(--pi-text-2); }

    .cmd-menu { margin: 0 12px 8px; background: var(--pi-surface); border: 1px solid var(--pi-divider); border-radius: 14px; overflow: hidden; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18); }
    .cmd { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: none; background: transparent; color: var(--pi-text); cursor: pointer; text-align: left; }
    .cmd:hover { background: var(--pi-surface-2); }
    .cmd + .cmd { border-top: 1px solid var(--pi-divider); }
    .cmd svg { width: 20px; height: 20px; color: var(--pi-text-2); flex: 0 0 auto; }
    .cmd-t { display: flex; flex-direction: column; }
    .cmd-t b { font-size: 14px; font-family: var(--pi-mono); }
    .cmd-d { font-size: 12px; color: var(--pi-text-2); }

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

  private statCard(path: string, n: number, label: string) {
    return html`<div class="stat"><span class="ic">${icon(path, 18)}</span><span class="num">${n}</span><span class="lbl">${label}</span></div>`;
  }

  private renderEntry(e: Entry) {
    if (e.kind === "user") return html`<div class="row user"><div class="bubble">${e.text}</div></div>`;
    if (e.kind === "notice") return html`<div class="notice">${e.text}</div>`;
    if (e.kind === "tool")
      return html`<div class="row assistant"><div style="width:100%"><pi-tool-block
        .toolName=${e.toolName} .args=${e.args} .running=${e.running} .isError=${e.isError} .result=${e.result}
      ></pi-tool-block></div></div>`;
    // assistant
    if (!e.text && !e.streaming) return nothing;
    // Thinking indicator — no bubble, sits directly on the background, small + italic; gone once text arrives
    if (!e.text) return html`<div class="row assistant"><span class="thinking-ind">${tr("thinking")}<span class="dots"><i>.</i><i>.</i><i>.</i></span></span></div>`;
    return html`<div class="row assistant"><div class="bubble">${unsafeHTML(renderMarkdown(e.text))}</div></div>`;
  }

  render() {
    const empty = this.entries.length === 0;
    return html`
      <pi-policy-wizard
        .open=${this.policyOpen}
        @wizard-close=${() => { this.policyOpen = false; }}
        @wizard-complete=${(e: CustomEvent) => this.onWizardComplete(e)}
      ></pi-policy-wizard>

      <pi-provider-setup
        .open=${this.configured === false || this.configOpen}
        .mustConfigure=${this.configured === false && !this.configOpen}
        .providers=${this.providers}
        .initialProvider=${this.configProvider}
        .initialModel=${this.configModel}
        .busy=${this.configBusy}
        .error=${this.configError}
        @request-providers=${() => this.wsSend({ type: "list_providers" })}
        @save-config=${(e: CustomEvent) => { this.configBusy = true; this.configError = ""; this.wsSend({ type: "save_config", ...e.detail }); }}
        @setup-close=${() => { this.configOpen = false; this.configError = ""; }}
      ></pi-provider-setup>

      ${this.drawerOpen
        ? html`
            <div class="scrim" @click=${() => { this.drawerOpen = false; }}></div>
            <aside class="drawer">
              <div class="drawer-head">${tr("sessions")}</div>
              <button class="newchat" @click=${() => this.newSession()}>
                ${icon(mdiPlus, 18)}
                ${tr("new_chat")}
              </button>
              <button class="sess" @click=${() => { this.policyOpen = true; this.drawerOpen = false; }}>
                <span class="sess-t">${tr("setup_conventions")}</span><span class="sess-w">${tr("setup_wizard_sub")}</span>
              </button>
              ${this.sessions.slice(0, this.sessionLimit).map(
                (s) => html`<button class="sess" @click=${() => this.openSession(s)}>
                  <span class="sess-t">${s.title}</span><span class="sess-w">${s.when}</span>
                </button>`,
              )}
              ${this.sessions.length > this.sessionLimit
                ? html`<button class="sess morebtn" @click=${() => { this.sessionLimit += 12; }}>
                    <span class="sess-t">${tr("show_more")} (${this.sessions.length - this.sessionLimit})</span>
                  </button>`
                : nothing}
            </aside>`
        : nothing}

      <header>
        <button class="iconbtn" @click=${() => this.openDrawer()} title="${tr("sessions")}" aria-label="${tr("sessions")}">
          ${icon(mdiMenu, 22)}
        </button>
        <div class="logo">${icon(mdiRobot, 20)}</div>
        <div>
          <div class="title">Pi Agent</div>
          <div class="sub">${this.sessionTitle}</div>
        </div>
        <div class="spacer"></div>
        <button class="iconbtn" @click=${() => { this.configOpen = true; }} title="${tr("ai_settings")}" aria-label="${tr("ai_settings")}">
          ${icon(mdiCog, 22)}
        </button>
        <button class="iconbtn" @click=${() => this.cycleTheme()} title="${tr("theme")}: ${this.themeMode}" aria-label="Toggle theme">
          ${icon(this.themeIcon(), 22)}
        </button>
        <button class="iconbtn" @click=${() => this.newSession()} title="New chat" aria-label="New chat">
          ${icon(mdiPlus, 22)}
        </button>
        <div class="dot ${this.connected ? "" : "off"}" title=${this.connected ? "connected" : "reconnecting"}></div>
      </header>

      <div class="scroll" @entity-click=${(e: CustomEvent) => this.onEntityClick(e)}>
        ${empty
          ? html`<div class="empty">
              <div class="logo" style="margin:0 auto 12px">${icon(mdiRobot, 20)}</div>
              <h2>${tr("empty_title")}</h2>
              <div>${tr("empty_sub")}</div>
              <div class="chips">
                ${[tr("chip_lights"), tr("chip_porch"), tr("chip_kitchen"), tr("chip_capabilities")].map(
                  (c) => html`<button class="chip" @click=${() => this.send(c)}>${c}</button>`,
                )}
              </div>
              <div class="chips" style="margin-top: 6px">
                <button class="chip" @click=${() => { this.policyOpen = true; }}>${icon(mdiCog, 16)} ${tr("setup_conventions")}</button>
              </div>
              ${this.stats
                ? html`<div class="stats">
                    ${this.statCard(mdiShapeOutline, this.stats.entities, tr("stat_entities"))}
                    ${this.statCard(mdiRobotOutline, this.stats.automations, tr("stat_automations"))}
                    ${this.statCard(mdiScriptTextOutline, this.stats.scripts, tr("stat_scripts"))}
                    ${this.statCard(mdiLightbulbOutline, this.stats.lights, tr("stat_lights"))}
                    ${this.statCard(mdiGauge, this.stats.sensors, tr("stat_sensors"))}
                    ${this.statCard(mdiFloorPlan, this.stats.areas, tr("stat_areas"))}
                  </div>`
                : nothing}
            </div>`
          : this.entries.map((e) => this.renderEntry(e))}
        ${this.working
          ? html`<div class="working"><md-circular-progress indeterminate></md-circular-progress>${this.working}…</div>`
          : nothing}
      </div>

      ${this.draft.trim() === "/"
        ? html`<div class="cmd-menu">
            ${COMMANDS.map(
              (c) => html`<button class="cmd" @click=${() => this.send(c.cmd)}>
                ${icon(c.icon, 20)}
                <span class="cmd-t"><b>${c.cmd}</b><span class="cmd-d">${c.desc}</span></span>
              </button>`,
            )}
          </div>`
        : nothing}

      <div class="composer">
        <textarea
          rows="1"
          placeholder="${tr("composer_placeholder")}"
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
