"""Ollama provider endpoints."""
import json

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()


def _resolve_ollama_base_url() -> str:
    """Resolve Ollama base URL from adapter_presets (v1) or models (v0)."""
    import app as _app
    presets = _app.load_adapter_presets()
    if "ollama_api" in presets and "baseUrl" in presets["ollama_api"]:
        return presets["ollama_api"]["baseUrl"]
    if "ollama" in presets and "baseUrl" in presets["ollama"]:
        return presets["ollama"]["baseUrl"]
    return "http://127.0.0.1:11434"


@router.get("/providers/ollama/models")
async def ollama_models(base_url: str = ""):
    if not base_url:
        base_url = _resolve_ollama_base_url()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{base_url}/api/tags")
            r.raise_for_status()
            result = [m["name"] for m in r.json().get("models", [])]
            return {"ok": True, "models": result}
    except Exception as e:
        return {"ok": False, "models": [], "error": str(e)}


@router.post("/providers/ollama/pull")
async def ollama_pull(payload: dict):
    base_url = payload.get("base_url", "").strip()
    if not base_url:
        base_url = _resolve_ollama_base_url()
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
