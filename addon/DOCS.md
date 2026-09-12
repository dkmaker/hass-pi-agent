# Pi Agent for Home Assistant

An AI agent with full access to your Home Assistant — manage automations, entities, dashboards, helpers, and more through a chat panel, in plain language.

## Getting started

1. Install the add-on and click **Start**.
2. Open **Pi Agent** from the sidebar (or **Open Web UI** on the add-on's Info tab).
3. On first run a **welcome screen** asks you to choose an **AI provider** and **model** and paste that provider's **API key**. Pi runs a quick live test — you can only continue once the key actually works.
4. That's it — start chatting.

To change the provider, model, or key later, open the **⚙️ settings** button in the top bar of the chat panel.

Everything is configured inside the panel. There are no API-key fields to fill in on this Configuration tab — your choice is saved to the add-on's options (so it survives restarts and updates) under the collapsed **AI provider & model** section. Leave that section alone unless you deliberately need a manual fallback (see the warning inside it: manual edits are **not** validated and only take effect on the next restart).

## Choosing a provider

The setup offers the providers that authenticate with a single **API key**:

Anthropic · OpenAI · Google (Gemini) · OpenRouter · xAI (Grok) · Groq · Mistral · Cerebras · Hugging Face

Pick the provider, then the model (the list is fetched live from pi, e.g. `anthropic/claude-sonnet-4.5`), paste the key, and press **Save & test**.

Where to get a key:

| Provider | Where to get it |
|----------|-----------------|
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) → API Keys |
| OpenAI | [platform.openai.com](https://platform.openai.com/) → API Keys |
| Google (Gemini) | [aistudio.google.com](https://aistudio.google.com/) → API Keys |
| OpenRouter | [openrouter.ai](https://openrouter.ai/) → Keys |
| xAI (Grok) | [console.x.ai](https://console.x.ai/) → API Keys |
| Groq | [console.groq.com](https://console.groq.com/) → API Keys |
| Mistral | [console.mistral.ai](https://console.mistral.ai/) → API Keys |
| Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai/) → API Keys |
| Hugging Face | [huggingface.co](https://huggingface.co/) → Settings → Access Tokens |

Providers that use OAuth (GitHub Copilot) or several credentials (Amazon Bedrock, Google Vertex, Azure OpenAI) are intentionally not offered — the setup is single-API-key only.

## The chat panel

- Full-screen chat served over the add-on's Ingress — no separate login.
- Follows your Home Assistant theme (light/dark) and interface language (English, Danish, Norwegian, Swedish, German).
- Tool results render as rich tables with per-entity icons; entities are clickable and open straight to their details.
- Type `/` in the composer for slash commands:
  - **/new** — start a fresh conversation.
  - **/sessions** — list and resume past conversations.
  - **/setup** — a short wizard to record your naming and organisation conventions (saved to the agent's policies).

## Voice & automations (`pi_agent.ask`)

With **Install Conversation Integration** enabled (the default), the add-on installs the Pi Agent integration so automations and Home Assistant Assist can call the `pi_agent.ask` service with a question. Each call runs in a fresh, one-shot context using the model you configured.

## File safety (write-guard)

The agent works from a dedicated scratch directory, **`/homeassistant/agent/`**, which is freely writable (notes, drafts, temporary files). To protect your configuration, the built-in file tools are guarded: the agent may write to the scratch dir, to `configuration.yaml`, and to every file that `configuration.yaml` pulls in via `!include` / `!include_dir_*`. Writes to anything else under `/homeassistant` (for example `.storage/`, `secrets.yaml`, or stray files) are blocked. Registry and state changes still go through the built-in Home Assistant tools as usual.

This is a pragmatic guardrail against accidental writes, not a hard security sandbox.

### Write Guard

Mode for the guard:

- `strict` (default) — block writes outside the allowed set.
- `warn` — allow but log would-be blocks to the add-on log.
- `off` — disable the guard.

### Write Guard Allowlist

Extra paths the agent is allowed to write to, relative to `/homeassistant`. Add directories or globs you deliberately maintain, e.g.:

```yaml
write_guard_allow:
  - custom_components/**
  - www/**
```

Glob syntax: a trailing `/` or `/**` means anything under that directory; `*` matches one path segment; `**` matches any depth.

## Additional Packages

Alpine Linux packages to install at startup. Useful for tools your workflows need (e.g. `jq`, `yq`, `imagemagick`).
