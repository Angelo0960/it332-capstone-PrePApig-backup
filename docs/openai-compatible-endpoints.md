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

Pig-price analysis prefers the Responses API and retries Chat Completions on the same configured OpenAI-compatible provider if Responses returns non-JSON content or HTTP 404/405. When a full endpoint override shares the configured base URL's origin, non-JSON/404/405 responses retry against the base-derived endpoint; overrides on a different origin are never silently redirected to the base. Provider response errors record status and content type, and the pig-price failure log records endpoint host/path without logging response bodies or credentials. These retries do not switch vendors. When Google/Serper results are already supplied, pig-price analysis omits the provider's `web_search` tool. Feed-forecast, expense, and estimated-profit analyses use Chat Completions with JSON response format. All requests explicitly set `stream: false` and require valid JSON; the app does not silently switch providers when `OPENAI_BASE_URL` is non-empty.

Configure the variables in the backend deployment environment (for example, Render's `prepapig-backend` service). Do not put API keys in frontend variables or commit secrets.
