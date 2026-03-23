# Think Mode model_tiers + History Summarization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add model_tiers-based think mode switching (Gemini → gemini-2.5-pro) with user notification, and implement history summarization Phase 2 using a configurable lightweight model to compress overflow messages into cached summaries.

**Architecture:** Two independent features sharing `app.py`. Feature 1 adds runtime model resolution in `stream_agent()` and WS system messages. Feature 2 adds `compress_history()` as a standalone function called before `build_prompt()`, with `summary.json` cache per session. Both features plus TODO cleanup.

**Tech Stack:** Python FastAPI, React + react-query, vitest (frontend), pytest (backend)

**Spec:** `docs/superpowers/specs/2026-03-24-think-mode-history-summarization-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app.py` | `resolve_thinking_model()`, modify `stream_agent()`, `compress_history()`, `load_session_config()`, WS `set_mode` notification |
| `test_api.py` | All backend tests for both features |
| `config.json` | Add `summarization_model`, `summary_trigger_threshold` |
| `agents/gemini/config.json` | Add `supports_thinking: true`, `model_tiers` |
| `ui/src/chat/settings/AgentsTab.tsx` | Thinking model dropdown in agent edit form |
| `ui/src/chat/settings/useSettingsApi.ts` | No changes needed (PUT `/agents/{name}` already passes full body) |
| `ui/src/chat/types.ts` | Add `modelTiers` to `AgentDetail` type |
| `TODO.md` | Cleanup duplicates/outdated items |

---

## Task 1: model_tiers — Backend (resolve + stream)

**Files:**
- Modify: `app.py:1025-1032` (stream_agent), `app.py:849-850` (stream_cli_agent think logic)
- Modify: `app.py:307-348` (get_agent_registry — expose model_tiers)
- Test: `test_api.py`

- [ ] **Step 1: Write failing tests for `resolve_thinking_model()`**

In `test_api.py`, add a new test class after the existing `TestThinkModeFlag` class (~line 1938):

```python
class TestModelTiers:
    """model_tiers-based think mode model switching."""

    def test_resolve_thinking_model_with_tiers(self, tmp_project):
        """model_tiers.thinking exists → return resolved model info."""
        import app as a
        # Setup: config.json with gemini-2.5-pro model
        config = {
            "models": {
                "gemini": {"type": "cli", "cmd": ["gemini", "-p"]},
                "gemini-2.5-pro": {
                    "type": "cli",
                    "cmd": ["gemini", "-p"],
                    "extra_flags": ["--model", "gemini-2.5-pro"],
                    "idle_timeout_seconds": 600,
                    "startup_timeout_seconds": 120,
                },
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(config))
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "cmd": ["gemini", "-p"],
            "type": "cli",
            "workspace": tmp_project,
        }
        result = a.resolve_thinking_model(agent)
        assert result is not None
        assert result["cmd"] != agent["cmd"]  # should have extra_flags merged
        assert "--model" in result["cmd"]

    def test_resolve_thinking_model_no_tiers(self, tmp_project):
        """No model_tiers → return None."""
        import app as a
        agent = {"name": "claude", "cmd": ["claude", "--print"], "workspace": tmp_project}
        result = a.resolve_thinking_model(agent)
        assert result is None

    def test_resolve_thinking_model_missing_key(self, tmp_project):
        """model_tiers.thinking references non-existent model → return None + warning."""
        import app as a
        config = {"models": {"gemini": {"type": "cli", "cmd": ["gemini", "-p"]}}}
        (tmp_project / "config.json").write_text(json.dumps(config))
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "nonexistent"},
            "workspace": tmp_project,
        }
        with patch.object(a.logger, "warning") as mock_warn:
            result = a.resolve_thinking_model(agent)
        assert result is None
        mock_warn.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiers -v`
Expected: FAIL with `AttributeError: module 'app' has no attribute 'resolve_thinking_model'`

- [ ] **Step 3: Implement `resolve_thinking_model()` in app.py**

