import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "@material/web/progress/circular-progress.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { icon } from "../icon.js";
import { renderMarkdown } from "../md.js";
import { mdiCheck, mdiAlertCircle, mdiInformationOutline, mdiClose, mdiChevronRight, mdiChevronDown } from "@mdi/js";
import type { ToolResult, ToolDetails, ToolCol, ToolRow } from "../types.js";
import { toolMeta } from "../tool-meta.js";
import { t as tr, col } from "../i18n.js";
import { relTime } from "../reltime.js";
import "../ha-icons.js";
import "../entity-chip.js";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Per-tool render block: a titled card whose body depends on the result kind. */
@customElement("pi-tool-block")
export class PiToolBlock extends LitElement {
  @property() toolName = "";
  @property({ type: Object }) args: Record<string, unknown> = {};
  @property({ type: Boolean }) running = false;
  @property({ type: Boolean }) isError = false;
  @property({ type: Object }) result?: ToolResult;
  @state() private showRaw = false;
  @state() private open = false;

  static styles = css`
    * { box-sizing: border-box; }
    :host { display: block; }
    .card {
      border: 1px solid var(--pi-divider);
      background: var(--pi-surface);
      border-radius: var(--pi-radius-sm);
      overflow: hidden;
      margin: 6px 0;
    }
    .head {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px;
      background: var(--pi-surface-2);
      font: 600 13.5px/1.2 var(--pi-font);
      color: var(--pi-text);
    }
    .head { cursor: pointer; user-select: none; }
    .head > svg { width: 17px; height: 17px; color: var(--pi-primary); flex: 0 0 auto; }
    .head .name { color: var(--pi-text); font-weight: 600; flex: 0 0 auto; }
    .head .reason { color: var(--pi-text-2); font: 400 12.5px/1.2 var(--pi-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; min-width: 0; }
    .head .args { color: var(--pi-text-2); font: 400 12px/1.2 var(--pi-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .head .spacer { flex: 1; }
    .chev { display: grid; place-items: center; color: var(--pi-text-2); flex: 0 0 auto; }
    .chev svg { width: 18px; height: 18px; }
    .body { padding: 10px 12px; font: 13px/1.5 var(--pi-font); }
    md-circular-progress { --md-circular-progress-size: 18px; }
    .badge { display: inline-flex; align-items: center; gap: 4px; font: 600 11px/1 var(--pi-font); padding: 4px 8px; border-radius: 999px; }
    .badge svg { width: 13px; height: 13px; }
    .badge.ok { background: color-mix(in srgb, var(--pi-ok) 18%, transparent); color: var(--pi-ok); }
    .badge.err { background: color-mix(in srgb, var(--pi-danger) 18%, transparent); color: var(--pi-danger); }
    .ibtn { display: grid; place-items: center; width: 26px; height: 26px; border: none; background: transparent; color: var(--pi-text-2); border-radius: 8px; cursor: pointer; flex: 0 0 auto; }
    .ibtn:hover { background: var(--pi-surface); color: var(--pi-text); }
    .ibtn svg { width: 16px; height: 16px; }
    .rawscrim { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 20; display: grid; place-items: center; padding: 16px; }
    .rawmodal { width: 100%; max-width: 640px; max-height: 88dvh; display: flex; flex-direction: column; background: var(--pi-surface); border: 1px solid var(--pi-divider); border-radius: 16px; overflow: hidden; }
    .rawhead { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--pi-divider); }
    .rawtitle { font: 600 14px var(--pi-font); color: var(--pi-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rawbody { padding: 12px 14px; overflow-y: auto; }
    .rawsec { font: 600 11px var(--pi-font); text-transform: uppercase; letter-spacing: 0.05em; color: var(--pi-text-2); margin: 4px 0 6px; }
    pre.json { margin: 0 0 14px; background: var(--pi-code-bg); border-radius: 8px; padding: 10px 12px; overflow-x: auto; font: 12.5px/1.5 var(--pi-mono); color: var(--pi-text); white-space: pre-wrap; word-break: break-word; }
    .j-key { color: var(--pi-primary); } .j-str { color: var(--pi-ok); } .j-num { color: var(--pi-accent); } .j-bool { color: var(--pi-accent); } .j-null { color: var(--pi-text-2); }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--pi-divider); }
    th { color: var(--pi-text-2); font-weight: 600; }
    td:first-child { font-family: var(--pi-mono); }
    .state-on { color: var(--pi-ok); font-weight: 600; }
    .state-off { color: var(--pi-text-2); }
    .ricon { color: var(--pi-text); margin-right: 6px; font-size: 15px; flex: 0 0 auto; }
    .elink { display: inline-flex; align-items: center; gap: 2px; border: none; background: transparent; color: var(--pi-primary); cursor: pointer; font: inherit; font-family: var(--pi-mono); padding: 0; text-align: left; }
    .elink:hover { text-decoration: underline; }
    .firstc { display: inline-flex; align-items: center; }
    .tnote { color: var(--pi-text-2); font-size: 12px; margin-top: 6px; }
    .tlist { margin: 4px 0; padding-left: 18px; }

    pre.diff { margin: 0; font: 12.5px/1.5 var(--pi-mono); background: var(--pi-code-bg); border-radius: 8px; padding: 8px 10px; overflow-x: auto; }
    .diff .add { color: var(--pi-ok); background: color-mix(in srgb, var(--pi-ok) 12%, transparent); display: block; }
    .diff .del { color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 12%, transparent); display: block; }
    .diff .ctx { color: var(--pi-text-2); display: block; }
    .kv { color: var(--pi-text-2); }
    .kv b { color: var(--pi-text); font-family: var(--pi-mono); }
    .md p { margin: 0 0 6px; } .md p:last-child { margin: 0; }
    .md pre.code { background: var(--pi-code-bg); border-radius: 8px; padding: 8px 10px; overflow-x: auto; font: 12.5px/1.5 var(--pi-mono); }
    .md code { font-family: var(--pi-mono); }
    .md ul { margin: 4px 0; padding-left: 18px; }
    .md table { margin: 4px 0; display: block; overflow-x: auto; max-width: 100%; white-space: nowrap; }
    .md h1, .md h2, .md h3, .md h4 { margin: 8px 0 4px; font-weight: 700; line-height: 1.25; }
    .md h1 { font-size: 1.2em; } .md h2 { font-size: 1.1em; } .md h3 { font-size: 1.02em; }
  `;

