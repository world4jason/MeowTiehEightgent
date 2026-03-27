"""User markdown endpoints (/user/md)."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/user/md")
async def get_user_md():
    import app as _app
    user_md = _app.PROJECT_DIR / "USER.md"
    return {"content": user_md.read_text() if user_md.exists() else ""}


@router.put("/user/md")
async def put_user_md(body: dict):
    import app as _app
    (_app.PROJECT_DIR / "USER.md").write_text(body.get("content", ""))
    return {"ok": True}
