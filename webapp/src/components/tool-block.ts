import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import "@material/web/progress/circular-progress.js";
import type { ToolResult } from "../types.js";

/** Per-tool render block: a titled card whose body depends on the result kind. */
@customElement("pi-tool-block")
export class PiToolBlock extends LitElement {
  @property() toolName = "";
  @property({ type: Object }) args: Record<string, unknown> = {};
  @property({ type: Boolean }) running = false;
  @property({ type: Boolean }) isError = false;
  @property({ type: Object }) result?: ToolResult;

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
      font: 600 13px/1.2 var(--pi-mono);
      color: var(--pi-text);
    }
    .head .name { color: var(--pi-primary); }
    .head .args { color: var(--pi-text-2); font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .head .spacer { flex: 1; }
    .body { padding: 10px 12px; font: 13px/1.5 var(--pi-font); }
    md-circular-progress { --md-circular-progress-size: 18px; }
    .badge { font: 600 11px/1 var(--pi-font); padding: 3px 7px; border-radius: 999px; }
    .badge.ok { background: color-mix(in srgb, var(--pi-ok) 18%, transparent); color: var(--pi-ok); }
    .badge.err { background: color-mix(in srgb, var(--pi-danger) 18%, transparent); color: var(--pi-danger); }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--pi-divider); }
    th { color: var(--pi-text-2); font-weight: 600; }
    td:first-child { font-family: var(--pi-mono); }
    .state-on { color: var(--pi-ok); font-weight: 600; }
    .state-off { color: var(--pi-text-2); }

    pre.diff { margin: 0; font: 12.5px/1.5 var(--pi-mono); background: var(--pi-code-bg); border-radius: 8px; padding: 8px 10px; overflow-x: auto; }
    .diff .add { color: var(--pi-ok); background: color-mix(in srgb, var(--pi-ok) 12%, transparent); display: block; }
    .diff .del { color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 12%, transparent); display: block; }
    .diff .ctx { color: var(--pi-text-2); display: block; }
    .kv { color: var(--pi-text-2); }
    .kv b { color: var(--pi-text); font-family: var(--pi-mono); }
  `;

  private argSummary(): string {
    const a = this.args ?? {};
    return Object.entries(a)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join("  ");
  }

  private renderBody(): TemplateResult | typeof nothing {
    if (this.running) return html`<span class="kv">Running…</span>`;
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
    return html`<span class="kv">${JSON.stringify(r.data)}</span>`;
  }

  render() {
    return html`
      <div class="card">
        <div class="head">
          <span class="name">${this.toolName}</span>
          <span class="args">${this.argSummary()}</span>
          <span class="spacer"></span>
          ${this.running
            ? html`<md-circular-progress indeterminate aria-label="running"></md-circular-progress>`
            : html`<span class="badge ${this.isError ? "err" : "ok"}">${this.isError ? "error" : "done"}</span>`}
        </div>
        <div class="body">${this.renderBody()}</div>
      </div>`;
  }
}