  private argSummary(): string {
    const a = this.args ?? {};
    return Object.entries(a)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join("  ");
  }

  private renderBody(): TemplateResult | typeof nothing {
    if (this.running) return html`<span class="kv">${tr("t_running")}</span>`;
    const r = this.result;
    if (!r) return nothing;
    if (r.kind === "entities") {
      const d = r.data as { columns: string[]; rows: string[][] };
      return html`
        <table>
          <thead><tr>${d.columns.map((c) => html`<th>${c}</th>`)}</tr></thead>
          <tbody>
            ${d.rows.map(
              (row) => html`<tr>${row.map((cell, i) =>
                i === 1
                  ? html`<td class=${cell === "on" ? "state-on" : "state-off"}>${cell}</td>`
                  : html`<td>${cell}</td>`,
              )}</tr>`,
            )}
          </tbody>
        </table>`;
    }
    if (r.kind === "yaml_diff") {
      const d = r.data as { file: string; diff: { t: string; s: string }[] };
      return html`
        <div class="kv" style="margin-bottom:6px">${d.file}</div>
        <pre class="diff">${d.diff.map((l) =>
          html`<span class=${l.t}>${l.t === "add" ? "+ " : l.t === "del" ? "- " : "  "}${l.s}</span>`,
        )}</pre>`;
    }
    if (r.kind === "service") {
      const d = r.data as { domain: string; service: string; target: string; ok: boolean };
      return html`<div class="kv">Called <b>${d.domain}.${d.service}</b> on <b>${d.target}</b> — ${d.ok ? "success" : "failed"}.</div>`;
    }
    if (r.kind === "details" && r.details) return this.renderDetails(r.details);
    // Generic fallback: HA tools already emit human-formatted markdown
    // (tables/lists/code) — render it as markdown rather than dumping raw JSON.
    const text = typeof r.data === "string" ? r.data : "```json\n" + JSON.stringify(r.data, null, 2) + "\n```";
    return html`<div class="md">${unsafeHTML(renderMarkdown(text))}</div>`;
  }

  private emitEntity(entityId: string): void {
    this.dispatchEvent(new CustomEvent("entity-click", { detail: { entityId }, bubbles: true, composed: true }));
  }

  private cell(c: ToolCol, row: ToolRow, first: boolean): TemplateResult {
    const val = row.cells[c.key] ?? "";
    if (first) {
      const inner = html`${row.icon ? html`<ha-mdi-icon class="ricon" icon=${row.icon}></ha-mdi-icon>` : nothing}<span>${val}</span>`;
      return row.entity_id
        ? html`<td><button class="elink" title=${row.entity_id} @click=${() => this.emitEntity(row.entity_id!)}>${inner}</button></td>`
        : html`<td><span class="firstc">${inner}</span></td>`;
    }
    if (c.type === "reltime") return html`<td>${val ? relTime(val) : "—"}</td>`;
    if (c.key === "state") return html`<td class=${val === "on" || val === "home" ? "state-on" : "state-off"}>${val}</td>`;
    return html`<td>${val}</td>`;
  }

