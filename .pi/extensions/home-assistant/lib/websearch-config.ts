/**
 * Web search configuration, read from the environment (mapped by init-pi from
 * the add-on's `websearch:` options section). The tool registers itself only
 * when this reports `enabled` — a disabled/unconfigured web search leaves no
 * tool and no system-prompt footprint at all.
 */

export type WebSearchProvider = "perplexity" | "perplexity_openrouter" | "brave";

const PROVIDERS: WebSearchProvider[] = ["perplexity", "perplexity_openrouter", "brave"];

export interface WebSearchConfig {
  enabled: boolean;
  provider: WebSearchProvider;
  apiKey: string;
}

export function webSearchConfig(): WebSearchConfig {
  const flag = (process.env.WEBSEARCH_ENABLED || "").trim().toLowerCase();
  const on = flag === "true" || flag === "1" || flag === "yes";
  const rawProvider = (process.env.WEBSEARCH_PROVIDER || "perplexity").trim() as WebSearchProvider;
  const provider = PROVIDERS.includes(rawProvider) ? rawProvider : "perplexity";
  const apiKey = (process.env.WEBSEARCH_API_KEY || "").trim();
  // Enabled only when the flag is on AND a key is present — otherwise the tool
  // would register but fail on every call.
  return { enabled: on && apiKey.length > 0, provider, apiKey };
}
