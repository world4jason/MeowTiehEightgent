# Phase 1 — Agent 個體控制 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-agent chat/think mode control (TUI + GUI) and scenario template support to the multi-agent session system.

**Architecture:** Backend changes to `app.py` add mode state to each WS session, intercept `/think`/`/chat` TUI commands, handle `set_mode` WS messages, and modify `build_prompt()` + `stream_cli_agent()` to apply mode effects. A new `GET /scenarios` endpoint serves JSON files from a `scenarios/` directory. Frontend changes add a 3-way context toggle, scenario picker, and per-agent mode toggle in the Members panel.

**Tech Stack:** Python 3.11+, FastAPI, pytest, Vanilla JS, WebSocket

**Spec:** `docs/specs/2026-03-19-phase1-agent-control-design.md`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `app.py` | Modify | `stream_cli_agent()` + `stream_agent()` mode param; `build_prompt()` mode + scenario params; WS handler session state, `set_mode` handler, TUI command interception; `GET /scenarios` endpoint |
| `scenarios/code-review.json` | Create | Example scenario |
| `scenarios/brainstorm.json` | Create | Example scenario |
| `test_api.py` | Modify | Append `TestAgentMode` and `TestScenarios` classes |
| `static/index.html` | Modify | 3-way context toggle, scenario picker, Members panel chat/think toggle, WS mode_update handler |

---

## Chunk 1: Backend — stream mode + build_prompt mode prefix

### Task 1: Add `mode` param to `stream_cli_agent()` and `stream_agent()`

**Files:**
- Modify: `app.py:657` (`stream_cli_agent`) and `app.py:786` (`stream_agent`)
- Test: `test_api.py` (append new class after `TestProtectedPaths`)

**Context:** `stream_cli_agent()` is the subprocess runner (line 657). `stream_agent()` at line 786 is a thin dispatcher that calls either `stream_cli_agent` (CLI agents) or `stream_api_agent` (API agents). The `--extended-thinking` flag must go into `stream_cli_agent`. `stream_agent` just passes the param through.

- [ ] **Step 1: Write failing tests** — append class to `test_api.py`:

