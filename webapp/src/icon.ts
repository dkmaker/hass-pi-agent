import { html, type TemplateResult } from "lit";

/**
 * Render a Material Design Icon (from @mdi/js path data) as an inline SVG.
 * Same icon set Home Assistant uses. No icon font, no unicode/emoji — the path
 * fills with currentColor so it inherits the surrounding text color.
 */
export function icon(path: string, size = 24): TemplateResult {
  return html`<svg
    class="mdi"
    viewBox="0 0 24 24"
    width=${size}
    height=${size}
    aria-hidden="true"
    focusable="false"
  ><path fill="currentColor" d=${path}></path></svg>`;
}