Add after `stream_cli_agent` function (~line 1024, before `stream_agent`):

```python
def resolve_thinking_model(agent: dict) -> dict | None:
    """Resolve model_tiers.thinking to a full model config dict.

    Returns a shallow copy of agent with thinking model's cmd/timeouts merged,
    or None if no thinking tier is configured or the model key is missing.
    """
    tiers = agent.get("model_tiers")
    if not tiers or "thinking" not in tiers:
        return None
    thinking_key = tiers["thinking"]
    models = load_models()
    if thinking_key not in models:
        logger.warning("model_tiers.thinking=%r not found in models config", thinking_key)
        return None
    m = models[thinking_key]
    resolved = dict(agent)  # shallow copy
    if "cmd" in m:
        base_cmd = list(m["cmd"])
        for flag in m.get("extra_flags", []):
            if flag not in base_cmd:
                base_cmd.append(flag)
        resolved["cmd"] = base_cmd
    resolved["type"] = m.get("type", "cli")
    if "baseUrl" in m:
        resolved["baseUrl"] = m["baseUrl"]
    if "apiModel" in m:
        resolved["model"] = m["apiModel"]
    for tk in ("idle_timeout_seconds", "startup_timeout_seconds"):
        if tk in m:
            resolved[tk] = m[tk]
    return resolved
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiers -v`
Expected: PASS

- [ ] **Step 5: Write failing test for `stream_agent` model_tiers dispatch**

```python
    @pytest.mark.asyncio
    async def test_stream_agent_uses_thinking_model_cmd(self, tmp_project):
        """stream_agent with model_tiers.thinking → uses resolved model cmd."""
        import app as a
        config = {
            "models": {
                "gemini": {"type": "cli", "cmd": ["gemini", "-p"]},
                "gemini-2.5-pro": {
                    "type": "cli",
                    "cmd": ["gemini", "-p"],
                    "extra_flags": ["--model", "gemini-2.5-pro"],
                },
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(config))
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = list(args)
            raise FileNotFoundError("mock")

        agent = {
            "name": "gemini",
            "cmd": ["gemini", "-p"],
            "type": "cli",
            "workspace": tmp_project,
            "supports_thinking": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_agent(agent, "prompt", mode="think"):
                    pass
            except Exception:
                pass
        args = captured.get("args", [])
        assert "--model" in args, f"Expected --model in args: {args}"
        assert "gemini-2.5-pro" in args
        # Should NOT have --effort max (model_tiers takes precedence)
        assert "--effort" not in args
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiers::test_stream_agent_uses_thinking_model_cmd -v`
Expected: FAIL

- [ ] **Step 7: Modify `stream_agent()` to resolve model_tiers**

In `app.py`, modify `stream_agent` (~line 1025):

```python
async def stream_agent(agent: dict, prompt: str, images: list[dict] | None = None, mode: str = "chat"):
    """Dispatch to streaming implementation, with model_tiers resolution."""
    effective_agent = agent
    if mode == "think":
        resolved = resolve_thinking_model(agent)
        if resolved is not None:
            effective_agent = resolved
            # model_tiers takes precedence: don't also pass mode="think"
            # to stream_cli_agent (avoids double --effort max)
            mode = "chat"  # reset mode since we already switched model

    if effective_agent.get("type") == "api":
        async for chunk in stream_api_agent(effective_agent, prompt):
            yield chunk
    else:
        async for chunk in stream_cli_agent(effective_agent, prompt, images=images, mode=mode):
            yield chunk
```

