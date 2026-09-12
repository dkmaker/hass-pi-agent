/*
 * DA/NO/EN/SV/DE localisation for the web chat GUI.
 * Language follows the user's Home Assistant language (read from the parent HA
 * frame, same-origin under ingress), falling back to the browser language.
 * English is the default for any unsupported language.
 */
export type Lang = "da" | "no" | "en" | "sv" | "de";

function detectLang(): Lang {
  let l = "";
  try {
    if (window.parent && window.parent !== window) l = window.parent.document.documentElement.lang || "";
  } catch { /* cross-origin — ignore */ }
  if (!l) l = navigator.language || document.documentElement.lang || "";
  const p = l.toLowerCase();
  if (p.startsWith("da")) return "da";
  if (p.startsWith("nb") || p.startsWith("nn") || p.startsWith("no")) return "no";
  if (p.startsWith("sv")) return "sv";
  if (p.startsWith("de")) return "de";
  return "en";
}

export const lang: Lang = detectLang();

const EN: Record<string, string> = {
  sessions: "Sessions", new_chat: "New chat", setup_conventions: "Set up conventions",
  setup_wizard_sub: "/setup wizard", show_more: "Show more",
  empty_title: "How can I help with your home?",
  empty_sub: "Ask about entities, automations, scripts, or the dashboard.",
  chip_lights: "Show my lights", chip_porch: "Update the porch light script",
  chip_kitchen: "Turn off the kitchen light", chip_capabilities: "What can you do?",
  stat_entities: "Entities", stat_automations: "Automations", stat_scripts: "Scripts",
  stat_lights: "Lights", stat_sensors: "Sensors", stat_areas: "Areas",
  composer_placeholder: "Message Pi Agent…", thinking: "Thinking", stopped: "Stopped", theme: "Theme",
  cmd_new: "Start a new chat", cmd_sessions: "Open past sessions", cmd_setup: "Set up conventions",
  wiz_step_of: "Step {n} of {t}", wiz_review: "Review", wiz_back: "Back", wiz_next: "Next",
  wiz_save: "Save & finish", wiz_done_title: "You're all set",
  wiz_done_sub: "These conventions will guide how I name and organize things.", wiz_close: "Close",
  raw_info: "Raw request & response", req: "Request", resp: "Response",
};

const DA: Record<string, string> = {
  sessions: "Sessioner", new_chat: "Ny chat", setup_conventions: "Opsæt konventioner",
  setup_wizard_sub: "/setup-guide", show_more: "Vis flere",
  empty_title: "Hvordan kan jeg hjælpe med dit hjem?",
  empty_sub: "Spørg om entiteter, automatiseringer, scripts eller dashboardet.",
  chip_lights: "Vis mine lys", chip_porch: "Opdater scriptet til udendørslyset",
  chip_kitchen: "Sluk køkkenlyset", chip_capabilities: "Hvad kan du?",
  stat_entities: "Entiteter", stat_automations: "Automatiseringer", stat_scripts: "Scripts",
  stat_lights: "Lys", stat_sensors: "Sensorer", stat_areas: "Områder",
  composer_placeholder: "Skriv til Pi Agent…", thinking: "Tænker", stopped: "Stoppet", theme: "Tema",
  cmd_new: "Start en ny chat", cmd_sessions: "Åbn tidligere sessioner", cmd_setup: "Opsæt konventioner",
  wiz_step_of: "Trin {n} af {t}", wiz_review: "Gennemse", wiz_back: "Tilbage", wiz_next: "Næste",
  wiz_save: "Gem & afslut", wiz_done_title: "Så er du klar",
  wiz_done_sub: "Disse konventioner styrer, hvordan jeg navngiver og organiserer ting.", wiz_close: "Luk",
  raw_info: "Rå forespørgsel & svar", req: "Forespørgsel", resp: "Svar",
};

