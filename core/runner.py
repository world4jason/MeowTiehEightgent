"""Agent subprocess runner: pure helpers for streaming/calling CLI and API agents."""
import asyncio
import base64
import json
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path

import httpx

from core.config import DEFAULT_MODELS
from core.errors import (
    SubprocessError,
    SubprocessStartupError,
    SubprocessTimeoutError,
    SubprocessCrashError,
    TokenUsage,
)

logger = logging.getLogger(__name__)


# ── JSON output helpers ────────────────────────────────────────────────────────

def _get_json_output_flags(agent: dict) -> list[str]:
    """Return extra CLI flags to enable JSON streaming output for token tracking.

    Returns [] if the model does not support JSON output, or if explicitly disabled.
    Uses the CLI binary name (cmd[0]) for detection, not model_id which may have
    suffixes like _local/_api.
    """
    if agent.get("json_output") is False:
        return []
    # Detect by binary name (more reliable than model_id for v1 adapter presets)
    cmd = agent.get("cmd") or []
    binary = cmd[0] if cmd else ""
    model_id = agent.get("model_id", "")
    if binary == "claude" or model_id == "claude":
        return ["--output-format", "stream-json", "--verbose"]
    if binary == "gemini" or model_id == "gemini":
        return ["--output-format", "stream-json"]
    return []


def _parse_jsonl_line(line: str, model_id: str) -> tuple[str | None, dict | None]:
    """Parse one JSONL line from a stream-json CLI output.

    Returns (text_chunk, usage_dict).
    - text_chunk: incremental text from this event, or None
    - usage_dict: {"input": int, "output": int, "cached": int}, or None
    """
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return (line, None)  # non-JSON line: pass through as raw text

    t = obj.get("type", "")

    if model_id == "claude":
        if t == "assistant":
            msg = obj.get("message") or {}
            content = msg.get("content") or []
            texts = [b.get("text", "") for b in content
                     if isinstance(b, dict) and b.get("type") == "text"]
            text = "".join(texts)
            return (text or None, None)
        if t == "result":
            u = obj.get("usage") or {}
            return (None, {
                "input": int(u.get("input_tokens", 0)),
                "output": int(u.get("output_tokens", 0)),
                "cached": int(u.get("cache_read_input_tokens", 0)),
            })

    elif model_id == "gemini":
        # Gemini stream-json format: type=message + role=assistant + content (str)
        if t == "message":
            role = obj.get("role", "")
            if role == "assistant":
                content = obj.get("content", "")
                if isinstance(content, str):
                    return (content or None, None)
                elif isinstance(content, list):
                    texts = []
                    for item in content:
                        if isinstance(item, str):
                            texts.append(item)
                        elif isinstance(item, dict):
                            texts.append(str(item.get("text", "") or item.get("content", "")))
                    return ("".join(texts) or None, None)
            return (None, None)
        # Gemini usage is in type=result → stats
        if t == "result":
            stats = obj.get("stats") or {}
            input_tok = int(stats.get("input_tokens", 0))
            output_tok = int(stats.get("output_tokens", 0))
            cached_tok = int(stats.get("cached", 0))
            return (None, {"input": input_tok, "output": output_tok, "cached": cached_tok})

    return (None, None)


def accumulate_token_usage(totals: dict, agent_name: str, input_tokens: int, output_tokens: int) -> None:
    """Add turn token counts to the per-agent cumulative totals dict (mutates in place)."""
    if agent_name not in totals:
        totals[agent_name] = {"input": 0, "output": 0}
    totals[agent_name]["input"] += input_tokens
    totals[agent_name]["output"] += output_tokens


def format_token_count(n: int) -> str:
    """Format token count: < 1000 as integer, >= 1000 as '1.2k'."""
    if n < 1000:
        return str(n)
    return f"{n / 1000:.1f}k"


def _resolve_timeout(agent: dict, key: str, default: float) -> float:
    """Precedence: agent config > DEFAULT_MODELS > hard default."""
    if key in agent:
        return float(agent[key])
    # Fall back to DEFAULT_MODELS so built-in defaults apply even when
    # the user's config.json overrides the models dict without timeout fields.
    model_id = agent.get("model_id", "")
    if model_id in DEFAULT_MODELS and key in DEFAULT_MODELS[model_id]:
        return float(DEFAULT_MODELS[model_id][key])
    return default


