# Model Adapters — Overview

Adapters define how the backend communicates with an underlying AI model. Every agent points to a model, and every model has a `type` that selects which adapter handles it.

## Architecture

```
Agent (agents/<name>/config.json)
  └─ model: "claude"
       └─ models["claude"] in config.json
            └─ type: "cli"  →  stream_cli_agent()  (app.py:704)
            └─ type: "api"  →  stream_api_agent()  (app.py:817)
```

`get_agent_registry()` (`app.py:298`) merges the agent's own config with its model config. The combined `agent` dict is then passed to `stream_agent()` which dispatches to the right adapter.

## Built-in Model Types

| Type | Implementation | Use case |
|------|---------------|---------|
| `cli` | `stream_cli_agent()` | Claude Code, Gemini CLI, Codex — subprocess wrappers |
| `api` | `stream_api_agent()` | Ollama and any OpenAI-compatible HTTP endpoint |

## Default Models (`DEFAULT_MODELS` in `app.py:99`)

Built-in fallbacks for well-known models. These apply **only** when a model key is missing from `config.json` entirely. If `config.json` defines `"models"`, those models override DEFAULT_MODELS. Any field absent from a custom model definition falls back to DEFAULT_MODELS via `_resolve_timeout()`.

| Model ID | Type | Notes |
|----------|------|-------|
| `claude` | cli | `claude --print` |
| `gemini` | cli | `gemini -p` |
| `codex` | cli | `codex -q --approval-mode full-auto -p` |
| `ollama` | api | `http://127.0.0.1:11434` |

## Timeout Behaviour

Two separate timeouts control CLI agent execution:

- **`startup_timeout_seconds`** — max wait for the **first byte** of output after process launch. Default: 120s. Exceeding this raises `SubprocessStartupError`.
- **`idle_timeout_seconds`** — max wait between **consecutive chunks** once streaming starts. Default: 120s. Exceeding this raises `SubprocessTimeoutError`.

Both can be overridden at the model or agent level. Precedence: **agent config > DEFAULT_MODELS > hard default (120s)**.

Why these defaults are generous: `claude --print` with a full AGENT.md prompt takes ~15s for the first byte; Gemini CLI initialises an MCP context before any output and consistently takes 19s+ even for simple prompts.
