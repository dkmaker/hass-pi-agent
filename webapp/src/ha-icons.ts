/*
 * Resolve MDI icon SVG paths from Home Assistant's own /static/mdi chunks.
 * Same-origin under ingress; chunk filenames are content-hashed → cached by the
 * browser forever. No icons are bundled in this app. Unknown/failed → no icon.
 *
 * <ha-mdi-icon icon="mdi:fridge"> renders the resolved SVG (async).
 */
import { LitElement, html, css, svg, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

type Part = { start?: string; file: string };

let metaPromise: Promise<Part[]> | null = null;
const chunkCache = new Map<string, Promise<Record<string, string>>>();
const pathCache = new Map<string, string | null>();

function loadMeta(): Promise<Part[]> {
  if (!metaPromise) {
    metaPromise = fetch("/static/mdi/iconMetadata.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m) => (m.parts as Part[]) ?? [])
      .catch(() => []);
  }
  return metaPromise;
}

function chunkFor(parts: Part[], name: string): string | null {
  let last: Part | null = null;
  for (const c of parts) {
    if (c.start !== undefined && name < c.start) break;
    last = c;
  }
  return last?.file ?? null;
}

function loadChunk(file: string): Promise<Record<string, string>> {
  let p = chunkCache.get(file);
  if (!p) {
    p = fetch(`/static/mdi/${file}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    chunkCache.set(file, p);
  }
  return p;
}

/** Resolve a bare or "mdi:"-prefixed icon name to its SVG path data (or null). */
export async function resolveIcon(name: string): Promise<string | null> {
  const n = name.replace(/^mdi:/, "").trim();
  if (!n) return null;
  if (pathCache.has(n)) return pathCache.get(n)!;
  const parts = await loadMeta();
  if (!parts.length) return null;
  const file = chunkFor(parts, n);
  if (!file) { pathCache.set(n, null); return null; }
  const icons = await loadChunk(file);
  const path = icons[n] ?? null;
  pathCache.set(n, path);
  return path;
}

@customElement("ha-mdi-icon")
export class HaMdiIcon extends LitElement {
  @property() icon = "";
  @state() private _path: string | null = null;

  static styles = css`
    :host { display: inline-flex; width: 1em; height: 1em; vertical-align: -0.125em; }
    svg { width: 100%; height: 100%; fill: currentColor; }
  `;

  updated(changed: Map<string, unknown>): void {
    if (changed.has("icon")) {
      this._path = null;
      const want = this.icon;
      if (want) void resolveIcon(want).then((p) => { if (this.icon === want) this._path = p; });
    }
  }

  render(): TemplateResult | typeof nothing {
    if (!this._path) return nothing;
    return html`<svg viewBox="0 0 24 24"><path d=${this._path}></path></svg>`;
  }
}
