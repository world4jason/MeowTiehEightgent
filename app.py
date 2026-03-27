import asyncio
import base64
import logging
import os
from conversation_engine import ConversationEngine
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import httpx  # re-exported: tests patch app.httpx.AsyncClient
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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


# ── Workspace setup ───────────────────────────────────────────────────────────

def ensure_workspace(agent: dict):
    ws: Path = agent["workspace"]
    ws.mkdir(parents=True, exist_ok=True)
    (ws / "memory").mkdir(exist_ok=True)
    name = agent["name"]

    default_dir = AGENTS_DIR / "_default"
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"]:
        dst = ws / fname
        if not dst.exists():
            src = default_dir / fname
            if src.exists():
                dst.write_text(src.read_text().replace("{name}", name))


# ── Agent registry ────────────────────────────────────────────────────────────

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
    preset = presets.get(adapter_type) or {}

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
    models = load_models()
    presets = load_adapter_presets()
    registry: dict[str, dict] = {}

    for agent_dir in sorted(AGENTS_DIR.iterdir()):
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
    if name == "_default":
        p = AGENTS_DIR / "_default"
        return p if p.is_dir() else None

    for agent_dir in AGENTS_DIR.iterdir():
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
    names: set[str] = set()
    for agent_dir in AGENTS_DIR.iterdir():
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


# ── Skill resolver ────────────────────────────────────────────────────────────

_THINK_RE = re.compile(r'^/think(?:\s+@(\S+))?$', re.IGNORECASE)
_CHAT_RE = re.compile(r'^/chat(?:\s+@(\S+))?$', re.IGNORECASE)


def intercept_mode_command(
    text: str,
    agent_modes: dict,
    active_agents: list,
) -> tuple[bool, list[dict]]:
    """Check if text is a /think or /chat TUI command.

    Returns (intercepted: bool, mode_updates: list[dict]).
    Each update is either {"agent": str, "mode": str} or {"error": str}.
    If intercepted=True, caller must NOT forward text to agents.
    """
    m = _THINK_RE.match(text.strip()) or _CHAT_RE.match(text.strip())
    if not m:
        return False, []

    target_mode = "think" if text.strip().lower().startswith("/think") else "chat"
    target_name = m.group(1)  # None if no @name

    updates: list[dict] = []
    if target_name:
        found = next(
            (a["name"] for a in active_agents if a["name"].lower() == target_name.lower()),
            None,
        )
        if found:
            agent_modes[found] = target_mode
            updates.append({"agent": found, "mode": target_mode})
        else:
            return True, [{"error": f'No agent named "{target_name}" found.'}]
    else:
        for a in active_agents:
            agent_modes[a["name"]] = target_mode
            updates.append({"agent": a["name"], "mode": target_mode})

    return True, updates


