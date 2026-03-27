"""Configuration defaults and pure config helpers (no filesystem path deps)."""

DEFAULT_MODELS = {
    "claude": {
        "type": "cli",
        "cmd": ["claude", "--print"],
        "color": "#a78bfa",
        "emoji": "🟣",
        "supports_image": True,
        "idle_timeout_seconds": 120,
        "startup_timeout_seconds": 120,  # full AGENT.md prompt can take 15s+ for first byte
    },
    "gemini": {
        "type": "cli",
        "cmd": ["gemini", "-p"],
        "color": "#34d399",
        "emoji": "🟢",
        "supports_image": True,
        "idle_timeout_seconds": 600,       # generalist tool can take 3-5 min
        "startup_timeout_seconds": 120,  # gemini MCP context init takes 19s+ before first byte
    },
    "ollama": {
        "type": "api",
        "baseUrl": "http://127.0.0.1:11434",
        "apiModel": "llama3.2",
        "color": "#fb923c",
        "emoji": "🦙",
    },
    "codex": {
        "type": "cli",
        "cmd": ["codex", "-q", "--no-project-doc", "--approval-mode", "full-auto", "-p"],
        "color": "#38bdf8",
        "emoji": "🔵",
        "supports_image": False,
        "idle_timeout_seconds": 120,
        "startup_timeout_seconds": 120,
    },
}


def _convert_models_to_presets(models: dict) -> dict:
    """Convert old v0 models dict to adapter_presets-like dict on the fly.

    The keys remain the same as the old model IDs (e.g. "claude", "ollama")
    so that v0 agents with model="claude" can still look up their preset.
    Each entry is augmented with command/defaultArgs extracted from cmd[].
    """
    presets: dict = {}
    for mid, m in models.items():
        preset: dict = dict(m)  # shallow copy
        # Extract command + defaultArgs from cmd list
        cmd_list = m.get("cmd", [])
        if cmd_list:
            preset["command"] = cmd_list[0]
            preset["defaultArgs"] = cmd_list[1:]
        # Map apiModel → defaultModel for consistency
        if "apiModel" in m:
            preset["defaultModel"] = m["apiModel"]
        # Map timeout fields
        if "idle_timeout_seconds" in m:
            preset["timeoutSec"] = m["idle_timeout_seconds"]
        if "startup_timeout_seconds" in m:
            preset["startupTimeoutSec"] = m["startup_timeout_seconds"]
        presets[mid] = preset
    return presets
