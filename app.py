import asyncio
import base64
import tempfile
import os
from conversation_engine import ConversationEngine
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import io
import zipfile

import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles


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

# ── Default templates ──────────────────────────────────────────────────────────

DEFAULT_AGENT_MD = """\
# Agent Instructions

## Role
You are {name}.

## Session Startup

Before anything else:
1. Read `IDENTITY.md` — this is who you are
2. Read `SOUL.md` — this is what drives you
3. Read `../../USER.md` — this is who you're helping
4. Read `memory/` latest file if it exists — recent context
5. Check `../../skills/` for available shared skills

## Memory

> ⚠️ Do NOT write to `~/.claude/`, `~/.gemini/`, `~/codex/`, or any CLI system directory.
> Your memory belongs here, in this workspace.

Working directory is `agents/{name}/`. Write to:

- `MEMORY.md` — long-term notes, curated across sessions
- `memory/YYYY-MM-DD.md` — daily log, append key exchanges each session

After each significant exchange, append a short note to today's log file.

## How to engage
- Build on conversation history — don't repeat what's been said
- When the human speaks, prioritize their input and reset your focus
- Engage directly with what others actually said — not just your own agenda
- Keep responses to 2–4 paragraphs unless depth is clearly needed
- Plain prose. No bullet dumps. No sign-offs.
- To address someone directly, use `@Name`.

## Red Lines

- Don't summarize the whole conversation on every turn
"""

DEFAULT_IDENTITY_MD = """\
# Identity

- **Name:** {name}
- **Vibe:** Thoughtful AI in a multi-agent discussion.
"""

DEFAULT_SOUL_MD = """\
# Soul

You believe in the value of dialogue. Careful thinking, expressed clearly, moves conversations forward.

You are curious. You are direct. You don't perform certainty you don't have.
"""

DEFAULT_MEMORY_MD = "# MEMORY.md - Long-Term Memory\n\n_Sessions will be recorded here._\n"

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
    cfg = load_config()
    return cfg.get("models", DEFAULT_MODELS)


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
                agent_md.write_text(DEFAULT_AGENT_MD.format(name=name))

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
                agent_md.write_text(DEFAULT_AGENT_MD.format(name=name))


# ── Default template agent ─────────────────────────────────────────────────────

def ensure_default_template():
    """Create _default template folder for new agents."""
    default_dir = AGENTS_DIR / "_default"
    default_dir.mkdir(parents=True, exist_ok=True)
    for fname, content in [
        ("AGENT.md", DEFAULT_AGENT_MD.format(name="{name}")),
        ("IDENTITY.md", DEFAULT_IDENTITY_MD.format(name="{name}")),
        ("SOUL.md", DEFAULT_SOUL_MD),
        ("MEMORY.md", DEFAULT_MEMORY_MD),
    ]:
        f = default_dir / fname
        if not f.exists():
            f.write_text(content)


# ── Workspace setup ───────────────────────────────────────────────────────────

def ensure_workspace(agent: dict):
    ws: Path = agent["workspace"]
    ws.mkdir(parents=True, exist_ok=True)
    (ws / "memory").mkdir(exist_ok=True)
    name = agent["name"]

    default_dir = AGENTS_DIR / "_default"

    def from_default(fname: str, fallback: str) -> str:
        src = default_dir / fname
        if src.exists():
            return src.read_text().replace("{name}", name)
        return fallback

    for fname, content in [
        ("AGENT.md", from_default("AGENT.md", DEFAULT_AGENT_MD.format(name=name))),
        ("IDENTITY.md", from_default("IDENTITY.md", DEFAULT_IDENTITY_MD.format(name=name))),
        ("SOUL.md", from_default("SOUL.md", DEFAULT_SOUL_MD)),
        ("MEMORY.md", DEFAULT_MEMORY_MD),
    ]:
        f = ws / fname
        if not f.exists():
            f.write_text(content)


# ── Agent registry ────────────────────────────────────────────────────────────

def get_agent_registry() -> dict[str, dict]:
    """Load all agents by scanning agents/ folders for config.json."""
    models = load_models()
    registry: dict[str, dict] = {}

    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
            continue
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            continue
        try:
            agent = json.loads(config_path.read_text())
            name = agent_dir.name
            agent["name"] = name
            agent["workspace"] = agent_dir

            # Merge model connection info
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

            registry[name] = agent
        except Exception:
            continue

    return registry


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

def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None, mode: str = "chat", scenario_system_prompt: str | None = None, blank_mode: bool = False) -> str:
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


# ── Subprocess error types ────────────────────────────────────────────────────

class SubprocessError(Exception):
    """Base class for all CLI subprocess failures."""
    def __init__(self, agent: str, partial_output: str = "", stderr_output: str = "", **_):
        super().__init__(agent)
        self.agent = agent
        self.partial_output = partial_output
        self.stderr_output = stderr_output


class SubprocessStartupError(SubprocessError):
    """Command not found, permission denied, or no output within startup_timeout."""
    def __init__(self, agent: str, cause: str = "", **_):
        super().__init__(agent, partial_output="", stderr_output="")
        self.cause = cause


class SubprocessTimeoutError(SubprocessError):
    """Idle timeout: no new chunk within idle_timeout_seconds."""
    def __init__(self, agent: str, partial_output: str, stderr_output: str,
                 timeout_seconds: float, **_):
        super().__init__(agent, partial_output, stderr_output)
        self.timeout_seconds = timeout_seconds


class SubprocessCrashError(SubprocessError):
    """Process exited non-zero or raised an unexpected exception."""
    def __init__(self, agent: str, partial_output: str = "", stderr_output: str = "",
                 exit_code: int | None = None, cause: str = "", **_):
        super().__init__(agent, partial_output, stderr_output)
        self.exit_code = exit_code
        self.cause = cause


class TokenUsage:
    """Sentinel yielded at end of a JSON-mode CLI stream with per-turn token counts."""
    __slots__ = ("input_tokens", "output_tokens", "cached_tokens")

    def __init__(self, input_tokens: int = 0, output_tokens: int = 0, cached_tokens: int = 0):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.cached_tokens = cached_tokens


