/*
 * Locale-aware relative time. The extension emits raw ISO timestamps for
 * columns typed "reltime"; the UI formats them here in the user's language via
 * Intl.RelativeTimeFormat (no dictionary — the platform localizes for free).
 */
import { lang, type Lang } from "./i18n.js";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relTime(iso: string, l: Lang = lang): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  let diff = (Date.now() - then) / 1000;
  if (diff < 0) diff = 0;
  const rtf = new Intl.RelativeTimeFormat(l, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (diff >= secs || unit === "second") return rtf.format(-Math.floor(diff / secs), unit);
  }
  return rtf.format(0, "second");
}
