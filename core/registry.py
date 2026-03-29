"""Agent registry: scanning agents/ folders and building the in-memory registry."""
import json
from pathlib import Path


def _merge_v0_agent(agent: dict, agent_dir: Path, models: dict) -> tuple[str, dict]:
    """Merge connection info for a v0 agent (legacy model soft-ref format).

    Returns (registry_key, merged_agent_dict).
    """
    name = agent_dir.name
    agent["name"] = name
    agent["workspace"] = agent_dir

    model_id = agent.get("model", "")
    agent["model_id"] = model_id
    if model_id in models:
        m = models[model_id]
        agent["type"] = m.get("type", "cli")
        if "cmd" in m:
            base_cmd = list(m["cmd"])
            # Append extra_flags if defined (e.g. ["--model", "claude-opus-4-5"])
            for flag in m.get("extra_flags", []):
                if flag not in base_cmd:
                    base_cmd.append(flag)
            agent["cmd"] = base_cmd
        if "baseUrl" in m:
            agent["baseUrl"] = m["baseUrl"]
        if "apiModel" in m:
            agent["model"] = m["apiModel"]  # for API calls
        # Merge timeout fields from model config (agent-level config takes precedence)
        for timeout_key in ("idle_timeout_seconds", "startup_timeout_seconds"):
            if timeout_key not in agent and timeout_key in m:
                agent[timeout_key] = m[timeout_key]

    return name, agent


def _merge_v1_agent(agent: dict, agent_dir: Path, presets: dict) -> tuple[str, dict]:
    """Merge connection info for a v1 agent (adapter-based format).

    Returns (registry_key, merged_agent_dict).
    Registry key = agent["name"] from config.json (not the folder name).
    """
    name = agent.get("name", agent_dir.name)
    agent["name"] = name
    agent["workspace"] = agent_dir

    adapter_type = agent.get("adapter", "")
    adapter_config = agent.get("adapterConfig") or {}
    # Try exact match first, then strip common suffixes (_local, _api)
    preset = presets.get(adapter_type) or {}
    if not preset:
        for suffix in ("_local", "_api", "_cloud"):
            base = adapter_type.removesuffix(suffix)
            if base != adapter_type and base in presets:
                preset = presets[base]
                break

    # Determine type: "api" if baseUrl in preset, else "cli"
    if "baseUrl" in preset:
        agent["type"] = "api"
        agent["baseUrl"] = preset["baseUrl"]
    else:
        agent["type"] = "cli"

    # Build cmd from preset command + defaultArgs (CLI adapters only)
    command = adapter_config.get("command") or preset.get("command")
    if command:
        default_args = preset.get("defaultArgs", [])
        agent["cmd"] = [command] + list(default_args)

    # Model: adapterConfig.model > preset.defaultModel
    model = adapter_config.get("model") or preset.get("defaultModel")
    if model:
        agent["model"] = model

    # model_id for legacy fallback paths (_resolve_timeout, etc.)
    agent["model_id"] = adapter_type

    # Timeouts: adapterConfig.timeoutSec > preset.timeoutSec
    timeout_sec = adapter_config.get("timeoutSec") or preset.get("timeoutSec")
    if timeout_sec is not None:
        agent["idle_timeout_seconds"] = timeout_sec

    startup_timeout_sec = adapter_config.get("startupTimeoutSec") or preset.get("startupTimeoutSec")
    if startup_timeout_sec is not None:
        agent["startup_timeout_seconds"] = startup_timeout_sec

    # supports_image from preset
    if "supports_image" in preset and "supports_image" not in agent:
        agent["supports_image"] = preset["supports_image"]

    return name, agent


def get_agent_registry() -> dict[str, dict]:
    """Load all agents by scanning agents/ folders for config.json.

    Supports both v0 (model soft-ref) and v1 (adapter-based) agent configs.
    """
    import app as _app
    agents_dir = _app.AGENTS_DIR
    models = _app.load_models()
    presets = _app.load_adapter_presets()
    registry: dict[str, dict] = {}

    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
            continue
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            continue
        try:
            agent = json.loads(config_path.read_text())

            # Detect v1 (has configVersion field) vs v0 (legacy)
            if agent.get("configVersion", 0) >= 1:
                key, merged = _merge_v1_agent(agent, agent_dir, presets)
            else:
                key, merged = _merge_v0_agent(agent, agent_dir, models)

            registry[key] = merged
        except Exception:
            continue

    return registry


def _find_agent_dir(name: str) -> Path | None:
    """Find an agent folder by display name.

    Scans agents/ directory. For v1 configs (has 'name' field), matches against
    the config name. For v0 configs (no 'name' field), matches against folder name.
    Skips _default/ and Default_* folders.
    Returns the Path to the matching folder, or None.
    """
    import app as _app
    agents_dir = _app.AGENTS_DIR

    if name == "_default":
        p = agents_dir / "_default"
        return p if p.is_dir() else None

    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir():
            continue
        if agent_dir.name.startswith("_") or agent_dir.name.startswith("Default_"):
            continue
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            continue
        try:
            cfg = json.loads(config_path.read_text())
        except Exception:
            continue
        # v1 config: has 'name' field — match against it
        if "name" in cfg:
            if cfg["name"] == name:
                return agent_dir
        else:
            # v0 config: match against folder name
            if agent_dir.name == name:
                return agent_dir

    return None


def _get_installed_agent_names() -> set[str]:
    """Return set of display names for all installed agents.

    Used for marketplace 'installed' checks. Handles both v0 (folder name)
    and v1 (config name field) agents.
    """
    import app as _app
    agents_dir = _app.AGENTS_DIR

    names: set[str] = set()
    for agent_dir in agents_dir.iterdir():
        if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
            continue
        config_path = agent_dir / "config.json"
        if config_path.exists():
            try:
                cfg = json.loads(config_path.read_text())
                # v1: use config name; v0: use folder name
                names.add(cfg.get("name", agent_dir.name))
            except Exception:
                names.add(agent_dir.name)
        else:
            names.add(agent_dir.name)
    return names