def _get_json_output_flags(agent: dict) -> list[str]:
    """Return extra CLI flags to enable JSON streaming output for token tracking.

    Returns [] if the model does not support JSON output, or if explicitly disabled.
    """
    if agent.get("json_output") is False:
        return []
    model_id = agent.get("model_id", "")
    if model_id == "claude":
        return ["--output-format", "stream-json", "--verbose"]
    if model_id == "gemini":
        return ["--output-format", "stream-json"]
    return []


def _parse_jsonl_line(line: str, model_id: str) -> tuple[str | None, dict | None]:
    """Parse one JSONL line from a stream-json CLI output.

    Returns (text_chunk, usage_dict).
    - text_chunk: incremental text from this event, or None
    - usage_dict: {"input": int, "output": int, "cached": int}, or None
    """
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return (line, None)  # non-JSON line: pass through as raw text

    t = obj.get("type", "")

    if model_id == "claude":
        if t == "assistant":
            msg = obj.get("message") or {}
            content = msg.get("content") or []
            texts = [b.get("text", "") for b in content
                     if isinstance(b, dict) and b.get("type") == "text"]
            text = "".join(texts)
            return (text or None, None)
        if t == "result":
            u = obj.get("usage") or {}
            return (None, {
                "input": int(u.get("input_tokens", 0)),
                "output": int(u.get("output_tokens", 0)),
                "cached": int(u.get("cache_read_input_tokens", 0)),
            })

    elif model_id == "gemini":
        # Gemini stream-json format: type=message + role=assistant + content (str)
        if t == "message":
            role = obj.get("role", "")
            if role == "assistant":
                content = obj.get("content", "")
                if isinstance(content, str):
                    return (content or None, None)
                elif isinstance(content, list):
                    texts = []
                    for item in content:
                        if isinstance(item, str):
                            texts.append(item)
                        elif isinstance(item, dict):
                            texts.append(str(item.get("text", "") or item.get("content", "")))
                    return ("".join(texts) or None, None)
            return (None, None)
        # Gemini usage is in type=result → stats
        if t == "result":
            stats = obj.get("stats") or {}
            input_tok = int(stats.get("input_tokens", 0))
            output_tok = int(stats.get("output_tokens", 0))
            cached_tok = int(stats.get("cached", 0))
            return (None, {"input": input_tok, "output": output_tok, "cached": cached_tok})

    return (None, None)


TRUNCATION_MARKER = "[... 較早對話已省略 ...]\n\n"

def truncate_history(history_text: str, max_chars: int) -> str:
    """Sliding window: remove oldest [Agent]: blocks until under max_chars."""
    if len(history_text) <= max_chars:
        return history_text
    segments = re.split(r'(?=\n\[[\w\s\-]+\]: )', history_text)
    while segments and len("".join(segments)) > max_chars:
        segments.pop(0)
    truncated = "".join(segments)
    return TRUNCATION_MARKER + truncated.lstrip("\n")


def accumulate_token_usage(totals: dict, agent_name: str, input_tokens: int, output_tokens: int) -> None:
    """Add turn token counts to the per-agent cumulative totals dict (mutates in place)."""
    if agent_name not in totals:
        totals[agent_name] = {"input": 0, "output": 0}
    totals[agent_name]["input"] += input_tokens
    totals[agent_name]["output"] += output_tokens


def format_token_count(n: int) -> str:
    """Format token count: < 1000 as integer, >= 1000 as '1.2k'."""
    if n < 1000:
        return str(n)
    return f"{n / 1000:.1f}k"


def apply_sliding_window(messages: list, max_rounds: int = 30) -> list:
    """Keep only the most recent max_rounds messages; discard older ones."""
    if len(messages) <= max_rounds:
        return messages
    return messages[-max_rounds:]


def _resolve_timeout(agent: dict, key: str, default: float) -> float:
    """Precedence: agent config > DEFAULT_MODELS > hard default."""
    if key in agent:
        return float(agent[key])
    # Fall back to DEFAULT_MODELS so built-in defaults apply even when
    # the user's config.json overrides the models dict without timeout fields.
    model_id = agent.get("model_id", "")
    if model_id in DEFAULT_MODELS and key in DEFAULT_MODELS[model_id]:
        return float(DEFAULT_MODELS[model_id][key])
    return default


def _resolve_supports_image(agent: dict) -> bool:
    """Precedence: agent-level > model_config > DEFAULT_MODELS > True (safe default)."""
    if "supports_image" in agent:
        return bool(agent["supports_image"])
    model_cfg = agent.get("model_config") or {}
    if "supports_image" in model_cfg:
        return bool(model_cfg["supports_image"])
    model_name = agent.get("model", "")
    if model_name in DEFAULT_MODELS and "supports_image" in DEFAULT_MODELS[model_name]:
        return bool(DEFAULT_MODELS[model_name]["supports_image"])
    return True


PROTECTED_FILENAMES: frozenset[str] = frozenset({
    "guide.md",
    "config.json",
    ".env",
    "requirements.txt",
})

_SAFE_FILENAME_RE = re.compile(r'^[\w\-. ]+$')
_MAX_FILENAME_LENGTH = 255


def validate_filename(filename: str, *, allow_protected: bool = False) -> None:
    """Raise ValueError if filename is unsafe or protected."""
    if not filename:
        raise ValueError("Filename cannot be empty")
    if len(filename) > _MAX_FILENAME_LENGTH:
        raise ValueError(f"Filename too long: {len(filename)} chars")
    if "/" in filename or "\\" in filename:
        raise ValueError(f"Filename must not contain path separators: {filename!r}")
    if ".." in filename:
        raise ValueError(f"Filename must not contain '..': {filename!r}")
    if not _SAFE_FILENAME_RE.match(filename):
        raise ValueError(f"Filename contains invalid characters: {filename!r}")
    if not allow_protected and filename in PROTECTED_FILENAMES:
        raise ValueError(f"Filename is protected and cannot be written by agents: {filename!r}")


def safe_workspace_path(workspace_dir: str, filename: str) -> str:
    """Return safe full path; raise ValueError if it resolves outside workspace_dir."""
    full_path = os.path.realpath(os.path.join(workspace_dir, filename))
    workspace_real = os.path.realpath(workspace_dir)
    if not full_path.startswith(workspace_real + os.sep) and full_path != workspace_real:
        raise ValueError(f"Path traversal detected: {filename!r} resolves outside workspace")
    return full_path


