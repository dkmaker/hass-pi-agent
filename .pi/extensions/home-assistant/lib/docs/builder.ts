/**
 * Docs index builder — shared between build script and runtime update.
 *
 * Parses .markdown files with YAML frontmatter and produces a structured index.
 * Works with both local directories and GitHub API as sources.
 */

export interface IntegrationMeta {
  title: string;
  description: string;
  category: string[];
  platforms: string[];
  iot_class: string | null;
  integration_type: string | null;
  config_flow: boolean;
  quality_scale: string | null;
  codeowners: string[];
  featured: boolean;
}

export interface DocMeta {
  title: string;
  description: string;
  path: string;
}

export interface DocsIndex {
  version: string;
  updated: string;
  source: string;
  integrations: Record<string, IntegrationMeta>;
  docs: Record<string, DocMeta>;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns the frontmatter as key-value pairs and the content start offset.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm: Record<string, unknown> = {};
  let currentKey = "";
  let currentList: string[] | null = null;

  for (const line of match[1].split("\n")) {
    // List item
    const listMatch = line.match(/^\s+-\s+'?(.+?)'?\s*$/);
    if (listMatch && currentList) {
      currentList.push(listMatch[1].replace(/^['"]|['"]$/g, ""));
      continue;
    }

    // Flush previous list
    if (currentList && currentKey) {
      fm[currentKey] = currentList;
      currentList = null;
    }

    // Key: value
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "") {
        // Could be start of a list
        currentList = [];
      } else {
        fm[currentKey] = val.replace(/^['"]|['"]$/g, "");
      }
    }
  }

  // Flush final list
  if (currentList && currentKey) {
    fm[currentKey] = currentList;
  }

  return fm;
}

/**
 * Build an IntegrationMeta from parsed frontmatter.
 */
function toIntegrationMeta(fm: Record<string, unknown>): IntegrationMeta {
  return {
    title: String(fm.title ?? ""),
    description: String(fm.description ?? ""),
    category: Array.isArray(fm.ha_category) ? fm.ha_category : fm.ha_category ? [String(fm.ha_category)] : [],
    platforms: Array.isArray(fm.ha_platforms) ? fm.ha_platforms : [],
    iot_class: fm.ha_iot_class ? String(fm.ha_iot_class) : null,
    integration_type: fm.ha_integration_type ? String(fm.ha_integration_type) : null,
    config_flow: fm.ha_config_flow === "true" || fm.ha_config_flow === true,
    quality_scale: fm.ha_quality_scale ? String(fm.ha_quality_scale) : null,
    codeowners: Array.isArray(fm.ha_codeowners) ? fm.ha_codeowners : [],
    featured: fm.featured === "true" || fm.featured === true,
  };
}

/**
 * Build index from a local directory of .markdown files.
 */
export async function buildFromLocal(
  integrationsDir: string,
  docsDir: string,
  source: string = "local"
): Promise<DocsIndex> {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const index: DocsIndex = {
    version: new Date().toISOString().slice(0, 10),
    updated: new Date().toISOString(),
    source,
    integrations: {},
    docs: {},
  };

  // Parse integrations
  try {
    const files = await readdir(integrationsDir);
    for (const file of files) {
      if (!file.endsWith(".markdown")) continue;
      const domain = file.replace(".markdown", "");
      const content = await readFile(join(integrationsDir, file), "utf-8");
      const fm = parseFrontmatter(content);
      if (fm.ha_domain) {
        index.integrations[String(fm.ha_domain)] = toIntegrationMeta(fm);
      } else {
        index.integrations[domain] = toIntegrationMeta(fm);
      }
    }
  } catch {
    // integrationsDir may not exist
  }

  // Parse general docs (recursive)
  async function scanDocs(dir: string, prefix: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await scanDocs(join(dir, entry.name), `${prefix}${entry.name}/`);
        } else if (entry.name.endsWith(".markdown")) {
          const slug = `${prefix}${entry.name.replace(".markdown", "")}`;
          const content = await readFile(join(dir, entry.name), "utf-8");
          const fm = parseFrontmatter(content);
          index.docs[slug] = {
            title: String(fm.title ?? slug),
            description: String(fm.description ?? ""),
            path: slug,
          };
        }
      }
    } catch {
      // dir may not exist
    }
  }

