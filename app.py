import asyncio
import itertools
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import io
import zipfile

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

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
You are {name}. You participate in a live multi-agent discussion with other AI agents and a human facilitator.

## How to engage
- Build on conversation history — don't repeat what's already been said
- Pick one thread to develop rather than covering everything shallowly
- Keep responses to 2–4 paragraphs unless depth is clearly needed
- Plain prose. No bullet dumps. No sign-offs.
- When the human speaks, prioritize their input and reset your focus

## Memory
After each session, key exchanges and decisions get logged to your memory files.
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
    },
    "gemini": {
        "type": "cli",
        "cmd": ["gemini", "-p"],
        "color": "#34d399",
        "emoji": "🟢",
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
                    agent["cmd"] = m["cmd"]
                if "baseUrl" in m:
                    agent["baseUrl"] = m["baseUrl"]
                if "apiModel" in m:
                    agent["model"] = m["apiModel"]  # for API calls

            registry[name] = agent
        except Exception:
            continue

    return registry


# ── Skill resolver ────────────────────────────────────────────────────────────

def resolve_human_text(text: str) -> tuple[str, str | None]:
    if text.startswith("/"):
        skill_name = text[1:].strip().lower()
        skill_file = find_skill_file(PROJECT_DIR / "skills" / skill_name)
        if skill_file:
            s = parse_skill(skill_file)
            history_entry = f"[Skill invoked: {s['name']}]\n\n{s['body']}\n\nAll agents: apply this skill now in your next response."
            return history_entry, s["name"]
    return text, None


# ── Prompt builder ────────────────────────────────────────────────────────────

def build_prompt(agent: dict, history_text: str) -> str:
    ws: Path = agent["workspace"]
    parts = []

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

    skills_dir = PROJECT_DIR / "skills"
    if skills_dir.exists():
        for slug_dir in sorted(skills_dir.iterdir()):
            if not slug_dir.is_dir():
                continue
            sf = find_skill_file(slug_dir)
            if sf:
                s = parse_skill(sf)
                parts.append(f"## Skill: {s['name']}\n\n{s['body']}")

    context = "\n\n---\n\n".join(parts)
    return f"{context}\n\n===== DISCUSSION =====\n\n{history_text}\n\nYour turn. Respond as your persona dictates."


# ── Agent runners ─────────────────────────────────────────────────────────────

async def call_cli_agent(agent: dict, prompt: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        *agent["cmd"], prompt,
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


def save_history(session_id: str, messages: list[dict]):
    (HISTORY_DIR / f"{session_id}.json").write_text(
        json.dumps(messages, ensure_ascii=False, indent=2)
    )


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


@app.post("/marketplace/agents/{agent_id}/install")
async def install_marketplace_agent(agent_id: str):
    src = MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    dst = AGENTS_DIR / agent_id
    if dst.exists():
        raise HTTPException(status_code=409, detail="Agent already installed")
    dst.mkdir(parents=True)
    (dst / "memory").mkdir()
    for fname in ["config.json", "AGENT.md", "IDENTITY.md", "SOUL.md"]:
        src_file = src / fname
        if src_file.exists():
            (dst / fname).write_text(src_file.read_text())
    # Create empty MEMORY.md
    (dst / "MEMORY.md").write_text(DEFAULT_MEMORY_MD)
    return {"ok": True, "name": agent_id}


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
    if not name or not re.match(r'^[a-zA-Z0-9_-]+$', name):
        raise HTTPException(status_code=400, detail="Name required (alphanumeric, _ - only)")
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
        "skills": body.get("skills", []),
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
    if not description:
        lines = [l for l in body.splitlines() if l.strip() and not l.startswith("#")]
        description = lines[0].strip() if lines else ""
    return {"name": name, "description": description, "body": body}


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
            result.append({"slug": slug_dir.name, "name": s["name"], "description": s["description"], "missing": False})
        else:
            result.append({"slug": slug_dir.name, "name": slug_dir.name, "description": "", "missing": True})
    return result


@app.get("/skills/{slug}")
async def get_skill(slug: str):
    sf = find_skill_file(PROJECT_DIR / "skills" / slug)
    if not sf:
        raise HTTPException(status_code=404, detail="Skill not found")
    s = parse_skill(sf)
    return {"slug": slug, "name": s["name"], "description": s["description"], "body": s["body"]}


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


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.get("/sessions")
async def list_sessions():
    hidden = load_hidden()
    sessions = []
    for f in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        if f.stem in hidden:
            continue
        try:
            msgs = json.loads(f.read_text())
            sys_msg = next((m for m in msgs if m.get("type") == "system"), None)
            sessions.append({
                "id": f.stem,
                "message_count": len([m for m in msgs if m.get("type") == "message"]),
                "first_message": (sys_msg["text"] if sys_msg else "")[:60],
            })
        except Exception:
            pass
    return sessions


@app.delete("/sessions/{session_id}")
async def hide_session(session_id: str):
    hidden = load_hidden()
    hidden.add(session_id)
    save_hidden(hidden)
    return {"ok": True}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    f = HISTORY_DIR / f"{session_id}.json"
    if not f.exists():
        return []
    return json.loads(f.read_text())


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

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    data = await ws.receive_json()
    topic = data.get("topic", "General Discussion").strip()
    selected: list[str] = data.get("agents", [])
    auto_mode: bool = data.get("auto", True)
    manual_rounds: int = int(data.get("rounds", 2))
    resume_id: str | None = data.get("resume_from")

    session_id = resume_id if resume_id else (
        datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + "_" + uuid.uuid4().hex[:6]
    )

    messages: list[dict] = []
    if resume_id:
        f = HISTORY_DIR / f"{resume_id}.json"
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

    # Build history_text
    if resume_id:
        f = HISTORY_DIR / f"{resume_id}.json"
        if f.exists():
            past = json.loads(f.read_text())
            lines = [f"Topic: {topic}"]
            for m in past:
                if m.get("type") == "message":
                    lines.append(f"\n[{m['agent']}]: {m['text']}")
            history_text = "\n".join(lines) + "\n"
        else:
            history_text = f"Topic: {topic}\n"
    else:
        history_text = f"Topic: {topic}\n"

    event_queue: asyncio.Queue = asyncio.Queue()

    # When resuming, consume the first human message before starting agents
    if resume_id:
        try:
            first_msg = await asyncio.wait_for(ws.receive_json(), timeout=3.0)
        except (asyncio.TimeoutError, Exception):
            first_msg = None
        if first_msg:
            if first_msg.get("type") == "human":
                raw_text = first_msg["text"]
                history_entry, skill_name = resolve_human_text(raw_text)
                history_text += f"\n[Human]: {history_entry}\n"
                log({
                    "type": "message", "agent": "Human",
                    "color": "#60a5fa", "text": raw_text,
                    "skill": skill_name,
                    "timestamp": datetime.now().isoformat(),
                })
            elif first_msg.get("type") == "stop":
                return

    await ws.send_json({
        "type": "system",
        "text": f"Session started — {topic}  [{', '.join(a['name'] for a in active_agents)}]  {'Auto' if auto_mode else 'Manual'}",
        "session_id": session_id,
    })
    log({"type": "system", "text": f"Topic: {topic}", "timestamp": datetime.now().isoformat()})

    agent_cycle = itertools.cycle(active_agents)

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
        while running:
            agent = next(agent_cycle)
            await ws.send_json({"type": "thinking", "agent": agent["name"], "color": agent["color"]})

            t_start = asyncio.get_event_loop().time()
            agent_task = asyncio.create_task(
                call_agent(agent, build_prompt(agent, history_text))
            )

            while not agent_task.done():
                evt = await next_event(timeout=0.3)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        agent_task.cancel()
                        running = False
                        break
                    elif t == "human":
                        await event_queue.put(evt)

            if not running:
                break

            try:
                response = await agent_task
            except asyncio.CancelledError:
                break

            duration_ms = int((asyncio.get_event_loop().time() - t_start) * 1000)

            if not response:
                continue

            history_text += f"\n[{agent['name']}]: {response}\n"
            append_memory(agent, topic, response)

            msg = {
                "type": "message",
                "agent": agent["name"],
                "color": agent["color"],
                "text": response,
                "timestamp": datetime.now().isoformat(),
                "duration_ms": duration_ms,
            }
            await ws.send_json(msg)
            log(msg)
            batch_turns += 1

            pause_now = (not auto_mode) and (batch_turns >= manual_rounds * len(active_agents))
            await ws.send_json({"type": "ready", "auto": auto_mode, "pause": pause_now})

            if auto_mode or not pause_now:
                evt = await next_event(timeout=2.0)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        running = False
                        break
                    elif t == "human":
                        text = evt["text"]
                        history_entry, skill_name = resolve_human_text(text)
                        history_text += f"\n[Human]: {history_entry}\n"
                        hmsg = {
                            "type": "message", "agent": "Human",
                            "color": "#60a5fa", "text": text,
                            "skill": skill_name,
                            "timestamp": datetime.now().isoformat(),
                        }
                        await ws.send_json(hmsg)
                        log(hmsg)
                        agent_cycle = itertools.cycle(active_agents)
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
                    elif t == "human":
                        text = evt["text"]
                        history_entry, skill_name = resolve_human_text(text)
                        history_text += f"\n[Human]: {history_entry}\n"
                        hmsg = {
                            "type": "message", "agent": "Human",
                            "color": "#60a5fa", "text": text,
                            "skill": skill_name,
                            "timestamp": datetime.now().isoformat(),
                        }
                        await ws.send_json(hmsg)
                        log(hmsg)
                        agent_cycle = itertools.cycle(active_agents)
                        break

    except WebSocketDisconnect:
        pass
    finally:
        recv_task.cancel()
        save_history(session_id, messages)
        try:
            await ws.send_json({"type": "system", "text": "Session ended. Writing daily summaries…"})
        except Exception:
            pass
        for agent in active_agents:
            asyncio.create_task(write_daily_summary(agent))


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    migrate_if_needed()
    ensure_agent_configs()
    ensure_default_template()


app.mount("/static", StaticFiles(directory="static"), name="static")
