# Home Assistant — Local Development Environment

Development workspace for **Pi Agent for Home Assistant**, a Home Assistant add-on that gives the Pi coding agent full access to manage all aspects of a Home Assistant installation.

## Project Layout

| Directory | Purpose |
|-----------|---------|
| `addon/` | Add-on source (config.yaml, Dockerfile, run.sh) |
| `.pi/extensions/home-assistant/` | Pi extension — tools, lib, schemas |
| `dev-scripts/` | Dev scripts — deploy, VM management, API helpers |
| `ha-core/` | Git submodule — HA backend (reference only, **do not edit**) |
| `ha-frontend/` | Git submodule — HA frontend (reference only, **do not edit**) |
| `tools/` | Schema extractors (extract-schemas.py, extract-automation-schemas.py) |
| `.env` | API token + VM config (gitignored) |

## Add-on

| Property | Value |
|----------|-------|
| Name | Pi Agent for Home Assistant |
| Slug / Supervisor slug | `pi_agent` / `local_pi_agent` |
| Source | `addon/` |

**Access inside container:** Supervisor API (`http://supervisor/`), Core REST/WS, `/homeassistant` (R/W), `/addon_configs`, `/ssl`, `/share`, `/media`, `/backup`.

**Token:** `$SUPERVISOR_TOKEN` loaded from `/run/s6/container_environment/SUPERVISOR_TOKEN` (not auto-injected when `init: false`).

## Dev VM

| Property | Value |
|----------|-------|
| VM IP / URL | `10.99.0.13` / `http://10.99.0.13:8123` |
| API token | `.env` (`HAOS_API_TOKEN`) |
| SSH | `root@10.99.0.13:22` (Terminal & SSH add-on) |
| Network | `haos-isolated` — private subnet, NAT internet, no LAN bridge |

```bash
dev-scripts/vm-ctl start|stop|status|ssh|destroy
```

## Deploy Workflow

See asset **"Add-on Deploy & Test Workflow"** for deploy commands, troubleshooting, and details.

## Extension Structure

