# API Model Adapter

Calls an OpenAI-compatible HTTP streaming endpoint. No subprocess — pure HTTP. Used for Ollama and any self-hosted or remote inference server.

## How it Works

`stream_api_agent()` (`app.py:817`):

1. POSTs to `<baseUrl>/api/generate` with `{ model, prompt, stream: true }`
2. Reads newline-delimited JSON; yields `data.response` chunks
3. httpx timeout: 120s total (no per-chunk idle timeout)

Note: API agents skip the `startup_timeout` / `idle_timeout` mechanism — they fail or succeed within the httpx timeout.

## Config Fields

```jsonc
// In config.json → "models" → "<model-id>"
{
  "type": "api",
  "baseUrl": "http://127.0.0.1:11434",    // Required. Base URL, no trailing slash.
  "apiModel": "llama3.2",                  // Required. Model name passed to the endpoint.
  "color": "#fb923c",
  "emoji": "🦙"
}
```

## Built-in API Model: Ollama

```
POST http://127.0.0.1:11434/api/generate
{ "model": "deepseek-v3.1:671b-cloud", "prompt": "...", "stream": true }
```

Requires Ollama running locally. Pull the model first: `ollama pull <model>`.

## Adding a New API Model

1. Make sure the server implements `POST /api/generate` with Ollama-compatible streaming response format (newline-delimited JSON with a `response` field).

2. Add to `config.json → models`:

```jsonc
"my-api-model": {
  "type": "api",
  "baseUrl": "http://localhost:8080",
  "apiModel": "my-model-name",
  "color": "#abc123",
  "emoji": "🌐"
}
```

3. Assign the model to an agent via Settings → Agents.

## Limitations

- No `supports_image` support (images are CLI-only via `--add-file`)
- No `supports_thinking` / `--extended-thinking` support
- Errors from the HTTP layer show as `⚠ 無回應` (no structured error type)

## Future: Direct Anthropic / OpenAI API

See `TODO.md → 直接 API 支援` — planned as a future adapter alongside the existing CLI wrappers.