def _error_message(e: "SubprocessError") -> str:
    if isinstance(e, SubprocessTimeoutError):
        return f"Agent {e.agent} timed out after {e.timeout_seconds}s of inactivity"
    if isinstance(e, SubprocessStartupError):
        return f"Agent {e.agent} failed to start: {e.cause}"
    if isinstance(e, SubprocessCrashError):
        details = f"exit {e.exit_code}" if e.exit_code is not None else e.cause
        return f"Agent {e.agent} crashed ({details})"
    return f"Agent {e.agent} failed"


# ── Image helpers ──────────────────────────────────────────────────────────────

def write_temp_images(images: list[dict]) -> tuple[list[str], list[str]]:
    """Write base64 images to temp files. Returns (file_paths, extra_cmd_args)."""
    tmp_paths: list[str] = []
    extra_args: list[str] = []
    for img in images:
        suffix = '.' + (img.get('mime', 'image/jpeg').split('/')[-1] or 'jpg')
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(base64.b64decode(img['base64']))
            tmp_paths.append(f.name)
            extra_args.extend(['--add-file', f.name])
    return tmp_paths, extra_args


def cleanup_temp_files(paths: list[str]):
    for p in paths:
        try:
            os.unlink(p)
        except Exception:
            pass


# ── CLI agent calls ────────────────────────────────────────────────────────────

async def call_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None) -> str:
    tmp_paths: list[str] = []
    extra_args: list[str] = []
    if images:
        tmp_paths, extra_args = write_temp_images(images)
    proc = await asyncio.create_subprocess_exec(
        *agent["cmd"], *extra_args, prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        cwd=agent["workspace"],
    )
    try:
        stdout, _ = await proc.communicate()
        return stdout.decode().strip()
    except asyncio.CancelledError:
        proc.kill()
        raise
    finally:
        cleanup_temp_files(tmp_paths)


async def call_api_agent(agent: dict, prompt: str) -> str:
    base = agent.get("baseUrl", "http://127.0.0.1:11434")
    model = agent.get("model", "llama3.2")
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        data = r.json()
        # Surface API-level errors (e.g. ollama quota limit, model not found)
        if "error" in data:
            raise RuntimeError(f"API error: {data['error']}")
        r.raise_for_status()
        return data.get("response", "").strip()


async def call_agent(agent: dict, prompt: str) -> str:
    if agent.get("type") == "api":
        return await call_api_agent(agent, prompt)
    return await call_cli_agent(agent, prompt)


# ── CLI streaming ──────────────────────────────────────────────────────────────

