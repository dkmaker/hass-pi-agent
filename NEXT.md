# Next Steps — Extension Review & Cleanup

## Context

We completed a major rewrite of the Home Assistant Pi extension. We now have 5 tools, a registry system, two storage backends, and a schema extractor. Before adding more features, we need to review, clean up, and consolidate.

**Read the Pi extension docs first**: `/home/cp/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md` and examples at `/home/cp/.nvm/versions/node/v24.14.0/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/` to understand best practices, API surface, and patterns before refactoring.

## What exists today

### Extension files (`.pi/extensions/home-assistant/`)

```
index.ts                          (14 lines)  — registers all 5 tools
lib/
  config.ts                       (79 lines)  — env vars, paths, .env loader
  storage.ts                      (50 lines)  — read/write .storage files with backup
  backup.ts                       (88 lines)  — timestamped backup with rotation
  config-check.ts                 (73 lines)  — ⚠️ DEAD CODE — checkConfig + restartHA, no longer imported
  registry.ts                    (336 lines)  — positive-list type registry, schema loading, validation
  backends/
    collection.ts                (123 lines)  — .storage/<domain> items[] backend
    config-entry.ts              (238 lines)  — core.config_entries backend + entity registry cleanup
tools/
  ha-helpers.ts                  (272 lines)  — helper CRUD (list-types, list, get, add, update, remove, backups, restore)
  ha-template.ts                  (88 lines)  — render/validate Jinja2 templates
  ha-entities.ts                 (365 lines)  — entity discovery with device/area context
  ha-restart.ts                  (175 lines)  — restart, reload-all, reload-core, reload-templates, reload-domain, validate
  ha-services.ts                 (280 lines)  — list, get, call services
docs/
  storage-schemas.md                          — ⚠️ STALE — marked for deletion, replaced by schema JSON files
schemas/
  collections/    (14 files)                  — collection storage schemas
  config_entries/ (17 files)                  — config entry schemas (template has sub_types)
  registries/      (6 files)                  — core registry schemas (not used by tools yet)
```

### Other project files

```
tools/extract-schemas.py         — Python schema extractor from ha-core source
PLAN.md                          — Completed plan with all investigation results
NEXT.md                          — This file
.pi/skills/ha-dev/               — Dev skill with bash scripts (ha-api, ha-supervisor, vm-ctl, deploy-addon)
```

## Issues to fix

### 1. Dead code: `lib/config-check.ts`
`checkConfig()` and `restartHA()` were moved into `ha-restart.ts` tool but the old shared lib still exists. **Nobody imports it.** Delete it.

### 2. Duplicated code: `requireToken()` and `apiGet()`
These are copy-pasted across 4 tool files:
- `ha-entities.ts` — `requireToken()` + `apiGet()`
- `ha-services.ts` — `requireToken()` + `apiGet()`
- `ha-restart.ts` — `requireToken()` + `callService()`
- `ha-template.ts` — `requireToken()`

**Action**: Extract a shared `lib/api.ts` with `requireToken()`, `apiGet()`, `apiPost()`, and `callService()`. All tools import from there.

### 3. Stale docs: `docs/storage-schemas.md`
Was marked for deletion in the original NEXT.md. Replaced by the JSON schema files. **Delete it.**

### 4. `ws` dependency unused
`package.json` has `ws` and `@types/ws` as dependencies but no tool imports websocket. Check if still needed or remove.

### 5. Tool descriptions review
Review all 5 tool descriptions for clarity, accuracy, and consistency. The descriptions are what the AI reads to decide when/how to use a tool. They should be:
- Concise but complete
- List all actions and parameters clearly
- Not expose internal implementation details (no "collection" vs "config_entry")
- Consistent in style across all tools

Current descriptions to review:
- `ha_helpers` — good but long, template sub-type info could be clearer
- `ha_template` — good, concise
- `ha_entities` — good but mentions "device and area context" which may over-promise on simple installs
- `ha_restart` — good, clear guidance on when to use restart vs reload
- `ha_services` — good, concise

### 6. Skills are dev-only tooling — NOT part of the extension
The `ha-dev` skill (`ha-api`, `ha-supervisor`, `vm-ctl`, `deploy-addon`) is **developer tooling** for building and testing the extension on the local dev VM. It is NOT part of the shipped extension and will NOT be included in the final add-on. The skill scripts talk to the VM directly; the extension tools talk to HA via its internal APIs (designed to run inside the add-on container).

**No action needed** — the skill stays as-is for development. No overlap to resolve.

## Refactoring plan

### Step 1: Read Pi extension docs
Read the extension documentation and examples to check we're following best practices for tool registration, parameter schemas, error handling, and description formatting.

### Step 2: Extract shared API module
Create `lib/api.ts`:
```typescript
export function requireToken(): void
export async function apiGet<T>(path: string): Promise<T>
export async function apiPost<T>(path: string, data?: unknown): Promise<T>
export async function callService(domain: string, service: string, data?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown }>
```

### Step 3: Delete dead code
- Delete `lib/config-check.ts`
- Delete `docs/storage-schemas.md`
- Remove `ws` + `@types/ws` from package.json if unused

### Step 4: Review and polish tool descriptions
Make all descriptions follow same pattern. Focus on what the AI needs to know to use the tool correctly.

### Step 5: Review parameter schemas
Check that all parameter types, descriptions, and optionality are correct. Ensure the AI gets good error messages when it passes wrong params.

### Step 6: Update project docs
- Update AGENTS.md to reflect new tool architecture
- Update or remove PLAN.md (completed)
- Write this NEXT.md with future roadmap
- Skills are dev-only — no changes needed there

## Future features (after cleanup)

- **Automations/scripts/scenes**: Extend registry to manage YAML-based automations via the tools
- **Area/floor/label management**: Use registry schemas to manage core registries
- **Dashboard management**: Lovelace dashboard CRUD
- **Backup management**: HA backup create/restore via supervisor API
- **History/statistics**: Query entity history and long-term statistics
