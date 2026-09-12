/**
 * web_search — external web search for the agent, adapted from the standalone
 * web-search extension for the Home Assistant add-on.
 *
 * Providers (one, chosen in the add-on's `websearch:` config section):
 *   - perplexity            → api.perplexity.ai (synthesised answer + citations)
 *   - perplexity_openrouter → openrouter.ai, perplexity/* models (key = OpenRouter)
 *   - brave                 → api.search.brave.com (raw web results)
 *
 * Registers only when web search is enabled + keyed (see registerWebSearchTool).
 * No disk cache. Never uses a "research" / deep-research model.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import { defineHaTool, type HaDetails } from "../lib/tool-render.js";
import { webSearchConfig } from "../lib/websearch-config.js";

// ── Intent profiles (Home-Assistant-tailored) ───────────────────────────────
// model/highEffortModel are Perplexity sonar tiers — NEVER a deep-research model.
interface IntentProfile { model: string; highModel: string; system: string; }

const RESPONSE_TEMPLATE =
  "\n\nStructure the answer as:\n\n## Answer\n[focused answer]\n\n## Key Points\n- [concise takeaways]\n\nDo NOT add a Sources section — sources are attached separately.";

const INTENTS: Record<string, IntentProfile> = {
  docs: {
    model: "sonar-pro",
    highModel: "sonar-reasoning-pro",
    system:
      "You find official Home Assistant and integration documentation: configuration options, YAML/service schemas, entity/attribute details.\n- Prefer primary docs (home-assistant.io, integration repos) over blogs.\n- Give exact option names, types, defaults, and the HA version they apply to.\n- Show YAML/service-call snippets when relevant." + RESPONSE_TEMPLATE,
  },
  troubleshoot: {
    model: "sonar-pro",
    highModel: "sonar-reasoning-pro",
    system:
      "You find known Home Assistant problems: bugs, breaking changes, integration errors, and their fixes/workarounds.\n- Search GitHub issues, the HA forum/Reddit, release notes and breaking-changes.\n- Include issue links and the HA versions affected.\n- Distinguish confirmed bugs from misconfiguration; give a concrete fix." + RESPONSE_TEMPLATE,
  },
  howto: {
    model: "sonar-pro",
    highModel: "sonar-reasoning-pro",
    system:
      "You find practical Home Assistant how-to guidance: automations, templates (Jinja2), blueprints, and configuration examples.\n- Provide complete, working YAML/template snippets, not pseudocode.\n- Use current HA syntax (modern automation/action schema).\n- Note required integrations/helpers." + RESPONSE_TEMPLATE,
  },
  quick: {
    model: "sonar",
    highModel: "sonar-pro",
    system:
      "You give brief, direct factual answers.\n- Lead with the answer.\n- One value/command/line when that suffices — no filler." + RESPONSE_TEMPLATE,
  },
  search: {
    model: "sonar-pro",
    highModel: "sonar-reasoning-pro",
    system:
      "You are a general web-search assistant. Synthesise well-sourced answers, facts before opinions, and note when information may be outdated." + RESPONSE_TEMPLATE,
  },
};

type Intent = keyof typeof INTENTS;
const INTENT_KEYS = Object.keys(INTENTS) as Intent[];

interface Source { title?: string; url: string; description?: string }

// ── Perplexity (native API or via OpenRouter) ────────────────────────────────
async function runPerplexity(
  endpoint: string,
  model: string,
  system: string,
  query: string,
  apiKey: string,
  recency: string | undefined,
  domains: string[] | undefined,
  signal: AbortSignal | undefined,
): Promise<{ answer: string; sources: Source[] }> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: query },
    ],
    return_related_questions: false,
  };
  if (recency) body.search_recency_filter = recency;
  if (domains?.length) body.search_domain_filter = domains;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/dkmaker/hass-pi-agent",
      "X-Title": "Pi Agent for Home Assistant",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "(no body)");
    throw new Error(`Search API HTTP ${res.status} — ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    search_results?: Array<{ title?: string; url: string; snippet?: string }>;
  };
  const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) throw new Error("Search API returned an empty answer.");
  const sources: Source[] = (data.search_results ?? []).map((r) => ({ title: r.title, url: r.url, description: r.snippet }));
  if (sources.length === 0 && Array.isArray(data.citations)) {
    for (const url of data.citations) sources.push({ url });
  }
  return { answer, sources };
}

// ── Brave Search (raw web results) ───────────────────────────────────────────
const BRAVE_FRESHNESS: Record<string, string> = { day: "pd", week: "pw", month: "pm", year: "py" };

async function runBrave(
  query: string,
  apiKey: string,
  recency: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ answer: string; sources: Source[] }> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "8");
  const fresh = recency ? BRAVE_FRESHNESS[recency] : undefined;
  if (fresh) url.searchParams.set("freshness", fresh);

  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "(no body)");
    throw new Error(`Brave Search HTTP ${res.status} — ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url: string; description?: string }> } };
  const results = data.web?.results ?? [];
  if (results.length === 0) throw new Error("Brave Search returned no results.");
  const sources: Source[] = results.map((r) => ({ title: r.title, url: r.url, description: r.description }));
  const answer = results
    .map((r, i) => `${i + 1}. **${r.title ?? r.url}**\n   ${(r.description ?? "").replace(/\s+/g, " ").trim()}`)
    .join("\n");
  return { answer, sources };
}

function toMarkdown(answer: string, sources: Source[]): string {
  let md = answer;
  if (sources.length) {
    md += "\n\n**Sources:**\n";
    for (const s of sources) md += `- ${s.title ? `[${s.title}](${s.url})` : s.url}\n`;
  }
  return md.trim();
}

// ── Registration ─────────────────────────────────────────────────────────────
export function registerWebSearchTool(pi: ExtensionAPI): void {
  const cfg = webSearchConfig();
  if (!cfg.enabled) return; // disabled → no tool, no prompt footprint

  const label =
    cfg.provider === "brave" ? "Web Search (Brave)"
    : cfg.provider === "perplexity_openrouter" ? "Web Search (Perplexity/OpenRouter)"
    : "Web Search (Perplexity)";

  defineHaTool(pi, {
    name: "web_search",
    label,
    description:
      "Search the live web for current or external information. Use it to VALIDATE facts, look up documentation, " +
      "known issues, and how-to guidance instead of relying on pre-trained knowledge. Pick the intent that fits.",
    promptSnippet:
      "Search the live web (docs, known issues, how-to, quick facts, general) to validate facts instead of trusting pre-trained knowledge.",
    promptGuidelines: [
      "Use web_search when a question depends on current, version-specific, or external facts (HA release notes, integration docs, breaking changes) — don't answer those from memory.",
      "Pick intent: docs (official documentation), troubleshoot (known bugs/errors/fixes), howto (automations/templates/config examples), quick (fast factual lookup), search (general).",
      "Set recency for anything time-sensitive; high_effort for hard questions (uses a stronger reasoning model, never a deep-research model).",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      intent: Type.Optional(
        StringEnum(INTENT_KEYS as string[], {
          description: "Search profile: docs, troubleshoot, howto, quick, search (default: search).",
        }),
      ),
      recency: Type.Optional(
        StringEnum(["hour", "day", "week", "month", "year"], { description: "Limit results to this recency." }),
      ),
      high_effort: Type.Optional(Type.Boolean({ description: "Use a stronger reasoning model for hard questions." })),
      search_domains: Type.Optional(
        Type.Array(Type.String(), { description: "Restrict to these domains (Perplexity providers only)." }),
      ),
    }),
    async execute(params): Promise<HaDetails> {
      const query = String(params.query ?? "").trim();
      if (!query) throw new Error("web_search requires a non-empty 'query'.");
      const intent = (INTENT_KEYS.includes(params.intent as Intent) ? params.intent : "search") as Intent;
      const profile = INTENTS[intent];
      const recency = params.recency as string | undefined;
      const domains = params.search_domains as string[] | undefined;
      const high = params.high_effort === true;

      let out: { answer: string; sources: Source[] };
      if (cfg.provider === "brave") {
        out = await runBrave(query, cfg.apiKey, recency, undefined);
      } else {
        const endpoint =
          cfg.provider === "perplexity_openrouter"
            ? "https://openrouter.ai/api/v1/chat/completions"
            : "https://api.perplexity.ai/chat/completions";
        const base = high ? profile.highModel : profile.model;
        const model = cfg.provider === "perplexity_openrouter" ? `perplexity/${base}` : base;
        out = await runPerplexity(endpoint, model, profile.system, query, cfg.apiKey, recency, domains, undefined);
      }

      return { kind: "message", text: toMarkdown(out.answer, out.sources) };
    },
  });
}

// Injected into the system prompt ONLY when web search is enabled.
export const WEBSEARCH_VALIDATE_PROMPT =
  "## Web Search — Validate, Don't Guess\n\n" +
  "You have a `web_search` tool backed by a live search provider. By default, when a question depends on " +
  "**current, version-specific, or external facts** — Home Assistant release notes, integration documentation, " +
  "breaking changes, known bugs, third-party APIs, prices, dates — **validate with `web_search` instead of " +
  "answering from pre-trained knowledge**, which may be outdated or wrong.\n\n" +
  "- Reach for it before asserting a version-specific detail, a config option, or \"this is broken/changed\".\n" +
  "- Pick the intent that fits (docs / troubleshoot / howto / quick / search) and set `recency` for time-sensitive queries.\n" +
  "- You still answer trivial or purely local questions (the user's own entities/config) directly — search is for external truth.";
