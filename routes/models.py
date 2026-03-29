"""Models, adapter presets, and config endpoints."""
import asyncio
import json

from fastapi import APIRouter, HTTPException

router = APIRouter()


def _adapter_presets_key(cfg: dict) -> str:
    """Return the config key that holds adapter presets ('adapter_presets' or 'models')."""
    return "adapter_presets" if "adapter_presets" in cfg else "models"


# ── Models ────────────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models():
    """Backward-compatible model list — returns adapter_presets if available,
    otherwise falls back to old models dict."""
    import app as _app
    presets = _app.load_adapter_presets()
    return [{"id": mid, **m} for mid, m in presets.items()]


@router.post("/models")
async def add_model(body: dict):
    import app as _app
    mid = body.get("id", "").strip().lower()
    if not mid:
        raise HTTPException(status_code=400, detail="Model id required")
    cfg = _app.load_config()
    if "models" not in cfg:
        cfg["models"] = {}
    if mid in cfg["models"]:
        raise HTTPException(status_code=409, detail="Model already exists")
    entry: dict = {
        "type": body.get("type", "cli"),
        "color": body.get("color", "#888"),
        "emoji": body.get("emoji", "🤖"),
        "label": body.get("label", "").strip() or mid,
    }
    if entry["type"] == "cli":
        entry["cmd"] = body.get("cmd", [mid])
    else:
        entry["baseUrl"] = body.get("baseUrl", "http://127.0.0.1:11434")
        entry["apiModel"] = body.get("apiModel", "llama3.2")
    cfg["models"][mid] = entry
    _app.save_config(cfg)
    return {"ok": True}


@router.put("/models/{mid}")
async def update_model(mid: str, body: dict):
    import app as _app
    cfg = _app.load_config()
    if "models" not in cfg or mid not in cfg["models"]:
        raise HTTPException(status_code=404, detail="Model not found")
    body.pop("id", None)
    cfg["models"][mid].update(body)
    _app.save_config(cfg)
    return {"ok": True}


@router.delete("/models/{mid}")
async def delete_model(mid: str):
    import app as _app
    cfg = _app.load_config()
    cfg.get("models", {}).pop(mid, None)
    _app.save_config(cfg)
    return {"ok": True}


# ── Adapter Preset CRUD ───────────────────────────────────────────────────────

@router.get("/adapter-presets")
async def list_adapter_presets():
    """List all adapter presets from config.json."""
    import app as _app
    presets = _app.load_adapter_presets()
    return [{"adapter_type": k, **v} for k, v in presets.items()]


@router.post("/adapter-presets")
async def create_adapter_preset(body: dict):
    """Create a new adapter preset."""
    import app as _app
    adapter_type = body.get("adapter_type", "").strip()
    if not adapter_type:
        raise HTTPException(status_code=400, detail="adapter_type required")

    cfg = _app.load_config()
    key = _adapter_presets_key(cfg)
    if key not in cfg:
        cfg[key] = {}
    if adapter_type in cfg[key]:
        raise HTTPException(status_code=409, detail="Adapter preset already exists")

    entry = {k: v for k, v in body.items() if k != "adapter_type"}
    cfg[key][adapter_type] = entry
    _app.save_config(cfg)
    return {"ok": True, "adapter_type": adapter_type}


@router.put("/adapter-presets/{adapter_type}")
async def update_adapter_preset(adapter_type: str, body: dict):
    """Update an existing adapter preset."""
    import app as _app
    cfg = _app.load_config()
    key = _adapter_presets_key(cfg)
    if key not in cfg or adapter_type not in cfg[key]:
        raise HTTPException(status_code=404, detail="Adapter preset not found")

    body.pop("adapter_type", None)
    cfg[key][adapter_type].update(body)
    _app.save_config(cfg)
    return {"ok": True}


@router.delete("/adapter-presets/{adapter_type}")
async def delete_adapter_preset(adapter_type: str):
    """Delete an adapter preset."""
    import app as _app
    cfg = _app.load_config()
    key = _adapter_presets_key(cfg)
    cfg.get(key, {}).pop(adapter_type, None)
    _app.save_config(cfg)
    return {"ok": True}


# ── Config ────────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config():
    import app as _app
    return _app.load_config()


@router.post("/config")
async def post_config(body: dict):
    import app as _app
    _app.save_config(body)
    return {"ok": True}


@router.put("/config")
async def put_config(body: dict):
    import app as _app
    config = _app.load_config()
    if "summarization_model" in body:
        v = body["summarization_model"]
        if not isinstance(v, str):
            raise HTTPException(status_code=400, detail="summarization_model must be a string")
        config["summarization_model"] = v
    if "summary_trigger_threshold" in body:
        v = body["summary_trigger_threshold"]
        if not isinstance(v, int) or v < 1:
            raise HTTPException(status_code=400, detail="summary_trigger_threshold must be a positive integer")
        config["summary_trigger_threshold"] = v
    _app.CONFIG_FILE.write_text(json.dumps(config, indent=2, ensure_ascii=False))
    return {"ok": True}


@router.post("/models/{model_id}/test")
async def test_model(model_id: str):
    """Test connectivity for a model by sending a simple prompt."""
    import app as _app

    models = _app.load_models()
    if model_id not in models:
        return {"ok": False, "error": f"Unknown model: {model_id}"}

    m = models[model_id]
    agent_type = m.get("type", "cli")

    if agent_type == "api" and not m.get("baseUrl"):
        return {"ok": False, "error": "API model missing baseUrl — check adapter preset config"}
    if agent_type != "api" and "cmd" not in m:
        return {"ok": False, "error": "CLI model missing command — check adapter preset or add command field"}

    # Build a minimal agent dict for call_agent
    # Use small/fast model for connectivity test — we just need to know if CLI/API works
    test_agent = {
        "name": f"_test_{model_id}",
        "workspace": str(_app.PROJECT_DIR),
        **m,
    }
    # For API models, ensure "model" key is set (load_models uses "apiModel")
    if agent_type == "api" and not test_agent.get("model") and test_agent.get("apiModel"):
        test_agent["model"] = test_agent["apiModel"]
    # Override to fastest model variant for CLI agents
    _FAST_MODELS = {
        "claude": "claude-haiku-4-5-20251001",
        "gemini": "gemini-2.5-flash",
        "codex": "gpt-4.1-mini",
    }
    if agent_type == "cli" and test_agent.get("cmd"):
        binary = test_agent["cmd"][0]
        if binary in _FAST_MODELS:
            # Inject --model flag for fast test
            test_agent["cmd"] = list(test_agent["cmd"])
            if "--model" in test_agent["cmd"]:
                idx = test_agent["cmd"].index("--model")
                test_agent["cmd"][idx + 1] = _FAST_MODELS[binary]
            else:
                test_agent["cmd"].extend(["--model", _FAST_MODELS[binary]])
            # Remove extra_flags model override to avoid conflict
            test_agent.pop("extra_flags", None)
    try:
        response = await asyncio.wait_for(
            _app.call_agent(test_agent, "Reply with exactly three words: I am ready."),
            timeout=30,
        )
        return {"ok": bool(response), "response": response[:300] if response else "(empty)"}
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout (30s)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
