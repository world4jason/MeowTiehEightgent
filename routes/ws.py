"""WebSocket endpoint for multi-agent conversation sessions."""
import asyncio
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from conversation_engine import ConversationEngine

router = APIRouter()

_active_ws: list[str] = []   # client IPs currently connected (allows duplicates for counting)
_WS_LIMIT_PER_IP = 3


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    import app as _app
    from core.errors import SubprocessError, SubprocessStartupError, TokenUsage
    from core.runner import (
        stream_cli_agent,
        stream_api_agent,
        accumulate_token_usage,
        _error_message,
        build_mode_switch_notification,
        _handle_set_mode,
        append_memory,
        write_daily_summary,
    )
    from history_manager import (
        truncate_history,
        apply_sliding_window,
        compress_history,
        load_session_config,
        _format_history_text,
    )
    from core.memory_pipeline import safe_distill

    client_ip = ws.client.host if ws.client else "unknown"
    if _active_ws.count(client_ip) >= _WS_LIMIT_PER_IP:
        await ws.close(code=1008, reason="Too many connections")
        return
    _active_ws.append(client_ip)
    await ws.accept()

    data = await ws.receive_json()
    topic = data.get("topic", "General Discussion").strip()
    selected: list[str] = data.get("agents", [])
    auto_mode: bool = data.get("auto", True)
    manual_rounds: int = int(data.get("rounds", 2))
    silence_mode: bool = data.get("silence", False)   # probabilistic silence on/off
    resume_id: str | None = data.get("resume_from")
    workspace_id: str | None = data.get("workspace_id") or None
    scenario_id: str | None = data.get("scenario_id") or None
    blank_mode: bool = bool(data.get("blank_mode", False))
    kanban_state: list[dict] = data.get("kanban", [])

    session_id = resume_id if resume_id else (
        datetime.now().strftime("%Y-%m-%d_%H-%M-%S") + "_" + uuid.uuid4().hex[:6]
    )

    messages: list[dict] = []
    if resume_id:
        f = _app.session_messages_path(resume_id)
        if f.exists():
            messages = json.loads(f.read_text())

    def log(msg: dict):
        messages.append(msg)
        _app.save_history(session_id, messages)

    registry = _app.get_agent_registry()
    active_agents = []
    for name in selected:
        if name in registry and registry[name].get("enabled", True):
            agent = registry[name]
            _app.ensure_workspace(agent)
            active_agents.append(agent)

    if not active_agents:
        await ws.send_json({"type": "system", "text": "No agents selected."})
        return

    # Phase 1.1 — per-agent mode state
    agent_modes: dict[str, str] = {
        a["name"]: a.get("mode", "chat") for a in active_agents
    }

    # Phase 1.2 — scenario context
    scenario_system_prompt: str | None = None
    if scenario_id:
        scenario_file = _app.PROJECT_DIR / "scenarios" / f"{scenario_id}.json"
        if scenario_file.exists():
            try:
                sc = json.loads(scenario_file.read_text())
                scenario_system_prompt = sc.get("system_prompt") or None
            except Exception:
                pass
        if scenario_system_prompt is None and scenario_id:
            # scenario_id given but file not found or parse failed → blank mode
            blank_mode = True

    # Build history_text (with optional summarization)
    _cfg = _app.load_config()
    _max_rounds = _cfg.get("max_history_rounds", 30)
    _summ_model = _cfg.get("summarization_model", "")
    _summ_threshold = _cfg.get("summary_trigger_threshold", 10)

    # Per-session overrides
    _session_cfg = load_session_config(session_id)
    _max_rounds = _session_cfg.get("max_history_rounds", _max_rounds)
    _summ_threshold = _session_cfg.get("summary_trigger_threshold", _summ_threshold)

    def _build_agent_workspaces() -> dict[str, str]:
        return {a["name"]: str(a["workspace"]) for a in active_agents}

    async def _compression_progress(text: str):
        await ws.send_json({"type": "system", "text": text})

    if resume_id:
        if _summ_model and messages:
            _summary_prefix, _windowed = await compress_history(
                session_id, messages, window_size=_max_rounds,
                summary_model=_summ_model, trigger_threshold=_summ_threshold,
                on_progress=_compression_progress,
                agent_workspaces=_build_agent_workspaces(),
            )
        else:
            _summary_prefix = ""
            _windowed = apply_sliding_window(messages, max_rounds=_max_rounds)

        history_text = _format_history_text(topic, _summary_prefix, _windowed)
    else:
        # First message from welcome screen: treat as the opening human turn,
        # not just a session label, so agents see [Human]: from the start.
        history_text = f"[Human]: {topic}\n"
        hmsg = {
            "type": "message", "agent": "Human",
            "color": "#60a5fa", "text": topic,
            "timestamp": datetime.now().isoformat(),
        }
        log(hmsg)

    event_queue: asyncio.Queue = asyncio.Queue()

    # When resuming, consume the first human message before starting agents
    if resume_id:
        try:
            first_msg = await asyncio.wait_for(ws.receive_json(), timeout=60.0)
        except (asyncio.TimeoutError, Exception):
            first_msg = None
        if first_msg:
            if first_msg.get("type") == "human":
                raw_text = first_msg["text"]
                imgs = first_msg.get("images") or []
                img_refs = _app.save_session_images(session_id, imgs)
                history_entry, skill_name = _app.resolve_human_text(raw_text)
                history_text += f"\n[Human]: {history_entry}\n"
                hmsg0 = {
                    "type": "message", "agent": "Human",
                    "color": "#60a5fa", "text": raw_text,
                    "skill": skill_name,
                    "timestamp": datetime.now().isoformat(),
                }
                if img_refs:
                    hmsg0["images"] = img_refs
                log(hmsg0)
            elif first_msg.get("type") == "stop":
                return

    await ws.send_json({
        "type": "system",
        "text": f"Session started — {topic}  [{', '.join(a['name'] for a in active_agents)}]  {'Auto' if auto_mode else 'Manual'}",
        "session_id": session_id,
    })
    log({"type": "system", "text": f"Topic: {topic}", "workspace_id": workspace_id, "timestamp": datetime.now().isoformat()})

    # Broadcast initial mode state so clients know defaults on connect
    for _ag in active_agents:
        await ws.send_json({"type": "mode_update", "agent": _ag["name"], "mode": agent_modes[_ag["name"]]})

    engine = ConversationEngine(active_agents, silence=silence_mode)

    async def handle_member_event(evt: dict) -> bool:
        """Handle add_agent / remove_agent events. Returns True if handled."""
        nonlocal history_text
        t = evt.get("type")
        if t == "add_agent":
            name = evt.get("agent", "")
            registry = _app.get_agent_registry()
            if name in registry and not any(a["name"] == name for a in active_agents):
                agent = registry[name]
                _app.ensure_workspace(agent)
                active_agents.append(agent)
                agent_modes[name] = agent.get("mode", "chat")
                engine.add_agent(agent)
                history_text += f"\n[System]: {name} joined the conversation\n"
                smsg = {"type": "system", "text": f"{agent.get('emoji', '')} {name} 加入聊天室"}
                await ws.send_json(smsg)
                log({**smsg, "timestamp": datetime.now().isoformat()})
            return True
        if t == "remove_agent":
            name = evt.get("agent", "")
            removed = next((a for a in active_agents if a["name"] == name), None)
            if removed:
                active_agents.remove(removed)
                engine.remove_agent(name)
                smsg = {"type": "system", "text": f"{removed.get('emoji', '')} {name} 離開聊天室"}
                await ws.send_json(smsg)
                log({**smsg, "timestamp": datetime.now().isoformat()})
            return True
        return False

    async def receive_loop():
        while True:
            try:
                msg = await ws.receive_json()
                await event_queue.put(msg)
            except Exception:
                await event_queue.put({"type": "stop"})
                break

    recv_task = asyncio.create_task(receive_loop())

    async def next_event(timeout=None):
        try:
            if timeout is not None:
                return await asyncio.wait_for(event_queue.get(), timeout=timeout)
            return await event_queue.get()
        except asyncio.TimeoutError:
            return None

    try:
        running = True
        batch_turns = 0
        pending_humans: list[dict] = []  # buffer human msgs received while agent is thinking
        current_images: list[dict] = []  # images from last human message, used for next agent turn
        _session_token_totals: dict[str, dict] = {}  # cumulative per-agent token counts
        while running:
            agent = engine.next_speaker()
            await ws.send_json({"type": "thinking", "agent": agent["name"], "color": agent["color"]})

            t_start = asyncio.get_event_loop().time()
            chunk_parts: list[str] = []
            chunk_q: asyncio.Queue[str | SubprocessError | None] = asyncio.Queue()
            cancelled = False
            had_subprocess_error: SubprocessError | None = None
            turn_images = current_images[:]
            current_images = []  # consume once

            # Rebuild history from in-memory messages with summarization
            if _summ_model and messages:
                _summary_prefix, _windowed = await compress_history(
                    session_id, messages, window_size=_max_rounds,
                    summary_model=_summ_model, trigger_threshold=_summ_threshold,
                    on_progress=_compression_progress,
                    agent_workspaces=_build_agent_workspaces(),
                )
                _rebuilt_history = _format_history_text(topic, _summary_prefix, _windowed)
            else:
                _rebuilt_history = history_text

            _max_hist = _app.load_config().get("max_history_chars", 80000)
            _trimmed_history = truncate_history(_rebuilt_history, _max_hist)
            _turn_usage: list[TokenUsage] = []
            _current_mode = agent_modes.get(agent["name"], "chat")

            async def _produce():
                try:
                    _prompt = _app.build_prompt(
                        agent, _trimmed_history, workspace_id, active_agents,
                        mode=_current_mode,
                        scenario_system_prompt=scenario_system_prompt,
                        blank_mode=blank_mode,
                        kanban_state=kanban_state,
                    )
                    async for chunk in _app.stream_agent(agent, _prompt, images=turn_images or None, mode=_current_mode):
                        if isinstance(chunk, TokenUsage):
                            _turn_usage.append(chunk)
                        else:
                            await chunk_q.put(chunk)
                except SubprocessError as e:
                    await chunk_q.put(e)  # sentinel: SubprocessError in queue
                except asyncio.CancelledError:
                    pass
                finally:
                    await chunk_q.put(None)

            agent_task = asyncio.create_task(_produce())
            agent_done = False
            _stream_started = False  # delay stream_start until first chunk arrives

            while not agent_done:
                # Drain all ready chunks
                while True:
                    try:
                        chunk = chunk_q.get_nowait()
                        if chunk is None:
                            agent_done = True
                            break
                        if isinstance(chunk, SubprocessError):
                            had_subprocess_error = chunk
                            agent_done = True
                            break
                        if not _stream_started:
                            _stream_started = True
                            await ws.send_json({"type": "stream_start", "agent": agent["name"], "color": agent["color"]})
                        chunk_parts.append(chunk)
                        await ws.send_json({"type": "chunk", "agent": agent["name"], "color": agent["color"], "text": chunk})
                    except asyncio.QueueEmpty:
                        break

                if agent_done:
                    break

                # Wait briefly for events or more chunks
                evt = await next_event(timeout=0.05)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        agent_task.cancel()
                        running = False
                        cancelled = True
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                        # If the currently speaking agent was removed, cancel its task
                        if t == "remove_agent" and evt.get("agent") == agent["name"]:
                            agent_task.cancel()
                            cancelled = True
                            break
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "kanban_update":
                        kanban_state = evt.get("items", [])
                    elif t == "human":
                        pending_humans.append(evt)

            if cancelled:
                # If cancelled due to agent removal (not stop), continue to next agent
                if running:
                    continue
                break

            # Handle subprocess error sentinel
            if had_subprocess_error:
                e = had_subprocess_error
                had_subprocess_error = None
                partial = e.partial_output or ""
                suffix = " [TRUNCATED]" if partial else ""
                response = (partial + suffix).strip() or None

                partial_text_for_frontend = (
                    e.partial_output if isinstance(e, SubprocessStartupError) else None
                )
                await ws.send_json({
                    "type": "agent_error",
                    "agent": agent["name"],
                    "error_type": type(e).__name__,
                    "message": _error_message(e),
                    "partial_text": partial_text_for_frontend,
                })
                agent["pending_continuation"] = True
            else:
                response = "".join(chunk_parts).strip() if chunk_parts else None

            duration_ms = int((asyncio.get_event_loop().time() - t_start) * 1000)

            if not response:
                continue

            history_text += f"\n[{agent['name']}]: {response}\n"
            append_memory(agent, topic, response)

            ts = datetime.now().isoformat()
            msg = {
                "type": "message",
                "agent": agent["name"],
                "color": agent["color"],
                "text": response,
                "timestamp": ts,
                "duration_ms": duration_ms,
                "mode": _current_mode,
            }
            _usage_obj = _turn_usage[0] if _turn_usage else None
            _msg_end: dict = {"type": "message_end", "agent": agent["name"], "color": agent["color"], "timestamp": ts, "duration_ms": duration_ms, "mode": _current_mode}
            if _usage_obj:
                _msg_end["usage"] = {"input": _usage_obj.input_tokens, "output": _usage_obj.output_tokens, "cached": _usage_obj.cached_tokens}
                accumulate_token_usage(_session_token_totals, agent["name"], _usage_obj.input_tokens, _usage_obj.output_tokens)
                await ws.send_json({
                    "type": "token_update",
                    "agent": agent["name"],
                    "turn": {"input": _usage_obj.input_tokens, "output": _usage_obj.output_tokens},
                    "cumulative": _session_token_totals[agent["name"]],
                })
            await ws.send_json(_msg_end)
            log(msg)
            batch_turns += 1

            # Process any human messages buffered during agent execution
            if pending_humans:
                for ph in pending_humans:
                    text = ph["text"]
                    imgs = ph.get("images") or []
                    if imgs:
                        current_images = imgs  # use for next turn
                    img_refs = _app.save_session_images(session_id, imgs)
                    # TUI command interception
                    _intercepted, _mode_updates = _app.intercept_mode_command(text, agent_modes, active_agents)
                    if _intercepted:
                        for _upd in _mode_updates:
                            if "error" in _upd:
                                history_text += f"\n[System]: {_upd['error']}\n"
                                await ws.send_json({"type": "system", "text": _upd["error"]})
                            else:
                                await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        continue  # do NOT forward command to agents
                    history_entry, skill_name = _app.resolve_human_text(text, workspace_id)
                    history_text += f"\n[Human]: {history_entry}\n"
                    hmsg = {
                        "type": "message", "agent": "Human",
                        "color": "#60a5fa", "text": text,
                        "skill": skill_name,
                        "timestamp": datetime.now().isoformat(),
                        **({"images": img_refs} if img_refs else {}),
                    }
                    await ws.send_json(hmsg)
                    log(hmsg)
                    mention = ConversationEngine.extract_mention(text, active_agents)
                    if mention and engine.on_mention(mention) is not None:
                        pass
                    else:
                        engine.on_human()
                pending_humans.clear()
                batch_turns = 0

            pause_now = (not auto_mode) and (batch_turns >= manual_rounds * len(active_agents))
            await ws.send_json({"type": "ready", "auto": auto_mode, "pause": pause_now})

            if auto_mode or not pause_now:
                evt = await next_event(timeout=2.0)
                if evt:
                    t = evt.get("type")
                    if t == "stop":
                        running = False
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "human":
                        text = evt["text"]
                        imgs = evt.get("images") or []
                        if imgs:
                            current_images = imgs
                        img_refs = _app.save_session_images(session_id, imgs)
                        # TUI command interception
                        _intercepted, _mode_updates = _app.intercept_mode_command(text, agent_modes, active_agents)
                        if _intercepted:
                            for _upd in _mode_updates:
                                if "error" in _upd:
                                    history_text += f"\n[System]: {_upd['error']}\n"
                                    await ws.send_json({"type": "system", "text": _upd["error"]})
                                else:
                                    await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        else:
                            history_entry, skill_name = _app.resolve_human_text(text, workspace_id)
                            history_text += f"\n[Human]: {history_entry}\n"
                            hmsg = {
                                "type": "message", "agent": "Human",
                                "color": "#60a5fa", "text": text,
                                "skill": skill_name,
                                "timestamp": datetime.now().isoformat(),
                                **({"images": img_refs} if img_refs else {}),
                            }
                            await ws.send_json(hmsg)
                            log(hmsg)
                            mention = ConversationEngine.extract_mention(text, active_agents)
                            if mention and engine.on_mention(mention) is not None:
                                pass  # engine reordered; next next_speaker() returns @target
                            else:
                                engine.on_human()
                            batch_turns = 0
            else:
                batch_turns = 0
                while True:
                    evt = await next_event()
                    if evt is None:
                        continue
                    t = evt.get("type")
                    if t == "stop":
                        running = False
                        break
                    elif t == "next":
                        break
                    elif t in ("add_agent", "remove_agent"):
                        await handle_member_event(evt)
                    elif t == "set_mode":
                        await _handle_set_mode(ws, evt, agent_modes, active_agents)
                    elif t == "human":
                        text = evt["text"]
                        imgs = evt.get("images") or []
                        if imgs:
                            current_images = imgs
                        img_refs = _app.save_session_images(session_id, imgs)
                        # TUI command interception
                        _intercepted, _mode_updates = _app.intercept_mode_command(text, agent_modes, active_agents)
                        if _intercepted:
                            for _upd in _mode_updates:
                                if "error" in _upd:
                                    history_text += f"\n[System]: {_upd['error']}\n"
                                    await ws.send_json({"type": "system", "text": _upd["error"]})
                                else:
                                    await ws.send_json({"type": "mode_update", "agent": _upd["agent"], "mode": _upd["mode"]})
                        else:
                            history_entry, skill_name = _app.resolve_human_text(text, workspace_id)
                            history_text += f"\n[Human]: {history_entry}\n"
                            hmsg = {
                                "type": "message", "agent": "Human",
                                "color": "#60a5fa", "text": text,
                                "skill": skill_name,
                                "timestamp": datetime.now().isoformat(),
                                **({"images": img_refs} if img_refs else {}),
                            }
                            await ws.send_json(hmsg)
                            log(hmsg)
                            mention = ConversationEngine.extract_mention(text, active_agents)
                            if mention and engine.on_mention(mention) is not None:
                                pass  # engine reordered; next next_speaker() returns @target
                            else:
                                engine.on_human()
                            break

    except WebSocketDisconnect:
        pass
    finally:
        try: _active_ws.remove(client_ip)
        except ValueError: pass
        recv_task.cancel()
        _app.save_history(session_id, messages)
        try:
            await ws.send_json({"type": "system", "text": "Session ended. Processing memory…"})
        except Exception:
            pass
        # Post-session distillation (replaces write_daily_summary when available)
        _distill_cfg = _app.load_config()
        _distill_min = _distill_cfg.get("distill_min_messages", 5)
        _distill_model_key = _distill_cfg.get("distillation_model") or _distill_cfg.get("summarization_model", "")
        if messages and len(messages) > _distill_min and _distill_model_key:
            _models = _app.load_models()
            _dm = _models.get(_distill_model_key, {})
            _distill_agent = {
                "name": f"_distiller_{_distill_model_key}",
                "workspace": str(_app.HISTORY_DIR / session_id),
                **_dm,
            }
            _agent_ws = _build_agent_workspaces()
            asyncio.create_task(safe_distill(session_id, messages, _agent_ws, _distill_agent))
        else:
            # Fallback: write_daily_summary when distillation is not available
            for agent in active_agents:
                asyncio.create_task(write_daily_summary(agent))
