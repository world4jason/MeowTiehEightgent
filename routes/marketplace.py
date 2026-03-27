"""Marketplace agent endpoints."""
import json
import re
import shutil
import uuid

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/marketplace/agents")
async def list_marketplace_agents():
    import app as _app
    if not _app.MARKETPLACE_DIR.exists():
        return []
    installed_names = _app._get_installed_agent_names()
    result = []
    for agent_dir in sorted(_app.MARKETPLACE_DIR.iterdir()):
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
            "installed": agent_dir.name in installed_names,
        })
    return result


@router.get("/marketplace/agents/{agent_id}")
async def get_marketplace_agent(agent_id: str):
    import app as _app
    src = _app.MARKETPLACE_DIR / agent_id
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
        "installed": _app._find_agent_dir(agent_id) is not None,
    }


@router.post("/marketplace/agents")
async def create_marketplace_agent(body: dict = {}):
    import app as _app
    agent_id = (body.get("id") or "").strip()
    if not agent_id or re.search(r'[/\\.\s]', agent_id) or len(agent_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid agent id")
    _app.MARKETPLACE_DIR.mkdir(parents=True, exist_ok=True)
    dst = _app.MARKETPLACE_DIR / agent_id
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


@router.put("/marketplace/agents/{agent_id}")
async def update_marketplace_agent(agent_id: str, body: dict = {}):
    import app as _app
    src = _app.MARKETPLACE_DIR / agent_id
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


@router.delete("/marketplace/agents/{agent_id}")
async def delete_marketplace_agent(agent_id: str):
    import app as _app
    src = _app.MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    shutil.rmtree(src)
    return {"ok": True}


@router.post("/marketplace/agents/{agent_id}/install")
async def install_marketplace_agent(agent_id: str, body: dict = {}):
    import app as _app
    src = _app.MARKETPLACE_DIR / agent_id
    if not src.is_dir():
        raise HTTPException(status_code=404, detail="Agent not found in marketplace")
    dest_name = (body.get("name") or agent_id).strip()
    if not dest_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    if _app._find_agent_dir(dest_name) is not None:
        raise HTTPException(status_code=409, detail=f"Agent '{dest_name}' already exists")

    new_agent_id = str(uuid.uuid4())
    short_id = new_agent_id[:8]
    folder_name = f"{short_id}-{dest_name}"
    dst = _app.AGENTS_DIR / folder_name
    dst.mkdir(parents=True)
    (dst / "memory").mkdir()
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md"]:
        src_file = src / fname
        if src_file.exists():
            (dst / fname).write_text(src_file.read_text())
    mkt_cfg = json.loads((src / "config.json").read_text()) if (src / "config.json").exists() else {}
    cfg = {
        "configVersion": 1,
        "id": new_agent_id,
        "name": dest_name,
        "role": mkt_cfg.get("role", ""),
        "title": mkt_cfg.get("title", ""),
        "emoji": mkt_cfg.get("emoji", "🤖"),
        "color": mkt_cfg.get("color", "#888"),
        "description": mkt_cfg.get("description", ""),
        "enabled": True,
        "adapter": body.get("model", mkt_cfg.get("adapter", mkt_cfg.get("model", ""))),
        "adapterConfig": mkt_cfg.get("adapterConfig", {}),
        "model_tiers": mkt_cfg.get("model_tiers", None),
        "skills": mkt_cfg.get("skills", []),
        "reportsTo": mkt_cfg.get("reportsTo", None),
        "permissions": mkt_cfg.get("permissions", {}),
        "budget": mkt_cfg.get("budget", {}),
        "heartbeat": mkt_cfg.get("heartbeat", None),
    }
    (dst / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    default_memory = _app.AGENTS_DIR / "_default" / "MEMORY.md"
    if default_memory.exists():
        (dst / "MEMORY.md").write_text(default_memory.read_text().replace("{name}", dest_name))
    return {"ok": True, "name": dest_name, "id": new_agent_id}