- [ ] **Step 8: Run all model_tiers tests**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiers -v`
Expected: PASS

- [ ] **Step 9: Run full test suite to check no regressions**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py -v --tb=short`
Expected: All existing tests pass (existing `--effort max` tests still pass because they don't have `model_tiers`)

- [ ] **Step 10: Commit**

```bash
git add app.py test_api.py
git commit -m "feat: add resolve_thinking_model + model_tiers dispatch in stream_agent"
```

---

## Task 2: model_tiers — WS Notification + Agent Config

**Files:**
- Modify: `app.py:2261-2270, 2380-2389, 2437-2446` (all 3 set_mode handler sites)
- Modify: `agents/gemini/config.json`
- Modify: `config.json` (add gemini-2.5-pro model)
- Test: `test_api.py`

**Note:** The codebase has 3 duplicate `set_mode` handler blocks (auto-streaming, auto-waiting, manual mode). Extract to a shared helper `_handle_set_mode()` first, then add notification once.

- [ ] **Step 0: Extract `_handle_set_mode()` helper**

Find all 3 identical `set_mode` blocks (~lines 2261-2270, 2380-2389, 2437-2446) and extract:

```python
async def _handle_set_mode(ws, evt, agent_modes: dict, active_agents: list):
    """Shared handler for set_mode WS messages. Used by all 3 event loop phases."""
    _sm_agent = evt.get("agent", "")
    _sm_mode = evt.get("mode", "")
    if _sm_agent not in agent_modes:
        await ws.send_json({"type": "error", "message": f"Unknown agent: {_sm_agent}"})
    elif _sm_mode not in ("chat", "think"):
        await ws.send_json({"type": "error", "message": f"Invalid mode: {_sm_mode}"})
    else:
        agent_modes[_sm_agent] = _sm_mode
        await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
        # Notification added in Step 5
```

Replace all 3 inline blocks with: `await _handle_set_mode(ws, evt, agent_modes, active_agents)`

- [ ] **Step 1: Write failing test for WS system notification**

```python
class TestModelTiersNotification:
    """WS system message when model_tiers switches model."""

    def test_set_mode_think_with_tiers_sends_system_message(self, tmp_project):
        """set_mode think on agent with model_tiers → system message emitted."""
        import app as a
        # Simulate what the WS handler should do
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "supports_thinking": True,
        }
        msg = a.build_mode_switch_notification(agent, "think")
        assert msg is not None
        assert "gemini-2.5-pro" in msg["text"]
        assert msg["type"] == "system"

    def test_set_mode_chat_with_tiers_sends_system_message(self, tmp_project):
        """set_mode chat on agent with model_tiers → system message emitted."""
        import app as a
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "supports_thinking": True,
        }
        msg = a.build_mode_switch_notification(agent, "chat")
        assert msg is not None
        assert msg["type"] == "system"

    def test_set_mode_no_tiers_no_notification(self, tmp_project):
        """set_mode on agent without model_tiers → no notification."""
        import app as a
        agent = {"name": "claude", "supports_thinking": True}
        msg = a.build_mode_switch_notification(agent, "think")
        assert msg is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiersNotification -v`
Expected: FAIL

- [ ] **Step 3: Implement `build_mode_switch_notification()`**

Add in `app.py` near the other helper functions:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestModelTiersNotification -v`
Expected: PASS

- [ ] **Step 5: Wire notification into `_handle_set_mode()` helper**

In the `_handle_set_mode()` helper (extracted in Step 0), add notification after `mode_update`:

```python
    else:
        agent_modes[_sm_agent] = _sm_mode
        await ws.send_json({"type": "mode_update", "agent": _sm_agent, "mode": _sm_mode})
        # Send system notification if model_tiers switch
        _sm_agent_obj = next((a for a in active_agents if a["name"] == _sm_agent), None)
        if _sm_agent_obj:
            _notif = build_mode_switch_notification(_sm_agent_obj, _sm_mode)
            if _notif:
                await ws.send_json(_notif)
```

This covers all 3 handler sites + TUI `/think @agent` commands (which go through `intercept_mode_command` → same `agent_modes` dict → next turn picks up the mode). Note: TUI commands don't send WS system notification (they don't go through `_handle_set_mode`). This is acceptable — TUI is a power-user path.

- [ ] **Step 6: Update `agents/gemini/config.json`**

```json
{
  "emoji": "🟢",
  "color": "#34d399",
  "description": "Gemini agent",
  "model": "gemini",
  "skills": [
    "brainstorming"
  ],
  "enabled": true,
  "supports_thinking": true,
  "model_tiers": { "default": "gemini", "thinking": "gemini-2.5-pro" }
}
```

- [ ] **Step 7: Add `gemini-2.5-pro` model to `config.json`**

```json
{
  "models": {
    "claude": { ... },
    "gemini": { ... },
    "gemini-2.5-pro": {
      "type": "cli",
      "cmd": ["gemini", "-p"],
      "extra_flags": ["--model", "gemini-2.5-pro"],
      "color": "#34d399",
      "emoji": "🧠",
      "idle_timeout_seconds": 600,
      "startup_timeout_seconds": 120
    },
    "ollama": { ... },
    "codex": { ... }
  }
}
```

- [ ] **Step 8: Expose `model_tiers` in agent registry API**

In `app.py` GET `/agents` endpoint (~line 1348), add `model_tiers`:

```python
            "supportsThinking": a.get("supports_thinking", None),
            "modelTiers": a.get("model_tiers", None),
```

And in GET `/agents/{name}` (~line 1354-1361), it already returns full config.json so `model_tiers` is included automatically.

- [ ] **Step 9: Run full test suite**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py -v --tb=short`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add app.py test_api.py agents/gemini/config.json config.json
git commit -m "feat: model_tiers WS notification + gemini thinking config"
```

---

## Task 3: model_tiers — Settings UI

**Files:**
- Modify: `ui/src/chat/settings/AgentsTab.tsx:155-188` (form state), `ui/src/chat/settings/AgentsTab.tsx:372-388` (model select area)
- Modify: `ui/src/chat/types.ts` (AgentDetail type)
- Test: manual (UI)

- [ ] **Step 1: Add `modelTiers` to AgentDetail type**

In `ui/src/chat/types.ts`, find the `AgentDetail` interface and add:

```typescript
  modelTiers?: { default?: string; thinking?: string };
```

- [ ] **Step 2: Add form state for thinking model in AgentDetailView**

In `ui/src/chat/settings/AgentsTab.tsx` (~line 156-159), add after `const [selectedSkills, setSelectedSkills]`:

```typescript
  const [supportsThinking, setSupportsThinking] = useState(false);
  const [thinkingModel, setThinkingModel] = useState("");
```

In the useEffect that resets form (~line 183-189), add:

```typescript
      setSupportsThinking(detail.supports_thinking ?? false);
      setThinkingModel(detail.model_tiers?.thinking ?? "");
```

- [ ] **Step 3: Include thinking fields in handleSave**

In `handleSave` (~line 231-238), add `supports_thinking` and `model_tiers` to the mutation body:

```typescript
      await updateAgent.mutateAsync({
        name: agentName,
        description,
        color,
        model,
        skills: selectedSkills,
        supports_thinking: supportsThinking,
        model_tiers: thinkingModel
          ? { default: model, thinking: thinkingModel }
          : undefined,
      });
```

- [ ] **Step 4: Add UI controls after the model select**

In `AgentsTab.tsx`, after the model `</select>` closing tag (~line 388), add:

```tsx
        {/* Thinking mode */}
        <div className="space-y-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={supportsThinking}
              onChange={(e) => {
                setSupportsThinking(e.target.checked);
                if (!e.target.checked) setThinkingModel("");
              }}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              支援思考模式
            </span>
          </label>
          {supportsThinking && (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={thinkingModel}
              onChange={(e) => setThinkingModel(e.target.value)}
            >
              <option value="">-- 使用預設 (--effort max) --</option>
              {models
                .filter((m) => m.id !== model)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji ?? "🤖"} {m.label ?? m.id}
                  </option>
                ))}
            </select>
          )}
        </div>
