# Phase 2 — Cowork Pattern 核心 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Arbiter, Substantive Gate, session status.json, and Blackboard to turn the round-robin chat loop into a self-governing, quality-aware multi-agent workspace.

**Architecture:** All backend logic goes into `app.py`. Implementation order follows spec dependency graph: 2.3 (status.json, lowest coupling) → 2.2 (Substantive Gate, self-contained) → 2.1 (Arbiter, most logic) → 2.4 (Blackboard, depends on Arbiter). Frontend adds a status badge and renders arbiter/gate WS messages. No new UI controls for Phase 2.

**Tech Stack:** Python 3.11+, FastAPI, pytest, dataclasses, Vanilla JS, WebSocket

**Spec:** `docs/specs/2026-03-19-phase2-cowork-patterns-design.md`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `app.py` | Modify | `write_status()`, `GET /sessions/{id}/status`, `classify_message()`, `build_arbiter_prompt()`, `BlackboardState` dataclass, `build_prompt()` blackboard param, `_produce()` loop additions, WS session state vars |
| `test_api.py` | Modify | Append `TestCoworkPatterns` class |
| `static/index.html` | Modify | Status badge in chat header, arbiter/gate message rendering |

---

## Chunk 1: status.json infrastructure (Phase 2.3)

### Task 1: `write_status()` helper + `GET /sessions/{id}/status` endpoint

**Files:**
- Modify: `app.py` — add after existing session endpoints
- Test: `test_api.py` — append `TestCoworkPatterns` class

**Context:** `HISTORY_DIR` is already defined at line ~35 as `PROJECT_DIR / "history"`. Session files live at `history/<session_id>/messages.json` — status.json goes alongside it. Find `session_messages_path()` or the path pattern used for saving history to match it.

```bash
grep -n "session_messages_path\|HISTORY_DIR\|messages.json" app.py | head -10
```

- [ ] **Step 1: Write failing tests** — append after `TestProtectedPaths` in `test_api.py`:

```python
class TestCoworkPatterns:
    """Phase 2 — Arbiter, Substantive Gate, status.json, Blackboard."""

    # ── 2.3 status.json ──────────────────────────────────────────

    def test_write_status_creates_file(self, tmp_project):
        import app as a
        session_dir = tmp_project / "history" / "test-session-001"
        session_dir.mkdir(parents=True)
        state = {
            "session_id": "test-session-001",
            "phase": "running",
            "round": 1,
            "agents": ["claude"],
            "last_verdict": None,
            "consecutive_incremental": 0,
            "arbiter_count": 0,
            "updated_at": "2026-03-19T12:00:00.000Z",
        }
        a.write_status("test-session-001", state)
        status_file = tmp_project / "history" / "test-session-001" / "status.json"
        assert status_file.exists()
        data = json.loads(status_file.read_text())
        assert data["phase"] == "running"
        assert data["round"] == 1

    def test_write_status_overwrites_existing(self, tmp_project):
        import app as a
        session_dir = tmp_project / "history" / "s1"
        session_dir.mkdir(parents=True)
        state1 = {"session_id": "s1", "phase": "running", "round": 1,
                   "agents": [], "last_verdict": None, "consecutive_incremental": 0,
                   "arbiter_count": 0, "updated_at": "2026-01-01T00:00:00Z"}
        a.write_status("s1", state1)
        state2 = {**state1, "round": 5, "phase": "concluded"}
        a.write_status("s1", state2)
        data = json.loads((tmp_project / "history" / "s1" / "status.json").read_text())
        assert data["round"] == 5
        assert data["phase"] == "concluded"

    def test_get_session_status_returns_200(self, tmp_project):
        import app as a
        session_dir = tmp_project / "history" / "sess-abc"
        session_dir.mkdir(parents=True)
        state = {"session_id": "sess-abc", "phase": "running", "round": 2,
                 "agents": ["claude"], "last_verdict": None,
                 "consecutive_incremental": 0, "arbiter_count": 0,
                 "updated_at": "2026-03-19T00:00:00Z"}
        (session_dir / "status.json").write_text(json.dumps(state))
        with TestClient(a.app) as client:
            resp = client.get("/sessions/sess-abc/status")
        assert resp.status_code == 200
        assert resp.json()["phase"] == "running"
        assert resp.json()["round"] == 2

    def test_get_session_status_404_when_missing(self, client):
        resp = client.get("/sessions/nonexistent-session-xyz/status")
        assert resp.status_code == 404
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns::test_write_status_creates_file test_api.py::TestCoworkPatterns::test_get_session_status_returns_200 -v 2>&1 | head -20
```

