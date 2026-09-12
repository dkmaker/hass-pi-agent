/*
 * Lightweight DA/EN localisation for the web chat GUI.
 * Language = Danish when the user's Home Assistant (or browser) language is
 * Danish, English otherwise. Detected once at load from the parent HA frame
 * (same-origin under ingress), falling back to the browser language.
 */
export type Lang = "da" | "en";

function detectLang(): Lang {
  let l = "";
  try {
    if (window.parent && window.parent !== window) l = window.parent.document.documentElement.lang || "";
  } catch { /* cross-origin — ignore */ }
  if (!l) l = navigator.language || document.documentElement.lang || "";
  return l.toLowerCase().startsWith("da") ? "da" : "en";
}

export const lang: Lang = detectLang();

const EN: Record<string, string> = {
  sessions: "Sessions",
  new_chat: "New chat",
  setup_conventions: "Set up conventions",
  setup_wizard_sub: "/setup wizard",
  show_more: "Show more",
  empty_title: "How can I help with your home?",
  empty_sub: "Ask about entities, automations, scripts, or the dashboard.",
  chip_lights: "Show my lights",
  chip_porch: "Update the porch light script",
  chip_kitchen: "Turn off the kitchen light",
  chip_capabilities: "What can you do?",
  stat_entities: "Entities",
  stat_automations: "Automations",
  stat_scripts: "Scripts",
  stat_lights: "Lights",
  stat_sensors: "Sensors",
  stat_areas: "Areas",
  composer_placeholder: "Message Pi Agent…",
  thinking: "Thinking",
  stopped: "Stopped",
  theme: "Theme",
  cmd_new: "Start a new chat",
  cmd_sessions: "Open past sessions",
  cmd_setup: "Set up conventions",
  wiz_step_of: "Step {n} of {t}",
  wiz_review: "Review",
  wiz_back: "Back",
  wiz_next: "Next",
  wiz_save: "Save & finish",
  wiz_done_title: "You're all set",
  wiz_done_sub: "These conventions will guide how I name and organize things.",
  wiz_close: "Close",
};

const DA: Record<string, string> = {
  sessions: "Sessioner",
  new_chat: "Ny chat",
  setup_conventions: "Opsæt konventioner",
  setup_wizard_sub: "/setup-guide",
  show_more: "Vis flere",
  empty_title: "Hvordan kan jeg hjælpe med dit hjem?",
  empty_sub: "Spørg om entiteter, automatiseringer, scripts eller dashboardet.",
  chip_lights: "Vis mine lys",
  chip_porch: "Opdater scriptet til udendørslyset",
  chip_kitchen: "Sluk køkkenlyset",
  chip_capabilities: "Hvad kan du?",
  stat_entities: "Entiteter",
  stat_automations: "Automatiseringer",
  stat_scripts: "Scripts",
  stat_lights: "Lys",
  stat_sensors: "Sensorer",
  stat_areas: "Områder",
  composer_placeholder: "Skriv til Pi Agent…",
  thinking: "Tænker",
  stopped: "Stoppet",
  theme: "Tema",
  cmd_new: "Start en ny chat",
  cmd_sessions: "Åbn tidligere sessioner",
  cmd_setup: "Opsæt konventioner",
  wiz_step_of: "Trin {n} af {t}",
  wiz_review: "Gennemse",
  wiz_back: "Tilbage",
  wiz_next: "Næste",
  wiz_save: "Gem & afslut",
  wiz_done_title: "Så er du klar",
  wiz_done_sub: "Disse konventioner styrer, hvordan jeg navngiver og organiserer ting.",
  wiz_close: "Luk",
};

const TABLE: Record<Lang, Record<string, string>> = { en: EN, da: DA };

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = TABLE[lang][key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
