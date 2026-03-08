#!/usr/bin/env python3
"""
Fetch and update Home Assistant documentation from GitHub.

NOTE: This is the add-on container copy, run at startup by the init-docs
s6 service. The canonical source is tools/update-docs.py — keep both in sync.

First run: fetches all integration + doc files, builds index + content.
Subsequent runs: incremental — only fetches files with changed blob SHAs.

Output structure:
  <output_dir>/
    index.json          — metadata index (frontmatter for all integrations + docs)
    manifest.json       — commit SHA, per-file blob SHAs for incremental updates
    content/
      integrations/     — cleaned markdown for each integration
        mqtt.md
        hue.md
        ...
      docs/             — cleaned markdown for general docs
        automation/
          trigger.md
          ...

Usage:
  python3 scripts/update-docs.py                          # default output
  python3 scripts/update-docs.py --output /data/ha-docs   # custom output dir
  python3 scripts/update-docs.py --full                    # force full rebuild
"""

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

REPO = "home-assistant/home-assistant.io"
BRANCH = "current"
API_BASE = f"https://api.github.com/repos/{REPO}"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"

# ── GitHub API helpers ────────────────────────────────────────


def github_get(url: str) -> dict:
    """GET a GitHub API endpoint, return parsed JSON."""
    req = Request(url, headers={
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "pi-ha-docs-updater",
    })
    with urlopen(req) as resp:
        return json.loads(resp.read())


def github_raw(path: str) -> str:
    """Fetch raw file content from GitHub."""
    url = f"{RAW_BASE}/{path}"
    req = Request(url, headers={"User-Agent": "pi-ha-docs-updater"})
    with urlopen(req) as resp:
        return resp.read().decode("utf-8")


def get_commit_sha() -> str:
    """Get the current commit SHA for the branch."""
    data = github_get(f"{API_BASE}/commits/{BRANCH}")
    return data["sha"]


def get_tree(tree_path: str, recursive: bool = False) -> list[dict]:
    """Get file tree via Git Trees API (no 1000-item limit)."""
    url = f"{API_BASE}/git/trees/{BRANCH}:{tree_path}"
    if recursive:
        url += "?recursive=1"
    data = github_get(url)
    return data.get("tree", [])


# ── Frontmatter parser ───────────────────────────────────────


def parse_frontmatter(content: str) -> dict:
    """Parse YAML frontmatter from markdown content."""
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return {}

    fm = {}
    current_key = ""
    current_list = None

    for line in match.group(1).split("\n"):
        # List item
        list_match = re.match(r"^\s+-\s+'?(.+?)'?\s*$", line)
        if list_match and current_list is not None:
            val = list_match.group(1).strip("'\"")
            current_list.append(val)
            continue

        # Flush previous list
        if current_list is not None and current_key:
            fm[current_key] = current_list
            current_list = None

        # Key: value
        kv_match = re.match(r"^(\w[\w_]*)\s*:\s*(.*)", line)
        if kv_match:
            current_key = kv_match.group(1)
            val = kv_match.group(2).strip()
            if val == "":
                current_list = []
            else:
                fm[current_key] = val.strip("'\"")

    # Flush final list
    if current_list is not None and current_key:
        fm[current_key] = current_list

    return fm


def to_integration_meta(fm: dict) -> dict:
    """Convert parsed frontmatter to integration metadata."""
    cat = fm.get("ha_category", [])
    if isinstance(cat, str):
        cat = [cat]
    platforms = fm.get("ha_platforms", [])
    if isinstance(platforms, str):
        platforms = [platforms]
    codeowners = fm.get("ha_codeowners", [])
    if isinstance(codeowners, str):
        codeowners = [codeowners]

    return {
        "title": str(fm.get("title", "")),
        "description": str(fm.get("description", "")),
        "category": cat,
        "platforms": platforms,
        "iot_class": fm.get("ha_iot_class"),
        "integration_type": fm.get("ha_integration_type"),
        "config_flow": fm.get("ha_config_flow") in ("true", True),
        "quality_scale": fm.get("ha_quality_scale"),
        "codeowners": codeowners,
        "featured": fm.get("featured") in ("true", True),
    }