```

- [ ] **Step 5: Verify in browser**

Start dev server: `cd ui && pnpm dev`
1. Open Settings → Agents → gemini
2. Verify "支援思考模式" checkbox is checked
3. Verify thinking model dropdown shows "gemini-2.5-pro"
4. Toggle off → dropdown disappears
5. Save → verify config.json updated

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/settings/AgentsTab.tsx ui/src/chat/types.ts
git commit -m "feat(ui): add thinking model dropdown in AgentsTab settings"
```

---

## Task 4: compress_history — Core Function

**Files:**
- Modify: `app.py` (add `compress_history`, `load_session_config`, `SUMMARIZATION_PROMPT`)
- Test: `test_api.py`

- [ ] **Step 1: Write failing tests for `load_session_config()`**

```python
class TestSessionConfig:
    """Per-session config override."""

    def test_load_session_config_no_file(self, tmp_project):
        """No session_config.json → returns empty dict."""
        import app as a
        result = a.load_session_config("nonexistent_session")
        assert result == {}

    def test_load_session_config_with_overrides(self, tmp_project):
        """session_config.json exists → returns its contents."""
        import app as a
        sid = "test-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "session_config.json").write_text(json.dumps({
            "max_history_rounds": 50,
            "summary_trigger_threshold": 5,
        }))
        result = a.load_session_config(sid)
        assert result["max_history_rounds"] == 50
        assert result["summary_trigger_threshold"] == 5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestSessionConfig -v`