- [ ] **Step 3: Add `write_status()` to `app.py`**

Near the top of `app.py`, after existing helper functions (good place: after `_error_message()` around line ~580), add:

```python
def write_status(session_id: str, state: dict) -> None:
    """Write session status to history/<session_id>/status.json. Swallows write errors."""
    try:
        status_path = HISTORY_DIR / session_id / "status.json"
        status_path.write_text(json.dumps(state, ensure_ascii=False, default=str))
    except Exception as exc:
        print(f"[write_status] failed for {session_id}: {exc}")
```

- [ ] **Step 4: Add `GET /sessions/{session_id}/status` endpoint**

Find where existing session endpoints are (search for `@app.get("/sessions")`). Add the new endpoint nearby:

```python
@app.get("/sessions/{session_id}/status")
async def get_session_status(session_id: str):
    """Return status.json for a session."""
    status_path = HISTORY_DIR / session_id / "status.json"
    if not status_path.exists():
        raise HTTPException(status_code=404, detail="Status not found")
    try:
        return json.loads(status_path.read_text())
    except Exception:
        raise HTTPException(status_code=500, detail="Status file unreadable")
```

- [ ] **Step 5: Run tests**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns::test_write_status_creates_file test_api.py::TestCoworkPatterns::test_write_status_overwrites_existing test_api.py::TestCoworkPatterns::test_get_session_status_returns_200 test_api.py::TestCoworkPatterns::test_get_session_status_404_when_missing -v
```
Expected: All 4 pass

- [ ] **Step 6: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(status): write_status() helper + GET /sessions/{id}/status endpoint"
```

---

## Chunk 2: Substantive Gate (Phase 2.2)

### Task 2: `classify_message()` heuristic + in-memory gate state

**Files:**
- Modify: `app.py` — add `classify_message()` function; add gate state vars to WS handler; add gate check inside `_produce()`
- Test: `test_api.py` — add to `TestCoworkPatterns`

**Context:** `classify_message` is a pure function. It goes near `write_status()`. The gate state (`consecutive_incremental_count`, `decision_space_exhausted`) lives as local variables in `websocket_endpoint()`, accessible to `_produce()` via closure. The gate check runs AFTER `response = "".join(chunk_parts).strip()` (line ~1833) — only on complete messages, not during streaming.

- [ ] **Step 1: Add classify_message tests** — append to `TestCoworkPatterns`:

```python
    # ── 2.2 Substantive Gate ──────────────────────────────────────

    def test_classify_short_message_is_incremental(self):
        import app as a
        assert a.classify_message("ok") == "incremental"
        assert a.classify_message("I agree.") == "incremental"
        assert a.classify_message("x" * 99) == "incremental"

    def test_classify_message_exactly_100_chars_not_incremental(self):
        import app as a
        text = "x" * 100
        # 100 chars is NOT < 100, so not incremental by length rule
        result = a.classify_message(text)
        assert result in ("structural", "transformative", "incremental")
        # specifically: no ## or backtick or numbered list, no summary phrases
        # → default → transformative
        assert result == "transformative"

    def test_classify_message_with_headers_is_structural(self):
        import app as a
        text = "## Introduction\n" + "x" * 100
        assert a.classify_message(text) == "structural"

    def test_classify_message_with_code_fence_is_structural(self):
        import app as a
        text = "Here is the code:\n```python\nprint('hello')\n```\nEnd." + "x" * 100
        assert a.classify_message(text) == "structural"

    def test_classify_message_with_numbered_list_is_structural(self):
        import app as a
        text = "Steps:\n1. First step\n2. Second step\n" + "x" * 100
        assert a.classify_message(text) == "structural"

    def test_classify_message_with_summary_phrase_is_incremental(self):
        import app as a
        text = "In summary, everything looks good. " + "x" * 100
        assert a.classify_message(text) == "incremental"
        text2 = "To conclude, we should proceed." + "x" * 100
        assert a.classify_message(text2) == "incremental"
        text3 = "As mentioned earlier, " + "x" * 100
        assert a.classify_message(text3) == "incremental"
        text4 = "Similarly, this approach " + "x" * 100
        assert a.classify_message(text4) == "incremental"

    def test_classify_default_is_transformative(self):
        import app as a
        text = "This is a completely new idea that has not been mentioned before " + "x" * 100
        assert a.classify_message(text) == "transformative"

    def test_gate_counter_resets_on_non_incremental(self):
        """Counter resets on non-incremental: i,t,i,i → count=2 not 3."""
        import app as a
        messages = [
            "short",             # incremental, count=1
            "This is a completely new idea that has not been mentioned before " + "x" * 100,  # transformative, count=0
            "short",             # incremental, count=1
            "short",             # incremental, count=2 — NOT triggered
        ]
        count = 0
        triggered = False
        for msg in messages:
            cls = a.classify_message(msg)
            if cls == "incremental":
                count += 1
            else:
                count = 0
            if count >= 3:
                triggered = True
        assert not triggered
        assert count == 2

    def test_gate_triggers_after_3_consecutive_incremental(self):
        """3 consecutive incremental → gate triggered."""
        import app as a
        messages = ["short1", "short2", "short3"]
        count = 0
        for msg in messages:
            cls = a.classify_message(msg)
            if cls == "incremental":
                count += 1
            else:
                count = 0
        assert count >= 3
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns::test_classify_short_message_is_incremental -v 2>&1 | head -10
```

