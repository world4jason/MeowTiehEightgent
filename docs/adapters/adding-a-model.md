# Adding a New Model

Quick reference for wiring in a new AI backend.

## Step 1 — Add to `config.json`

```jsonc
// config.json
{
  "models": {
    "my-model": {
      "type": "cli",          // or "api"
      "cmd": ["my-cli", "-p"],
      "color": "#aabbcc",
      "emoji": "🆕",
      "startup_timeout_seconds": 60,
      "idle_timeout_seconds": 120
    }
  }
}
```

See [cli-model.md](cli-model.md) or [api-model.md](api-model.md) for all config fields.

## Step 2 — Add to `DEFAULT_MODELS` (if needed)

If your model has a known warm-up delay (like Gemini's 19s MCP init), add it to `DEFAULT_MODELS` in `app.py:99` so the correct timeout applies even when the user's `config.json` doesn't specify it:

```python
DEFAULT_MODELS = {
    ...
    "my-model": {
        "type": "cli",
        "cmd": ["my-cli", "-p"],
        "color": "#aabbcc",
        "emoji": "🆕",
        "startup_timeout_seconds": 60,
        "idle_timeout_seconds": 120,
    },
}
```

`_resolve_timeout()` checks `DEFAULT_MODELS` as a fallback between agent-level config and the hard-coded default.

## Step 3 — Create an Agent

Via Settings → Agents → New Agent, pick your model. Or directly create `agents/<name>/config.json`:

```jsonc
{
  "emoji": "🆕",
  "color": "#aabbcc",
  "description": "My new model",
  "model": "my-model",
  "enabled": true
}
```

## Step 4 — Test

Use the **測試連線** button in Settings → Agents. It calls `POST /agents/<name>/test` which sends a short ping prompt and reports the response or error.

## Step 5 — Validate Image Support

If your CLI doesn't support `--add-file`, set `"supports_image": false` in the model config. Otherwise users sending images will crash the subprocess.

## Debugging Timeouts

Run in Python to measure real first-byte latency:

```python
import asyncio, time

async def test():
    start = time.time()
    proc = await asyncio.create_subprocess_exec(
        "my-cli", "-p", "say hi",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    chunk = await asyncio.wait_for(proc.stdout.read(256), timeout=60)
    print(f"First byte in {time.time()-start:.1f}s: {chunk[:30]}")
    proc.kill(); await proc.wait()

asyncio.run(test())
```

Set `startup_timeout_seconds` to at least 2× the measured value.
