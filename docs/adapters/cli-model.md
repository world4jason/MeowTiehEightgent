# CLI Model Adapter

Runs an AI CLI tool as a subprocess. Every token the CLI writes to stdout is streamed back to the browser in real time.

## How it Works

`stream_cli_agent()` (`app.py:704`):

1. Spawns `subprocess(cmd + extra_args + [prompt], cwd=agent["workspace"])`
2. Waits up to `startup_timeout_seconds` for the first byte
3. Streams 256-byte chunks with an `idle_timeout_seconds` deadline between each
4. On finish: propagates output to the WS session and appends to agent memory

Prompt is always passed as the **last CLI argument**. Images are written to temp files and injected via `--add-file` (if `supports_image: true`).

## Config Fields

```jsonc
// In config.json → "models" → "<model-id>"
{
  "type": "cli",
  "cmd": ["claude", "--print"],            // Required. Executable + flags, no prompt.
  "startup_timeout_seconds": 120,          // Optional. Default from DEFAULT_MODELS or 120.
  "idle_timeout_seconds": 120,             // Optional. Default from DEFAULT_MODELS or 120.
  "supports_image": true,                  // Optional. Default true. Set false for codex.
  "supports_thinking": false,              // Optional. Default false. Set true for claude.
  "color": "#a78bfa",                      // UI colour.
  "emoji": "🟣"
}
```

Extra CLI flags (e.g. `--model claude-opus-4-6`) go in `extra_flags`:

```jsonc
{
  "type": "cli",
  "cmd": ["claude", "--print"],
  "extra_flags": ["--model", "claude-opus-4-6"]
}
```

`extra_flags` are appended to `cmd` before the prompt, deduped against existing flags.

## Built-in CLI Models

### Claude Code (`claude`)

```
claude --print "<prompt>"
```

- Working dir: `agents/<name>/` (may contain `CLAUDE.md` for project context)
- First-byte latency: ~2s (simple) to ~15s (full AGENT.md + 3KB context)
- `supports_thinking: true` → adds `--extended-thinking` when agent mode is `think`

### Gemini CLI (`gemini`)

```
gemini -p "<prompt>"
```

- MCP context initialisation (credentials + memory read) runs before any stdout
- First-byte latency: 19s+ regardless of prompt size
- `supports_image: true`

### Codex (`codex`)

```
codex -q --no-project-doc --approval-mode full-auto -p "<prompt>"
```

- `supports_image: false` — `--add-file` not supported

## Error Types

| Error | Cause | Badge |
|-------|-------|-------|
| `SubprocessStartupError` | No output within `startup_timeout_seconds` | ⚠ 逾時 |
| `SubprocessTimeoutError` | No chunk within `idle_timeout_seconds` | ⚠ 逾時 |
| `SubprocessCrashError` | Process exited non-zero with no output | ⚠ 無回應 |
| `FileNotFoundError` | CLI binary not found in PATH | ⚠ 找不到指令 |

## Adding a New CLI Model

1. Add entry to `config.json → models`:

```jsonc
"my-model": {
  "type": "cli",
  "cmd": ["my-cli", "--flag"],
  "startup_timeout_seconds": 60,
  "color": "#aabbcc",
  "emoji": "🚀"
}
```

2. If the CLI needs a long warm-up, also add it to `DEFAULT_MODELS` in `app.py` so the timeout applies even if the user's `config.json` omits it.

3. Test via **Settings → Agents → 測試連線** button (`POST /agents/<name>/test`).
