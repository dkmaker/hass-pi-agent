---
name: ha-dev
description: Use this skill for ANY interaction with the local Home Assistant development environment — querying the HA API, managing entities/services/add-ons, controlling the HAOS dev VM (start/stop/ssh), deploying the hass-claude-code add-on, or searching HA documentation. Triggers on any mention of Home Assistant, HA entities, the dev VM, add-on deployment, or HA docs lookup.
---

# Home Assistant Development Skill

Unified skill for the local HAOS dev VM. All scripts are in `./scripts/` relative to this file. Workflow docs are in `./docs/`.

## Quick Reference

| Task | Script | Docs |
|------|--------|------|
| Talk to HA REST API | `./scripts/ha-api` | `./docs/api-reference.md` |
| Talk to Supervisor API | `./scripts/ha-supervisor` | `./docs/supervisor-reference.md` |
| Manage the dev VM | `./scripts/vm-ctl` | `./docs/vm-management.md` |
| Deploy add-on to VM | `./scripts/deploy-addon` | `./docs/addon-workflow.md` |
| Setup VM from scratch | `./scripts/setup-vm` | `./docs/vm-management.md` |
| Search HA docs | grep/rg | `./docs/documentation.md` |

## Environment

| Property | Value |
|----------|-------|
| VM name | `haos-dev` |
| Network | `haos-isolated` (10.99.0.0/24, NAT, no LAN bridge) |
| VM IP | `10.99.0.13` |
| HA URL | http://10.99.0.13:8123 |
| HA version | 2026.3.1 |
| SSH | `root@10.99.0.13` (port 22, ed25519 key) |
| API token | `.env` in repo root (`HAOS_API_TOKEN`) |

## Usage

Read the relevant `./docs/*.md` file for the workflow you need, then run the corresponding `./scripts/*` command. All scripts are self-contained with embedded config (IP, token, VM name).