```python
class TestAgentMode:
    """Phase 1.1 — agent chat/think mode."""

    def test_build_prompt_chat_mode_adds_concise_prefix(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history", mode="chat")
        assert "concise" in prompt.lower() or "2-3 sentences" in prompt

    def test_build_prompt_think_mode_no_concise_prefix(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history", mode="think")
        assert "2-3 sentences" not in prompt

    def test_build_prompt_default_mode_is_chat(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        # calling without mode param should behave same as mode="chat"
        prompt_default = a.build_prompt(agent, "history")
        prompt_chat = a.build_prompt(agent, "history", mode="chat")
        assert ("2-3 sentences" in prompt_default) == ("2-3 sentences" in prompt_chat)

    @pytest.mark.asyncio
    async def test_stream_cli_adds_extended_thinking_when_supported(self, tmp_project):
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = args
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": True,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="think"):
                    pass
            except a.SubprocessStartupError:
                pass
        assert "--extended-thinking" in captured.get("args", []), f"args: {captured.get('args')}"

    @pytest.mark.asyncio
    async def test_stream_cli_no_extended_thinking_when_not_supported(self, tmp_project):
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = args
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": False,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="think"):
                    pass
            except a.SubprocessStartupError:
                pass
        assert "--extended-thinking" not in captured.get("args", []), f"args: {captured.get('args')}"

    @pytest.mark.asyncio
    async def test_stream_cli_no_extended_thinking_in_chat_mode(self, tmp_project):
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = args
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": True,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="chat"):
                    pass
            except a.SubprocessStartupError:
                pass
        assert "--extended-thinking" not in captured.get("args", []), f"args: {captured.get('args')}"
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestAgentMode -v 2>&1 | head -30
```
Expected: AttributeError or similar (functions don't have mode param yet)

- [ ] **Step 3: Add `mode` param to `stream_cli_agent()` in `app.py`**

Find `async def stream_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None):` (line ~657) and change to:

```python
async def stream_cli_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
```

Then find the lines that build `extra_args` (just after the signature, around line 670):

```python
    tmp_paths: list[str] = []
    extra_args: list[str] = []
    if images and _resolve_supports_image(agent):
        tmp_paths, extra_args = write_temp_images(images)
```

Add below those lines:

```python
    if mode == "think" and agent.get("supports_thinking", False):
        extra_args = extra_args + ["--extended-thinking"]
```

- [ ] **Step 4: Add `mode` param to `stream_agent()` in `app.py`**

Find `async def stream_agent(agent: dict, prompt: str, images: list[dict] | None = None):` (line ~786) and change to:

```python
async def stream_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
```

Change the `stream_cli_agent` call inside it to:

```python
        async for chunk in stream_cli_agent(agent, prompt, images=images, mode=mode):
            yield chunk
```

- [ ] **Step 5: Add `mode` param to `build_prompt()` in `app.py`**

Find `def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None) -> str:` (line ~375) and change to:

```python
def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None, mode: str = "chat", scenario_system_prompt: str | None = None, blank_mode: bool = False) -> str:
```

At the top of the function body (before `# Workspace guide injected first`), add:

```python
    # Mode concise prefix
    mode_prefix = "Keep your response concise — 2-3 sentences max.\n\n" if mode == "chat" else ""
```

Find the workspace guide injection block that starts with:
```python
    # Workspace guide injected first (before agent identity)
    if workspace_id:
```

Replace the entire workspace guide block with:

```python
    # Context injection: scenario > workspace > blank
    if scenario_system_prompt is not None:
        # Scenario mode: use scenario system prompt instead of workspace guide
        if scenario_system_prompt:
            parts.append(f"## Session Context\n\n{scenario_system_prompt}")
    elif not blank_mode and workspace_id:
        # Workspace mode: inject workspace guide as before
        ws_dir = WORKSPACES_DIR / workspace_id
        ws_cfg_path = ws_dir / "config.json"
        if ws_cfg_path.exists():
            ws_cfg = json.loads(ws_cfg_path.read_text())
            guide_parts = []
            if ws_cfg.get("system_prompt"):
                guide_parts.append(ws_cfg["system_prompt"])
            files_dir = ws_dir / "files"
            if files_dir.exists():
                total = 0
                file_names = []
                for fp in sorted(files_dir.iterdir()):
                    if not fp.is_file():
                        continue
                    file_names.append(fp.name)
                    size = fp.stat().st_size
                    if total + size < 50_000:
                        try:
                            guide_parts.append(f"### {fp.name}\n\n{fp.read_text()}")
                            total += size
                        except Exception:
                            pass
                    else:
                        guide_parts.append(f"### {fp.name} (too large — use @{fp.name} to load)")
            if guide_parts:
                parts.append("## Workspace Guide\n\n" + "\n\n".join(guide_parts))
    # blank_mode: inject nothing
```

At the end of `build_prompt()`, just before the `return` statement, find:

```python
    return (
        f"{context}\n\n===== DISCUSSION =====\n\n"
        ...
    )
```

Prepend `mode_prefix` to the return:

```python
    return (
        f"{mode_prefix}{context}\n\n===== DISCUSSION =====\n\n"
        f"{participants_header}\n{history_text}"
        f"{continuation_hint}\n\n"
        "Your turn. Respond as your persona dictates."
    )
```

- [ ] **Step 6: Run tests to confirm PASS**

```bash
python3 -m pytest test_api.py::TestAgentMode -v
```
Expected: All tests pass

- [ ] **Step 7: Run full suite to check no regressions**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -20
```
Expected: Only the 2 pre-existing failures, all new tests pass

- [ ] **Step 8: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(mode): add chat/think mode param to stream and build_prompt"
```

---

## Chunk 2: Backend — WS session state + set_mode + TUI commands

### Task 2: WS session state, `set_mode` handler, TUI command interception

**Files:**
- Modify: `app.py` — WebSocket handler (line ~1600), `_produce()` (line ~1761)
- Test: `test_api.py` — append to `TestAgentMode` class

**Context:** The WS handler starts at `async def websocket_endpoint(ws: WebSocket):` (line ~1600). It reads the `start` message at line 1608. After reading `workspace_id`, add new session state variables. The `_produce()` inner function at line 1761 calls `build_prompt()` — update it to pass `mode`. Human message events are processed at two places (line ~1864 and ~1901 in the main loop) — TUI commands must be intercepted before `resolve_human_text()` is called.

- [ ] **Step 1: Add new tests to `TestAgentMode`**

Append these methods inside `TestAgentMode`:

```python
    def test_set_mode_broadcast_to_all_clients(self, tmp_project):
        """set_mode WS message triggers mode_update broadcast."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    # drain until ready
                    events = []
                    for _ in range(30):
                        msg = ws.receive_json()
                        events.append(msg)
                        if msg.get("type") == "ready":
                            break
                    # send set_mode
                    ws.send_json({"type": "set_mode", "agent": "claude", "mode": "think"})
                    # receive mode_update
                    for _ in range(5):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            assert msg["agent"] == "claude"
                            assert msg["mode"] == "think"
                            break
                    else:
                        pytest.fail("No mode_update received")

    def test_set_mode_unknown_agent_returns_error(self, tmp_project):
        """set_mode with unknown agent sends error to sender only."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    for _ in range(30):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "set_mode", "agent": "nonexistent", "mode": "think"})
                    for _ in range(5):
                        msg = ws.receive_json()
                        if msg.get("type") == "error":
                            assert "nonexistent" in msg.get("message", "").lower() or "unknown" in msg.get("message", "").lower()
                            break
                    else:
                        pytest.fail("No error received for unknown agent")

    def test_tui_think_command_sets_all_agents(self, tmp_project):
        """/think command sets all agents to think mode and broadcasts mode_update per agent."""
        import app as a

        for name in ["claude", "gemini"]:
            d = tmp_project / "agents" / name
            d.mkdir(parents=True)
            (d / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
            (d / "AGENT.md").write_text(f"You are {name}.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude", "gemini"], "auto": False})
                    for _ in range(50):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think"})
                    updates = []
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            updates.append(msg)
                        if len(updates) == 2:
                            break
                    assert len(updates) == 2
                    modes = {u["agent"]: u["mode"] for u in updates}
                    assert all(m == "think" for m in modes.values())

    def test_tui_think_at_agent_sets_only_that_agent(self, tmp_project):
        """/think @claude sets only claude; other agents unchanged."""
        import app as a

        for name in ["claude", "gemini"]:
            d = tmp_project / "agents" / name
            d.mkdir(parents=True)
            (d / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
            (d / "AGENT.md").write_text(f"You are {name}.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude", "gemini"], "auto": False})
                    for _ in range(50):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think @claude"})
                    updates = []
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            updates.append(msg)
                        if msg.get("type") == "ready":
                            break
                    assert len(updates) == 1
                    assert updates[0]["agent"] == "claude"
                    assert updates[0]["mode"] == "think"

    def test_tui_command_not_forwarded_to_agents(self, tmp_project):
        """/think command is NOT sent to agents as a human message."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#a78bfa", "enabled": True}))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        received_prompts = []

        async def mock_stream(agent, prompt, **kwargs):
            received_prompts.append(prompt)
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    for _ in range(30):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think"})
                    # wait a moment then check — agent should not get /think as prompt input
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
        # /think should not appear in any prompt sent to the agent
        for p in received_prompts:
            assert "/think" not in p
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestAgentMode::test_set_mode_broadcast_to_all_clients test_api.py::TestAgentMode::test_tui_think_command_sets_all_agents -v 2>&1 | head -30
```

- [ ] **Step 3: Add session state variables to WS handler**

In `websocket_endpoint()`, after the line `workspace_id: str | None = data.get("workspace_id") or None` (line ~1615), add:

```python
    scenario_id: str | None = data.get("scenario_id") or None
    blank_mode: bool = bool(data.get("blank_mode", False))
```

After `active_agents` is built (after line ~1641), add:

```python
    # Phase 1.1 — agent mode state (server is source of truth)
    agent_modes: dict[str, str] = {
        a["name"]: a.get("mode", "chat") for a in active_agents
    }

    # Phase 1.2 — scenario context
    scenario_system_prompt: str | None = None
    if scenario_id:
        scenario_file = PROJECT_DIR / "scenarios" / f"{scenario_id}.json"
        if scenario_file.exists():
            try:
                sc = json.loads(scenario_file.read_text())
                scenario_system_prompt = sc.get("system_prompt", "")
            except Exception:
                pass
        # If file not found: proceed as blank mode (no system prompt)
        if scenario_system_prompt is None:
            scenario_system_prompt = ""  # treats as scenario with empty prompt (blank-ish)
```

After the `await ws.send_json({"type": "system", ...})` line that announces session start (~line 1685), broadcast initial mode state for all agents:

```python
    # Broadcast initial mode state so clients know defaults
    for ag in active_agents:
        await ws.send_json({"type": "mode_update", "agent": ag["name"], "mode": agent_modes[ag["name"]]})
```

- [ ] **Step 4: Add `set_mode` message handler to the `receive_loop` / event routing**

In the main `while running:` loop, locate where events from the queue are processed. There is a `next_event()` call. We need to handle `set_mode` messages in the event dispatcher.

Find the `handle_member_event()` function (line ~1694). After that function, the `receive_loop()` is defined. In the main loop, wherever `evt.get("type")` is checked (e.g., the `elif t in ("add_agent", "remove_agent"):` blocks), add:

```python
                    elif t == "set_mode":
                        agent_name = evt.get("agent", "")
                        new_mode = evt.get("mode", "")
                        if agent_name not in agent_modes:
                            await ws.send_json({"type": "error", "message": f"Unknown agent: {agent_name}"})
                        elif new_mode not in ("chat", "think"):
                            await ws.send_json({"type": "error", "message": f"Invalid mode: {new_mode}"})
                        else:
                            agent_modes[agent_name] = new_mode
                            await ws.send_json({"type": "mode_update", "agent": agent_name, "mode": new_mode})
```

Note: There are TWO places in the loop where events are dispatched (during agent streaming and during pause/auto wait). Add the `elif t == "set_mode":` block in **both** locations.

- [ ] **Step 5: Add TUI command interception**

Create a helper function near `resolve_human_text()` (line ~346) in `app.py`:

```python
_THINK_RE = re.compile(r'^/think(?:\s+@(\S+))?$', re.IGNORECASE)
_CHAT_RE = re.compile(r'^/chat(?:\s+@(\S+))?$', re.IGNORECASE)


def intercept_mode_command(text: str, agent_modes: dict, active_agents: list) -> tuple[bool, list[dict]]:
    """Check if text is a /think or /chat TUI command.

    Returns (intercepted: bool, mode_updates: list[{agent, mode}]).
    If intercepted=True, caller must NOT forward text to agents.
    """
    m = _THINK_RE.match(text.strip()) or _CHAT_RE.match(text.strip())
    if not m:
        return False, []

    target_mode = "think" if text.strip().lower().startswith("/think") else "chat"
    target_name = m.group(1)  # None if no @name

    updates = []
    if target_name:
        # Find agent case-insensitively
        found = next((a["name"] for a in active_agents if a["name"].lower() == target_name.lower()), None)
        if found:
            agent_modes[found] = target_mode
            updates.append({"agent": found, "mode": target_mode})
        else:
            # Return special sentinel: agent not found
            return True, [{"error": f"No agent named \"{target_name}\" found."}]
    else:
        for a in active_agents:
            agent_modes[a["name"]] = target_mode
            updates.append({"agent": a["name"], "mode": target_mode})

    return True, updates
```

Then, in the WS main loop, wherever a human message event `t == "human"` is processed, BEFORE calling `resolve_human_text()`, add the TUI interception:

```python
                    elif t == "human":
                        text = evt["text"]
                        # TUI command interception (before resolve_human_text)
                        intercepted, mode_updates = intercept_mode_command(text, agent_modes, active_agents)
                        if intercepted:
                            for upd in mode_updates:
                                if "error" in upd:
                                    history_text += f"\n[System]: {upd['error']}\n"
                                    await ws.send_json({"type": "system", "text": upd["error"]})
                                else:
                                    await ws.send_json({"type": "mode_update", "agent": upd["agent"], "mode": upd["mode"]})
                            continue  # don't process as a normal human message
                        # ... existing human message handling follows ...
```

Note: There are multiple places in the loop where `t == "human"` is handled. Apply the interception to all of them. The intercept block goes BEFORE the `resolve_human_text()` call in each case.

- [ ] **Step 6: Update `_produce()` to pass mode to `build_prompt()` and `stream_agent()`**

Inside `_produce()` (line ~1761), find the call:

```python
async for chunk in stream_agent(agent, build_prompt(agent, _trimmed_history, workspace_id, active_agents), images=turn_images or None):
```

Replace with:

```python
_current_mode = agent_modes.get(agent["name"], "chat")
_prompt = build_prompt(
    agent, _trimmed_history, workspace_id, active_agents,
    mode=_current_mode,
    scenario_system_prompt=scenario_system_prompt,
    blank_mode=blank_mode,
)
async for chunk in stream_agent(agent, _prompt, images=turn_images or None, mode=_current_mode):
```

- [ ] **Step 7: Run tests**

```bash
python3 -m pytest test_api.py::TestAgentMode -v
```
Expected: All pass

- [ ] **Step 8: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -20
```
Expected: Only 2 pre-existing failures

- [ ] **Step 9: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(mode): WS session agent_modes, set_mode handler, TUI /think /chat commands"
```

---

## Chunk 3: Backend — GET /scenarios endpoint + scenario files

### Task 3: `GET /scenarios` HTTP endpoint + example scenario files

**Files:**
- Modify: `app.py` — add `GET /scenarios` endpoint and `SCENARIOS_DIR` constant
- Create: `scenarios/code-review.json`
- Create: `scenarios/brainstorm.json`
- Test: `test_api.py` — append `TestScenarios` class

**Context:** The app has a pattern of `PROJECT_DIR / "some_dir"`. Add `SCENARIOS_DIR = PROJECT_DIR / "scenarios"` near the other directory constants (~line 35). The new endpoint reads all `*.json` files from this directory and returns them as a JSON array.

- [ ] **Step 1: Write failing tests** — append after `TestAgentMode`:

```python
class TestScenarios:
    """Phase 1.2 — scenario templates."""

    def test_get_scenarios_empty_when_no_dir(self, client):
        """GET /scenarios returns [] when scenarios/ dir does not exist."""
        # client fixture uses a tmp project without scenarios/ dir
        resp = client.get("/scenarios")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_scenarios_returns_all_valid_files(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir()
        (scenarios_dir / "test1.json").write_text(json.dumps({
            "id": "test1", "name": "Test 1", "description": "Desc",
            "system_prompt": "You are helpful."
        }))
        (scenarios_dir / "test2.json").write_text(json.dumps({
            "id": "test2", "name": "Test 2", "description": "Desc 2",
            "system_prompt": "Be concise."
        }))
        with TestClient(a.app) as client:
            resp = client.get("/scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        ids = {s["id"] for s in data}
        assert ids == {"test1", "test2"}

    def test_get_scenarios_skips_malformed_json(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir()
        (scenarios_dir / "valid.json").write_text(json.dumps({
            "id": "valid", "name": "Valid", "description": "ok", "system_prompt": "ok"
        }))
        (scenarios_dir / "broken.json").write_text("NOT VALID JSON {{{")
        with TestClient(a.app) as client:
            resp = client.get("/scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "valid"

    def test_scenario_system_prompt_injected_in_build_prompt(self, tmp_project):
        """When scenario_system_prompt is set, it replaces workspace guide."""
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(
            agent, "history",
            scenario_system_prompt="Review this code carefully.",
        )
        assert "Review this code carefully." in prompt

    def test_blank_mode_injects_no_context(self, tmp_project):
        """blank_mode=True skips both workspace guide and scenario."""
        import app as a
        # Create a workspace with a system_prompt
        ws_dir = tmp_project / "workspaces" / "ws1"
        ws_dir.mkdir(parents=True)
        (ws_dir / "config.json").write_text(json.dumps({
            "id": "ws1", "name": "WS", "system_prompt": "Secret guide"
        }))
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(
            agent, "history",
            workspace_id="ws1",
            blank_mode=True,
        )
        assert "Secret guide" not in prompt
        assert "Workspace Guide" not in prompt
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestScenarios -v 2>&1 | head -20
```

- [ ] **Step 3: Add `SCENARIOS_DIR` constant and `GET /scenarios` endpoint to `app.py`**

Near line 35 where directory constants are defined, add:

```python
SCENARIOS_DIR = PROJECT_DIR / "scenarios"
```

Add the endpoint near the other workspace/skill endpoints (anywhere after the FastAPI app setup, before the websocket endpoint):

```python
@app.get("/scenarios")
async def list_scenarios():
    """Return all scenario JSON files from the scenarios/ directory."""
    if not SCENARIOS_DIR.exists():
        return []
    result = []
    for f in sorted(SCENARIOS_DIR.glob("*.json")):
        try:
            result.append(json.loads(f.read_text()))
        except Exception:
            pass  # skip malformed files
    return result
```

- [ ] **Step 4: Create example scenario files**

Create `scenarios/` directory and example files:

`scenarios/code-review.json`:
```json
{
  "id": "code-review",
  "name": "Code Review",
  "description": "深度審查程式碼品質與架構",
  "system_prompt": "You are reviewing code in a multi-agent session. Focus on correctness, performance, security, and maintainability. Be specific with line references and suggest concrete improvements.",
  "suggested_agents": ["claude", "gemini"],
  "topic_hint": "請貼上要審查的程式碼"
}
```

`scenarios/brainstorm.json`:
```json
{
  "id": "brainstorm",
  "name": "腦力激盪",
  "description": "發散式思考，探索可能性",
  "system_prompt": "This is a creative brainstorming session. Explore diverse perspectives, challenge assumptions, and generate unconventional ideas. Quantity over quality in early rounds — judgment comes later.",
  "suggested_agents": ["claude", "gemini"],
  "topic_hint": "我想探索..."
}
```

- [ ] **Step 5: Run tests**

```bash
python3 -m pytest test_api.py::TestScenarios -v
```
Expected: All pass

- [ ] **Step 6: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add app.py scenarios/code-review.json scenarios/brainstorm.json test_api.py
git commit -m "feat(scenarios): GET /scenarios endpoint + example scenario files"
```

---

## Chunk 4: Frontend — 3-way toggle + scenario picker

### Task 4: Welcome screen 3-way context toggle + scenario picker grid

**Files:**
- Modify: `static/index.html`

**Context:** The welcome screen currently has some workspace selector. We're replacing/augmenting it with a 3-way segmented control: Workspace / Scenario / Blank. When Scenario is selected, a grid of scenario cards appears below. The selected `scenario_id` and `blank_mode` are sent as part of the `start` WS message. Read `static/index.html` in full before editing to understand the current welcome screen structure.

- [ ] **Step 1: Read current welcome screen HTML**

Search for the welcome/start section. Find the topic input area and the existing workspace context UI. Identify where to insert the 3-way toggle.

```bash
grep -n "welcome\|topic\|start-btn\|context-mode\|scenario\|workspace-selector" static/index.html | head -30
```

- [ ] **Step 2: Add CSS for 3-way toggle and scenario picker**

In the `<style>` section of `index.html`, add:

```css
/* 3-way context mode toggle */
.context-mode-toggle { display: flex; gap: 4px; padding: 3px; background: var(--surface); border-radius: 8px; margin-bottom: 14px; }
.context-mode-btn { flex: 1; padding: 7px 10px; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 0.82rem; cursor: pointer; transition: all 0.15s; }
.context-mode-btn.active { background: var(--bg); color: var(--text); font-weight: 500; }

/* Scenario picker */
.scenario-picker { display: none; }
.scenario-picker.visible { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.scenario-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; cursor: pointer; transition: all 0.15s; }
.scenario-card:hover { border-color: #555; }
.scenario-card.selected { border-color: var(--accent, #6366f1); background: rgba(99,102,241,0.08); }
.scenario-card-name { font-size: 0.87rem; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.scenario-card-desc { font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
.scenario-card-agents { display: flex; gap: 4px; margin-top: 7px; flex-wrap: wrap; }
.scenario-agent-badge { font-size: 0.72rem; padding: 2px 7px; border-radius: 99px; background: var(--bg); color: var(--text-muted); border: 1px solid var(--border); }
```

- [ ] **Step 3: Add 3-way toggle HTML in the welcome/start section**

Find the area in the welcome screen where workspace context is shown (likely near the topic input). Insert the following HTML block before the topic input or after the workspace selector, wherever it fits most naturally in the flow:

```html
<!-- Phase 1.2: 3-way context mode toggle -->
<div class="context-mode-toggle" id="context-mode-toggle">
  <button class="context-mode-btn active" id="ctx-workspace-btn" onclick="setContextMode('workspace')">Workspace</button>
  <button class="context-mode-btn" id="ctx-scenario-btn" onclick="setContextMode('scenario')">Scenario</button>
  <button class="context-mode-btn" id="ctx-blank-btn" onclick="setContextMode('blank')">Blank</button>
</div>
<!-- Scenario picker (visible only when Scenario mode selected) -->
<div class="scenario-picker" id="scenario-picker"></div>
```

- [ ] **Step 4: Add JS for context mode management**

In the `<script>` section, add:

```javascript
// ── Context mode (Phase 1.2) ──────────────────────────────────────
let contextMode = 'workspace';  // 'workspace' | 'scenario' | 'blank'
let selectedScenarioId = null;
let scenariosCache = [];

async function loadScenarios() {
  try {
    scenariosCache = await fetch('/scenarios').then(r => r.json());
  } catch (_) {
    scenariosCache = [];
  }
}

function setContextMode(mode) {
  contextMode = mode;
  if (mode !== 'scenario') selectedScenarioId = null;
  document.querySelectorAll('.context-mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`ctx-${mode}-btn`).classList.add('active');
  const picker = document.getElementById('scenario-picker');
  if (mode === 'scenario') {
    picker.classList.add('visible');
    renderScenarioPicker();
  } else {
    picker.classList.remove('visible');
  }
}

function renderScenarioPicker() {
  const picker = document.getElementById('scenario-picker');
  if (!scenariosCache.length) {
    picker.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:0.82rem;padding:20px">尚無情境模板</div>';
    return;
  }
  picker.innerHTML = scenariosCache.map(s => `
    <div class="scenario-card${selectedScenarioId === s.id ? ' selected' : ''}"
         onclick="selectScenario(${JSON.stringify(s.id)}, ${JSON.stringify(s.topic_hint || '')}, ${JSON.stringify((s.suggested_agents || []).join(','))})">
      <div class="scenario-card-name">${esc(s.name)}</div>
      <div class="scenario-card-desc">${esc(s.description || '')}</div>
      ${(s.suggested_agents || []).length ? `<div class="scenario-card-agents">${(s.suggested_agents || []).map(a => `<span class="scenario-agent-badge">${esc(a)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');
}

function selectScenario(id, topicHint, suggestedAgents) {
  if (selectedScenarioId === id) {
    selectedScenarioId = null;  // deselect
  } else {
    selectedScenarioId = id;
    // Pre-fill topic hint
    if (topicHint) {
      const topicInput = document.getElementById('topic-input');
      if (topicInput && !topicInput.value) topicInput.value = topicHint;
    }
    // Pre-check suggested agents
    const suggested = suggestedAgents ? suggestedAgents.split(',').map(s => s.trim().toLowerCase()) : [];
    if (suggested.length) {
      document.querySelectorAll('.agent-checkbox').forEach(cb => {
        const name = (cb.dataset.agent || '').toLowerCase();
        cb.checked = suggested.includes(name);
      });
    }
  }
  renderScenarioPicker();
}
```

- [ ] **Step 5: Call `loadScenarios()` on page load**

Find the `init()` function or the page load handler. Add `await loadScenarios();` early in that function.

- [ ] **Step 6: Add `scenario_id` and `blank_mode` to the start WS message**

Find where the `start` WS message is sent (search for `"type": "start"` in the JS). Add the new fields:

```javascript
ws.send(JSON.stringify({
  type: 'start',
  topic: topic,
  agents: selectedAgents,
  auto: autoMode,
  rounds: manualRounds,
  workspace_id: selectedWorkspaceId,
  scenario_id: contextMode === 'scenario' ? selectedScenarioId : null,
  blank_mode: contextMode === 'blank',
  // ... other existing fields
}));
```

- [ ] **Step 7: Commit**

```bash
git add static/index.html
git commit -m "feat(ui): 3-way context mode toggle + scenario picker on welcome screen"
```

---

## Chunk 5: Frontend — Members panel Chat/Think toggle

### Task 5: Members panel per-agent Chat/Think toggle + `mode_update` WS handler

**Files:**
- Modify: `static/index.html`

**Context:** The Members panel shows the list of active agents. Each agent row needs a Chat/Think toggle. The toggle sends `{type: "set_mode", agent, mode}` over the WS. The WS `onmessage` handler receives `mode_update` and updates the toggle visually. The `Think` button is disabled for agents where `supports_thinking` is falsy.

- [ ] **Step 1: Add CSS for mode toggle buttons in Members panel**

In the `<style>` section, add:

```css
/* Per-agent mode toggle in Members panel */
.agent-mode-toggle { display: flex; gap: 2px; margin-left: auto; }
.agent-mode-btn { padding: 3px 9px; border: 1px solid var(--border); border-radius: 5px; background: transparent; color: var(--text-muted); font-size: 0.75rem; cursor: pointer; transition: all 0.12s; }
.agent-mode-btn.active { background: var(--surface); color: var(--text); border-color: #555; }
.agent-mode-btn:disabled { opacity: 0.35; cursor: not-allowed; }
```

- [ ] **Step 2: Find the Members panel agent row template**

Search for where agent rows are rendered in the Members panel. This is likely a function that builds agent list HTML. Look for something like `renderMembers()` or agent row HTML generation.

```bash
grep -n "member\|agent-row\|participant\|Members" static/index.html | head -20
```

- [ ] **Step 3: Add mode toggle to each agent row**

In the agent row rendering, add the Chat/Think toggle. Each agent row should emit:

```html
<div class="agent-mode-toggle" id="mode-toggle-${agentName}">
  <button class="agent-mode-btn active" id="mode-chat-${agentName}"
    onclick="sendSetMode('${agentName}', 'chat')">Chat</button>
  <button class="agent-mode-btn" id="mode-think-${agentName}"
    onclick="sendSetMode('${agentName}', 'think')"
    ${!agent.supports_thinking ? 'disabled title="This agent does not support extended thinking"' : ''}>Think</button>
</div>
```

Where `agentName` is the agent's name and `agent` is the agent config object.

- [ ] **Step 4: Add `sendSetMode()` JS function**

```javascript
function sendSetMode(agentName, mode) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_mode', agent: agentName, mode: mode }));
  }
}
```

- [ ] **Step 5: Add `mode_update` WS message handler**

In the WS `onmessage` handler (the switch/if block that handles message types), add:

```javascript
} else if (data.type === 'mode_update') {
  const agentName = data.agent;
  const mode = data.mode;
  // Update both toggle buttons
  const chatBtn = document.getElementById(`mode-chat-${agentName}`);
  const thinkBtn = document.getElementById(`mode-think-${agentName}`);
  if (chatBtn && thinkBtn) {
    chatBtn.classList.toggle('active', mode === 'chat');
    thinkBtn.classList.toggle('active', mode === 'think');
  }
}
```

- [ ] **Step 6: Initialize toggle state from `mode_update` broadcasts on session start**

The server broadcasts `mode_update` for each agent on session start. The WS handler added in Step 5 will automatically update the toggles when those initial broadcasts arrive — no extra work needed.

- [ ] **Step 7: Commit**

```bash
git add static/index.html
git commit -m "feat(ui): Members panel chat/think mode toggle per agent"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -25
```
Expected: New tests pass, only 2 pre-existing failures remain

- [ ] **Manual smoke test**
  1. Start server: `python3 -m uvicorn app:app --reload`
  2. Open browser, create a new session
  3. Verify 3-way toggle appears (Workspace / Scenario / Blank)
  4. Switch to Scenario — scenario cards appear
  5. Click a scenario card — topic hint fills, suggested agents pre-checked
  6. Start session — Members panel shows Chat/Think toggle per agent
  7. Click Think for one agent — verify mode_update reflected in toggle
  8. Type `/think` in chat — verify all agent toggles switch to Think
  9. Type `/chat @claude` — verify only Claude switches back to Chat
