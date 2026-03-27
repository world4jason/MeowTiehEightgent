"""Agent CRUD and agent file (AGENT.md, IDENTITY.md, SOUL.md) endpoints."""
import asyncio
import json
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/agents")
async def list_agents():
    import app as _app
    registry = _app.get_agent_registry()
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
            "modelTiers": a.get("model_tiers", None),
        }
        for a in registry.values()
    ]


@router.get("/agents/{name}")
async def get_agent(name: str):
    import app as _app
    agent_dir = _app._find_agent_dir(name)
    if agent_dir is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    config_path = agent_dir / "config.json"
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Agent not found")
    data = json.loads(config_path.read_text())
    data["name"] = name
    return data


@router.post("/agents")
async def add_agent(body: dict):
    import app as _app
    name = body.get("name", "").strip()
    if not name or re.search(r'[/\\.\s]', name) or len(name) > 64:
        raise HTTPException(status_code=400, detail="Name required (no slashes, dots, or spaces)")

    if _app._find_agent_dir(name) is not None:
        raise HTTPException(status_code=409, detail="Agent already exists")

    agent_id = str(uuid.uuid4())
    short_id = agent_id[:8]
    folder_name = f"{short_id}-{name}"
    agent_dir = _app.AGENTS_DIR / folder_name
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "memory").mkdir(exist_ok=True)

    default_dir = _app.AGENTS_DIR / "_default"
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"]:
        src = default_dir / fname
        dst = agent_dir / fname
        if src.exists():
            dst.write_text(src.read_text().replace("{name}", name))

    config = {
        "configVersion": 1,
        "id": agent_id,
        "name": name,
        "role": body.get("role", ""),
        "title": body.get("title", ""),
        "emoji": body.get("emoji", "🤖"),
        "color": body.get("color", "#888888"),
        "description": body.get("description", ""),
        "enabled": body.get("enabled", False),
        "adapter": body.get("adapter", body.get("model", "")),
        "adapterConfig": body.get("adapterConfig", {}),
        "model_tiers": body.get("model_tiers", None),
        "skills": body.get("skills") or _app.list_skill_slugs(),
        "reportsTo": body.get("reportsTo", None),
        "permissions": body.get("permissions", {}),
        "budget": body.get("budget", {}),
        "heartbeat": body.get("heartbeat", None),
    }
    (agent_dir / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False))
    return {"ok": True, "name": name, "id": agent_id}


@router.put("/agents/{name}")
async def update_agent(name: str, body: dict):
    import app as _app
    agent_dir = _app._find_agent_dir(name)
    if agent_dir is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    config_path = agent_dir / "config.json"
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Agent not found")
    body.pop("name", None)
    existing = json.loads(config_path.read_text())
    existing.update(body)
    config_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    return {"ok": True}


@router.delete("/agents/{name}")
async def remove_agent(name: str):
    import app as _app
    agent_dir = _app._find_agent_dir(name)
    if agent_dir is not None:
        config_path = agent_dir / "config.json"
        if config_path.exists():
            data = json.loads(config_path.read_text())
            data["enabled"] = False
            config_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {"ok": True}


def _read_agent_file(name: str, fname: str) -> str:
    import app as _app
    agent_dir = _app._find_agent_dir(name)
    if agent_dir is None:
        agent_dir = _app.AGENTS_DIR / name
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "memory").mkdir(exist_ok=True)
    path = agent_dir / fname
    if not path.exists():
        registry = _app.get_agent_registry()
        if name in registry:
            _app.ensure_workspace(registry[name])
        elif name == "_default":
            _app.ensure_default_template()
    return path.read_text() if path.exists() else ""


def _write_agent_file(name: str, fname: str, content: str):
    import app as _app
    agent_dir = _app._find_agent_dir(name)
    if agent_dir is None:
        agent_dir = _app.AGENTS_DIR / name
    path = agent_dir / fname
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


@router.get("/agents/{name}/agent-md")
async def get_agent_md(name: str):
    return {"content": _read_agent_file(name, "AGENT.md")}


@router.put("/agents/{name}/agent-md")
async def put_agent_md(name: str, body: dict):
    _write_agent_file(name, "AGENT.md", body.get("content", ""))
    return {"ok": True}


@router.get("/agents/{name}/identity")
async def get_agent_identity(name: str):
    return {"content": _read_agent_file(name, "IDENTITY.md")}


@router.put("/agents/{name}/identity")
async def put_agent_identity(name: str, body: dict):
    _write_agent_file(name, "IDENTITY.md", body.get("content", ""))
    return {"ok": True}


@router.get("/agents/{name}/soul")
async def get_agent_soul(name: str):
    return {"content": _read_agent_file(name, "SOUL.md")}


@router.put("/agents/{name}/soul")
async def put_agent_soul(name: str, body: dict):
    _write_agent_file(name, "SOUL.md", body.get("content", ""))
    return {"ok": True}


@router.post("/agents/{name}/test")
async def test_agent(name: str):
    import app as _app
    registry = _app.get_agent_registry()
    if name not in registry:
        return {"ok": False, "error": "Unknown agent"}
    agent = registry[name]
    _app.ensure_workspace(agent)
    try:
        response = await asyncio.wait_for(
            _app.call_agent(agent, "Reply with exactly three words: I am ready."),
            timeout=30,
        )
        return {"ok": bool(response), "response": response[:300] if response else "(empty)"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout (30s)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/agents/{name}/daily-summary")
async def trigger_daily_summary(name: str):
    import app as _app
    registry = _app.get_agent_registry()
    if name not in registry:
        return {"ok": False, "error": "Unknown agent"}
    agent = registry[name]
    _app.ensure_workspace(agent)
    await _app.write_daily_summary(agent)
    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = agent["workspace"] / "memory" / f"{today}.md"
    summary_written = mem_file.exists() and "## Daily Summary" in mem_file.read_text()
    return {"ok": summary_written}