def _error_message(e: "SubprocessError") -> str:
    if isinstance(e, SubprocessTimeoutError):
        return f"Agent {e.agent} timed out after {e.timeout_seconds}s of inactivity"
    if isinstance(e, SubprocessStartupError):
        return f"Agent {e.agent} failed to start: {e.cause}"
    if isinstance(e, SubprocessCrashError):
        details = f"exit {e.exit_code}" if e.exit_code is not None else e.cause
        return f"Agent {e.agent} crashed ({details})"
    return f"Agent {e.agent} failed"


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


def write_temp_images(images: list[dict]) -> tuple[list[str], list[str]]:
    """Write base64 images to temp files. Returns (file_paths, extra_cmd_args)."""
    tmp_paths: list[str] = []
    extra_args: list[str] = []
    for img in images:
        suffix = '.' + (img.get('mime', 'image/jpeg').split('/')[-1] or 'jpg')
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(base64.b64decode(img['base64']))
            tmp_paths.append(f.name)
            extra_args.extend(['--add-file', f.name])
    return tmp_paths, extra_args

def cleanup_temp_files(paths: list[str]):
    for p in paths:
        try: os.unlink(p)
        except Exception: pass


async def call_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None) -> str:
    tmp_paths: list[str] = []
    extra_args: list[str] = []
    if images:
        tmp_paths, extra_args = write_temp_images(images)
    proc = await asyncio.create_subprocess_exec(
        *agent["cmd"], *extra_args, prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        cwd=agent["workspace"],
    )
    try:
        stdout, _ = await proc.communicate()
        return stdout.decode().strip()
    except asyncio.CancelledError:
        proc.kill()
        raise
    finally:
        cleanup_temp_files(tmp_paths)


async def call_api_agent(agent: dict, prompt: str) -> str:
    base = agent.get("baseUrl", "http://127.0.0.1:11434")
    model = agent.get("model", "llama3.2")
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        r.raise_for_status()
        return r.json().get("response", "").strip()


async def call_agent(agent: dict, prompt: str) -> str:
    if agent.get("type") == "api":
        return await call_api_agent(agent, prompt)
    return await call_cli_agent(agent, prompt)