async def stream_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
    """Async generator: yield text chunks from CLI stdout, then optionally a TokenUsage.

    When the model supports JSON output (claude/gemini), adds --output-format stream-json
    flags, reads line-by-line, parses JSONL events for text and token usage, and yields
    a TokenUsage object as the last item after all text chunks.

    Raises SubprocessStartupError, SubprocessTimeoutError, or SubprocessCrashError
    on failure.  Already-yielded chunks are preserved in the exception's
    partial_output so the caller can append [TRUNCATED] to history.
    """
    idle_timeout = _resolve_timeout(agent, "idle_timeout_seconds", 60)
    startup_timeout = _resolve_timeout(agent, "startup_timeout_seconds", 10)
    buffer = ""

    tmp_paths: list[str] = []
    extra_args: list[str] = []
    if images and _resolve_supports_image(agent):
        tmp_paths, extra_args = write_temp_images(images)

    if mode == "think" and agent.get("supports_thinking", False):
        extra_args = extra_args + ["--effort", "max"]

    # JSON output mode: adds stream-json flags for token tracking
    # json_flags must come BEFORE the rest of cmd (e.g. before gemini's `-p`)
    # to avoid yargs parsing errors like "Not enough arguments following: p"
    json_flags = _get_json_output_flags(agent)
    cmd_binary = agent["cmd"][:1]   # e.g. ["gemini"] or ["claude"]
    cmd_rest = agent["cmd"][1:]     # e.g. ["-p"] or ["--print"]
    model_id = agent.get("model_id", "")
    _usage: dict[str, int] = {"input": 0, "output": 0, "cached": 0}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_binary, *json_flags, *cmd_rest, *extra_args, prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=agent["workspace"],
        )
    except (FileNotFoundError, PermissionError, OSError) as e:
        cleanup_temp_files(tmp_paths)
        raise SubprocessStartupError(agent=agent["name"], cause=str(e))

    # Increase StreamReader line limit to 8MB so large tool_result JSONL lines
    # (e.g. Gemini reading big memory files) don't raise LimitOverrunError
    if json_flags and hasattr(proc.stdout, '_limit'):
        proc.stdout._limit = 8 * 1024 * 1024  # 8MB per line

    stderr_task = asyncio.create_task(proc.stderr.read())

    try:
        # --- startup timeout: wait for first byte/line ---
        try:
            first_data = await asyncio.wait_for(
                proc.stdout.readline() if json_flags else proc.stdout.read(256),
                timeout=startup_timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise SubprocessStartupError(
                agent=agent["name"],
                cause=f"no output within {startup_timeout}s",
            )

        if not first_data:
            # EOF immediately after startup
            await proc.wait()
            stderr_out = await stderr_task
            raise SubprocessCrashError(
                agent=agent["name"],
                partial_output="",
                stderr_output=stderr_out.decode(errors='replace'),
                exit_code=proc.returncode,
                cause="empty output",
            )

        decoded = first_data.decode(errors='replace')
        if json_flags:
            line = decoded.strip()
            if line:
                text, usage = _parse_jsonl_line(line, model_id)
                if usage:
                    for k, v in usage.items():
                        if v > _usage.get(k, 0):
                            _usage[k] = v
                if text:
                    buffer += text
                    yield text
        else:
            buffer += decoded
            yield decoded

        # --- idle timeout: per-chunk/line reads ---
        while True:
            try:
                data = await asyncio.wait_for(
                    proc.stdout.readline() if json_flags else proc.stdout.read(256),
                    timeout=idle_timeout,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                stderr_out = await stderr_task
                with open("/tmp/agent_crash.log", "a") as _f:
                    _f.write(f"\n=== {agent['name']} IDLE TIMEOUT ({idle_timeout}s) ===\n")
                    _f.write(f"buffer_len: {len(buffer)}\n")
                raise SubprocessTimeoutError(
                    agent=agent["name"],
                    partial_output=buffer,
                    stderr_output=stderr_out.decode(errors='replace'),
                    timeout_seconds=idle_timeout,
                )
            if not data:
                break
            decoded = data.decode(errors='replace')
            if json_flags:
                line = decoded.strip()
                if line:
                    text, usage = _parse_jsonl_line(line, model_id)
                    if usage:
                        for k, v in usage.items():
                            if v > _usage.get(k, 0):
                                _usage[k] = v
                    if text:
                        buffer += text
                        yield text
            else:
                buffer += decoded
                yield decoded

    except SubprocessError:
        raise

    except Exception as e:
        proc.kill()
        await proc.wait()
        stderr_out = await stderr_task
        stderr_text = stderr_out.decode(errors='replace')
        with open("/tmp/agent_crash.log", "a") as _f:
            _f.write(f"\n=== {agent['name']} EXCEPTION: {type(e).__name__}: {e} ===\n")
            _f.write(f"stderr: {stderr_text[:500]}\n")
        raise SubprocessCrashError(
            agent=agent["name"],
            partial_output=buffer,
            stderr_output=stderr_text,
            cause=str(e),
        )

    finally:
        cleanup_temp_files(tmp_paths)

    # --- normal exit: check return code ---
    await proc.wait()
    stderr_out = await stderr_task
    if proc.returncode != 0:
        stderr_text = stderr_out.decode(errors='replace')
        with open("/tmp/agent_crash.log", "a") as _f:
            _f.write(f"\n=== {agent['name']} exit {proc.returncode} ===\n")
            _f.write(f"stderr: {stderr_text[:1000]}\n")
            _f.write(f"buffer_len: {len(buffer)}\n")
        raise SubprocessCrashError(
            agent=agent["name"],
            partial_output=buffer,
            stderr_output=stderr_text,
            exit_code=proc.returncode,
        )

    # Yield token usage if JSON mode was active and we captured any counts
    if json_flags and (_usage["input"] or _usage["output"]):
        yield TokenUsage(
            input_tokens=_usage["input"],
            output_tokens=_usage["output"],
            cached_tokens=_usage["cached"],
        )


async def stream_api_agent(agent: dict, prompt: str):
    """Async generator: yield text chunks from Ollama HTTP stream."""
    base = agent.get("baseUrl", "http://127.0.0.1:11434")
    model = agent.get("model", "llama3.2")
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST", f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if chunk := data.get("response", ""):
                            yield chunk
                    except json.JSONDecodeError:
                        pass


def build_mode_switch_notification(agent: dict, mode: str) -> dict | None:
    """Build a system message for model_tiers mode switches. Returns None if no notification needed."""
    tiers = agent.get("model_tiers")
    if not tiers or "thinking" not in tiers:
        return None
    thinking_key = tiers["thinking"]
    name = agent.get("name", "Agent")
    if mode == "think":
        return {"type": "system", "text": f"\U0001f9e0 {name} 已切換至思考模式 ({thinking_key})"}
    else:
        return {"type": "system", "text": f"\U0001f4ac {name} 已切換至對話模式"}


async def _handle_set_mode(ws, evt, agent_modes: dict, active_agents: list):
    """Shared handler for set_mode WS messages."""
    _sm_agent = evt.get("agent", "")
    _sm_mode = evt.get("mode", "")
    if _sm_agent not in agent_modes:
        await ws.send_json({"type": "error", "message": f"Unknown agent: {_sm_agent}"})
    elif _sm_mode not in ("chat", "think"):
        await ws.send_json({"type": "error", "message": f"Invalid mode: {_sm_mode}"})
    else:
        agent_modes[_sm_agent] = _sm_mode
        await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
        _sm_agent_obj = next((a for a in active_agents if a["name"] == _sm_agent), None)
        if _sm_agent_obj:
            _notif = build_mode_switch_notification(_sm_agent_obj, _sm_mode)
            if _notif:
                await ws.send_json(_notif)


def append_memory(agent: dict, topic: str, response: str):
    today = datetime.now().strftime("%Y-%m-%d")
    raw_dir = agent["workspace"] / "memory" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    mem_file = raw_dir / f"{today}.md"
    ts = datetime.now().strftime("%H:%M")
    with mem_file.open("a") as f:
        f.write(f"\n=====\n[{agent['name']}] {today} {ts}\n\nTopic: {topic}\n\n{response}\n")


async def write_daily_summary(agent: dict):
    today = datetime.now().strftime("%Y-%m-%d")
    mem_file = agent["workspace"] / "memory" / f"{today}.md"
    if not mem_file.exists():
        return
    raw = mem_file.read_text().strip()
    if "## Daily Summary" in raw:
        return
    prompt = (
        f"You are {agent['name']}. Below is your raw memory log from today ({today}).\n\n"
        f"{raw}\n\n---\n\n"
        f"Write a concise daily summary (3–6 sentences) covering:\n"
        f"- The main topics discussed today\n"
        f"- Key ideas or arguments you made or encountered\n"
        f"- Anything worth remembering for future sessions\n\n"
        f"Write only the summary text, no headers."
    )
    try:
        summary = await asyncio.wait_for(call_agent(agent, prompt), timeout=60)
        if summary:
            ts = datetime.now().strftime("%H:%M")
            with mem_file.open("a") as f:
                f.write(f"\n\n## Daily Summary — {today} {ts}\n\n{summary}\n")
    except Exception:
        pass


def _resolve_supports_image(agent: dict) -> bool:
    """Precedence: agent-level > adapter preset (v1) > model_config > DEFAULT_MODELS > True.

    For v1 agents (configVersion >= 1):
      1. Agent-level ``supports_image`` (set by user or copied by _merge_v1_agent)
      2. Adapter preset ``supports_image``
      3. Fallback True

    For v0 agents (legacy):
      1. Agent-level ``supports_image``
      2. model_config ``supports_image``
      3. DEFAULT_MODELS lookup by model name
      4. Fallback True
    """
    # Step 1: agent-level override (works for both v0 and v1)
    if "supports_image" in agent:
        return bool(agent["supports_image"])

    # Step 2 (v1): look up adapter preset
    if agent.get("configVersion", 0) >= 1:
        adapter_type = agent.get("adapter", "")
        if adapter_type:
            import app as _app
            presets = _app.load_adapter_presets()
            preset = presets.get(adapter_type) or {}
            if "supports_image" in preset:
                return bool(preset["supports_image"])
        return True

    # Step 2 (v0): model_config then DEFAULT_MODELS
    model_cfg = agent.get("model_config") or {}
    if "supports_image" in model_cfg:
        return bool(model_cfg["supports_image"])
    model_name = agent.get("model", "")
    if model_name in DEFAULT_MODELS and "supports_image" in DEFAULT_MODELS[model_name]:
        return bool(DEFAULT_MODELS[model_name]["supports_image"])
    return True


