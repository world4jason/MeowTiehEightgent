"""Session list, get, create, hide, image, summary, recompress, rename endpoints."""
import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()


@router.get("/sessions")
async def list_sessions(limit: int = 30, offset: int = 0):
    import app as _app
    hidden = _app.load_hidden()
    all_dirs = sorted(
        (d for d in _app.HISTORY_DIR.iterdir()
         if d.is_dir() and d.name not in hidden and (d / "messages.json").exists()),
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


@router.post("/sessions")
async def create_session():
    import app as _app
    session_id = str(uuid.uuid4())
    session_path = _app.HISTORY_DIR / session_id
    session_path.mkdir(parents=True, exist_ok=True)
    (session_path / "messages.json").write_text("[]")
    return {"id": session_id, "name": f"Session {session_id[:8]}"}


@router.delete("/sessions/{session_id}")
async def hide_session(session_id: str):
    import app as _app
    hidden = _app.load_hidden()
    hidden.add(session_id)
    _app.save_hidden(hidden)
    return {"ok": True}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    import app as _app
    f = _app.session_messages_path(session_id)
    if not f.exists():
        return []
    return json.loads(f.read_text())


@router.get("/sessions/{session_id}/images/{filename}")
async def get_session_image(session_id: str, filename: str):
    import app as _app
    p = _app.HISTORY_DIR / session_id / "images" / filename
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(p))


@router.get("/sessions/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Get the cached summary for a session."""
    import app as _app
    path = _app.HISTORY_DIR / session_id / "summary.json"
    if not path.exists():
        return {"exists": False}
    try:
        data = json.loads(path.read_text())
        if data.get("failed"):
            return {"exists": False}
        return {"exists": True, **data}
    except Exception:
        return {"exists": False}


@router.post("/sessions/{session_id}/recompress")
async def recompress_session(session_id: str, body: dict = {}):
    """Force re-summarization with optional direction hint. Runs inline."""
    import app as _app
    from history_manager import compress_history
    cfg = _app.load_config()
    summ_model = cfg.get("summarization_model", "")
    if not summ_model:
        raise HTTPException(status_code=400, detail="No summarization_model configured")

    msg_path = _app.session_messages_path(session_id)
    if not msg_path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    messages = json.loads(msg_path.read_text())

    summary_path = _app.HISTORY_DIR / session_id / "summary.json"
    if summary_path.exists():
        summary_path.unlink()

    max_rounds = cfg.get("max_history_rounds", 30)
    summary_text, _ = await compress_history(
        session_id, messages, window_size=max_rounds,
        summary_model=summ_model, trigger_threshold=0,
    )
    return {"ok": True, "summary_text": summary_text}


@router.put("/sessions/{session_id}/topic")
async def rename_session(session_id: str, body: dict):
    """Update the Topic text in the first system message."""
    import app as _app
    new_topic = (body.get("topic") or "").strip()
    if not new_topic:
        raise HTTPException(status_code=400, detail="topic required")
    f = _app.session_messages_path(session_id)
    if not f.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = json.loads(f.read_text())
    for m in msgs:
        if m.get("type") == "system":
            m["text"] = f"Topic: {new_topic}"
            break
    f.write_text(json.dumps(msgs, indent=2, ensure_ascii=False))
    return {"ok": True}