Expected: FAIL

- [ ] **Step 3: Implement `load_session_config()`**

```python
def load_session_config(session_id: str) -> dict:
    """Load per-session config overrides from history/{session_id}/session_config.json."""
    path = HISTORY_DIR / session_id / "session_config.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestSessionConfig -v`
Expected: PASS

- [ ] **Step 5: Write failing tests for `compress_history()`**

```python
def _write_haiku_config(tmp_project):
    """Helper: write config.json with a 'haiku' model entry for summarization tests."""
    config = {
        "models": {
            "haiku": {"type": "cli", "cmd": ["claude", "--print"], "extra_flags": ["--model", "claude-haiku"]},
        }
    }
    (tmp_project / "config.json").write_text(json.dumps(config))


class TestCompressHistory:
    """History summarization Phase 2."""

    @pytest.mark.asyncio
    async def test_no_overflow_returns_empty_summary(self, tmp_project):
        """All messages fit in window → no summary, no model call."""
        import app as a
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(5)]
        summary, windowed = await a.compress_history("sid", messages, window_size=10, summary_model="haiku", trigger_threshold=5)
        assert summary == ""
        assert len(windowed) == 5

    @pytest.mark.asyncio
    async def test_overflow_triggers_summarization(self, tmp_project):
        """Overflow exceeds threshold → calls model, writes summary.json."""
        import app as a
        _write_haiku_config(tmp_project)
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]
        mock_response = "This is a summary of the conversation."

        async def mock_call_agent(agent, prompt):
            return mock_response

        with patch.object(a, "call_agent", mock_call_agent):
            summary, windowed = await a.compress_history(
                "test-summ-session", messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == mock_response
        assert len(windowed) == 30
        # Verify summary.json was written
        sj = tmp_project / "history" / "test-summ-session" / "summary.json"
        assert sj.exists()
        data = json.loads(sj.read_text())
        assert data["covered_message_count"] == 10
        assert data["total_message_count"] == 40

    @pytest.mark.asyncio
    async def test_cached_summary_reused_below_threshold(self, tmp_project):
        """Cached summary exists, new overflow < threshold → reuse."""
        import app as a
        _write_haiku_config(tmp_project)
        sid = "test-cache-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "summary.json").write_text(json.dumps({
            "summary_text": "Old summary.",
            "covered_message_count": 10,
            "total_message_count": 40,
            "updated_at": "2026-03-24T10:00:00",
        }))
        # 42 messages total, 30 in window, 12 overflow. covered=10, new=2 < threshold=5
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(42)]

        call_count = 0
        async def mock_call_agent(agent, prompt):
            nonlocal call_count
            call_count += 1
            return "Should not be called"

        with patch.object(a, "call_agent", mock_call_agent):
            summary, windowed = await a.compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == "Old summary."
        assert call_count == 0  # no model call
        assert len(windowed) == 30
        # I2: Verify total_message_count was updated even though cache was reused
        data = json.loads((sdir / "summary.json").read_text())
        assert data["total_message_count"] == 42  # updated from 40

    @pytest.mark.asyncio
    async def test_empty_summary_model_skips_summarization(self, tmp_project):
        """Empty summary_model → skip summarization, return empty."""
        import app as a
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]
        summary, windowed = await a.compress_history(
            "sid", messages, window_size=30,
            summary_model="", trigger_threshold=5,
        )
        assert summary == ""
        assert len(windowed) == 30

    @pytest.mark.asyncio
    async def test_cached_summary_refreshed_above_threshold(self, tmp_project):
        """Cached summary exists, new overflow >= threshold → refresh."""
        import app as a
        _write_haiku_config(tmp_project)
        sid = "test-refresh-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "summary.json").write_text(json.dumps({
            "summary_text": "Old summary.",
            "covered_message_count": 10,
            "total_message_count": 40,
            "updated_at": "2026-03-24T10:00:00",
        }))
        # 50 messages total, 30 in window, 20 overflow. covered=10, new=10 >= threshold=5
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(50)]

        async def mock_call_agent(agent, prompt):
            return "Refreshed summary."

        with patch.object(a, "call_agent", mock_call_agent):
            summary, windowed = await a.compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == "Refreshed summary."
        data = json.loads((sdir / "summary.json").read_text())
        assert data["covered_message_count"] == 20
        assert data["total_message_count"] == 50

    @pytest.mark.asyncio
    async def test_summarization_failure_returns_empty(self, tmp_project):
        """Model call fails → returns empty summary (fallback to truncation)."""
        import app as a
        _write_haiku_config(tmp_project)
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]

        async def mock_call_agent_fail(agent, prompt):
            raise Exception("model crashed")

        with patch.object(a, "call_agent", mock_call_agent_fail):
            summary, windowed = await a.compress_history(
                "test-fail-session", messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == ""
        assert len(windowed) == 30
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestCompressHistory -v`
Expected: FAIL