const NO: Record<string, string> = {
  sessions: "Økter", new_chat: "Ny chat", setup_conventions: "Sett opp konvensjoner",
  setup_wizard_sub: "/setup-veiviser", show_more: "Vis flere",
  empty_title: "Hvordan kan jeg hjelpe med hjemmet ditt?",
  empty_sub: "Spør om enheter, automasjoner, skript eller dashbordet.",
  chip_lights: "Vis lysene mine", chip_porch: "Oppdater skriptet for utelyset",
  chip_kitchen: "Slå av kjøkkenlyset", chip_capabilities: "Hva kan du?",
  stat_entities: "Enheter", stat_automations: "Automasjoner", stat_scripts: "Skript",
  stat_lights: "Lys", stat_sensors: "Sensorer", stat_areas: "Områder",
  composer_placeholder: "Skriv til Pi Agent…", thinking: "Tenker", stopped: "Stoppet", theme: "Tema",
  cmd_new: "Start en ny chat", cmd_sessions: "Åpne tidligere økter", cmd_setup: "Sett opp konvensjoner",
  wiz_step_of: "Trinn {n} av {t}", wiz_review: "Gjennomgå", wiz_back: "Tilbake", wiz_next: "Neste",
  wiz_save: "Lagre & fullfør", wiz_done_title: "Da er du klar",
  wiz_done_sub: "Disse konvensjonene styrer hvordan jeg navngir og organiserer ting.", wiz_close: "Lukk",
  raw_info: "Rå forespørsel & svar", req: "Forespørsel", resp: "Svar",
};

const SV: Record<string, string> = {
  sessions: "Sessioner", new_chat: "Ny chatt", setup_conventions: "Konfigurera konventioner",
  setup_wizard_sub: "/setup-guide", show_more: "Visa fler",
  empty_title: "Hur kan jag hjälpa till med ditt hem?",
  empty_sub: "Fråga om entiteter, automationer, skript eller dashboarden.",
  chip_lights: "Visa mina lampor", chip_porch: "Uppdatera skriptet för utomhusbelysningen",
  chip_kitchen: "Släck köksbelysningen", chip_capabilities: "Vad kan du göra?",
  stat_entities: "Entiteter", stat_automations: "Automationer", stat_scripts: "Skript",
  stat_lights: "Lampor", stat_sensors: "Sensorer", stat_areas: "Områden",
  composer_placeholder: "Skriv till Pi Agent…", thinking: "Tänker", stopped: "Stoppad", theme: "Tema",
  cmd_new: "Starta en ny chatt", cmd_sessions: "Öppna tidigare sessioner", cmd_setup: "Konfigurera konventioner",
  wiz_step_of: "Steg {n} av {t}", wiz_review: "Granska", wiz_back: "Tillbaka", wiz_next: "Nästa",
  wiz_save: "Spara & slutför", wiz_done_title: "Då är du klar",
  wiz_done_sub: "Dessa konventioner styr hur jag namnger och organiserar saker.", wiz_close: "Stäng",
  raw_info: "Rå förfrågan & svar", req: "Förfrågan", resp: "Svar",
};

const DE: Record<string, string> = {
  sessions: "Sitzungen", new_chat: "Neuer Chat", setup_conventions: "Konventionen einrichten",
  setup_wizard_sub: "/setup-Assistent", show_more: "Mehr anzeigen",
  empty_title: "Wie kann ich bei deinem Zuhause helfen?",
  empty_sub: "Frag nach Entitäten, Automationen, Skripten oder dem Dashboard.",
  chip_lights: "Zeige meine Lichter", chip_porch: "Aktualisiere das Skript für das Außenlicht",
  chip_kitchen: "Schalte das Küchenlicht aus", chip_capabilities: "Was kannst du?",
  stat_entities: "Entitäten", stat_automations: "Automationen", stat_scripts: "Skripte",
  stat_lights: "Lichter", stat_sensors: "Sensoren", stat_areas: "Bereiche",
  composer_placeholder: "Nachricht an Pi Agent…", thinking: "Denkt", stopped: "Gestoppt", theme: "Design",
  cmd_new: "Neuen Chat starten", cmd_sessions: "Frühere Sitzungen öffnen", cmd_setup: "Konventionen einrichten",
  wiz_step_of: "Schritt {n} von {t}", wiz_review: "Überprüfen", wiz_back: "Zurück", wiz_next: "Weiter",
  wiz_save: "Speichern & abschließen", wiz_done_title: "Alles bereit",
  wiz_done_sub: "Diese Konventionen bestimmen, wie ich Dinge benenne und organisiere.", wiz_close: "Schließen",
  raw_info: "Rohe Anfrage & Antwort", req: "Anfrage", resp: "Antwort",
};

const TABLE: Record<Lang, Record<string, string>> = { en: EN, da: DA, no: NO, sv: SV, de: DE };

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = TABLE[lang][key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
