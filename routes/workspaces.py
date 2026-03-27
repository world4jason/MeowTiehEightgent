"""Workspace CRUD and file upload endpoints."""
import json
import re
import shutil
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.security import validate_filename, safe_workspace_path

router = APIRouter()


def _workspace_config_path(workspace_id: str):
    import app as _app
    return _app.WORKSPACES_DIR / workspace_id / "config.json"


def _load_workspace_config(workspace_id: str) -> dict:
    p = _workspace_config_path(workspace_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    return json.loads(p.read_text())


@router.get("/workspaces")
async def list_workspaces():
    import app as _app
    result = []
    for d in sorted(_app.WORKSPACES_DIR.iterdir(), key=lambda x: x.name):
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


@router.post("/workspaces")
async def create_workspace(body: dict):
    import app as _app
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    workspace_id = re.sub(r"[^a-z0-9_-]", "-", name.lower()).strip("-") or "workspace"
    base = workspace_id
    idx = 2
    while (_app.WORKSPACES_DIR / workspace_id).exists():
        workspace_id = f"{base}-{idx}"
        idx += 1
    d = _app.WORKSPACES_DIR / workspace_id
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


@router.get("/workspaces/{workspace_id}")
async def get_workspace(workspace_id: str):
    import app as _app
    cfg = _load_workspace_config(workspace_id)
    files_dir = _app.WORKSPACES_DIR / workspace_id / "files"
    files = [f.name for f in files_dir.iterdir() if f.is_file()] if files_dir.exists() else []
    return {**cfg, "files": sorted(files)}


@router.put("/workspaces/{workspace_id}")
async def update_workspace(workspace_id: str, body: dict):
    cfg = _load_workspace_config(workspace_id)
    for key in ("name", "description", "system_prompt", "default_agents"):
        if key in body:
            cfg[key] = body[key]
    _workspace_config_path(workspace_id).write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    return {"ok": True}


@router.delete("/workspaces/{workspace_id}")
async def delete_workspace(workspace_id: str):
    import app as _app
    d = _app.WORKSPACES_DIR / workspace_id
    if not d.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    shutil.rmtree(d)
    # Detach sessions that belonged to this workspace
    for session_dir in _app.HISTORY_DIR.iterdir():
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


@router.post("/workspaces/{workspace_id}/files")
async def upload_workspace_file(workspace_id: str, file: UploadFile = File(...)):
    import app as _app
    d = _app.WORKSPACES_DIR / workspace_id / "files"
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


@router.delete("/workspaces/{workspace_id}/files/{filename}")
async def delete_workspace_file(workspace_id: str, filename: str):
    import app as _app
    p = _app.WORKSPACES_DIR / workspace_id / "files" / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found")
    p.unlink()
    return {"ok": True}


@router.put("/sessions/{session_id}/workspace")
async def move_session_to_workspace(session_id: str, body: dict):
    """Change the workspace_id field in a session's messages."""
    import app as _app
    mf = _app.session_messages_path(session_id)
    if not mf.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    workspace_id = body.get("workspace_id")  # None to detach
    if workspace_id and not (_app.WORKSPACES_DIR / workspace_id).exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    msgs = json.loads(mf.read_text())
    for m in msgs:
        m["workspace_id"] = workspace_id
    mf.write_text(json.dumps(msgs, indent=2, ensure_ascii=False))
    return {"ok": True}