- [ ] **Step 7: Implement `compress_history()` and `SUMMARIZATION_PROMPT`**

Add in `app.py` after `truncate_history()` (~line 659):

```python
SUMMARIZATION_PROMPT = """請閱讀以下多人對話，先判斷對話性質，再據此摘要。

如果是任務導向對話（有明確目標、計畫、技術討論）：
  → 保留關鍵決策、結論、每位參與者的主要觀點、未解決問題

如果是自由閒聊：
  → 忠實摘要對話脈絡，保留每位參與者的語氣和立場

用自然敘述，控制在 500 字以內。請用對話中的主要語言撰寫摘要。

{overflow_text}"""


async def compress_history(
    session_id: str,
    messages: list,
    window_size: int,
    summary_model: str,
    trigger_threshold: int,
) -> tuple[str, list]:
    """Compress overflow messages into a cached summary.

    Returns (summary_prefix, windowed_messages).
    On failure, returns ("", windowed_messages) so truncation fallback handles it.
    """
    if len(messages) <= window_size:
        return ("", messages)

    overflow = messages[:-window_size]
    windowed = messages[-window_size:]

    # Guard: empty/falsy summary_model → skip summarization (no warning)
    if not summary_model:
        return ("", windowed)

    # Read cached summary
    summary_path = HISTORY_DIR / session_id / "summary.json"
    cached = None
    if summary_path.exists():
        try:
            cached = json.loads(summary_path.read_text())
        except Exception:
            pass

    # Check if we need to re-summarize
    if cached:
        new_overflow = len(overflow) - cached.get("covered_message_count", 0)
        if new_overflow < trigger_threshold:
            # Update total_message_count even when reusing
            cached["total_message_count"] = len(messages)
            summary_path.write_text(json.dumps(cached, ensure_ascii=False, indent=2))
            return (cached["summary_text"], windowed)

    # Build overflow text for summarization
    overflow_lines = []
    for m in overflow:
        if m.get("type") == "message":
            overflow_lines.append(f"[{m.get('agent', '?')}]: {m.get('text', '')}")
    overflow_text = "\n".join(overflow_lines)
    prompt = SUMMARIZATION_PROMPT.replace("{overflow_text}", overflow_text)

    # Call summarization model
    try:
        models = load_models()
        if summary_model not in models:
            logger.warning("summarization_model=%r not found in models config", summary_model)
            return ("", windowed)
        m_cfg = models[summary_model]
        # Build a minimal agent dict for call_agent
        agent_for_summary = {
            "name": "_summarizer",
            "workspace": HISTORY_DIR / session_id,
            "type": m_cfg.get("type", "cli"),
        }
        if "cmd" in m_cfg:
            cmd = list(m_cfg["cmd"])
            for flag in m_cfg.get("extra_flags", []):
                if flag not in cmd:
                    cmd.append(flag)
            agent_for_summary["cmd"] = cmd
        if "baseUrl" in m_cfg:
            agent_for_summary["baseUrl"] = m_cfg["baseUrl"]
        if "apiModel" in m_cfg:
            agent_for_summary["model"] = m_cfg["apiModel"]

        summary_text = await call_agent(agent_for_summary, prompt)
        summary_text = summary_text.strip()
        if not summary_text:
            return ("", windowed)
    except Exception:
        logger.exception("compress_history: summarization failed for session %s", session_id)
        return ("", windowed)

    # Write cache
    summary_data = {
        "summary_text": summary_text,
        "covered_message_count": len(overflow),
        "total_message_count": len(messages),
        "updated_at": datetime.now().isoformat(),
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summary_data, ensure_ascii=False, indent=2))

    return (summary_text, windowed)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestCompressHistory -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app.py test_api.py
git commit -m "feat: add compress_history with summary.json cache + per-session config"
```