# ── Markdown cleaner ─────────────────────────────────────────


def clean_markdown(raw: str) -> str:
    """Strip frontmatter and simplify Jekyll/Liquid tags."""
    content = re.sub(r"^---\n[\s\S]*?\n---\n*", "", raw)

    # Block tags → markdown
    content = re.sub(r"\{%\s*tip\s*%\}", '> **💡 Tip:**', content)
    content = re.sub(r"\{%\s*note\s*%\}", '> **📝 Note:**', content)
    content = re.sub(r"\{%\s*important\s*%\}", '> **⚠️ Important:**', content)
    content = re.sub(r"\{%\s*warning\s*%\}", '> **🚨 Warning:**', content)
    content = re.sub(r"\{%\s*end(?:tip|note|important|warning)\s*%\}", "", content)

    # Details
    content = re.sub(r'\{%\s*details\s+"([^"]+)"\s*%\}', r"<details><summary>\1</summary>\n", content)
    content = re.sub(r"\{%\s*enddetails\s*%\}", "</details>\n", content)

    # Term → bold
    content = re.sub(r'\{%\s*term\s+"?([^"%}]+)"?\s*%\}', r"**\1**", content)

    # My links → title text
    content = re.sub(r'\{%\s*my\s+\w+\s+title="([^"]+)"\s*%\}', r"\1", content)

    # Icons
    content = re.sub(r'\{%\s*icon\s+"([^"]+)"\s*%\}', r"[\1]", content)

    # Includes → remove
    content = re.sub(r"\{%\s*include\s+[^%]*%\}", "", content)

    # Raw tags → remove
    content = re.sub(r"\{%\s*(?:end)?raw\s*%\}", "", content)

    # Configuration blocks → code fences
    content = re.sub(r"\{%\s*configuration_basic?\s*%\}", "```yaml", content)
    content = re.sub(r"\{%\s*endconfiguration_basic?\s*%\}", "```", content)

    # Remaining tags → remove
    content = re.sub(r"\{%[^%]*%\}", "", content)

    # Clean up excessive blank lines
    content = re.sub(r"\n{4,}", "\n\n\n", content)

    return content.strip()


# ── Main update logic ─────────────────────────────────────────


def load_manifest(output_dir: Path) -> dict:
    """Load existing manifest or return empty."""
    manifest_path = output_dir / "manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text())
    return {"commit": None, "files": {}}


def save_manifest(output_dir: Path, manifest: dict):
    """Save manifest to disk."""
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


def fetch_and_process_file(github_path: str, raw: str | None = None) -> tuple[str, dict | None, str]:
    """Fetch a file and return (github_path, frontmatter_meta_or_None, cleaned_content)."""
    if raw is None:
        raw = github_raw(github_path)
    fm = parse_frontmatter(raw)
    cleaned = clean_markdown(raw)
    return github_path, fm, cleaned


