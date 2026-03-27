"""Workspace helpers: ensure_workspace, config loading, path utilities."""
import json
from pathlib import Path

from fastapi import HTTPException


def workspace_config_path(workspace_id: str) -> Path:
    import app as _app
    return _app.WORKSPACES_DIR / workspace_id / "config.json"


def load_workspace_config(workspace_id: str) -> dict:
    p = workspace_config_path(workspace_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Workspace not found")
    return json.loads(p.read_text())


def ensure_workspace(agent: dict):
    import app as _app
    ws: Path = agent["workspace"]
    ws.mkdir(parents=True, exist_ok=True)
    (ws / "memory").mkdir(exist_ok=True)
    name = agent["name"]

    default_dir = _app.AGENTS_DIR / "_default"
    for fname in ["AGENT.md", "IDENTITY.md", "SOUL.md", "MEMORY.md"]:
        dst = ws / fname
        if not dst.exists():
            src = default_dir / fname
            if src.exists():
                dst.write_text(src.read_text().replace("{name}", name))
