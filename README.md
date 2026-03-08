# Pi Agent for Home Assistant

[![Build](https://github.com/dkmaker/hass-pi-agent/actions/workflows/build.yaml/badge.svg)](https://github.com/dkmaker/hass-pi-agent/actions/workflows/build.yaml)

AI coding agent with full Home Assistant access — manage automations, entities, dashboards, and more via natural language.

Powered by [Pi](https://github.com/mariozechner/pi-coding-agent), an open-source coding agent that runs in your terminal.

## Installation

### 1. Add the repository

1. Open Home Assistant
2. Go to **Settings → Add-ons → Add-on Store**
3. Click the **⋮** menu (top right) → **Repositories**
4. Add this URL:
   ```
   https://github.com/dkmaker/hass-pi-agent
   ```
5. Click **Add → Close**

### 2. Install the add-on

1. Find **Pi Agent for Home Assistant** in the add-on store (refresh if needed)
2. Click **Install**
3. Go to the **Configuration** tab
4. Add your AI provider API key under **Environment**, e.g.:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. Click **Save**
6. Go to the **Info** tab and click **Start**

### 3. Open the agent

Click **Pi Agent** in the sidebar, or go to the **Info** tab and click **Open Web UI**.

## Configuration

### Provider

Select your AI provider from the **Default Provider** dropdown:

Anthropic · OpenAI · Google · OpenRouter · Groq · xAI · Mistral · Cerebras · Hugging Face · GitHub Copilot · Amazon Bedrock · Google Vertex · Azure OpenAI

### API Keys

Add your provider's API key as an environment variable in the **Environment** list:

| Provider | Environment variable |
|----------|---------------------|
| Anthropic | `ANTHROPIC_API_KEY=sk-ant-...` |
| OpenAI | `OPENAI_API_KEY=sk-...` |
| Google | `GEMINI_API_KEY=AI...` |
| OpenRouter | `OPENROUTER_API_KEY=sk-or-...` |
| Groq | `GROQ_API_KEY=gsk_...` |
| xAI | `XAI_API_KEY=xai-...` |
| Mistral | `MISTRAL_API_KEY=...` |
| Cerebras | `CEREBRAS_API_KEY=...` |
| Hugging Face | `HF_TOKEN=hf_...` |
| GitHub Copilot | `GITHUB_TOKEN=gho_...` |
| Amazon Bedrock | `AWS_ACCESS_KEY_ID=...` + `AWS_SECRET_ACCESS_KEY=...` + `AWS_REGION=us-east-1` |

### Model

Optionally set a **Default Model** — accepts any model ID or fuzzy pattern:

- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `*sonnet*` (fuzzy match)

Leave empty to use the provider's default.

### Additional Packages

Install extra Alpine Linux packages at startup (e.g., `jq`, `imagemagick`).

## What can it do?

Pi Agent has full access to your Home Assistant instance:

- **Automations** — create, edit, debug, and manage automations
- **Entities & Devices** — inspect states, rename, organize into areas
- **Dashboards** — build and modify Lovelace dashboards and cards
- **Services** — discover and call any Home Assistant service
- **Helpers** — create input booleans, counters, timers, templates, and more
- **Areas & Labels** — organize your smart home
- **Add-ons** — manage installed add-ons
- **Templates** — render and test Jinja2 templates
- **Backups** — create and manage backups
- **System** — view system info, restart, and reload configuration

## Supported architectures

- `amd64`
- `aarch64`

## License

MIT
