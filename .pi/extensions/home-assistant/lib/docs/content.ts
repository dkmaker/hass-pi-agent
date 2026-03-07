/**
 * Doc content fetcher — retrieves and cleans individual markdown files.
 *
 * Sources (in priority order):
 * 1. Local cache (runtime updates)
 * 2. GitHub raw content (fetched on demand, cached locally)
 */

const GITHUB_RAW = "https://raw.githubusercontent.com/home-assistant/home-assistant.io/current";
const CACHE_DIR = "/tmp/ha-docs-cache";

/**
 * Clean markdown content: strip frontmatter and simplify Jekyll/Liquid tags.
 */
export function cleanMarkdown(raw: string): string {
  // Strip frontmatter
  let content = raw.replace(/^---\n[\s\S]*?\n---\n*/, "");

  // Convert block tags to markdown equivalents
  content = content.replace(/\{%\s*tip\s*%\}/g, "> **💡 Tip:**");
  content = content.replace(/\{%\s*note\s*%\}/g, "> **📝 Note:**");
  content = content.replace(/\{%\s*important\s*%\}/g, "> **⚠️ Important:**");
  content = content.replace(/\{%\s*warning\s*%\}/g, "> **🚨 Warning:**");
  content = content.replace(/\{%\s*end(?:tip|note|important|warning)\s*%\}/g, "");

  // details blocks
  content = content.replace(/\{%\s*details\s+"([^"]+)"\s*%\}/g, "<details><summary>$1</summary>\n");
  content = content.replace(/\{%\s*enddetails\s*%\}/g, "</details>\n");

  // {% term "X" %} or {% term X %} → **X**
  content = content.replace(/\{%\s*term\s+"?([^"%}]+)"?\s*%\}/g, "**$1**");

  // {% my integrations title="Settings > Devices & services" %} → the title text
  content = content.replace(/\{%\s*my\s+\w+\s+title="([^"]+)"\s*%\}/g, "$1");

  // {% icon "mdi:xxx" %} → just the icon name
  content = content.replace(/\{%\s*icon\s+"([^"]+)"\s*%\}/g, "[$1]");

  // {% include ... %} → remove (these pull in shared snippets we don't have)
  content = content.replace(/\{%\s*include\s+[^%]*%\}/g, "");

  // {% raw %} / {% endraw %} — just remove the tags
  content = content.replace(/\{%\s*(?:end)?raw\s*%\}/g, "");

  // configuration blocks → code fences
  content = content.replace(/\{%\s*configuration_basic?\s*%\}/g, "```yaml");
  content = content.replace(/\{%\s*endconfiguration_basic?\s*%\}/g, "```");

  // Any remaining {% ... %} tags → remove
  content = content.replace(/\{%[^%]*%\}/g, "");

  // Clean up excessive blank lines
  content = content.replace(/\n{4,}/g, "\n\n\n");

  return content.trim();
}

/**
 * Ensure cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CACHE_DIR, { recursive: true });
}

/**
 * Get cached content for a doc, or null if not cached.
 */
async function getCached(key: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    return await readFile(join(CACHE_DIR, `${key}.md`), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write content to cache.
 */
async function setCache(key: string, content: string): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const path = join(CACHE_DIR, `${key}.md`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

/**
 * Fetch an integration doc by domain.
 * Returns cleaned markdown content.
 */
export async function fetchIntegrationDoc(domain: string): Promise<string> {
  const cacheKey = `integrations/${domain}`;

  // Check cache first
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // Fetch from GitHub
  const url = `${GITHUB_RAW}/source/_integrations/${domain}.markdown`;
  const resp = await fetch(url, { headers: { "User-Agent": "pi-ha-docs" } });
  if (!resp.ok) {
    if (resp.status === 404) throw new Error(`Integration '${domain}' not found.`);
    throw new Error(`GitHub fetch failed: ${resp.status}`);
  }

  const raw = await resp.text();
  const cleaned = cleanMarkdown(raw);

  // Cache it
  await ensureCacheDir();
  await setCache(cacheKey, cleaned);

  return cleaned;
}

/**
 * Fetch a general doc by path (e.g., "automation/trigger").
 * Returns cleaned markdown content.
 */
export async function fetchDoc(docPath: string): Promise<string> {
  const cacheKey = `docs/${docPath}`;

  // Check cache first
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  // Fetch from GitHub
  const url = `${GITHUB_RAW}/source/_docs/${docPath}.markdown`;
  const resp = await fetch(url, { headers: { "User-Agent": "pi-ha-docs" } });
  if (!resp.ok) {
    if (resp.status === 404) throw new Error(`Doc '${docPath}' not found.`);
    throw new Error(`GitHub fetch failed: ${resp.status}`);
  }

  const raw = await resp.text();
  const cleaned = cleanMarkdown(raw);

  // Cache it
  await ensureCacheDir();
  await setCache(cacheKey, cleaned);

  return cleaned;
}

/**
 * Clear the entire content cache.
 */
export async function clearCache(): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(CACHE_DIR, { recursive: true, force: true });
}
