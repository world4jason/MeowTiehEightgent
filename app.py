import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx  # re-exported: tests patch app.httpx.AsyncClient
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate_if_needed()
    migrate_history_to_folders()
    ensure_agent_configs()
    ensure_default_template()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_DIR = Path(__file__).parent.resolve()
HISTORY_DIR = PROJECT_DIR / "history"
HISTORY_DIR.mkdir(exist_ok=True)
CONFIG_FILE = PROJECT_DIR / "config.json"
AGENTS_DIR = PROJECT_DIR / "agents"
AGENTS_DIR.mkdir(exist_ok=True)

# ── Config defaults (re-exported from core.config) ────────────────────────────

from core.config import DEFAULT_MODELS, _convert_models_to_presets


# ── Config ────────────────────────────────────────────────────────────────────

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            pass
    return {"models": DEFAULT_MODELS}


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))


def load_models() -> dict:
    """Legacy helper — returns the old-style models dict.
    Kept for backward compatibility with resolve_thinking_model (v0 path),
    _resolve_timeout, _resolve_supports_image (v0 path), and model CRUD endpoints.
    """
    cfg = load_config()
    return cfg.get("models", DEFAULT_MODELS)



def load_adapter_presets() -> dict:
    """Load adapter presets from config.json.

    - If ``adapter_presets`` key exists → return it directly.
    - Otherwise convert old ``models`` dict on the fly (backward compat).
    """
    cfg = load_config()
    if "adapter_presets" in cfg:
        return cfg["adapter_presets"]
    # Fallback: convert old models format
    models = cfg.get("models", DEFAULT_MODELS)
    return _convert_models_to_presets(models)


# ── Migration from old config format ──────────────────────────────────────────

def migrate_if_needed():
    """One-time migration: move agents[] from config.json to per-folder config.json."""
    cfg = load_config()
    if "agents" not in cfg:
        return  # already migrated

    agents_old = cfg.pop("agents", {})
    providers_old = cfg.get("providers", {})
    models = cfg.get("models", {})

    for name, a in agents_old.items():
        agent_dir = AGENTS_DIR / name.lower()
        agent_dir.mkdir(parents=True, exist_ok=True)

        # Create config.json if not exists
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            model_id = name.lower()
            config_path.write_text(json.dumps({
                "emoji": a.get("emoji", "🤖"),
                "color": a.get("color", "#888"),
                "description": f"{name} agent",
                "model": model_id,
                "skills": [],
                "enabled": a.get("enabled", False),
            }, indent=2, ensure_ascii=False))

        # Migrate old {NAME}.md → AGENT.md
        agent_md = agent_dir / "AGENT.md"
        if not agent_md.exists():
            old_md = agent_dir / f"{name.upper()}.md"
            if old_md.exists():
                agent_md.write_text(old_md.read_text())
            else:
                default_src = AGENTS_DIR / "_default" / "AGENT.md"
                if default_src.exists():
                    agent_md.write_text(default_src.read_text().replace("{name}", name))

        # Build model entry
        model_id = name.lower()
        if model_id not in models:
            model_entry: dict = {"type": a.get("type", "cli")}
            if "cmd" in a:
                model_entry["cmd"] = a["cmd"]
            if "color" in a:
                model_entry["color"] = a["color"]
            if "emoji" in a:
                model_entry["emoji"] = a["emoji"]
            if a.get("type") == "api":
                pname = a.get("provider", model_id)
                p = providers_old.get(pname, {})
                if "baseUrl" in p:
                    model_entry["baseUrl"] = p["baseUrl"]
                if "model" in p:
                    model_entry["apiModel"] = p["model"]
            models[model_id] = model_entry

    cfg["models"] = models
    cfg.pop("providers", None)
    save_config(cfg)