def update_docs(output_dir: Path, force_full: bool = False, max_workers: int = 10):
    """Main update function."""
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(output_dir)

    # Get current commit
    print("Fetching current commit SHA...")
    commit_sha = get_commit_sha()

    if not force_full and manifest.get("commit") == commit_sha:
        print(f"Already up to date (commit {commit_sha[:12]})")
        return

    # Get file trees
    print("Fetching file trees...")
    integration_tree = get_tree("source/_integrations")
    docs_tree = get_tree("source/_docs", recursive=True)

    integration_files = {
        f"source/_integrations/{t['path']}": t["sha"]
        for t in integration_tree
        if t["type"] == "blob" and t["path"].endswith(".markdown")
    }
    doc_files = {
        f"source/_docs/{t['path']}": t["sha"]
        for t in docs_tree
        if t["type"] == "blob" and t["path"].endswith(".markdown")
    }

    all_files = {**integration_files, **doc_files}
    old_files = manifest.get("files", {})

    # Determine what changed
    if force_full or not old_files:
        changed = set(all_files.keys())
        removed = set()
        print(f"Full fetch: {len(changed)} files")
    else:
        changed = {p for p, sha in all_files.items() if old_files.get(p) != sha}
        removed = set(old_files.keys()) - set(all_files.keys())
        print(f"Incremental: {len(changed)} changed, {len(removed)} removed, {len(all_files) - len(changed)} unchanged")

    if not changed and not removed:
        # Update commit even if no file changes (e.g., non-docs commits)
        manifest["commit"] = commit_sha
        save_manifest(output_dir, manifest)
        print("No documentation changes.")
        return

    # Load existing index for incremental updates
    index_path = output_dir / "index.json"
    if index_path.exists() and not force_full:
        index = json.loads(index_path.read_text())
    else:
        index = {
            "integrations": {},
            "docs": {},
        }

    # Fetch changed files in parallel
    content_dir = output_dir / "content"

    def process_one(github_path: str):
        raw = github_raw(github_path)
        fm = parse_frontmatter(raw)
        cleaned = clean_markdown(raw)
        return github_path, fm, cleaned

    fetched = 0
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(process_one, p): p for p in changed}
        for future in as_completed(futures):
            github_path = futures[future]
            try:
                _, fm, cleaned = future.result()
            except Exception as e:
                print(f"  ERROR fetching {github_path}: {e}", file=sys.stderr)
                continue

            fetched += 1
            if fetched % 50 == 0 or fetched == len(changed):
                print(f"  Fetched {fetched}/{len(changed)} files...")

            # Store content
            if github_path.startswith("source/_integrations/"):
                filename = github_path.split("/")[-1].replace(".markdown", "")
                domain = str(fm.get("ha_domain", filename))
                out_path = content_dir / "integrations" / f"{domain}.md"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_text(cleaned)
                index["integrations"][domain] = to_integration_meta(fm)

            elif github_path.startswith("source/_docs/"):
                rel = github_path.removeprefix("source/_docs/").replace(".markdown", "")
                out_path = content_dir / "docs" / f"{rel}.md"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_text(cleaned)
                index["docs"][rel] = {
                    "title": str(fm.get("title", rel)),
                    "description": str(fm.get("description", "")),
                    "path": rel,
                }

    # Handle removed files
    for github_path in removed:
        if github_path.startswith("source/_integrations/"):
            filename = github_path.split("/")[-1].replace(".markdown", "")
            # Try to find the domain from old index
            (content_dir / "integrations" / f"{filename}.md").unlink(missing_ok=True)
            index["integrations"].pop(filename, None)
        elif github_path.startswith("source/_docs/"):
            rel = github_path.removeprefix("source/_docs/").replace(".markdown", "")
            (content_dir / "docs" / f"{rel}.md").unlink(missing_ok=True)
            index["docs"].pop(rel, None)

    # Save index
    index["version"] = time.strftime("%Y-%m-%d")
    index["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    index["source"] = f"github:{REPO}@{BRANCH}"
    index["commit"] = commit_sha
    index["integration_count"] = len(index["integrations"])
    index["doc_count"] = len(index["docs"])

    index_path.write_text(json.dumps(index, indent=2))

    # Save manifest
    manifest["commit"] = commit_sha
    manifest["files"] = all_files
    save_manifest(output_dir, manifest)

    print(f"\n✅ Done: {len(index['integrations'])} integrations, {len(index['docs'])} docs")
    print(f"   Commit: {commit_sha[:12]}")
    print(f"   Output: {output_dir}")


# ── CLI ───────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update Home Assistant docs index and content")
    parser.add_argument(
        "--output", "-o",
        default=os.path.join(os.path.dirname(__file__), "..", ".pi", "extensions", "home-assistant", "data", "ha-docs"),
        help="Output directory (default: extension data/ha-docs/)",
    )
    parser.add_argument("--full", action="store_true", help="Force full rebuild (ignore manifest)")
    parser.add_argument("--workers", type=int, default=10, help="Parallel fetch workers (default: 10)")
    args = parser.parse_args()

    update_docs(Path(args.output).resolve(), force_full=args.full, max_workers=args.workers)