def resolve_human_text(text: str, workspace_id: str | None = None) -> tuple[str, str | None]:
    if text.startswith("/"):
        skill_name = text[1:].strip().lower()
        skill_file = find_skill_file(PROJECT_DIR / "skills" / skill_name)
        # Fallback: handle "source:slug" format (e.g. "gstack:review")
        if not skill_file and ":" in skill_name:
            source_prefix, slug_part = skill_name.split(":", 1)
            # Try skills/{slug} (symlink from gstack setup)
            skill_file = find_skill_file(PROJECT_DIR / "skills" / slug_part)
            # Try skills/{source}/{slug} (direct subdirectory)
            if not skill_file:
                skill_file = find_skill_file(PROJECT_DIR / "skills" / source_prefix / slug_part)
        if skill_file:
            s = parse_skill(skill_file)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            history_entry = f"[Skill invoked: {display_name}]\n\n{s['body']}\n\nAll agents: apply this skill now in your next response."
            return history_entry, display_name

    # @filename.ext injection
    if workspace_id:
        files_dir = WORKSPACES_DIR / workspace_id / "files"
        def inject_file(m):
            fname = m.group(1)
            fpath = files_dir / fname
            if fpath.is_file():
                try:
                    content = fpath.read_text(errors='replace')
                    return f"[File: {fname}]\n```\n{content}\n```"
                except Exception:
                    pass
            return m.group(0)
        text = re.sub(r'@([\w\-]+\.\w+)', inject_file, text)

    return text, None


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None, mode: str = "chat", scenario_system_prompt: str | None = None, blank_mode: bool = False, kanban_state: list[dict] | None = None) -> str:
    ws: Path = agent["workspace"]
    parts = []
    mode_prefix = "Keep your response concise — 2-3 sentences max.\n\n" if mode == "chat" else ""

    # Context injection: scenario > workspace > blank
    # scenario_system_prompt="" is treated same as None (no scenario active)
    if scenario_system_prompt:
        parts.append(f"## Session Context\n\n{scenario_system_prompt}")
    elif not blank_mode and workspace_id:
        # Workspace guide injected first (before agent identity)
        ws_dir = WORKSPACES_DIR / workspace_id
        ws_cfg_path = ws_dir / "config.json"
        if ws_cfg_path.exists():
            ws_cfg = json.loads(ws_cfg_path.read_text())
            guide_parts = []
            if ws_cfg.get("system_prompt"):
                guide_parts.append(ws_cfg["system_prompt"])
            files_dir = ws_dir / "files"
            if files_dir.exists():
                total = 0
                file_names = []
                for fp in sorted(files_dir.iterdir()):
                    if not fp.is_file():
                        continue
                    file_names.append(fp.name)
                    size = fp.stat().st_size
                    if total + size < 50_000:  # inject full text up to 50KB
                        try:
                            guide_parts.append(f"### {fp.name}\n\n{fp.read_text()}")
                            total += size
                        except Exception:
                            pass
                    else:
                        guide_parts.append(f"### {fp.name} (too large — use @{fp.name} to load)")
            if guide_parts:
                parts.append("## Workspace Guide\n\n" + "\n\n".join(guide_parts))
    # blank_mode: inject nothing

    # Kanban discussion state
    if kanban_state:
        todo = [i["text"] for i in kanban_state if i.get("status") == "todo"]
        wip = [i["text"] for i in kanban_state if i.get("status") == "wip"]
        done = [i["text"] for i in kanban_state if i.get("status") == "done"]
        lines = ["## Discussion Board"]
        if wip:
            lines.append("**In Progress:** " + ", ".join(wip))
        if todo:
            lines.append("**TODO:** " + ", ".join(todo))
        if done:
            lines.append("**Done:** " + ", ".join(done))
        lines.append("\nFocus on In Progress items. Refer to this board to stay aligned with the discussion goals.")
        parts.append("\n".join(lines))

    # AGENT.md first — main operational instructions
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md"]:
        f = ws / fname
        if f.exists():
            parts.append(f.read_text().strip())

    user_md = PROJECT_DIR / "USER.md"
    if user_md.exists():
        parts.append(user_md.read_text().strip())

    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = ws / "memory" / f"{today}.md"
    if mem_file.exists():
        parts.append(f"## Your memory ({today})\n\n{mem_file.read_text().strip()}")

    agent_skills: list[str] = agent.get("skills") or []
    skills_dir = PROJECT_DIR / "skills"
    if skills_dir.exists() and agent_skills:
        for slug_dir in sorted(skills_dir.iterdir()):
            if not slug_dir.is_dir() or slug_dir.name not in agent_skills:
                continue
            sf = find_skill_file(slug_dir)
            if sf:
                s = parse_skill(sf)
                parts.append(f"## Skill: {s['name']}\n\n{s['body']}")

    context = "\n\n---\n\n".join(parts)

    # Dynamic participants header
    if all_agents:
        names = [a["name"] for a in all_agents if a["name"] != agent["name"]]
        others = ", ".join(names) if names else "none"
        participants_header = (
            f"Participants in this room: {agent['name']} (you), {others}, Human\n"
            f"Your previous responses above are marked [{agent['name']}]:\n"
        )
    else:
        participants_header = ""

    # Continuation hint for agents truncated in the previous turn
    continuation_hint = ""
    if agent.get("pending_continuation"):
        continuation_hint = (
            "\n\n[系統提示] 你在上一輪說到一半被打斷了"
            "（歷史中可看到 [TRUNCATED] 標記）。"
            "這輪你可以選擇繼續完整你的想法，或先回應其他人的發言再補充。"
        )
        agent["pending_continuation"] = False

    return (
        f"{mode_prefix}{context}\n\n===== DISCUSSION =====\n\n"
        f"{participants_header}\n{history_text}"
        f"{continuation_hint}\n\n"
        "Your turn. Respond as your persona dictates."
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

# ── Security helpers (re-exported from core.security) ─────────────────────────

from core.security import (
    PROTECTED_FILENAMES,
    validate_filename,
    safe_workspace_path,
)


def _resolve_supports_image(agent: dict) -> bool:
    """Precedence: agent-level > adapter preset (v1) > model_config > DEFAULT_MODELS > True.

    For v1 agents (configVersion >= 1):
      1. Agent-level ``supports_image`` (set by user or copied by _merge_v1_agent)
      2. Adapter preset ``supports_image``
      3. Fallback True

    For v0 agents (legacy):
      1. Agent-level ``supports_image``
      2. model_config ``supports_image``
      3. DEFAULT_MODELS lookup by model name
      4. Fallback True
    """
    # Step 1: agent-level override (works for both v0 and v1)
    if "supports_image" in agent:
        return bool(agent["supports_image"])

    # Step 2 (v1): look up adapter preset
    if agent.get("configVersion", 0) >= 1:
        adapter_type = agent.get("adapter", "")
        if adapter_type:
            presets = load_adapter_presets()
            preset = presets.get(adapter_type) or {}
            if "supports_image" in preset:
                return bool(preset["supports_image"])
        return True

    # Step 2 (v0): model_config then DEFAULT_MODELS
    model_cfg = agent.get("model_config") or {}
    if "supports_image" in model_cfg:
        return bool(model_cfg["supports_image"])
    model_name = agent.get("model", "")
    if model_name in DEFAULT_MODELS and "supports_image" in DEFAULT_MODELS[model_name]:
        return bool(DEFAULT_MODELS[model_name]["supports_image"])
    return True


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


# ── Agent runners ─────────────────────────────────────────────────────────────

def save_session_images(session_id: str, images: list[dict]) -> list[dict]:
    """Save images to history/<session_id>/images/ and return [{name, filename}] references."""
    if not images:
        return []
    img_dir = HISTORY_DIR / session_id / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    refs = []
    for img in images:
        suffix = '.' + (img.get('mime', 'image/jpeg').split('/')[-1] or 'jpg')
        fname = f"{uuid.uuid4().hex}{suffix}"
        (img_dir / fname).write_bytes(base64.b64decode(img['base64']))
        refs.append({"name": img.get("name", fname), "filename": fname})
    return refs


def session_dir(session_id: str) -> Path:
    """Return (and create) the folder for a session."""
    d = HISTORY_DIR / session_id
    d.mkdir(exist_ok=True)
    (d / "workspace").mkdir(exist_ok=True)   # pre-create workspace for future use
    return d


def session_messages_path(session_id: str) -> Path:
    return HISTORY_DIR / session_id / "messages.json"


def save_history(session_id: str, messages: list[dict]):
    session_dir(session_id)   # ensure folder exists
    session_messages_path(session_id).write_text(
        json.dumps(messages, ensure_ascii=False, indent=2)
    )


def migrate_history_to_folders():
    """One-time migration: move history/*.json → history/<id>/messages.json."""
    for f in list(HISTORY_DIR.glob("*.json")):
        sid = f.stem
        target_dir = HISTORY_DIR / sid
        target_dir.mkdir(exist_ok=True)
        target = target_dir / "messages.json"
        if not target.exists():
            target.write_text(f.read_text())
        f.unlink()


HIDDEN_FILE = PROJECT_DIR / "hidden_sessions.json"


def load_hidden() -> set[str]:
    if HIDDEN_FILE.exists():
        try:
            return set(json.loads(HIDDEN_FILE.read_text()))
        except Exception:
            pass
    return set()


def save_hidden(ids: set[str]):
    HIDDEN_FILE.write_text(json.dumps(sorted(ids)))


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


def list_skill_slugs() -> list[str]:
    """Return sorted list of all skill slugs currently installed."""
    d = PROJECT_DIR / "skills"
    if not d.exists():
        return []
    return sorted(p.name for p in d.iterdir() if p.is_dir())


from routes.skills import router as _skills_router
app.include_router(_skills_router)


# ── Workspaces ────────────────────────────────────────────────────────────────

WORKSPACES_DIR = PROJECT_DIR / "workspaces"
WORKSPACES_DIR.mkdir(exist_ok=True)

SCENARIOS_DIR = PROJECT_DIR / "scenarios"


def workspace_config_path(workspace_id: str) -> Path:
    return WORKSPACES_DIR / workspace_id / "config.json"


def load_workspace_config(workspace_id: str) -> dict:
    p = workspace_config_path(workspace_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    return json.loads(p.read_text())


from routes.workspaces import router as _workspaces_router
app.include_router(_workspaces_router)


# ── Scenarios ─────────────────────────────────────────────────────────────────

from routes.scenarios import router as _scenarios_router
app.include_router(_scenarios_router)


from routes.sessions import router as _sessions_router
app.include_router(_sessions_router)


from routes.providers import router as _providers_router
app.include_router(_providers_router)


# ── WebSocket ─────────────────────────────────────────────────────────────────

_active_ws: list[str] = []   # client IPs currently connected (allows duplicates for counting)
_WS_LIMIT_PER_IP = 3


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    client_ip = ws.client.host if ws.client else "unknown"
    if _active_ws.count(client_ip) >= _WS_LIMIT_PER_IP:
        await ws.close(code=1008, reason="Too many connections")
        return
    _active_ws.append(client_ip)
    await ws.accept()

    data = await ws.receive_json()
    topic = data.get("topic", "General Discussion").strip()
    selected: list[str] = data.get("agents", [])
    auto_mode: bool = data.get("auto", True)
    manual_rounds: int = int(data.get("rounds", 2))
    silence_mode: bool = data.get("silence", False)   # probabilistic silence on/off
    resume_id: str | None = data.get("resume_from")
    workspace_id: str | None = data.get("workspace_id") or None
    scenario_id: str | None = data.get("scenario_id") or None
    blank_mode: bool = bool(data.get("blank_mode", False))
    kanban_state: list[dict] = data.get("kanban", [])

    session_id = resume_id if resume_id else (
        datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + "_" + uuid.uuid4().hex[:6]
    )

    messages: list[dict] = []
    if resume_id:
        f = session_messages_path(resume_id)
        if f.exists():
            messages = json.loads(f.read_text())

    def log(msg: dict):
        messages.append(msg)
        save_history(session_id, messages)

    registry = get_agent_registry()
    active_agents = []
    for name in selected:
        if name in registry and registry[name].get("enabled", True):
            agent = registry[name]
            ensure_workspace(agent)
            active_agents.append(agent)

    if not active_agents:
        await ws.send_json({"type": "system", "text": "No agents selected."})
        return

    # Phase 1.1 — per-agent mode state
    agent_modes: dict[str, str] = {
        a["name"]: a.get("mode", "chat") for a in active_agents
    }

    # Phase 1.2 — scenario context
    scenario_system_prompt: str | None = None
    if scenario_id:
        scenario_file = PROJECT_DIR / "scenarios" / f"{scenario_id}.json"
        if scenario_file.exists():
            try:
                sc = json.loads(scenario_file.read_text())
                scenario_system_prompt = sc.get("system_prompt") or None
            except Exception:
                pass
        if scenario_system_prompt is None and scenario_id:
            # scenario_id given but file not found or parse failed → blank mode
            blank_mode = True

    # Build history_text (with optional summarization)
    _cfg = load_config()
    _max_rounds = _cfg.get("max_history_rounds", 30)
    _summ_model = _cfg.get("summarization_model", "")
    _summ_threshold = _cfg.get("summary_trigger_threshold", 10)

    # Per-session overrides
    _session_cfg = load_session_config(session_id)
    _max_rounds = _session_cfg.get("max_history_rounds", _max_rounds)
    _summ_threshold = _session_cfg.get("summary_trigger_threshold", _summ_threshold)

    async def _compression_progress(text: str):
        await ws.send_json({"type": "system", "text": text})

    if resume_id:
        if _summ_model and messages:
            _summary_prefix, _windowed = await compress_history(
                session_id, messages, window_size=_max_rounds,
                summary_model=_summ_model, trigger_threshold=_summ_threshold,
                on_progress=_compression_progress,
            )
        else:
            _summary_prefix = ""
            _windowed = apply_sliding_window(messages, max_rounds=_max_rounds)

        history_text = _format_history_text(topic, _summary_prefix, _windowed)
    else:
        # First message from welcome screen: treat as the opening human turn,
        # not just a session label, so agents see [Human]: from the start.
        history_text = f"[Human]: {topic}\n"
        hmsg = {
            "type": "message", "agent": "Human",
            "color": "#60a5fa", "text": topic,
            "timestamp": datetime.now().isoformat(),
        }
        log(hmsg)

    event_queue: asyncio.Queue = asyncio.Queue()

    # When resuming, consume the first human message before starting agents
    if resume_id:
        try:
            first_msg = await asyncio.wait_for(ws.receive_json(), timeout=60.0)
        except (asyncio.TimeoutError, Exception):
            first_msg = None
        if first_msg:
            if first_msg.get("type") == "human":
                raw_text = first_msg["text"]
                imgs = first_msg.get("images") or []
                img_refs = save_session_images(session_id, imgs)
                history_entry, skill_name = resolve_human_text(raw_text)
                history_text += f"\n[Human]: {history_entry}\n"
                hmsg0 = {
                    "type": "message", "agent": "Human",
                    "color": "#60a5fa", "text": raw_text,
                    "skill": skill_name,
                    "timestamp": datetime.now().isoformat(),
                }
                if img_refs:
                    hmsg0["images"] = img_refs
                log(hmsg0)
            elif first_msg.get("type") == "stop":
                return

    await ws.send_json({
        "type": "system",
        "text": f"Session started — {topic}  [{', '.join(a['name'] for a in active_agents)}]  {'Auto' if auto_mode else 'Manual'}",
        "session_id": session_id,
    })
    log({"type": "system", "text": f"Topic: {topic}", "workspace_id": workspace_id, "timestamp": datetime.now().isoformat()})

    # Broadcast initial mode state so clients know defaults on connect
    for _ag in active_agents:
        await ws.send_json({"type": "mode_update", "agent": _ag["name"], "mode": agent_modes[_ag["name"]]})

    engine = ConversationEngine(active_agents, silence=silence_mode)

    async def handle_member_event(evt: dict) -> bool:
        """Handle add_agent / remove_agent events. Returns True if handled."""
        t = evt.get("type")
        if t == "add_agent":
            name = evt.get("agent", "")
            registry = get_agent_registry()
            if name in registry and not any(a["name"] == name for a in active_agents):
                agent = registry[name]
                ensure_workspace(agent)
                active_agents.append(agent)
                agent_modes[name] = agent.get("mode", "chat")
                engine.add_agent(agent)
                history_text += f"\n[System]: {name} joined the conversation\n"
                smsg = {"type": "system", "text": f"{agent.get('emoji', '')} {name} 加入聊天室"}
                await ws.send_json(smsg)
                log({**smsg, "timestamp": datetime.now().isoformat()})
            return True
        if t == "remove_agent":
            name = evt.get("agent", "")
            removed = next((a for a in active_agents if a["name"] == name), None)
            if removed:
                active_agents.remove(removed)
                engine.remove_agent(name)
                smsg = {"type": "system", "text": f"{removed.get('emoji', '')} {name} 離開聊天室"}
                await ws.send_json(smsg)
                log({**smsg, "timestamp": datetime.now().isoformat()})
            return True
        return False

    async def receive_loop():
        while True:
            try:
                msg = await ws.receive_json()
                await event_queue.put(msg)
            except Exception:
                await event_queue.put({"type": "stop"})
                break

    recv_task = asyncio.create_task(receive_loop())

    async def next_event(timeout=None):
        try:
            if timeout is not None:
                return await asyncio.wait_for(event_queue.get(), timeout=timeout)
            return await event_queue.get()
        except asyncio.TimeoutError:
            return None

    try:
        running = True
        batch_turns = 0
        pending_humans: list[dict] = []  # buffer human msgs received while agent is thinking
        current_images: list[dict] = []  # images from last human message, used for next agent turn
        _session_token_totals: dict[str, dict] = {}  # cumulative per-agent token counts
        while running:
            agent = engine.next_speaker()
            await ws.send_json({"type": "thinking", "agent": agent["name"], "color": agent["color"]})

            t_start = asyncio.get_event_loop().time()
            chunk_parts: list[str] = []
            chunk_q: asyncio.Queue[str | SubprocessError | None] = asyncio.Queue()
            cancelled = False
            had_subprocess_error: SubprocessError | None = None
            turn_images = current_images[:]
            current_images = []  # consume once

            # Rebuild history from in-memory messages with summarization
            if _summ_model and messages:
                _summary_prefix, _windowed = await compress_history(
                    session_id, messages, window_size=_max_rounds,
                    summary_model=_summ_model, trigger_threshold=_summ_threshold,
                    on_progress=_compression_progress,
                )
                _rebuilt_history = _format_history_text(topic, _summary_prefix, _windowed)
            else:
                _rebuilt_history = history_text

            _max_hist = load_config().get("max_history_chars", 80000)
            _trimmed_history = truncate_history(_rebuilt_history, _max_hist)
            _turn_usage: list[TokenUsage] = []
            _current_mode = agent_modes.get(agent["name"], "chat")

            async def _produce():
                try:
                    _prompt = build_prompt(
                        agent, _trimmed_history, workspace_id, active_agents,
                        mode=_current_mode,
                        scenario_system_prompt=scenario_system_prompt,
                        blank_mode=blank_mode,
                        kanban_state=kanban_state,
                    )
                    async for chunk in stream_agent(agent, _prompt, images=turn_images or None, mode=_current_mode):
                        if isinstance(chunk, TokenUsage):
                            _turn_usage.append(chunk)
                        else:
                            await chunk_q.put(chunk)
                except SubprocessError as e:
                    await chunk_q.put(e)  # sentinel: SubprocessError in queue
                except asyncio.CancelledError:
                    pass
                finally:
                    await chunk_q.put(None)

            agent_task = asyncio.create_task(_produce())
            agent_done = False
            _stream_started = False  # delay stream_start until first chunk arrives

            while not agent_done:
                # Drain all ready chunks
                while True:
                    try:
                        chunk = chunk_q.get_nowait()
                        if chunk is None:
                            agent_done = True
                            break
                        if isinstance(chunk, SubprocessError):
                            had_subprocess_error = chunk
                            agent_done = True
                            break
                        if not _stream_started:
                            _stream_started = True
                            await ws.send_json({"type": "stream_start", "agent": agent["name"], "color": agent["color"]})
                        chunk_parts.append(chunk)
                        await ws.send_json({"type": "chunk", "agent": agent["name"], "color": agent["color"], "text": chunk})
                    except asyncio.QueueEmpty:
                        break

                if agent_done:
                    break

                # Wait briefly for events or more chunks
                evt = await next_event(timeout=0.05)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        agent_task.cancel()
                        running = False
                        cancelled = True
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "kanban_update":
                        kanban_state = evt.get("items", [])
                    elif t == "human":
                        pending_humans.append(evt)

            if cancelled:
                break

            # Handle subprocess error sentinel
            if had_subprocess_error:
                e = had_subprocess_error
                had_subprocess_error = None
                partial = e.partial_output or ""
                suffix = " [TRUNCATED]" if partial else ""
                response = (partial + suffix).strip() or None

                partial_text_for_frontend = (
                    e.partial_output if isinstance(e, SubprocessStartupError) else None
                )
                await ws.send_json({
                    "type": "agent_error",
                    "agent": agent["name"],
                    "error_type": type(e).__name__,
                    "message": _error_message(e),
                    "partial_text": partial_text_for_frontend,
                })
                agent["pending_continuation"] = True
            else:
                response = "".join(chunk_parts).strip() if chunk_parts else None

            duration_ms = int((asyncio.get_event_loop().time() - t_start) * 1000)

            if not response:
                continue

            history_text += f"\n[{agent['name']}]: {response}\n"
            append_memory(agent, topic, response)

            ts = datetime.now().isoformat()
            msg = {
                "type": "message",
                "agent": agent["name"],
                "color": agent["color"],
                "text": response,
                "timestamp": ts,
                "duration_ms": duration_ms,
                "mode": _current_mode,
            }
            _usage_obj = _turn_usage[0] if _turn_usage else None
            _msg_end: dict = {"type": "message_end", "agent": agent["name"], "color": agent["color"], "timestamp": ts, "duration_ms": duration_ms, "mode": _current_mode}
            if _usage_obj:
                _msg_end["usage"] = {"input": _usage_obj.input_tokens, "output": _usage_obj.output_tokens, "cached": _usage_obj.cached_tokens}
                accumulate_token_usage(_session_token_totals, agent["name"], _usage_obj.input_tokens, _usage_obj.output_tokens)
                await ws.send_json({
                    "type": "token_update",
                    "agent": agent["name"],
                    "turn": {"input": _usage_obj.input_tokens, "output": _usage_obj.output_tokens},
                    "cumulative": _session_token_totals[agent["name"]],
                })
            await ws.send_json(_msg_end)
            log(msg)
            batch_turns += 1

            # Process any human messages buffered during agent execution
            if pending_humans:
                for ph in pending_humans:
                    text = ph["text"]
                    imgs = ph.get("images") or []
                    if imgs:
                        current_images = imgs  # use for next turn
                    img_refs = save_session_images(session_id, imgs)
                    # TUI command interception
                    _intercepted, _mode_updates = intercept_mode_command(text, agent_modes, active_agents)
                    if _intercepted:
                        for _upd in _mode_updates:
                            if "error" in _upd:
                                history_text += f"\n[System]: {_upd['error']}\n"
                                await ws.send_json({"type": "system", "text": _upd["error"]})
                            else:
                                await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        continue  # do NOT forward command to agents
                    history_entry, skill_name = resolve_human_text(text, workspace_id)
                    history_text += f"\n[Human]: {history_entry}\n"
                    hmsg = {
                        "type": "message", "agent": "Human",
                        "color": "#60a5fa", "text": text,
                        "skill": skill_name,
                        "timestamp": datetime.now().isoformat(),
                        **({"images": img_refs} if img_refs else {}),
                    }
                    await ws.send_json(hmsg)
                    log(hmsg)
                    mention = ConversationEngine.extract_mention(text, active_agents)
                    if mention and engine.on_mention(mention) is not None:
                        pass
                    else:
                        engine.on_human()
                pending_humans.clear()
                batch_turns = 0

            pause_now = (not auto_mode) and (batch_turns >= manual_rounds * len(active_agents))
            await ws.send_json({"type": "ready", "auto": auto_mode, "pause": pause_now})

            if auto_mode or not pause_now:
                evt = await next_event(timeout=2.0)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        running = False
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "human":
                        text = evt["text"]
                        imgs = evt.get("images") or []
                        if imgs:
                            current_images = imgs
                        img_refs = save_session_images(session_id, imgs)
                        # TUI command interception
                        _intercepted, _mode_updates = intercept_mode_command(text, agent_modes, active_agents)
                        if _intercepted:
                            for _upd in _mode_updates:
                                if "error" in _upd:
                                    history_text += f"\n[System]: {_upd['error']}\n"
                                    await ws.send_json({"type": "system", "text": _upd["error"]})
                                else:
                                    await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        else:
                            history_entry, skill_name = resolve_human_text(text, workspace_id)
                            history_text += f"\n[Human]: {history_entry}\n"
                            hmsg = {
                                "type": "message", "agent": "Human",
                                "color": "#60a5fa", "text": text,
                                "skill": skill_name,
                                "timestamp": datetime.now().isoformat(),
                                **({"images": img_refs} if img_refs else {}),
                            }
                            await ws.send_json(hmsg)
                            log(hmsg)
                            mention = ConversationEngine.extract_mention(text, active_agents)
                            if mention and engine.on_mention(mention) is not None:
                                pass  # engine reordered; next next_speaker() returns @target
                            else:
                                engine.on_human()
                            batch_turns = 0
            else:
                batch_turns = 0
                while True:
                    evt = await next_event()
                    if evt is None:
                        continue
                    t = evt.get("type")
                    if t == "stop":
                        running = False
                        break
                    elif t == "next":
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "human":
                        text = evt["text"]
                        imgs = evt.get("images") or []
                        if imgs:
                            current_images = imgs
                        img_refs = save_session_images(session_id, imgs)
                        # TUI command interception
                        _intercepted, _mode_updates = intercept_mode_command(text, agent_modes, active_agents)
                        if _intercepted:
                            for _upd in _mode_updates:
                                if "error" in _upd:
                                    history_text += f"\n[System]: {_upd['error']}\n"
                                    await ws.send_json({"type": "system", "text": _upd["error"]})
                                else:
                                    await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        else:
                            history_entry, skill_name = resolve_human_text(text, workspace_id)
                            history_text += f"\n[Human]: {history_entry}\n"
                            hmsg = {
                                "type": "message", "agent": "Human",
                                "color": "#60a5fa", "text": text,
                                "skill": skill_name,
                                "timestamp": datetime.now().isoformat(),
                                **({"images": img_refs} if img_refs else {}),
                            }
                            await ws.send_json(hmsg)
                            log(hmsg)
                            mention = ConversationEngine.extract_mention(text, active_agents)
                            if mention and engine.on_mention(mention) is not None:
                                pass  # engine reordered; next next_speaker() returns @target
                            else:
                                engine.on_human()
                            break

    except WebSocketDisconnect:
        pass
    finally:
        try: _active_ws.remove(client_ip)
        except ValueError: pass
        recv_task.cancel()
        save_history(session_id, messages)
        try:
            await ws.send_json({"type": "system", "text": "Session ended. Writing daily summaries…"})
        except Exception:
            pass
        for agent in active_agents:
            asyncio.create_task(write_daily_summary(agent))


app.mount("/static", StaticFiles(directory="static"), name="static")