  await scanDocs(docsDir, "");

  return index;
}

/**
 * Build index by fetching from GitHub.
 * Uses the Git Trees API (no 1000-item limit) for file listing,
 * then fetches raw content for frontmatter parsing.
 */
export async function buildFromGitHub(
  onProgress?: (msg: string) => void
): Promise<DocsIndex> {
  const TREES_BASE = "https://api.github.com/repos/home-assistant/home-assistant.io/git/trees";
  const RAW_BASE = "https://raw.githubusercontent.com/home-assistant/home-assistant.io/current";

  const index: DocsIndex = {
    version: new Date().toISOString().slice(0, 10),
    updated: new Date().toISOString(),
    source: "github:home-assistant/home-assistant.io@current",
    integrations: {},
    docs: {},
  };

  // List files via Git Trees API (no pagination limit)
  async function listTree(treePath: string, recursive = false): Promise<Array<{ path: string; type: string }>> {
    const url = `${TREES_BASE}/current:${treePath}${recursive ? "?recursive=1" : ""}`;
    const resp = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "pi-ha-docs" },
    });
    if (!resp.ok) throw new Error(`GitHub Trees API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as { tree: Array<{ path: string; type: string }> };
    return data.tree;
  }

  // Fetch raw content
  async function fetchRaw(path: string): Promise<string> {
    const resp = await fetch(`${RAW_BASE}/${path}`, {
      headers: { "User-Agent": "pi-ha-docs" },
    });
    if (!resp.ok) throw new Error(`GitHub raw ${resp.status} for ${path}`);
    return resp.text();
  }

  // ── Integrations ──────────────────────────────────────────
  onProgress?.("Fetching integration list from GitHub (Trees API)...");
  const integrationTree = await listTree("source/_integrations");
  const integrationFiles = integrationTree.filter((f) => f.type === "blob" && f.path.endsWith(".markdown"));
  onProgress?.(`Found ${integrationFiles.length} integrations, fetching metadata...`);

  // Batch fetch in groups of 20
  for (let i = 0; i < integrationFiles.length; i += 20) {
    const batch = integrationFiles.slice(i, i + 20);
    const results = await Promise.all(
      batch.map(async (f) => {
        const content = await fetchRaw(`source/_integrations/${f.path}`);
        const fm = parseFrontmatter(content);
        const domain = fm.ha_domain ? String(fm.ha_domain) : f.path.replace(".markdown", "");
        return { domain, meta: toIntegrationMeta(fm) };
      })
    );
    for (const { domain, meta } of results) {
      index.integrations[domain] = meta;
    }
    onProgress?.(`Processed ${Math.min(i + 20, integrationFiles.length)}/${integrationFiles.length} integrations...`);
  }

  // ── General docs ──────────────────────────────────────────
  onProgress?.("Fetching docs list from GitHub...");
  const docsTree = await listTree("source/_docs", true);
  const docFiles = docsTree.filter((f) => f.type === "blob" && f.path.endsWith(".markdown"));
  onProgress?.(`Found ${docFiles.length} docs, fetching metadata...`);

  for (let i = 0; i < docFiles.length; i += 20) {
    const batch = docFiles.slice(i, i + 20);
    const results = await Promise.all(
      batch.map(async (f) => {
        const content = await fetchRaw(`source/_docs/${f.path}`);
        const fm = parseFrontmatter(content);
        const slug = f.path.replace(".markdown", "");
        return {
          slug,
          meta: {
            title: String(fm.title ?? slug),
            description: String(fm.description ?? ""),
            path: slug,
          },
        };
      })
    );
    for (const { slug, meta } of results) {
      index.docs[slug] = meta;
    }
    onProgress?.(`Processed ${Math.min(i + 20, docFiles.length)}/${docFiles.length} docs...`);
  }

  return index;
}