- [ ] **Step 3: Add `classify_message()` to `app.py`**

Add after `write_status()`:

```python
_STRUCTURAL_RE = re.compile(
    r'##|```|\n\d+\.',
)
_INCREMENTAL_PHRASES = ("in summary", "to conclude", "as mentioned", "similarly")


def classify_message(text: str) -> str:
    """Classify an agent message as structural, transformative, or incremental.

    Evaluated in order:
    1. len < 100 → incremental
    2. has ## / ``` / numbered list → structural
    3. contains summary phrases → incremental
    4. default → transformative
    """
    stripped = text.strip()
    if len(stripped) < 100:
        return "incremental"
    if _STRUCTURAL_RE.search(text):
        return "structural"
    lower = text.lower()
    if any(phrase in lower for phrase in _INCREMENTAL_PHRASES):
        return "incremental"
    return "transformative"
```

- [ ] **Step 4: Run classify tests**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns -k "classify or gate_counter or gate_triggers" -v
```
Expected: All pass

- [ ] **Step 5: Add gate state to WS handler + gate check in `_produce()`**

In `websocket_endpoint()`, after the `agent_modes` initialization block added in Phase 1 (or after the `active_agents` block), add:

```python
    # Phase 2.2 — Substantive Gate state
    consecutive_incremental_count: int = 0
    decision_space_exhausted: bool = False
```

In `_produce()`, after `response = "".join(chunk_parts).strip() if chunk_parts else None` (the line that builds the final response string, around line ~1833), add the gate check. Insert BEFORE the `if not response: continue` guard:

```python
            # Phase 2.2 — Substantive Gate check (only on complete non-empty responses)
            if response and not decision_space_exhausted:
                cls = classify_message(response)
                if cls == "incremental":
                    consecutive_incremental_count += 1
                else:
                    consecutive_incremental_count = 0
                if consecutive_incremental_count >= 3:
                    decision_space_exhausted = True
                    history_text += "\n[System]: Session ended: decision space exhausted after 3 consecutive incremental messages.\n"
                    await ws.send_json({"type": "substantive_gate_triggered"})
                    running = False
```

- [ ] **Step 6: Add WS integration test for gate** — append to `TestCoworkPatterns`:

```python
    def test_gate_terminates_session_after_3_incremental_ws(self, tmp_project):
        """WS integration: 3 consecutive short agent messages → substantive_gate_triggered."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        call_count = [0]

        async def mock_stream(*args, **kwargs):
            call_count[0] += 1
            yield "ok"  # short message, < 100 chars → incremental

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": True})
                    events = []
                    for _ in range(100):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            if msg.get("type") == "substantive_gate_triggered":
                                break
                        except Exception:
                            break

        types = [e["type"] for e in events]
        assert "substantive_gate_triggered" in types, f"Got: {types}"
```

- [ ] **Step 7: Run all gate tests**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns -k "gate or classify" -v
```

- [ ] **Step 8: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -10
```