---

## Task 5: compress_history — Wire into WS Loop

**Files:**
- Modify: `app.py:2066-2084` (history_text build), `app.py:2198-2199` (truncation call)
- Modify: `config.json` (add summarization fields)

- [ ] **Step 1: Add `summarization_model` and `summary_trigger_threshold` to `config.json`**

```json
{
  "models": { ... },
  "summarization_model": "",
  "summary_trigger_threshold": 10
}
```

Empty string = disabled (user must choose a model).

- [ ] **Step 2: Extract `_format_history_text()` helper (DRY)**

Add a helper to avoid duplicating history formatting in resume and per-turn:

```python
def _format_history_text(topic: str, summary_prefix: str, windowed_messages: list) -> str:
    """Format summary + windowed messages into history_text string."""
    lines = [f"Topic: {topic}"]
    if summary_prefix:
        lines.append(f"\n[對話摘要]: {summary_prefix}")
    for m in windowed_messages:
        if m.get("type") == "message":
            lines.append(f"\n[{m['agent']}]: {m['text']}")
    return "\n".join(lines) + "\n"
```

- [ ] **Step 3: Refactor history_text building to use `compress_history`**

Replace the history_text building block (~line 2066-2084) with:

```python
    # Build history_text (with optional summarization)
    _cfg = load_config()
    _max_rounds = _cfg.get("max_history_rounds", 30)
    _summ_model = _cfg.get("summarization_model", "")
    _summ_threshold = _cfg.get("summary_trigger_threshold", 10)

    # Per-session overrides
    _session_cfg = load_session_config(session_id)
    _max_rounds = _session_cfg.get("max_history_rounds", _max_rounds)
    _summ_threshold = _session_cfg.get("summary_trigger_threshold", _summ_threshold)

    if resume_id:
        if _summ_model and messages:
            _summary_prefix, _windowed = await compress_history(
                session_id, messages, _max_rounds, _summ_model, _summ_threshold,
            )
        else:
            _summary_prefix = ""
            _windowed = apply_sliding_window(messages, max_rounds=_max_rounds)

        history_text = _format_history_text(topic, _summary_prefix, _windowed)
    else:
        history_text = f"[Human]: {topic}\n"
        hmsg = {
            "type": "message", "agent": "Human",
            "color": "#60a5fa", "text": topic,
            "timestamp": datetime.now().isoformat(),
        }
        log(hmsg)
```

