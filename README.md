# Pi Agent for Home Assistant

[![Build](https://github.com/dkmaker/hass-pi-agent/actions/workflows/build.yaml/badge.svg)](https://github.com/dkmaker/hass-pi-agent/actions/workflows/build.yaml)

An AI agent with full access to your Home Assistant — manage automations, entities, dashboards, helpers, and more through a chat panel, in plain language.

Powered by [Pi](https://github.com/earendil-works/pi), an open-source coding agent, embedded in-process and served as a native web chat over the add-on's Ingress.

## Installation

### 1. Add the repository

1. Open Home Assistant.
2. Go to **Settings → Add-ons → Add-on Store**.
3. Click the **⋮** menu (top right) → **Repositories**.
4. Add this URL:
   ```
   https://github.com/dkmaker/hass-pi-agent
   ```
5. Click **Add → Close**.

### 2. Install and start

1. Find **Pi Agent for Home Assistant** in the add-on store (refresh if needed).
2. Click **Install**, then **Start**.

### 3. Configure in the panel

1. Open **Pi Agent** from the sidebar (or **Open Web UI** on the add-on's Info tab).
2. The **welcome screen** asks you to choose a provider and model and paste that provider's API key. Pi runs a live test before saving — you can only continue once the key works.
3. Start chatting. Use the **⚙️ settings** button in the top bar to change the provider, model, or key later.

There are no API-key fields on the add-on's Configuration tab — the panel is the source of truth, and your choice is stored in the add-on options (surviving restarts and updates) under a collapsed, app-managed section.

## Configuration

### Provider & model

Set up entirely in the panel. The setup lists the providers that authenticate with a single **API key**, and fetches each provider's model list live from pi:

Anthropic · OpenAI · Google (Gemini) · OpenRouter · xAI (Grok) · Groq · Mistral · Cerebras · Hugging Face

OAuth-only (GitHub Copilot) and multi-credential (Amazon Bedrock, Google Vertex, Azure OpenAI) providers are not offered — the setup is single-API-key only.

### Other add-on options

| Option | What it does |
|--------|--------------|
| **Install Conversation Integration** | Installs the Pi Agent integration so automations and Assist can call the `pi_agent.ask` service (on by default). |
| **Additional Packages** | Extra Alpine Linux packages to install at startup (e.g. `jq`, `imagemagick`). |
| **Write Guard** | Filesystem write protection: `strict` (default), `warn`, or `off`. |
| **Write Guard Allowlist** | Extra paths (globs, relative to `/homeassistant`) the agent may write to. |

## What can it do?

Pi Agent has full access to your Home Assistant instance:

- **Automations** — create, edit, debug, and manage automations.
- **Entities & Devices** — inspect states, rename, organize into areas.
- **Dashboards** — build and modify Lovelace dashboards and cards.
- **Services** — discover and call any Home Assistant service.
- **Helpers** — create input booleans, counters, timers, templates, and more.
- **Areas & Labels** — organize your smart home.
- **Add-ons** — manage installed add-ons.
- **Templates** — render and test Jinja2 templates.
- **Backups** — create and manage backups.
- **System** — view system info, restart, and reload configuration.

The chat panel follows your Home Assistant theme and interface language (English, Danish, Norwegian, Swedish, German), renders tool results as rich clickable tables, and supports `/new`, `/sessions`, and `/setup` slash commands.

## Supported architectures

- `amd64`
- `aarch64`

## License

MIT