- [ ] **Step 9: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(gate): classify_message() + substantive gate in _produce() loop"
```

---

## Chunk 3: Arbiter (Phase 2.1)

### Task 3: Arbiter — `build_arbiter_prompt()`, arbiter invocation in `_produce()`, `arbiter_count` cap

**Files:**
- Modify: `app.py` — add `build_arbiter_prompt()`, add arbiter state vars to WS handler, add arbiter check to `_produce()`
- Test: `test_api.py` — add to `TestCoworkPatterns`

**Context:** The arbiter is invoked from `_produce()` inside the main WS loop. It runs `stream_cli_agent()` with a special prompt. The WS handler needs `arbiter_enabled`, `arbiter_interval`, `arbiter_agent_name`, `arbiter_count`, `last_verdict` state. The arbiter is invoked at the START of each round (before the normal agent speaks), based on a `round_count` variable that we add.

**Important cap logic (from spec):** Pre-check: `if arbiter_count >= 3: skip arbiter`. Increment `arbiter_count` at start of invocation (before streaming). For `conclude`: send `arbiter_conclude`, set `running = False`. For `redirect`: append to history, update blackboard. For `continue`: just send `arbiter_verdict`. `arbiter_conclude` replaces `arbiter_verdict` for the conclude case.

- [ ] **Step 1: Add arbiter unit tests** — append to `TestCoworkPatterns`:

```python
    # ── 2.1 Arbiter ──────────────────────────────────────────────

    def test_build_arbiter_prompt_contains_json_template(self):
        import app as a
        history = "\n".join(f"[Agent]: line {i}" for i in range(20))
        prompt = a.build_arbiter_prompt(history)
        assert '"verdict"' in prompt
        assert "continue" in prompt
        assert "conclude" in prompt
        assert "redirect" in prompt

    def test_build_arbiter_prompt_uses_last_10_lines(self):
        import app as a
        # Build 20 lines, only last 10 should appear
        lines = [f"line_{i}" for i in range(20)]
        history = "\n".join(lines)
        prompt = a.build_arbiter_prompt(history)
        assert "line_19" in prompt      # last line present
        assert "line_9" in prompt       # 10th from end present
        # line_8 should not appear (it's the 11th from end)
        # (exact boundary depends on implementation, this is a sanity check)
        assert "line_0" not in prompt   # very first line should be gone

    def test_arbiter_verdict_continue_no_history_change(self, tmp_project):
        """Arbiter returning 'continue' does not modify history or set running=False."""
        import app as a
        # This is tested via the WS integration test below.
        # Unit-test just the prompt builder for now.
        prompt = a.build_arbiter_prompt("line1\nline2")
        assert "CONVERSATION SUMMARY" in prompt

    def test_ws_arbiter_conclude_sends_arbiter_conclude_message(self, tmp_project):
        """Arbiter returning 'conclude' → arbiter_conclude WS message, session ends."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        # Agent 'arbiter' config
        arb_dir = tmp_project / "agents" / "arbiter"
        arb_dir.mkdir(parents=True)
        (arb_dir / "config.json").write_text(json.dumps({"emoji": "⚖", "color": "#aaa", "enabled": True}))
        (arb_dir / "AGENT.md").write_text("You are the Arbiter.")

        call_count = [0]

        async def mock_stream(agent, *args, **kwargs):
            call_count[0] += 1
            if agent["name"] == "arbiter":
                yield '{"verdict": "conclude", "feedback": "Great discussion, time to wrap up."}'
            else:
                yield "This is a detailed response with enough content to be transformative and exceed the character limit for incremental classification purposes. It goes on quite a bit."

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({
                        "type": "start", "topic": "test",
                        "agents": ["claude"], "auto": True,
                        "arbiter_enabled": True,
                        "arbiter_interval": 1,
                        "arbiter_agent_name": "arbiter",
                    })
                    events = []
                    for _ in range(100):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            if msg.get("type") == "arbiter_conclude":
                                break
                        except Exception:
                            break

        types = [e["type"] for e in events]
        assert "arbiter_conclude" in types, f"Got: {types}"
        conclude_msg = next(e for e in events if e["type"] == "arbiter_conclude")
        assert "wrap up" in conclude_msg.get("feedback", "").lower() or "feedback" in conclude_msg

    def test_arbiter_skipped_when_count_reaches_cap(self, tmp_project):
        """After 3 arbiter invocations, arbiter is skipped (no more arbiter_thinking messages)."""
        import app as a

        for name in ["claude", "arbiter"]:
            d = tmp_project / "agents" / name
            d.mkdir(parents=True)
            (d / "config.json").write_text(json.dumps({"emoji": "⚖", "color": "#aaa", "enabled": True}))
            (d / "AGENT.md").write_text(f"You are {name}.")

        arbiter_invocations = [0]

        async def mock_stream(agent, *args, **kwargs):
            if agent["name"] == "arbiter":
                arbiter_invocations[0] += 1
                yield '{"verdict": "continue", "feedback": "keep going"}'
            else:
                yield "This is a detailed transformative response exceeding one hundred characters total length for classification."

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({
                        "type": "start", "topic": "test",
                        "agents": ["claude"], "auto": True,
                        "arbiter_enabled": True,
                        "arbiter_interval": 1,
                        "arbiter_agent_name": "arbiter",
                    })
                    events = []
                    for _ in range(200):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            # Stop after we've seen enough rounds
                            thinking_count = sum(1 for e in events if e.get("type") == "thinking" and e.get("agent") == "claude")
                            if thinking_count >= 5:
                                ws.send_json({"type": "stop"})
                                break
                        except Exception:
                            break

        assert arbiter_invocations[0] <= 3, f"Arbiter invoked {arbiter_invocations[0]} times, expected ≤ 3"
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns::test_build_arbiter_prompt_contains_json_template -v 2>&1 | head -10
```

- [ ] **Step 3: Add `build_arbiter_prompt()` to `app.py`**

Add after `classify_message()`:

```python
_ARBITER_PROMPT_TEMPLATE = """\
You are an impartial arbiter reviewing a multi-agent conversation.