async def stream_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
    """Async generator: yield text chunks from CLI stdout, then optionally a TokenUsage.

    When the model supports JSON output (claude/gemini), adds --output-format stream-json
    flags, reads line-by-line, parses JSONL events for text and token usage, and yields
    a TokenUsage object as the last item after all text chunks.

    Raises SubprocessStartupError, SubprocessTimeoutError, or SubprocessCrashError
    on failure.  Already-yielded chunks are preserved in the exception's
    partial_output so the caller can append [TRUNCATED] to history.
    """
    idle_timeout = _resolve_timeout(agent, "idle_timeout_seconds", 60)
    startup_timeout = _resolve_timeout(agent, "startup_timeout_seconds", 10)
    buffer = ""

    tmp_paths: list[str] = []
    extra_args: list[str] = []
    if images and _resolve_supports_image(agent):
        tmp_paths, extra_args = write_temp_images(images)

    if mode == "think" and agent.get("supports_thinking", False):
        extra_args = extra_args + ["--effort", "max"]

    # JSON output mode: adds stream-json flags for token tracking
    # json_flags must come BEFORE the rest of cmd (e.g. before gemini's `-p`)
    # to avoid yargs parsing errors like "Not enough arguments following: p"
    json_flags = _get_json_output_flags(agent)
    cmd_binary = agent["cmd"][:1]   # e.g. ["gemini"] or ["claude"]
    cmd_rest = agent["cmd"][1:]     # e.g. ["-p"] or ["--print"]
    model_id = agent.get("model_id", "")
    _usage: dict[str, int] = {"input": 0, "output": 0, "cached": 0}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_binary, *json_flags, *cmd_rest, *extra_args, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=agent["workspace"],
        )
    except (FileNotFoundError, PermissionError, OSError) as e:
        cleanup_temp_files(tmp_paths)
        raise SubprocessStartupError(agent=agent["name"], cause=str(e))

    # Increase StreamReader line limit to 8MB so large tool_result JSONL lines
    # (e.g. Gemini reading big memory files) don't raise LimitOverrunError
    if json_flags and hasattr(proc.stdout, '_limit'):
        proc.stdout._limit = 8 * 1024 * 1024  # 8MB per line

    stderr_task = asyncio.create_task(proc.stderr.read())

    try:
        # --- startup timeout: wait for first byte/line ---
        try:
            first_data = await asyncio.wait_for(
                proc.stdout.readline() if json_flags else proc.stdout.read(256),
                timeout=startup_timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise SubprocessStartupError(
                agent=agent["name"],
                cause=f"no output within {startup_timeout}s",
            )

        if not first_data:
            # EOF immediately after startup
            await proc.wait()
            stderr_out = await stderr_task
            raise SubprocessCrashError(
                agent=agent["name"],
                partial_output="",
                stderr_output=stderr_out.decode(errors='replace'),
                exit_code=proc.returncode,
                cause="empty output",
            )

        decoded = first_data.decode(errors='replace')
        if json_flags:
            line = decoded.strip()
            if line:
                text, usage = _parse_jsonl_line(line, model_id)
                if usage:
                    for k, v in usage.items():
                        if v > _usage.get(k, 0):
                            _usage[k] = v
                if text:
                    buffer += text
                    yield text
        else:
            buffer += decoded
            yield decoded

        # --- idle timeout: per-chunk/line reads ---
        while True:
            try:
                data = await asyncio.wait_for(
                    proc.stdout.readline() if json_flags else proc.stdout.read(256),
                    timeout=idle_timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                stderr_out = await stderr_task
                with open("/tmp/agent_crash.log", "a") as _f:
                    _f.write(f"\n=== {agent['name']} IDLE TIMEOUT ({idle_timeout}s) ===\n")
                    _f.write(f"buffer_len: {len(buffer)}\n")
                raise SubprocessTimeoutError(
                    agent=agent["name"],
                    partial_output=buffer,
                    stderr_output=stderr_out.decode(errors='replace'),
                    timeout_seconds=idle_timeout,
                )
            if not data:
                break
            decoded = data.decode(errors='replace')
            if json_flags:
                line = decoded.strip()
                if line:
                    text, usage = _parse_jsonl_line(line, model_id)
                    if usage:
                        for k, v in usage.items():
                            if v > _usage.get(k, 0):
                                _usage[k] = v
                    if text:
                        buffer += text
                        yield text
            else:
                buffer += decoded
                yield decoded

    except SubprocessError:
        raise

    except Exception as e:
        proc.kill()
        await proc.wait()
        stderr_out = await stderr_task
        stderr_text = stderr_out.decode(errors='replace')
        with open("/tmp/agent_crash.log", "a") as _f:
            _f.write(f"\n=== {agent['name']} EXCEPTION: {type(e).__name__}: {e} ===\n")
            _f.write(f"stderr: {stderr_text[:500]}\n")
        raise SubprocessCrashError(
            agent=agent["name"],
            partial_output=buffer,
            stderr_output=stderr_text,
            cause=str(e),
        )

    finally:
        cleanup_temp_files(tmp_paths)

    # --- normal exit: check return code ---
    await proc.wait()
    stderr_out = await stderr_task
    if proc.returncode != 0:
        stderr_text = stderr_out.decode(errors='replace')
        with open("/tmp/agent_crash.log", "a") as _f:
            _f.write(f"\n=== {agent['name']} exit {proc.returncode} ===\n")
            _f.write(f"stderr: {stderr_text[:1000]}\n")
            _f.write(f"buffer_len: {len(buffer)}\n")
        raise SubprocessCrashError(
            agent=agent["name"],
            partial_output=buffer,
            stderr_output=stderr_text,
            exit_code=proc.returncode,
        )

    # Yield token usage if JSON mode was active and we captured any counts
    if json_flags and (_usage["input"] or _usage["output"]):
        yield TokenUsage(
            input_tokens=_usage["input"],
            output_tokens=_usage["output"],
            cached_tokens=_usage["cached"],
        )


async def stream_api_agent(agent: dict, prompt: str):
    """Async generator: yield text chunks from Ollama HTTP stream."""
    base = agent.get("baseUrl", "http://127.0.0.1:11434")
    model = agent.get("model", "llama3.2")
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST", f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if chunk := data.get("response", ""):
                            yield chunk
                    except json.JSONDecodeError:
                        pass


async def stream_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
    """Dispatch to streaming implementation."""
    if agent.get("type") == "api":
        async for chunk in stream_api_agent(agent, prompt):
            yield chunk
    else:
        async for chunk in stream_cli_agent(agent, prompt, images=images, mode=mode):
            yield chunk


def append_memory(agent: dict, topic: str, response: str):
    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = agent["workspace"] / "memory" / f"{today}.md"
    ts = datetime.now().strftime("%H:%M")
    with mem_file.open("a") as f:
        f.write(f"\n=====\n[{agent['name']}] {today} {ts}\n\nTopic: {topic}\n\n{response}\n")


async def write_daily_summary(agent: dict):
    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = agent["workspace"] / "memory" / f"{today}.md"
    if not mem_file.exists():
        return
    raw = mem_file.read_text().strip()
    if "## Daily Summary" in raw:
        return
    prompt = (
        f"You are {agent['name']}. Below is your raw memory log from today ({today}).\n\n"
        f"{raw}\n\n---\n\n"
        f"Write a concise daily summary (3–6 sentences) covering:\n"
        f"- The main topics discussed today\n"
        f"- Key ideas or arguments you made or encountered\n"
        f"- Anything worth remembering for future sessions\n\n"
        f"Write only the summary text, no headers."
    )
    try:
        summary = await asyncio.wait_for(call_agent(agent, prompt), timeout=60)
        if summary:
            ts = datetime.now().strftime("%H:%M")
            with mem_file.open("a") as f:
                f.write(f"\n\n## Daily Summary — {today} {ts}\n\n{summary}\n")
    except Exception:
        pass


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

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/")
async def index():
    return FileResponse("static/index.html")


# ── User ─────────────────────────────────────────────────────────────────────

@app.get("/user/md")
async def get_user_md():
    user_md = PROJECT_DIR / "USER.md"
    return {"content": user_md.read_text() if user_md.exists() else ""}


@app.put("/user/md")
async def put_user_md(body: dict):
    (PROJECT_DIR / "USER.md").write_text(body.get("content", ""))
    return {"ok": True}


# ── Models ────────────────────────────────────────────────────────────────────

@app.get("/models")
async def list_models():
    models = load_models()
    return [{"id": mid, **m} for mid, m in models.items()]


@app.post("/models")
async def add_model(body: dict):
    mid = body.get("id", "").strip().lower()
    if not mid:
        raise HTTPException(status_code=400, detail="Model id required")
    cfg = load_config()
    if "models" not in cfg:
        cfg["models"] = {}
    if mid in cfg["models"]:
        raise HTTPException(status_code=409, detail="Model already exists")
    entry: dict = {
        "type": body.get("type", "cli"),
        "color": body.get("color", "#888"),
        "emoji": body.get("emoji", "🤖"),
        "label": body.get("label", "").strip() or mid,
    }
    if entry["type"] == "cli":
        entry["cmd"] = body.get("cmd", [mid])
    else:
        entry["baseUrl"] = body.get("baseUrl", "http://127.0.0.1:11434")
        entry["apiModel"] = body.get("apiModel", "llama3.2")
    cfg["models"][mid] = entry
    save_config(cfg)
    return {"ok": True}


@app.put("/models/{mid}")
async def update_model(mid: str, body: dict):
    cfg = load_config()
    if "models" not in cfg or mid not in cfg["models"]:
        raise HTTPException(status_code=404, detail="Model not found")
    body.pop("id", None)
    cfg["models"][mid].update(body)
    save_config(cfg)
    return {"ok": True}


@app.delete("/models/{mid}")
async def delete_model(mid: str):
    cfg = load_config()
    cfg.get("models", {}).pop(mid, None)
    save_config(cfg)
    return {"ok": True}


@app.get("/config")
async def get_config():
    return load_config()


@app.post("/config")
async def post_config(body: dict):
    save_config(body)
    return {"ok": True}


# ── Marketplace ───────────────────────────────────────────────────────────────

MARKETPLACE_DIR = PROJECT_DIR / "marketplace"


@app.get("/marketplace/agents")
async def list_marketplace_agents():
    if not MARKETPLACE_DIR.exists():
        return []
    installed = {d.name for d in AGENTS_DIR.iterdir() if d.is_dir() and not d.name.startswith("_")}
    result = []
    for agent_dir in sorted(MARKETPLACE_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        config_path = agent_dir / "config.json"
        if not config_path.exists():
            continue
        cfg = json.loads(config_path.read_text())
        result.append({
            "id": agent_dir.name,
            "emoji": cfg.get("emoji", "🤖"),
            "color": cfg.get("color", "#888"),
            "description": cfg.get("description", ""),
            "installed": agent_dir.name in installed,
        })
    return result


@app.get("/marketplace/agents/{agent_id}")
async def get_marketplace_agent(agent_id: str):
    src = MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    cfg = json.loads((src / "config.json").read_text()) if (src / "config.json").exists() else {}
    return {
        "id": agent_id,
        "emoji": cfg.get("emoji", "🤖"),
        "color": cfg.get("color", "#888"),
        "description": cfg.get("description", ""),
        "agent_md": (src / "AGENT.md").read_text() if (src / "AGENT.md").exists() else "",
        "identity_md": (src / "IDENTITY.md").read_text() if (src / "IDENTITY.md").exists() else "",
        "soul_md": (src / "SOUL.md").read_text() if (src / "SOUL.md").exists() else "",
        "installed": (AGENTS_DIR / agent_id).exists(),
    }


@app.post("/marketplace/agents")
async def create_marketplace_agent(body: dict = {}):
    agent_id = (body.get("id") or "").strip()
    if not agent_id or re.search(r'[/\\.\s]', agent_id) or len(agent_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid agent id")
    MARKETPLACE_DIR.mkdir(parents=True, exist_ok=True)
    dst = MARKETPLACE_DIR / agent_id
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"Marketplace agent '{agent_id}' already exists")
    dst.mkdir(parents=True)
    cfg = {
        "emoji": body.get("emoji", "🤖"),
        "color": body.get("color", "#888"),
        "description": body.get("description", ""),
    }
    (dst / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    (dst / "AGENT.md").write_text(body.get("agent_md", ""))
    (dst / "IDENTITY.md").write_text(body.get("identity_md", ""))
    (dst / "SOUL.md").write_text(body.get("soul_md", ""))
    return {"ok": True, "id": agent_id}


@app.put("/marketplace/agents/{agent_id}")
async def update_marketplace_agent(agent_id: str, body: dict = {}):
    src = MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    cfg = json.loads((src / "config.json").read_text()) if (src / "config.json").exists() else {}
    for key in ("emoji", "color", "description"):
        if key in body:
            cfg[key] = body[key]
    (src / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    if "agent_md" in body:
        (src / "AGENT.md").write_text(body["agent_md"])
    if "identity_md" in body:
        (src / "IDENTITY.md").write_text(body["identity_md"])
    if "soul_md" in body:
        (src / "SOUL.md").write_text(body["soul_md"])
    return {"ok": True}


@app.delete("/marketplace/agents/{agent_id}")
async def delete_marketplace_agent(agent_id: str):
    src = MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    import shutil
    shutil.rmtree(src)
    return {"ok": True}


@app.post("/marketplace/agents/{agent_id}/install")
async def install_marketplace_agent(agent_id: str, body: dict = {}):
    src = MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    # Allow caller to override the destination name (e.g. to install same template twice)
    dest_name = (body.get("name") or agent_id).strip()
    if not dest_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    dst = AGENTS_DIR / dest_name
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"Agent '{dest_name}' already exists")
    dst.mkdir(parents=True)
    (dst / "memory").mkdir()
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md"]:
        src_file = src / fname
        if src_file.exists():
            (dst / fname).write_text(src_file.read_text())
    # Merge marketplace config with chosen model and custom name
    cfg = json.loads((src / "config.json").read_text()) if (src / "config.json").exists() else {}
    if body.get("model"):
        cfg["model"] = body["model"]
    cfg["name"] = dest_name
    (dst / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    (dst / "MEMORY.md").write_text(DEFAULT_MEMORY_MD)
    return {"ok": True, "name": dest_name}


# ── Agents ────────────────────────────────────────────────────────────────────

@app.get("/agents")
async def list_agents():
    registry = get_agent_registry()
    return [
        {
            "name": a["name"],
            "emoji": a.get("emoji", "🤖"),
            "color": a.get("color", "#888"),
            "description": a.get("description", ""),
            "model": a.get("model_id", ""),
            "skills": a.get("skills", []),
            "enabled": a.get("enabled", False),
            "type": a.get("type", "cli"),
            "source": "chat",
            "supportsThinking": a.get("supports_thinking", None),
        }
        for a in registry.values()
    ]


@app.get("/agents/{name}")
async def get_agent(name: str):
    config_path = AGENTS_DIR / name / "config.json"
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Agent not found")
    data = json.loads(config_path.read_text())
    data["name"] = name
    return data


@app.post("/agents")
async def add_agent(body: dict):
    name = body.get("name", "").strip()
    if not name or re.search(r'[/\\.\s]', name) or len(name) > 64:
        raise HTTPException(status_code=400, detail="Name required (no slashes, dots, or spaces)")
    agent_dir = AGENTS_DIR / name
    if agent_dir.exists():
        raise HTTPException(status_code=409, detail="Agent already exists")

    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "memory").mkdir(exist_ok=True)

    # Copy template files from _default, substituting {name}
    default_dir = AGENTS_DIR / "_default"
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"]:
        src = default_dir / fname
        dst = agent_dir / fname
        if src.exists():
            dst.write_text(src.read_text().replace("{name}", name))
        elif fname == "MEMORY.md":
            dst.write_text(DEFAULT_MEMORY_MD)

    config = {
        "emoji": body.get("emoji", "🤖"),
        "color": body.get("color", "#888888"),
        "description": body.get("description", ""),
        "model": body.get("model", ""),
        "skills": body.get("skills") or list_skill_slugs(),
        "enabled": body.get("enabled", False),
    }
    (agent_dir / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False))
    return {"ok": True, "name": name}


@app.put("/agents/{name}")
async def update_agent(name: str, body: dict):
    config_path = AGENTS_DIR / name / "config.json"
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Agent not found")
    body.pop("name", None)
    existing = json.loads(config_path.read_text())
    existing.update(body)
    config_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    return {"ok": True}


@app.delete("/agents/{name}")
async def remove_agent(name: str):
    config_path = AGENTS_DIR / name / "config.json"
    if config_path.exists():
        data = json.loads(config_path.read_text())
        data["enabled"] = False
        config_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {"ok": True}


def _read_agent_file(name: str, fname: str) -> str:
    agent_dir = AGENTS_DIR / name
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "memory").mkdir(exist_ok=True)
    path = agent_dir / fname
    if not path.exists():
        # Ensure workspace for known agents
        registry = get_agent_registry()
        if name in registry:
            ensure_workspace(registry[name])
        elif name == "_default":
            ensure_default_template()
    return path.read_text() if path.exists() else ""


def _write_agent_file(name: str, fname: str, content: str):
    path = AGENTS_DIR / name / fname
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


@app.get("/agents/{name}/agent-md")
async def get_agent_md(name: str):
    return {"content": _read_agent_file(name, "AGENT.md")}


@app.put("/agents/{name}/agent-md")
async def put_agent_md(name: str, body: dict):
    _write_agent_file(name, "AGENT.md", body.get("content", ""))
    return {"ok": True}


@app.get("/agents/{name}/identity")
async def get_agent_identity(name: str):
    return {"content": _read_agent_file(name, "IDENTITY.md")}


@app.put("/agents/{name}/identity")
async def put_agent_identity(name: str, body: dict):
    _write_agent_file(name, "IDENTITY.md", body.get("content", ""))
    return {"ok": True}


@app.get("/agents/{name}/soul")
async def get_agent_soul(name: str):
    return {"content": _read_agent_file(name, "SOUL.md")}


@app.put("/agents/{name}/soul")
async def put_agent_soul(name: str, body: dict):
    _write_agent_file(name, "SOUL.md", body.get("content", ""))
    return {"ok": True}


@app.post("/agents/{name}/test")
async def test_agent(name: str):
    registry = get_agent_registry()
    if name not in registry:
        return {"ok": False, "error": "Unknown agent"}
    agent = registry[name]
    ensure_workspace(agent)
    try:
        response = await asyncio.wait_for(
            call_agent(agent, "Reply with exactly three words: I am ready."),
            timeout=30,
        )
        return {"ok": bool(response), "response": response[:300] if response else "(empty)"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout (30s)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/agents/{name}/daily-summary")
async def trigger_daily_summary(name: str):
    registry = get_agent_registry()
    if name not in registry:
        return {"ok": False, "error": "Unknown agent"}
    agent = registry[name]
    ensure_workspace(agent)
    await write_daily_summary(agent)
    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = agent["workspace"] / "memory" / f"{today}.md"
    summary_written = mem_file.exists() and "## Daily Summary" in mem_file.read_text()
    return {"ok": summary_written}


# ── Skills ────────────────────────────────────────────────────────────────────

def list_skill_slugs() -> list[str]:
    """Return sorted list of all skill slugs currently installed."""
    d = PROJECT_DIR / "skills"
    if not d.exists():
        return []
    return sorted(p.name for p in d.iterdir() if p.is_dir())


def find_skill_file(slug_dir: Path) -> Path | None:
    """Find SKILL.md or SKILLS.md inside a skill directory."""
    for name in ["SKILL.md", "SKILLS.md"]:
        f = slug_dir / name
        if f.exists():
            return f
    return None


def parse_skill(skill_file: Path) -> dict:
    raw = skill_file.read_text().strip()
    name = skill_file.parent.name
    description = ""
    source = ""
    source_url = ""
    source_version = ""
    body = raw
    if raw.startswith("---"):
        end = raw.find("---", 3)
        if end != -1:
            fm = raw[3:end].strip()
            body = raw[end + 3:].strip()
            for line in fm.splitlines():
                if line.startswith("name:"):
                    name = line[5:].strip()
                elif line.startswith("description:"):
                    description = line[12:].strip()
                elif line.startswith("source:"):
                    source = line[7:].strip()
                elif line.startswith("source_url:"):
                    source_url = line[11:].strip()
                elif line.startswith("source_version:"):
                    source_version = line[15:].strip()
    if not description:
        lines = [l for l in body.splitlines() if l.strip() and not l.startswith("#")]
        description = lines[0].strip() if lines else ""
    return {
        "name": name,
        "description": description,
        "body": body,
        "source": source,
        "source_url": source_url,
        "source_version": source_version,
    }


@app.get("/skills")
async def list_skills():
    skills_dir = PROJECT_DIR / "skills"
    result = []
    for slug_dir in sorted(skills_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        sf = find_skill_file(slug_dir)
        if sf:
            s = parse_skill(sf)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            result.append({
                "slug": slug_dir.name,
                "name": display_name,
                "description": s["description"],
                "missing": False,
                "source": s["source"],
                "source_url": s["source_url"],
                "source_version": s["source_version"],
            })
        else:
            result.append({"slug": slug_dir.name, "name": slug_dir.name, "description": "", "missing": True,
                           "source": "", "source_url": "", "source_version": ""})
    return result


@app.get("/skills/{slug}")
async def get_skill(slug: str):
    sf = find_skill_file(PROJECT_DIR / "skills" / slug)
    if not sf:
        raise HTTPException(status_code=404, detail="Skill not found")
    s = parse_skill(sf)
    return {"slug": slug, "name": s["name"], "description": s["description"], "body": s["body"],
            "source": s["source"], "source_url": s["source_url"], "source_version": s["source_version"]}


@app.put("/skills/{slug}")
async def save_skill(slug: str, payload: dict):
    sf = find_skill_file(PROJECT_DIR / "skills" / slug)
    if not sf:
        raise HTTPException(status_code=404, detail="Skill not found")
    name = payload.get("name", slug)
    description = payload.get("description", "")
    body = payload.get("body", "")
    sf.write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n{body}")
    return {"ok": True}


@app.post("/skills")
async def create_skill(payload: dict):
    slug = payload.get("slug", "").strip().lower().replace(" ", "-")
    if not slug:
        raise HTTPException(status_code=400, detail="slug required")
    skill_dir = PROJECT_DIR / "skills" / slug
    if skill_dir.exists():
        raise HTTPException(status_code=409, detail="Skill already exists")
    skill_dir.mkdir(parents=True)
    name = payload.get("name", slug)
    description = payload.get("description", "")
    body = payload.get("body", "")
    (skill_dir / "SKILL.md").write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n{body}")
    return {"ok": True, "slug": slug}


@app.post("/skills/upload")
async def upload_skills(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")
    data = await file.read()
    created = []
    skipped = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for member in zf.infolist():
                parts = Path(member.filename).parts
                # Expect: <slug>/SKILL.md or <slug>/SKILLS.md (possibly inside a top-level dir)
                # Normalize: strip a single leading directory if it wraps everything
                if len(parts) < 2:
                    continue
                slug = parts[0]
                filename = parts[-1]
                if filename not in ("SKILL.md", "SKILLS.md"):
                    continue
                skill_dir = PROJECT_DIR / "skills" / slug
                skill_dir.mkdir(parents=True, exist_ok=True)
                dest = skill_dir / filename
                dest.write_bytes(zf.read(member.filename))
                if slug not in created:
                    created.append(slug)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")
    return {"ok": True, "created": created, "skipped": skipped}


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


@app.get("/workspaces")
async def list_workspaces():
    result = []
    for d in sorted(WORKSPACES_DIR.iterdir(), key=lambda x: x.name):
        if not d.is_dir():
            continue
        cp = d / "config.json"
        if not cp.exists():
            continue
        try:
            cfg = json.loads(cp.read_text())
            result.append(cfg)
        except Exception:
            pass
    return result


@app.post("/workspaces")
async def create_workspace(body: dict):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    workspace_id = re.sub(r"[^a-z0-9_-]", "-", name.lower()).strip("-") or "workspace"
    # Ensure unique id
    base = workspace_id
    idx = 2
    while (WORKSPACES_DIR / workspace_id).exists():
        workspace_id = f"{base}-{idx}"
        idx += 1
    d = WORKSPACES_DIR / workspace_id
    d.mkdir(parents=True)
    (d / "files").mkdir()
    cfg = {
        "id": workspace_id,
        "name": name,
        "description": body.get("description", ""),
        "system_prompt": body.get("system_prompt", ""),
        "default_agents": body.get("default_agents", []),
        "created_at": datetime.now().isoformat(),
    }
    (d / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return cfg


@app.get("/workspaces/{workspace_id}")
async def get_workspace(workspace_id: str):
    cfg = load_workspace_config(workspace_id)
    files_dir = WORKSPACES_DIR / workspace_id / "files"
    files = [f.name for f in files_dir.iterdir() if f.is_file()] if files_dir.exists() else []
    return {**cfg, "files": sorted(files)}


@app.put("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, body: dict):
    cfg = load_workspace_config(workspace_id)
    for key in ("name", "description", "system_prompt", "default_agents"):
        if key in body:
            cfg[key] = body[key]
    workspace_config_path(workspace_id).write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return {"ok": True}


@app.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str):
    import shutil
    d = WORKSPACES_DIR / workspace_id
    if not d.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    shutil.rmtree(d)
    # Detach sessions that belonged to this workspace
    for session_dir in HISTORY_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        mf = session_dir / "messages.json"
        if not mf.exists():
            continue
        try:
            msgs = json.loads(mf.read_text())
            changed = False
            for m in msgs:
                if m.get("workspace_id") == workspace_id:
                    m["workspace_id"] = None
                    changed = True
            if changed:
                mf.write_text(json.dumps(msgs, indent=2, ensure_ascii=False))
        except Exception:
            pass
    return {"ok": True}


@app.post("/workspaces/{workspace_id}/files")
async def upload_workspace_file(workspace_id: str, file: UploadFile = File(...)):
    d = WORKSPACES_DIR / workspace_id / "files"
    if not d.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    try:
        validate_filename(file.filename)
        safe_workspace_path(str(d), file.filename)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    content = await file.read()
    (d / file.filename).write_bytes(content)
    return {"ok": True, "filename": file.filename}


@app.delete("/workspaces/{workspace_id}/files/{filename}")
async def delete_workspace_file(workspace_id: str, filename: str):
    p = WORKSPACES_DIR / workspace_id / "files" / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found")
    p.unlink()
    return {"ok": True}


@app.put("/sessions/{session_id}/workspace")
async def move_session_to_workspace(session_id: str, body: dict):
    """Change the workspace_id field in a session's messages."""
    mf = session_messages_path(session_id)
    if not mf.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    workspace_id = body.get("workspace_id")  # None to detach
    if workspace_id and not (WORKSPACES_DIR / workspace_id).exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    msgs = json.loads(mf.read_text())
    for m in msgs:
        m["workspace_id"] = workspace_id
    mf.write_text(json.dumps(msgs, indent=2, ensure_ascii=False))
    return {"ok": True}


# ── Scenarios ─────────────────────────────────────────────────────────────────

@app.get("/scenarios")
async def list_scenarios():
    """Return all scenario JSON files from the scenarios/ directory."""
    if not SCENARIOS_DIR.exists():
        return []
    result = []
    for f in sorted(SCENARIOS_DIR.glob("*.json")):
        try:
            result.append(json.loads(f.read_text()))
        except Exception:
            pass  # skip malformed files
    return result


@app.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str):
    f = SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    return json.loads(f.read_text())


@app.post("/scenarios")
async def create_scenario(body: dict = {}):
    sid = (body.get("id") or "").strip()
    if not sid or re.search(r'[/\\.\s]', sid) or len(sid) > 64:
        raise HTTPException(status_code=400, detail="Invalid scenario id")
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    f = SCENARIOS_DIR / f"{sid}.json"
    if f.exists():
        raise HTTPException(status_code=409, detail=f"Scenario '{sid}' already exists")
    data = {
        "id": sid,
        "name": body.get("name", sid),
        "description": body.get("description", ""),
        "system_prompt": body.get("system_prompt", ""),
        "suggested_agents": body.get("suggested_agents", []),
        "topic_hint": body.get("topic_hint", ""),
    }
    f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {"ok": True, "id": sid}


@app.put("/scenarios/{scenario_id}")
async def update_scenario(scenario_id: str, body: dict = {}):
    f = SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    data = json.loads(f.read_text())
    for key in ("name", "description", "system_prompt", "suggested_agents", "topic_hint"):
        if key in body:
            data[key] = body[key]
    f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {"ok": True}


@app.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str):
    f = SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    f.unlink()
    return {"ok": True}


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.get("/sessions")
async def list_sessions(limit: int = 30, offset: int = 0):
    hidden = load_hidden()
    all_dirs = sorted(
        (d for d in HISTORY_DIR.iterdir() if d.is_dir() and d.name not in hidden and (d / "messages.json").exists()),
        key=lambda x: x.stat().st_mtime, reverse=True,
    )
    total = len(all_dirs)
    page = all_dirs[offset: offset + limit]
    sessions = []
    for d in page:
        try:
            msgs = json.loads((d / "messages.json").read_text())
            sys_msg = next((m for m in msgs if m.get("type") == "system"), None)
            sessions.append({
                "id": d.name,
                "message_count": len([m for m in msgs if m.get("type") == "message"]),
                "first_message": (sys_msg["text"] if sys_msg else "")[:60],
                "workspace_id": sys_msg.get("workspace_id") if sys_msg else None,
            })
        except Exception:
            pass
    return {"sessions": sessions, "total": total, "offset": offset, "limit": limit}


@app.post("/sessions")
async def create_session():
    session_id = str(uuid.uuid4())
    session_path = HISTORY_DIR / session_id
    session_path.mkdir(parents=True, exist_ok=True)
    (session_path / "messages.json").write_text("[]")
    return {"id": session_id, "name": f"Session {session_id[:8]}"}


@app.delete("/sessions/{session_id}")
async def hide_session(session_id: str):
    hidden = load_hidden()
    hidden.add(session_id)
    save_hidden(hidden)
    return {"ok": True}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    f = session_messages_path(session_id)
    if not f.exists():
        return []
    return json.loads(f.read_text())


@app.get("/sessions/{session_id}/images/{filename}")
async def get_session_image(session_id: str, filename: str):
    p = HISTORY_DIR / session_id / "images" / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(p))


@app.put("/sessions/{session_id}/topic")
async def rename_session(session_id: str, body: dict):
    """Update the Topic text in the first system message."""
    new_topic = (body.get("topic") or "").strip()
    if not new_topic:
        raise HTTPException(status_code=400, detail="topic required")
    f = session_messages_path(session_id)
    if not f.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = json.loads(f.read_text())
    for m in msgs:
        if m.get("type") == "system":
            m["text"] = f"Topic: {new_topic}"
            break
    f.write_text(json.dumps(msgs, indent=2, ensure_ascii=False))
    return {"ok": True}


# ── Ollama model list ─────────────────────────────────────────────────────────

@app.get("/providers/ollama/models")
async def ollama_models(base_url: str = ""):
    if not base_url:
        models = load_models()
        base_url = models.get("ollama", {}).get("baseUrl", "http://127.0.0.1:11434")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{base_url}/api/tags")
            r.raise_for_status()
            result = [m["name"] for m in r.json().get("models", [])]
            return {"ok": True, "models": result}
    except Exception as e:
        return {"ok": False, "models": [], "error": str(e)}




@app.post("/providers/ollama/pull")
async def ollama_pull(payload: dict):
    base_url = payload.get("base_url", "").strip()
    if not base_url:
        models = load_models()
        base_url = models.get("ollama", {}).get("baseUrl", "http://127.0.0.1:11434")
    model_name = payload.get("model", "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="model required")

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", f"{base_url}/api/pull",
                                         json={"name": model_name}) as r:
                    async for line in r.aiter_lines():
                        if line.strip():
                            yield f"data: {line}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


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

    # Build history_text
    if resume_id:
        f = session_messages_path(resume_id)
        if f.exists():
            past = json.loads(f.read_text())
            _cfg = await get_config()
            _max_rounds = _cfg.get("max_history_rounds", 30)
            past = apply_sliding_window(past, max_rounds=_max_rounds)
            lines = [f"Topic: {topic}"]
            for m in past:
                if m.get("type") == "message":
                    lines.append(f"\n[{m['agent']}]: {m['text']}")
            history_text = "\n".join(lines) + "\n"
        else:
            history_text = f"Topic: {topic}\n"
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

            _max_hist = load_config().get("max_history_chars", 80000)
            _trimmed_history = truncate_history(history_text, _max_hist)
            _turn_usage: list[TokenUsage] = []

            async def _produce():
                try:
                    _current_mode = agent_modes.get(agent["name"], "chat")
                    _prompt = build_prompt(
                        agent, _trimmed_history, workspace_id, active_agents,
                        mode=_current_mode,
                        scenario_system_prompt=scenario_system_prompt,
                        blank_mode=blank_mode,
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
                        _sm_agent = evt.get("agent", "")
                        _sm_mode = evt.get("mode", "")
                        if _sm_agent not in agent_modes:
                            await ws.send_json({"type": "error", "message": f"Unknown agent: {_sm_agent}"})
                        elif _sm_mode not in ("chat", "think"):
                            await ws.send_json({"type": "error", "message": f"Invalid mode: {_sm_mode}"})
                        else:
                            agent_modes[_sm_agent] = _sm_mode
                            await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
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
            }
            _usage_obj = _turn_usage[0] if _turn_usage else None
            _msg_end: dict = {"type": "message_end", "agent": agent["name"], "color": agent["color"], "timestamp": ts, "duration_ms": duration_ms}
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
                        _sm_agent = evt.get("agent", "")
                        _sm_mode = evt.get("mode", "")
                        if _sm_agent not in agent_modes:
                            await ws.send_json({"type": "error", "message": f"Unknown agent: {_sm_agent}"})
                        elif _sm_mode not in ("chat", "think"):
                            await ws.send_json({"type": "error", "message": f"Invalid mode: {_sm_mode}"})
                        else:
                            agent_modes[_sm_agent] = _sm_mode
                            await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
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
                        _sm_agent = evt.get("agent", "")
                        _sm_mode = evt.get("mode", "")
                        if _sm_agent not in agent_modes:
                            await ws.send_json({"type": "error", "message": f"Unknown agent: {_sm_agent}"})
                        elif _sm_mode not in ("chat", "think"):
                            await ws.send_json({"type": "error", "message": f"Invalid mode: {_sm_mode}"})
                        else:
                            agent_modes[_sm_agent] = _sm_mode
                            await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
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
