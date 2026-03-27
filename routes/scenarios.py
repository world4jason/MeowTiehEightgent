"""Scenario CRUD endpoints."""
import json
import re

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/scenarios")
async def list_scenarios():
    """Return all scenario JSON files from the scenarios/ directory."""
    import app as _app
    if not _app.SCENARIOS_DIR.exists():
        return []
    result = []
    for f in sorted(_app.SCENARIOS_DIR.glob("*.json")):
        try:
            result.append(json.loads(f.read_text()))
        except Exception:
            pass
    return result


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str):
    import app as _app
    f = _app.SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    return json.loads(f.read_text())


@router.post("/scenarios")
async def create_scenario(body: dict = {}):
    import app as _app
    sid = (body.get("id") or "").strip()
    if not sid or re.search(r'[/\\.\s]', sid) or len(sid) > 64:
        raise HTTPException(status_code=400, detail="Invalid scenario id")
    _app.SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    f = _app.SCENARIOS_DIR / f"{sid}.json"
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


@router.put("/scenarios/{scenario_id}")
async def update_scenario(scenario_id: str, body: dict = {}):
    import app as _app
    f = _app.SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    data = json.loads(f.read_text())
    for key in ("name", "description", "system_prompt", "suggested_agents", "topic_hint"):
        if key in body:
            data[key] = body[key]
    f.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {"ok": True}


@router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str):
    import app as _app
    f = _app.SCENARIOS_DIR / f"{scenario_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Scenario not found")
    f.unlink()
    return {"ok": True}