  private tableFooter(d: Extract<ToolDetails, { kind: "table" }>): TemplateResult | typeof nothing {
    if (d.page) {
      const { offset, limit, total, hidden } = d.page;
      const shownAll = total <= limit && offset === 0;
      let txt = shownAll
        ? tr("tbl_count", { n: total })
        : tr("tbl_showing", { a: offset + 1, b: Math.min(offset + limit, total), t: total });
      if (hidden) txt += " " + tr("tbl_hidden", { n: hidden });
      return html`<div class="tnote">${txt}</div>`;
    }
    return d.note ? html`<div class="tnote">${d.note}</div>` : nothing;
  }

  private renderDetails(d: ToolDetails): TemplateResult {
    if (d.kind === "table") {
      return html`
        <table>
          <thead><tr>${d.columns.map((c) => html`<th>${col(c.label)}</th>`)}</tr></thead>
          <tbody>${d.rows.map((row) => html`<tr>${d.columns.map((c, i) => this.cell(c, row, i === 0))}</tr>`)}</tbody>
        </table>
        ${this.tableFooter(d)}`;
    }
    if (d.kind === "detail") {
      return html`<table><tbody>${d.fields.map((f) => html`<tr><th>${col(f.label)}</th><td>${f.value}</td></tr>`)}</tbody></table>`;
    }
    if (d.kind === "list") {
      return html`<ul class="tlist">${d.items.map((it) => html`<li>${it}</li>`)}</ul>${d.note ? html`<div class="tnote">${d.note}</div>` : nothing}`;
    }
    return html`<div class="md">${unsafeHTML(renderMarkdown(d.text))}</div>`;
  }

  render() {
    const meta = toolMeta(this.toolName);
    const reason = typeof this.args?.reason === "string" ? (this.args.reason as string) : "";
    return html`
      <div class="card">
        <div class="head" role="button" aria-expanded=${this.open ? "true" : "false"}
             title=${this.open ? tr("collapse") : tr("expand")}
             @click=${() => { this.open = !this.open; }}>
          <span class="chev">${icon(this.open ? mdiChevronDown : mdiChevronRight, 18)}</span>
          ${icon(meta.icon, 17)}
          <span class="name" title=${meta.desc}>${meta.label}</span>
          ${reason ? html`<span class="reason">${reason}</span>` : html`<span class="spacer"></span>`}
          <button class="ibtn" title=${tr("raw_info")} aria-label=${tr("raw_info")} @click=${(e: Event) => { e.stopPropagation(); this.showRaw = true; }}>${icon(mdiInformationOutline, 16)}</button>
          ${this.running
            ? html`<md-circular-progress indeterminate aria-label="running"></md-circular-progress>`
            : html`<span class="badge ${this.isError ? "err" : "ok"}">${icon(this.isError ? mdiAlertCircle : mdiCheck, 13)}${this.isError ? tr("t_error") : tr("t_done")}</span>`}
        </div>
        ${this.open ? html`<div class="body">${this.renderBody()}</div>` : nothing}
      </div>
      ${this.showRaw ? this.renderRaw() : nothing}`;
  }

  private renderRaw(): TemplateResult {
    const reqJson = this.hljson(this.args ?? {});
    const resp = this.result?.data;
    const respHtml = typeof resp === "string" ? escapeHtml(resp) : this.hljson(resp ?? null);
    return html`
      <div class="rawscrim" @click=${(e: Event) => { if (e.target === e.currentTarget) this.showRaw = false; }}>
        <div class="rawmodal">
          <div class="rawhead">
            <span class="rawtitle">${toolMeta(this.toolName).label} · ${this.toolName}</span>
            <span class="spacer"></span>
            <button class="ibtn" aria-label=${tr("wiz_close")} @click=${() => { this.showRaw = false; }}>${icon(mdiClose, 20)}</button>
          </div>
          <div class="rawbody">
            <div class="rawsec">${tr("req")}</div>
            <pre class="json">${unsafeHTML(reqJson)}</pre>
            <div class="rawsec">${tr("resp")}</div>
            <pre class="json">${unsafeHTML(respHtml)}</pre>
          </div>
        </div>
      </div>`;
  }

  private hljson(v: unknown): string {
    const json = JSON.stringify(v, null, 2) ?? "null";
    return json
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (m) => {
        let cls = "num";
        if (/^"/.test(m)) cls = /:$/.test(m) ? "key" : "str";
        else if (/true|false/.test(m)) cls = "bool";
        else if (/null/.test(m)) cls = "null";
        return `<span class="j-${cls}">${m}</span>`;
      });
  }
}
