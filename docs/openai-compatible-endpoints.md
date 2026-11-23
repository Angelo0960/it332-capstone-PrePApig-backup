# OpenAI-compatible endpoint configuration

The backend reads these environment variables for the existing OpenAI-backed integrations:

- `OPENAI_BASE_URL` — optional API base URL. Defaults to `https://api.openai.com/v1` for endpoint construction. When non-empty, it also selects OpenAI for pig-price, feed-forecast, expense, and estimated-profit AI analysis instead of trying Gemini first. The backend appends `/responses` or `/chat/completions` for the relevant integration.
- `OPENAI_RESPONSES_URL` — optional full endpoint URL override for pig-price analysis. If set, it takes precedence over `OPENAI_BASE_URL` for that request.
- `OPENAI_CHAT_COMPLETIONS_URL` — optional full endpoint URL override for Chat Completions integrations. If set, it takes precedence over `OPENAI_BASE_URL` for that request.
- `OPENAI_API_KEY` and `OPENAI_MODEL` — provider credential and model name. If `OPENAI_BASE_URL` is non-empty but `OPENAI_API_KEY` is missing, OpenAI-selected analyses return a configuration error rather than silently switching to Gemini.

If `OPENAI_BASE_URL` is empty, the existing provider preference remains: Gemini first, then the configured alternatives where supported.

Example base URL:

```text
OPENAI_BASE_URL=https://provider.example/v1
```

Pig-price analysis uses the Responses API request format and its `web_search` tool, so its custom endpoint must support both. Feed-forecast, expense, and estimated-profit analyses use Chat Completions with JSON response format. These settings select OpenAI when the base URL is non-empty; the app will not silently fall back to Gemini in that mode.

Configure the variables in the backend deployment environment (for example, Render's `prepapig-backend` service). Do not put API keys in frontend variables or commit secrets.
