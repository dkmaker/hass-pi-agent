# Pi Agent for Home Assistant

AI coding agent with full Home Assistant access — manage automations, entities, dashboards, and more via natural language.

## Configuration

All API keys are **optional** — you can configure them here or use the `/login` command inside the agent.

### Default Provider

Select the AI provider to use for new conversations.

### Default Model

Optionally set a default model. Accepts any model ID or fuzzy pattern supported by pi:

- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `google/gemini-2.5-pro`
- `*sonnet*` (fuzzy match)

Leave empty to use the provider's default model.

### API Keys — Main Providers

| Field | Provider | Where to get it |
|-------|----------|-----------------|
| Anthropic API Key | Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com/) → API Keys |
| OpenAI API Key | OpenAI (GPT) | [platform.openai.com](https://platform.openai.com/) → API Keys |
| Google (Gemini) API Key | Google Gemini | [aistudio.google.com](https://aistudio.google.com/) → API Keys |
| OpenRouter API Key | OpenRouter | [openrouter.ai](https://openrouter.ai/) → Keys |

### API Keys — Additional Providers

| Field | Provider | Where to get it |
|-------|----------|-----------------|
| xAI (Grok) API Key | xAI | [console.x.ai](https://console.x.ai/) → API Keys |
| Groq API Key | Groq | [console.groq.com](https://console.groq.com/) → API Keys |
| Mistral API Key | Mistral | [console.mistral.ai](https://console.mistral.ai/) → API Keys |
| Cerebras API Key | Cerebras | [cloud.cerebras.ai](https://cloud.cerebras.ai/) → API Keys |
| Hugging Face Token | Hugging Face | [huggingface.co](https://huggingface.co/) → Settings → Access Tokens |
| GitHub Token (Copilot) | GitHub Copilot | GitHub personal access token |
| Azure OpenAI API Key | Azure OpenAI | Azure Portal → OpenAI resource → Keys |

### Amazon Bedrock

For Bedrock, fill in all three fields:
- **AWS Access Key ID**
- **AWS Secret Access Key**
- **AWS Region** (e.g. `us-east-1`)

### Service Provider & Model

Optional separate provider/model for the `pi_agent.ask` service (used by automations and voice assistants). If empty, uses the default provider.

### Additional Packages

Alpine Linux packages to install at startup. Useful for tools your workflows need (e.g., `jq`, `yq`, `imagemagick`).

## File Safety (Write-Guard)

The agent works from a dedicated scratch directory, **`/homeassistant/agent/`**, which is freely writable (notes, backups, temporary files). To protect your configuration, the built-in file tools are guarded: the agent may write to the scratch dir, to `configuration.yaml`, and to every file that `configuration.yaml` pulls in via `!include` / `!include_dir_*`. Writes to anything else under `/homeassistant` (for example `.storage/`, `secrets.yaml`, or stray files) are blocked. Registry and state changes still go through the built-in Home Assistant tools as usual.

This is a pragmatic guardrail against accidental writes, not a hard security sandbox.

### Write Guard

Mode for the guard:

- `strict` (default) — block writes outside the allowed set.
- `warn` — allow but log would-be blocks to the add-on log.
- `off` — disable the guard.

### Write Guard Allow

Extra paths the agent is allowed to write to, relative to `/homeassistant`. Add directories or globs you deliberately maintain, e.g.:

```yaml
write_guard_allow:
  - custom_components/**
  - www/**
```

Glob syntax: a trailing `/` or `/**` means anything under that directory; `*` matches one path segment; `**` matches any depth.