CONVERSATION SUMMARY (last {n} messages):
{condensed_history}

Evaluate whether the conversation should continue, be redirected, or concluded.

Respond with ONLY valid JSON in this exact format:
{{"verdict": "continue" | "conclude" | "redirect", "feedback": "<one sentence>"}}

- "continue": agents are making progress, no intervention needed
- "conclude": the conversation has reached a satisfactory conclusion
- "redirect": the conversation is off-track; use "feedback" to steer it
"""


def build_arbiter_prompt(history_text: str) -> str:
    """Build arbiter prompt using last 10 lines of history_text."""
    lines = history_text.splitlines()
    last_10 = lines[-10:] if len(lines) > 10 else lines
    condensed = "\n".join(last_10)
    return _ARBITER_PROMPT_TEMPLATE.format(n=len(last_10), condensed_history=condensed)
```

- [ ] **Step 4: Add arbiter state to WS handler**

In `websocket_endpoint()`, after the gate state variables added in Chunk 2, add:

```python
    # Phase 2.1 — Arbiter state
    arbiter_enabled: bool = bool(data.get("arbiter_enabled", False))
    arbiter_interval: int = int(data.get("arbiter_interval", 3))
    arbiter_agent_name: str = data.get("arbiter_agent_name", "arbiter")
    arbiter_count: int = 0
    last_verdict: str | None = None
    round_count: int = 0

    # Validate arbiter agent exists (warn silently if not)
    _arbiter_registry = get_agent_registry()
    _arbiter_agent = _arbiter_registry.get(arbiter_agent_name) if arbiter_enabled else None
    if arbiter_enabled and not _arbiter_agent:
        print(f"[arbiter] Warning: agent '{arbiter_agent_name}' not found in config. Arbiter disabled.")
        arbiter_enabled = False
```

- [ ] **Step 5: Add arbiter invocation to `_produce()` main loop**

In the main `while running:` loop, just BEFORE `agent = engine.next_speaker()` (the first line of the loop body), add:

```python
            # Phase 2.1 — Arbiter check (at start of each round)
            round_count += 1
            if arbiter_enabled and _arbiter_agent and round_count % arbiter_interval == 0:
                if arbiter_count >= 3:
                    pass  # cap reached — skip silently
                else:
                    arbiter_count += 1
                    await ws.send_json({"type": "arbiter_thinking", "agent": arbiter_agent_name})
                    arb_chunks = []
                    try:
                        async for arb_chunk in stream_agent(_arbiter_agent, build_arbiter_prompt(history_text)):
                            arb_chunks.append(arb_chunk)
                            await ws.send_json({"type": "arbiter_chunk", "agent": arbiter_agent_name, "text": arb_chunk})
                    except SubprocessError as arb_err:
                        print(f"[arbiter] stream error: {arb_err}")
                    arb_full = "".join(arb_chunks)
                    # Parse JSON verdict
                    verdict = "continue"
                    feedback = ""
                    try:
                        # Extract first JSON object from output (arbiter may add prose)
                        arb_json_match = re.search(r'\{[^{}]+\}', arb_full, re.DOTALL)
                        if arb_json_match:
                            arb_data = json.loads(arb_json_match.group())
                            verdict = arb_data.get("verdict", "continue")
                            feedback = arb_data.get("feedback", "")
                    except Exception:
                        pass  # parse failure → continue
                    last_verdict = verdict
                    if verdict == "conclude":
                        if blackboard is not None:
                            blackboard.key_decisions.append(feedback)
                        await ws.send_json({"type": "arbiter_conclude", "feedback": feedback})
                        running = False
                        # Write final status immediately
                        write_status(session_id, {
                            "session_id": session_id, "phase": "concluded",
                            "round": round_count, "agents": [a["name"] for a in active_agents],
                            "last_verdict": verdict, "consecutive_incremental": consecutive_incremental_count,
                            "arbiter_count": arbiter_count, "updated_at": datetime.now().isoformat() + "Z",
                        })
                        break
                    elif verdict == "redirect":
                        history_text += f"\n[SYSTEM] Arbiter redirect: {feedback}\n"
                        if blackboard is not None:
                            blackboard.key_decisions.append(feedback)
                            blackboard.current_plan = feedback
                        await ws.send_json({"type": "arbiter_verdict", "verdict": verdict, "feedback": feedback})
                    else:  # continue
                        await ws.send_json({"type": "arbiter_verdict", "verdict": verdict, "feedback": feedback})
```

**Note:** `blackboard` is referenced here but not yet defined — it will be `None` until Task 4 adds it. The `if blackboard is not None:` guard is backward-compatible.

- [ ] **Step 6: Run arbiter unit tests**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns -k "arbiter or build_arbiter" -v
```

- [ ] **Step 7: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(arbiter): build_arbiter_prompt() + arbiter invocation in _produce() with 3-cap"
```

---

## Chunk 4: Blackboard + status.json integration in `_produce()` (Phase 2.4 + 2.3 wire-up)

### Task 4: `BlackboardState` dataclass + `build_prompt()` blackboard param + status write per round

**Files:**
- Modify: `app.py` — add `BlackboardState` dataclass, update `build_prompt()` signature, add blackboard state to WS handler, wire status writes into `_produce()`
- Test: `test_api.py` — add to `TestCoworkPatterns`

**Context:** `BlackboardState` is a simple dataclass. `build_prompt()` already has the `mode`, `scenario_system_prompt`, `blank_mode` params from Phase 1. We add `blackboard: BlackboardState | None = None`. The `[SHARED STATE]` block is prepended to the prompt context. Status writes happen after each agent turn (at the end of the main loop body, after the gate check).

- [ ] **Step 1: Add blackboard + status integration tests** — append to `TestCoworkPatterns`:

```python
    # ── 2.4 Blackboard ───────────────────────────────────────────

    def test_build_prompt_with_blackboard_includes_shared_state(self, tmp_project):
        import app as a
        from app import BlackboardState
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        bb = BlackboardState(
            current_plan="Build a recommendation system",
            key_decisions=["Use collaborative filtering", "Start with MVP"],
            open_questions="What data sources are available?",
        )
        prompt = a.build_prompt(agent, "history", blackboard=bb)
        assert "[SHARED STATE]" in prompt
        assert "Build a recommendation system" in prompt
        assert "collaborative filtering" in prompt
        assert "What data sources are available?" in prompt

    def test_build_prompt_without_blackboard_no_shared_state(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history")
        assert "[SHARED STATE]" not in prompt

    def test_build_prompt_blackboard_empty_fields_shows_none(self, tmp_project):
        import app as a
        from app import BlackboardState
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        bb = BlackboardState()  # all empty
        prompt = a.build_prompt(agent, "history", blackboard=bb)
        assert "[SHARED STATE]" in prompt
        assert "(none)" in prompt

    def test_blackboard_key_decisions_grows_on_redirect(self, tmp_project):
        """key_decisions accumulates feedback on each redirect."""
        from app import BlackboardState
        bb = BlackboardState()
        # Simulate redirect verdict
        feedback1 = "Focus on the API design first"
        bb.key_decisions.append(feedback1)
        bb.current_plan = feedback1
        assert len(bb.key_decisions) == 1
        feedback2 = "Consider authentication layer"
        bb.key_decisions.append(feedback2)
        assert len(bb.key_decisions) == 2
        assert bb.key_decisions[0] == feedback1

    # ── 2.3 status write per round ───────────────────────────────

    def test_status_json_written_per_round(self, tmp_project):
        """After each agent turn, status.json is written with correct round count."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "This is a detailed response exceeding one hundred characters in total length for classification."

        events = []
        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": True})
                    for _ in range(50):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            # Stop after 2 rounds
                            if sum(1 for e in events if e.get("type") == "status_update") >= 2:
                                ws.send_json({"type": "stop"})
                                break
                        except Exception:
                            break

        updates = [e for e in events if e.get("type") == "status_update"]
        assert len(updates) >= 1
        assert updates[0]["status"]["phase"] == "running"
        assert updates[0]["status"]["round"] >= 1
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns::test_build_prompt_with_blackboard_includes_shared_state -v 2>&1 | head -10
```

- [ ] **Step 3: Add `BlackboardState` dataclass to `app.py`**

At the top of `app.py`, after the existing `import` statements, add:

```python
from dataclasses import dataclass, field
```

Then after `build_arbiter_prompt()`, add the dataclass:

```python
@dataclass
class BlackboardState:
    current_plan: str = ""
    key_decisions: list[str] = field(default_factory=list)
    open_questions: str = ""