- [ ] **Step 4: Apply compress_history at each turn's prompt build**

At ~line 2198-2199, replace the simple truncation with compress_history integration:

```python
            # Rebuild history from in-memory messages with summarization
            if _summ_model and messages:
                _summary_prefix, _windowed = await compress_history(
                    session_id, messages, _max_rounds, _summ_model, _summ_threshold,
                )
                _rebuilt_history = _format_history_text(topic, _summary_prefix, _windowed)
            else:
                _rebuilt_history = history_text

            _max_hist = load_config().get("max_history_chars", 80000)
            _trimmed_history = truncate_history(_rebuilt_history, _max_hist)
```

Note: uses `load_config()` (sync utility) instead of `await get_config()` (HTTP handler). Both work but `load_config()` is semantically correct.

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py -v --tb=short`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add app.py config.json
git commit -m "feat: wire compress_history into WS session loop with per-session config"
```

---

## Task 6: TODO.md Cleanup

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Clean up TODO.md**

Move completed/duplicate items:
- Line 38 Bug → rewrite: only Gemini model switch remains, being done by this PR
- Lines 42-44 + 88-93 → merge into one, Phase 1 ✅, Phase 2 = this PR
- Lines 46-49 → 2/3 ✅, Gemini = this PR
- Lines 95-99 → move to completed (duplicate of line 24)
- Lines 126-129 → move to completed (duplicate of line 26)
- Lines 131-133 → move to completed (duplicate of line 25)

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: cleanup TODO.md — remove duplicates, mark completed items"
```

---

## Task 7: Integration Test + Final Verification

**Files:**
- Test: `test_api.py`

- [ ] **Step 1: Write integration test for full flow**

```python
class TestIntegrationThinkModeSummarization:
    """End-to-end integration tests."""

    @pytest.mark.asyncio
    async def test_compress_history_with_session_config_override(self, tmp_project):
        """Per-session config overrides global threshold."""
        import app as a
        sid = "test-override-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "session_config.json").write_text(json.dumps({
            "summary_trigger_threshold": 3,
        }))
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(35)]

        async def mock_call_agent(agent, prompt):
            return "Session override summary."

        with patch.object(a, "call_agent", mock_call_agent):
            summary, windowed = await a.compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=3,
            )
        assert summary == "Session override summary."

    def test_model_tiers_preserved_through_registry(self, tmp_project):
        """model_tiers from agent config.json survives get_agent_registry."""
        import app as a
        agent_dir = tmp_project / "agents" / "gemini"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟢",
            "color": "#34d399",
            "model": "gemini",
            "enabled": True,
            "supports_thinking": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
        }))
        registry = a.get_agent_registry()
        assert "gemini" in registry
        assert registry["gemini"].get("model_tiers") == {"default": "gemini", "thinking": "gemini-2.5-pro"}
```

- [ ] **Step 2: Run integration tests**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py::TestIntegrationThinkModeSummarization -v`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/jasonyeh/code_ground/agent-cli-converation && python3 -m pytest test_api.py -v --tb=short`
Expected: All tests pass, no regressions

- [ ] **Step 4: Commit**

```bash
git add test_api.py
git commit -m "test: add integration tests for model_tiers + compress_history"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | `resolve_thinking_model` + `stream_agent` dispatch | 4 unit tests |
| 2 | Extract `_handle_set_mode` + WS notification + config files | 3 unit tests |
| 3 | Settings UI thinking model dropdown | Manual |
| 4 | `compress_history` + `load_session_config` + `_format_history_text` | 7 unit tests |
| 5 | Wire into WS loop + config | Existing suite |
| 6 | TODO.md cleanup | N/A |
| 7 | Integration tests | 2 integration tests |
