"""Session history helpers: save/load, migration, hidden sessions, image storage."""
import base64
import json
import uuid
from pathlib import Path


def session_dir(session_id: str) -> Path:
    """Return (and create) the folder for a session."""
    import app as _app
    d = _app.HISTORY_DIR / session_id
    d.mkdir(exist_ok=True)
    (d / "workspace").mkdir(exist_ok=True)   # pre-create workspace for future use
    return d


def session_messages_path(session_id: str) -> Path:
    import app as _app
    return _app.HISTORY_DIR / session_id / "messages.json"


def save_history(session_id: str, messages: list[dict]):
    session_dir(session_id)   # ensure folder exists
    session_messages_path(session_id).write_text(
        json.dumps(messages, ensure_ascii=False, indent=2)
    )


def migrate_history_to_folders():
    """One-time migration: move history/*.json → history/<id>/messages.json."""
    import app as _app
    for f in list(_app.HISTORY_DIR.glob("*.json")):
        sid = f.stem
        target_dir = _app.HISTORY_DIR / sid
        target_dir.mkdir(exist_ok=True)
        target = target_dir / "messages.json"
        if not target.exists():
            target.write_text(f.read_text())
        f.unlink()


def load_hidden() -> set[str]:
    import app as _app
    if _app.HIDDEN_FILE.exists():
        try:
            return set(json.loads(_app.HIDDEN_FILE.read_text()))
        except Exception:
            pass
    return set()


def save_hidden(ids: set[str]):
    import app as _app
    _app.HIDDEN_FILE.write_text(json.dumps(sorted(ids)))


def save_session_images(session_id: str, images: list[dict]) -> list[dict]:
    """Save images to history/<session_id>/images/ and return [{name, filename}] references."""
    if not images:
        return []
    import app as _app
    img_dir = _app.HISTORY_DIR / session_id / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    refs = []
    for img in images:
        suffix = '.' + (img.get('mime', 'image/jpeg').split('/')[-1] or 'jpg')
        fname = f"{uuid.uuid4().hex}{suffix}"
        (img_dir / fname).write_bytes(base64.b64decode(img['base64']))
        refs.append({"name": img.get("name", fname), "filename": fname})
    return refs