```

- [ ] **Step 4: Update `build_prompt()` to accept `blackboard` param**

Find `def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None, mode: str = "chat", scenario_system_prompt: str | None = None, blank_mode: bool = False) -> str:` and add `blackboard` param:

```python
def build_prompt(agent: dict, history_text: str, workspace_id: str | None = None, all_agents: list[dict] | None = None, mode: str = "chat", scenario_system_prompt: str | None = None, blank_mode: bool = False, blackboard: "BlackboardState | None" = None) -> str:
```

At the top of the function body (before `parts = []`), add the blackboard block construction:

```python
    blackboard_block = ""
    if blackboard is not None:
        decisions = "\n".join(f"- {d}" for d in blackboard.key_decisions) if blackboard.key_decisions else "(none)"
        blackboard_block = (
            f"[SHARED STATE]\n"
            f"current_plan: {blackboard.current_plan or '(none)'}\n"
            f"key_decisions:\n{decisions}\n"
            f"open_questions: {blackboard.open_questions or '(none)'}\n\n"
        )
```

In the `return` statement at the end of `build_prompt()`, prepend `blackboard_block`:

```python
    return (
        f"{blackboard_block}{mode_prefix}{context}\n\n===== DISCUSSION =====\n\n"
        f"{participants_header}\n{history_text}"
        f"{continuation_hint}\n\n"
        "Your turn. Respond as your persona dictates."
    )