def ensure_agent_configs():
    """Create config.json for any existing agent folder that's missing it."""
    models = load_models()
    for agent_dir in AGENTS_DIR.iterdir():
        if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
            continue
        config_path = agent_dir / "config.json"
        if config_path.exists():
            continue
        name = agent_dir.name
        model_id = name.lower()
        # Find matching model by id
        m = models.get(model_id, {})
        config_path.write_text(json.dumps({
            "emoji": m.get("emoji", "🤖"),
            "color": m.get("color", "#888"),
            "description": f"{name} agent",
            "model": model_id,
            "skills": [],
            "enabled": True,
        }, indent=2, ensure_ascii=False))
        # Copy old rules file → AGENT.md
        agent_md = agent_dir / "AGENT.md"
        if not agent_md.exists():
            for candidate in [f"{name.upper()}.md", "CLAUDE.md", "GEMINI.md"]:
                old = agent_dir / candidate
                if old.exists():
                    agent_md.write_text(old.read_text())
                    break
            else:
                default_src = AGENTS_DIR / "_default" / "AGENT.md"
                if default_src.exists():
                    agent_md.write_text(default_src.read_text().replace("{name}", name))


# ── Default template agent ─────────────────────────────────────────────────────

def ensure_default_template():
    """Verify _default template folder exists. It MUST be in git."""
    default_dir = AGENTS_DIR / "_default"
    if not default_dir.exists():
        raise RuntimeError(
            f"agents/_default/ not found at {default_dir}. "
            "This folder is required and should be committed to git."
        )


# ── Workspace setup (re-exported from core.workspace) ─────────────────────────

from core.workspace import ensure_workspace


# ── Agent registry (re-exported from core.registry) ───────────────────────────

from core.registry import (
    _merge_v0_agent,
    _merge_v1_agent,
    get_agent_registry,
    _find_agent_dir,
    _get_installed_agent_names,
)


# ── Prompt builder + skill resolver (re-exported from core.prompt) ────────────

from core.prompt import (
    intercept_mode_command,
    resolve_human_text,
    build_prompt,
)


# ── Subprocess error types (re-exported from core.errors) ─────────────────────

from core.errors import (
    SubprocessError,
    SubprocessStartupError,
    SubprocessTimeoutError,
    SubprocessCrashError,
    TokenUsage,
)


# ── Runner helpers (re-exported from core.runner) ─────────────────────────────
# Think mode uses "--effort" "max" flag (see core/runner.py stream_cli_agent)

from core.runner import (
    _get_json_output_flags,
    _parse_jsonl_line,
    accumulate_token_usage,
    format_token_count,
    _resolve_timeout,
    _error_message,
    _resolve_supports_image,
    write_temp_images,
    cleanup_temp_files,
    call_cli_agent,
    call_api_agent,
    call_agent,
    stream_cli_agent,
    stream_api_agent,
    build_mode_switch_notification,
    _handle_set_mode,
    append_memory,
    write_daily_summary,
)

from history_manager import truncate_history, apply_sliding_window, TRUNCATION_MARKER, compress_history, load_session_config, _format_history_text

# ── Memory helpers (re-exported from core.memory) ──────────────────────────

from core.memory import (
    FACT_PATTERNS,
    heuristic_extract_facts,
    flush_facts_to_memory,
    load_recent_facts,
    load_entities,
    flush_entities,
    distill_session,
    safe_distill,
    _distill_semaphore,
    _distilling_sessions,
    _triage_session,
    _llm_extract_facts,
    _llm_extract_entities,
    _persist_session_memory,
    _consolidate_agent_memory,
    _update_memory_index,
)

# ── Security helpers (re-exported from core.security) ─────────────────────────

from core.security import (
    PROTECTED_FILENAMES,
    validate_filename,
    safe_workspace_path,
)


