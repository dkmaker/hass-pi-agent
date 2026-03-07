# Pi Agent for Home Assistant

AI coding agent with full Home Assistant access — manage automations, entities, dashboards, and more via natural language.

## Configuration

### Default Provider

Select the AI provider to use by default.

### Default Model

Optionally set a default model. Accepts any model pattern or ID supported by pi, for example:

- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `google/gemini-2.5-pro`
- `*sonnet*` (fuzzy match)

Leave empty to use the provider's default model.

### Environment

Set environment variables as `KEY=VALUE` pairs — one per entry. Use this for **API keys** and any other configuration.

#### API Keys

Add your provider's API key as an environment variable:

| Provider | Environment entry |
|----------|-------------------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY=sk-ant-...` |
| OpenAI | `OPENAI_API_KEY=sk-...` |
| Google (Gemini) | `GEMINI_API_KEY=AI...` |
| OpenRouter | `OPENROUTER_API_KEY=sk-or-...` |
| Groq | `GROQ_API_KEY=gsk_...` |
| xAI (Grok) | `XAI_API_KEY=xai-...` |
| Mistral | `MISTRAL_API_KEY=...` |
| Cerebras | `CEREBRAS_API_KEY=...` |
| Hugging Face | `HF_TOKEN=hf_...` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY=...` |
| GitHub Copilot | `GITHUB_TOKEN=gho_...` |
| Amazon Bedrock | `AWS_ACCESS_KEY_ID=...` |
| | `AWS_SECRET_ACCESS_KEY=...` |
| | `AWS_REGION=us-east-1` |

You can add multiple entries to configure multiple providers or additional settings.

### Additional Packages

Alpine Linux packages to install at startup. Useful for tools your workflows need (e.g., `jq`, `yq`, `imagemagick`).
