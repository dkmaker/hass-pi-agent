/**
 * Minimal, escape-first markdown → HTML for the mock. Handles the common
 * assistant output: code fences, inline code, bold, italic, links, bullet
 * lists, and line breaks. Escapes HTML before applying any formatting.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderMarkdown(src: string): string {
  const fences: string[] = [];
  let s = src.replace(/```([\s\S]*?)```/g, (_m, code) => {
    fences.push(`<pre class="code"><code>${esc(code.replace(/^\n/, ""))}</code></pre>`);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });

  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // GFM pipe tables: header row, |---| separator, then body rows
  s = s.replace(/(?:^|\n)(\|[^\n]+\|\n\|[ :|-]+\|\n(?:\|[^\n]*\|(?:\n|$))*)/g, (_m, block: string) => {
    const rows = block.trim().split("\n");
    const cells = (r: string) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
    const head = cells(rows[0]).map((c) => `<th>${c}</th>`).join("");
    const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    return `\n<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>\n`;
  });

  // headings (#, ##, …, ######) — optional trailing #'s stripped
  s = s.replace(/^(#{1,6})\s+(.+?)\s*#*$/gm, (_m, h: string, txt: string) => `<h${h.length}>${txt}</h${h.length}>`);

  // bullet lists
  s = s.replace(/(?:^|\n)((?:- .*(?:\n|$))+)/g, (_m, block: string) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^- /, "")}</li>`)
      .join("");
    return `\n<ul>${items}</ul>`;
  });

  s = s.replace(/\n{2,}/g, "</p><p>");
  s = s.replace(/\n/g, "<br>");
  s = `<p>${s}</p>`;
  s = s.replace(/<p>(<ul>[\s\S]*?<\/ul>)<\/p>/g, "$1");
  s = s.replace(/<p>(<table>[\s\S]*?<\/table>)<\/p>/g, "$1");
  s = s.replace(/<br>(<table>)/g, "$1").replace(/(<\/table>)<br>/g, "$1");
  s = s.replace(/<p>(<h[1-6]>[\s\S]*?<\/h[1-6]>)<\/p>/g, "$1");
  s = s.replace(/<br>(<h[1-6]>)/g, "$1").replace(/(<\/h[1-6]>)<br>/g, "$1");
  s = s.replace(/\u0000FENCE(\d+)\u0000/g, (_m, i) => fences[Number(i)]);
  return s;
}