def resolve_thinking_model(agent: dict) -> dict | None:
    """Resolve model_tiers.thinking to a full model config dict.
    Returns a shallow copy of agent with thinking model's cmd/timeouts merged,
    or None if no thinking tier is configured or the model key is missing.

    For v1 agents (with adapter field), model_tiers values are model variant
    names (e.g. "claude-opus-4-6") that override the adapter's model parameter.
    The adapter preset provides the base command/connection info.

    For v0 agents, model_tiers values reference model IDs in the models dict.
    """
    tiers = agent.get("model_tiers")
    if not tiers or "thinking" not in tiers:
        return None
    thinking_key = tiers["thinking"]

    # v1 agents: model_tiers are model variant names, not model IDs.
    # Use the same adapter preset but override the model parameter.
    if agent.get("configVersion", 0) >= 1:
        resolved = dict(agent)
        resolved["model"] = thinking_key
        return resolved

    # v0 path: look up thinking_key in old models dict
    models = load_models()
    if thinking_key not in models:
        logger.warning("model_tiers.thinking=%r not found in models config", thinking_key)
        return None
    m = models[thinking_key]
    resolved = dict(agent)
    if "cmd" in m:
        base_cmd = list(m["cmd"])
        for flag in m.get("extra_flags", []):
            if flag not in base_cmd:
                base_cmd.append(flag)
        resolved["cmd"] = base_cmd
    resolved["type"] = m.get("type", "cli")
    if "baseUrl" in m:
        resolved["baseUrl"] = m["baseUrl"]
    if "apiModel" in m:
        resolved["model"] = m["apiModel"]
    for tk in ("idle_timeout_seconds", "startup_timeout_seconds"):
        if tk in m:
            resolved[tk] = m[tk]
    return resolved


async def stream_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
    """Dispatch to streaming implementation, with model_tiers resolution."""
    effective_agent = agent
    subprocess_mode = mode
    if mode == "think":
        resolved = resolve_thinking_model(agent)
        if resolved is not None:
            effective_agent = resolved
            subprocess_mode = "chat"  # only affects subprocess, caller keeps mode="think" for badge

    if effective_agent.get("type") == "api":
        async for chunk in stream_api_agent(effective_agent, prompt):
            yield chunk
    else:
        async for chunk in stream_cli_agent(effective_agent, prompt, images=images, mode=subprocess_mode):
            yield chunk


# ── History helpers (re-exported from core.history) ───────────────────────────

HIDDEN_FILE = PROJECT_DIR / "hidden_sessions.json"

from core.history import (
    session_dir,
    session_messages_path,
    save_history,
    migrate_history_to_folders,
    load_hidden,
    save_hidden,
    save_session_images,
)


# ── HTTP endpoints ────────────────────────────────────────────────────────────

from routes.health import router as _health_router
app.include_router(_health_router)



from routes.user import router as _user_router
app.include_router(_user_router)

from routes.models import router as _models_router
app.include_router(_models_router)


# ── Marketplace ───────────────────────────────────────────────────────────────

MARKETPLACE_DIR = PROJECT_DIR / "marketplace"

from routes.marketplace import router as _marketplace_router
app.include_router(_marketplace_router)


from routes.agents import router as _agents_router
app.include_router(_agents_router)


# ── Skills ────────────────────────────────────────────────────────────────────

# ── Skill helpers (find_skill_file/parse_skill re-exported from core.skills) ──

from core.skills import find_skill_file, parse_skill


from core.prompt import list_skill_slugs

from routes.skills import router as _skills_router
app.include_router(_skills_router)


# ── Workspaces ────────────────────────────────────────────────────────────────

WORKSPACES_DIR = PROJECT_DIR / "workspaces"
WORKSPACES_DIR.mkdir(exist_ok=True)

SCENARIOS_DIR = PROJECT_DIR / "scenarios"


from core.workspace import workspace_config_path, load_workspace_config

from routes.workspaces import router as _workspaces_router
app.include_router(_workspaces_router)


# ── Scenarios ─────────────────────────────────────────────────────────────────

from routes.scenarios import router as _scenarios_router
app.include_router(_scenarios_router)


from routes.sessions import router as _sessions_router
app.include_router(_sessions_router)


from routes.providers import router as _providers_router
app.include_router(_providers_router)


# ── WebSocket (re-exported from routes.ws) ────────────────────────────────────

from routes.ws import router as _ws_router
app.include_router(_ws_router)

app.mount("/static", StaticFiles(directory="static"), name="static")
