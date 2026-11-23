# OpenAI-compatible endpoint configuration

The backend reads these environment variables for the existing OpenAI-backed integrations:

- `OPENAI_BASE_URL` — optional API base URL. Defaults to `https://api.openai.com/v1`. Set it to the provider's API prefix (including `/v1` when required); the backend appends `/responses` or `/chat/completions` for the relevant integration.
- `OPENAI_RESPONSES_URL` — optional full endpoint URL override for pig-price analysis. If set, it takes precedence over `OPENAI_BASE_URL` for that request.
- `OPENAI_CHAT_COMPLETIONS_URL` — optional full endpoint URL override for feed-forecast analysis. If set, it takes precedence over `OPENAI_BASE_URL` for that request.
- `OPENAI_API_KEY` and `OPENAI_MODEL` — provider credential and model name, as before.

Example base URL:

```text
OPENAI_BASE_URL=https://provider.example/v1
```

The pig-price integration uses the Responses API request format and its `web_search` tool, so a custom endpoint must support both. Feed-forecast analysis uses Chat Completions with JSON response format. A provider that supports only one API style can be configured with the corresponding full endpoint variable, but the other integration still needs a compatible endpoint. These settings affect the existing OpenAI integrations only; expense and estimated-profit analysis remain Gemini-only.

Configure the variables in the backend deployment environment (for example, Render's `prepapig-backend` service). Do not put API keys in frontend variables or commit secrets.