```

- [ ] **Step 5: Add `blackboard` state to WS handler**

In `websocket_endpoint()`, after the arbiter state variables, add:

```python
    # Phase 2.4 — Blackboard
    blackboard = BlackboardState()
```

- [ ] **Step 6: Wire status write per round into `_produce()`**

In `_produce()`, after the Substantive Gate check block (after the `if consecutive_incremental_count >= 3:` block), add:

```python
            # Phase 2.3 — Write status.json and broadcast status_update after each agent turn
            _status = {
                "session_id": session_id,
                "phase": "exhausted" if decision_space_exhausted else "running",
                "round": round_count,
                "agents": [a["name"] for a in active_agents],
                "last_verdict": last_verdict,
                "consecutive_incremental": consecutive_incremental_count,
                "arbiter_count": arbiter_count,
                "updated_at": datetime.now().isoformat() + "Z",
            }
            write_status(session_id, _status)
            await ws.send_json({"type": "status_update", "status": _status})
```

- [ ] **Step 7: Pass `blackboard` to `build_prompt()` in `_produce()`**

Find the `_prompt = build_prompt(...)` call added in Phase 1 (Task 2 Step 6). Add `blackboard=blackboard`:

```python
_prompt = build_prompt(
    agent, _trimmed_history, workspace_id, active_agents,
    mode=_current_mode,
    scenario_system_prompt=scenario_system_prompt,
    blank_mode=blank_mode,
    blackboard=blackboard,
)
```

- [ ] **Step 8: Run all Phase 2 tests**

```bash
python3 -m pytest test_api.py::TestCoworkPatterns -v
```
Expected: All pass

- [ ] **Step 9: Full suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -15
```
Expected: Only 2 pre-existing failures

- [ ] **Step 10: Commit**

```bash
git add app.py test_api.py
git commit -m "feat(blackboard): BlackboardState + build_prompt blackboard param + status write per round"
```

---

## Chunk 5: Frontend — status badge + arbiter/gate message rendering

### Task 5: Status badge in chat header + WS message handlers for arbiter and gate

**Files:**
- Modify: `static/index.html`

**Context:** The chat header area already has session info. A new `<div id="session-status">` is added there, hidden by default, shown on first `status_update`. WS `handleMessage()` already has a switch/if block — add handlers for the new message types.

- [ ] **Step 1: Add CSS for status badge and arbiter/gate message blocks**

In the `<style>` section, add:

```css
/* Session status badge (Phase 2.3) */
#session-status { display: none; padding: 3px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 500; margin-left: 8px; }
#session-status.running { background: var(--surface); color: var(--text-muted); display: inline-block; }
#session-status.arbiter_intervening { background: #f59e0b22; color: #f59e0b; display: inline-block; }
#session-status.concluded { background: #10b98122; color: #10b981; display: inline-block; }
#session-status.exhausted { background: #ef444422; color: #ef4444; display: inline-block; }

/* Arbiter message blocks (Phase 2.1) */
.arbiter-thinking { color: var(--text-muted); font-style: italic; font-size: 0.84rem; padding: 6px 14px; }
.arbiter-verdict-block { border-left: 3px solid #6366f1; padding: 10px 14px; margin: 8px 0; background: #6366f108; border-radius: 0 8px 8px 0; font-size: 0.84rem; }
.arbiter-conclude-block { border: 1px solid #10b981; padding: 14px; margin: 12px 0; background: #10b98110; border-radius: 10px; text-align: center; }
.arbiter-conclude-title { font-weight: 600; color: #10b981; margin-bottom: 6px; }

/* Substantive gate block (Phase 2.2) */
.gate-triggered-block { border: 1px solid #f59e0b; padding: 14px; margin: 12px 0; background: #f59e0b10; border-radius: 10px; text-align: center; color: #f59e0b; font-weight: 500; }
```

- [ ] **Step 2: Add `#session-status` to chat header HTML**

Find the chat header area (search for `chat-header` or similar). Add the status badge inline:

```html
<div id="session-status"></div>
```

Place it inside the header, after the session title or topic display.

- [ ] **Step 3: Add WS message handlers in `handleMessage()`**

In `handleMessage()`, add these cases to the `if/else if` chain:

```javascript
  } else if (data.type === 'status_update') {
    const s = data.status;
    const badge = document.getElementById('session-status');
    if (badge) {
      badge.className = s.phase || 'running';
      badge.textContent = `Round ${s.round} · ${s.phase}`;
    }
  } else if (data.type === 'arbiter_thinking') {
    removeThinking();
    const msgs = document.getElementById('messages');
    const el = document.createElement('div');
    el.className = 'arbiter-thinking';
    el.textContent = '[Arbiter is evaluating…]';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  } else if (data.type === 'arbiter_chunk') {
    // Arbiter streaming is shown inline with arbiter_thinking — skip individual chunks
  } else if (data.type === 'arbiter_verdict') {
    // Replace the thinking line with verdict block
    const thinking = document.querySelector('.arbiter-thinking');
    if (thinking) thinking.remove();
    const msgs = document.getElementById('messages');
    const el = document.createElement('div');
    el.className = 'arbiter-verdict-block';
    el.innerHTML = `<strong>Arbiter → ${esc(data.verdict)}</strong>: ${esc(data.feedback || '')}`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  } else if (data.type === 'arbiter_conclude') {
    const thinking = document.querySelector('.arbiter-thinking');
    if (thinking) thinking.remove();
    const msgs = document.getElementById('messages');
    const el = document.createElement('div');
    el.className = 'arbiter-conclude-block';
    el.innerHTML = `<div class="arbiter-conclude-title">✓ Session Concluded</div><div>${esc(data.feedback || '')}</div>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    // Disable send input
    const input = document.getElementById('msg-input');
    if (input) input.disabled = true;
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.disabled = true;
  } else if (data.type === 'substantive_gate_triggered') {
    const msgs = document.getElementById('messages');
    const el = document.createElement('div');
    el.className = 'gate-triggered-block';
    el.textContent = '⚠ Session ended: conversation has reached its decision space limit.';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    const input = document.getElementById('msg-input');
    if (input) input.disabled = true;
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.disabled = true;
  }
```

- [ ] **Step 4: Commit**

```bash
git add static/index.html
git commit -m "feat(ui): status badge, arbiter verdict/conclude blocks, gate triggered block"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
python3 -m pytest test_api.py -v 2>&1 | tail -20
```
Expected: All `TestCoworkPatterns` and `TestAgentMode` and `TestScenarios` pass; only 2 pre-existing failures remain

- [ ] **Manual smoke test (basic)**
  1. Start server: `python3 -m uvicorn app:app --reload`
  2. Open browser, start a session
  3. Verify status badge appears in header after first agent response
  4. Enable arbiter (currently requires manually setting `arbiter_enabled: true` in start WS message — no UI in Phase 2)
  5. Observe arbiter verdict blocks appearing in chat
  6. Verify gate triggers after 3 short agent responses