Tools live in `.pi/extensions/home-assistant/tools/ha-*.ts`, shared code in `lib/`. Registered in `index.ts`. See the wiki page **"New Tool Implementation Pattern"** (https://wiki.dkmaker.xyz/pages/MSWTS8F5) for conventions — and the project index https://wiki.dkmaker.xyz/pages/MSWNJA34 for all architecture/pattern/policy docs.

**Key principles:** <300 lines/file, shared types in `lib/types.ts`, complex tools get sub-directories, thin dispatch files.

## Schema Extraction

Submodules are pinned to matching HA **release tags** (not `dev` — it's unstable and huge to fetch). ha-core and ha-frontend track the versions that ship together in a given release (e.g. core `2026.9.1` ↔ frontend `20260826.6`, per core's `package_constraints.txt`).

To bump to a new release:

```bash
# Pin each submodule to the target release tag (shallow = fast)
git -C ha-core     fetch --depth 1 origin tag <core-tag>       && git -C ha-core     checkout <core-tag>
git -C ha-frontend fetch --depth 1 origin tag <frontend-tag>   && git -C ha-frontend checkout <frontend-tag>

python3 tools/extract-schemas.py                  # ha-core/ → .pi/extensions/home-assistant/schemas/{collections,config_entries,registries}
python3 tools/extract-automation-schemas.py       # ha-frontend/ → schemas/automation-elements.json
python3 tools/extract-card-schemas.py             # ha-frontend/ → schemas/card-schemas.json
```

Find the matching frontend tag with: `gh api repos/home-assistant/core/contents/homeassistant/package_constraints.txt?ref=<core-tag> --jq '.content' | base64 -d | grep home-assistant-frontend`.

## Policies

- **NEVER push commits or bump versions unless explicitly approved by the user**
- Use "Home Assistant" in full — never "HA" or "HASS" in user-facing text
- Always test add-on changes on the isolated VM before pushing
- Alpine Linux base image; VM has no `rsync` (use `scp`)
- `ha store reload` (not `ha addons reload`) for local add-on changes
- Local add-ons get `local_` prefix in Supervisor slug
- **Add-on image builds are fast — ~1-4 min per arch** (amd64 measured at 1.4 min). A build running **longer than ~5 min is hung/broken, not slow** — cancel and rebuild; never wait 30-60 min for it. The `home-assistant/builder@master` action (deprecated, tracked in issue #H5U58) is the flaky part and has hung the aarch64 leg; when a build stalls, suspect the runner/builder, not "emulated aarch64 is just slow."

## Release & Branching Workflow

**Branch model:** `beta` is the integration branch. Branch off **`beta` or `main` — whichever makes sense**, and open the PR against the same base: features/fixes that should go through beta testing branch off `beta` (the default); a stable-only hotfix or a docs tweak can branch off `main` directly. Whatever you branch off, PR back into that same branch — don't branch off beta and PR into main.

**ALWAYS fetch first — local is often stale.** release-please's release PRs and the beta workflow's tile-sync push commits to BOTH `main` and `beta` on their own, so your local `main`/`beta` fall behind origin constantly. Before branching, committing, or pushing: `git fetch <remote>` and branch off / rebase onto `<remote>/<branch>` (not your stale local ref). A rejected fast-forward push means you skipped this — fetch + rebase, don't force.

**Two release-please tracks:** `beta` cuts prereleases (`1.1.0-beta.X`) via `release-please-config-beta.json` + `.release-please-manifest-beta.json`; `main` cuts stable (`X.Y.Z`) via the stable config/manifest. They use separate tags (`v*-beta.X` vs `v*`) and separate changelog files (`addon-beta/CHANGELOG.md` vs `CHANGELOG.md`), so they never collide.

**Promote by MERGING, never cherry-pick.** This is the canonical release-please flow (confirmed: googleapis/release-please#2515 + docs/customizing.md): release-please computes versions purely from the commit history present on the branch it runs on. A feature authored once on `beta` therefore flows to stable by a plain `git merge beta → main` — main's release-please then sees those commits “as if developed directly on main” and computes the stable bump. NEVER cherry-pick a commit onto both branches (that is the double-work trap): author it once on `beta`, merge to promote.

**Stable release steps:**
1. `git merge beta → main` (one PR). Main's stable release-please computes the bump + changelog from the merged `feat:`/`fix:` commits and opens/updates its release PR.
2. Merge that stable release PR → stable tag `vX.Y.Z` + GHCR images + `addon/config.yaml` bump.
3. **Back-merge `main → beta`** afterwards so beta continues from the new stable baseline (main now carries the `chore(main): release` commit + stable manifest bump that beta lacks). Standard release-branch hygiene, not double work.

**Graduation version:** release-please has no native “re-tag `1.1.0-beta.3` as `1.1.0`” (issue #2515). It simply computes the next stable from `feat:`/`fix:` since the last *stable* tag — post-1.0.0 that means feats → minor (`1.0.1 → 1.1.0`). To force an exact number, land a `Release-As: X.Y.Z` commit on main. Beta prerelease tags (`v*-beta.N`) never collide with stable tags (`v*`).

All of the above works cleanly *only because every commit is labelled by its true Conventional-Commit type* (see below).

**Commit-message rule (load-bearing for clean beta→main):** every commit MUST state what the change actually is with its correct Conventional-Commit type + scope (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, …). Never mislabel a change to influence release-please, and never dump real changes under a generic `chore`. Honest typing is what lets features flow straight over on beta→main and keeps both changelogs correct.

**Harmless auto-noise:** release-please's own release-marker commits (`chore(beta): release …`) and the beta workflow's tile-sync commits (`chore(beta): sync tile … [skip ci]`) are auto-generated — not hand-written. They are genuine chores: they don't bump the stable version and don't appear in the stable changelog. Leave them as-is; do not try to relabel them (that would misrepresent what they are). They are the only `chore(beta)` commits that ride along on a beta→main merge, and they are cosmetic.
