"""Health check and static index endpoints."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/")
async def index():
    return FileResponse("static/index.html")
