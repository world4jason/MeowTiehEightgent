# Phase 2 — Cowork Pattern 核心 Design Spec

> **For agentic workers:** Use superpowers:executing-plans to implement this plan.

**Goal:** Introduce four cooperative-session patterns — an Arbiter, a Substantive Gate, machine-readable session status, and a Shared Blackboard — that turn the existing round-robin chat loop into a self-governing, quality-aware multi-agent workspace.
**Tech Stack:** Python 3.11+, FastAPI, Vanilla JS, WebSocket

---

## 1. Overview

### 2.1 — Arbiter 仲裁者

Every N rounds (default 3), an arbiter agent is invoked through the same `stream_cli_agent()` path. It receives a condensed history and returns a structured JSON verdict (`continue`, `conclude`, or `redirect`). The arbiter can steer the conversation, end it gracefully, or inject corrective guidance into the shared history. A hard cap of 3 arbiter interventions per session prevents infinite loops.

### 2.2 — Substantive Gate

After each agent message, a lightweight heuristic classifier labels the output as `structural`, `transformative`, or `incremental`. Three consecutive `incremental` messages indicate decision-space exhaustion and terminate the session with an explanation, without any extra LLM call.

### 2.3 — Session 機器可讀狀態 (status.json)

After every round, a `status.json` file is written alongside the session's `messages.json`. Its contents are also broadcast over the WebSocket and displayed as a compact status badge in the chat header. A new REST endpoint exposes the current status to external consumers.

### 2.4 — Blackboard 結構化 Header

`build_prompt()` is extended to prepend a `[SHARED STATE]` section to every agent's prompt. This blackboard surface records the current plan, a running list of key decisions, and open questions extracted from arbiter feedback, giving all agents shared situational awareness across rounds.

---

## 2. Data Model Changes

### 2.1 Arbiter — New Fields

**Session startup parameters (passed in the WebSocket handshake JSON body or query params):**

| Field | Type | Default | Description |
|---|---|---|---|
| `arbiter_enabled` | `bool` | `false` | Enable arbiter logic for this session |
| `arbiter_interval` | `int` | `3` | How many rounds between arbiter invocations |
| `arbiter_agent_name` | `str` | `"arbiter"` | Name key to look up in the agent config |

**In-memory WS session state (new fields):**

| Field | Type | Description |
|---|---|---|
| `arbiter_count` | `int` | Number of arbiter interventions so far this session |
| `last_verdict` | `str \| None` | Most recent arbiter verdict string |

**New WS message types (server → client):**

| `type` | Extra fields | Sent when |
|---|---|---|
| `arbiter_thinking` | `agent: str` | Arbiter invoked, generating verdict |
| `arbiter_chunk` | `agent: str`, `text: str` | Arbiter streaming (optional, for transparency) |
| `arbiter_verdict` | `verdict: str`, `feedback: str` | Verdict parsed and applied |
| `arbiter_conclude` | `feedback: str` | Verdict is `"conclude"` — session ending |

### 2.2 Substantive Gate — New Fields

**In-memory WS session state (new fields):**

| Field | Type | Description |
|---|---|---|
| `consecutive_incremental_count` | `int` | Resets on any non-incremental message |
| `decision_space_exhausted` | `bool` | Set `True` when threshold is reached |

**Classification values (internal enum or string literal):**

```
"structural" | "transformative" | "incremental"
```

**New WS message type:**

| `type` | Extra fields | Sent when |
|---|---|---|
| `substantive_gate_triggered` | — | `consecutive_incremental_count` reaches 3 |

### 2.3 status.json — New File

Written to `history/<session_id>/status.json` after every round.

```json
{
  "session_id": "abc123",
  "phase": "running",
  "round": 5,
  "agents": ["claude", "gemini"],
  "last_verdict": "continue",
  "consecutive_incremental": 2,
  "arbiter_count": 1,
  "updated_at": "2026-03-19T12:34:56.789Z"
}
```

**`phase` values:**

| Value | Meaning |
|---|---|
| `"running"` | Normal round-robin in progress |
| `"arbiter_intervening"` | Arbiter is currently being invoked |
| `"concluded"` | Session ended by arbiter `conclude` verdict |
| `"exhausted"` | Session ended by substantive gate |

**New WS message type:**

| `type` | Extra fields | Sent when |
|---|---|---|
| `status_update` | `status: {...}` | After each `status.json` write |

**New REST endpoint:**

```
GET /sessions/{session_id}/status
Response: 200 application/json — contents of status.json
Response: 404 — session or status file not found
```

### 2.4 BlackboardState — New Dataclass

```python
from dataclasses import dataclass, field

@dataclass
class BlackboardState:
    current_plan: str = ""
    key_decisions: list[str] = field(default_factory=list)
    open_questions: str = ""
```

Injected into every agent's prompt via `build_prompt()` as a new `blackboard` parameter.

**No new WS message types.** Blackboard content is visible to agents only through their prompts.

---

## 3. Backend Changes

### 3.1 `app.py`

#### `_produce()` loop

The main loop gains the following logic, in order of execution per round:

1. **Arbiter check (2.1):** After incrementing `round_count`, if `arbiter_enabled` and `round_count % arbiter_interval == 0`:
   - **Pre-check hard cap:** if `arbiter_count >= 3`, skip arbiter entirely for this trigger (no invocation, no WS messages).
   - Look up agent by `arbiter_agent_name` in the config list. If not found, skip silently.
   - Increment `arbiter_count` (now counts invocations, regardless of verdict).
   - Send `{type: "arbiter_thinking", agent: arbiter_name}`.
   - Call `stream_cli_agent()` with an arbiter-specific prompt (condensed history + JSON template).
   - Parse the JSON verdict from the full streamed text. On parse failure, treat as `"continue"`.
   - Apply verdict:
     - `"continue"` — send `{type: "arbiter_verdict", verdict: "continue", feedback: feedback}`. No other action.
     - `"redirect"` — prepend `[SYSTEM] Arbiter redirect: <feedback>` to `history_text`. Append `feedback` to `BlackboardState.key_decisions`. Update `BlackboardState.current_plan` to `feedback`. Send `{type: "arbiter_verdict", verdict: "redirect", feedback: feedback}`.
     - `"conclude"` — send `{type: "arbiter_conclude", feedback: feedback}` (this replaces `arbiter_verdict` for the conclude case). Append `feedback` to `BlackboardState.key_decisions`. Set `running = False`, write final `status.json` with `phase: "concluded"`.

2. **Substantive Gate check (2.2):** After receiving `full_text` from an agent:
   - Call `classify_message(full_text)` → `"structural" | "transformative" | "incremental"`.
   - If `"incremental"`: increment `consecutive_incremental_count`.
   - Else: reset `consecutive_incremental_count = 0`.
   - If `consecutive_incremental_count >= 3`:
     - Set `decision_space_exhausted = True`.
     - Inject system message into `history_text`: `[SYSTEM] Session ended: decision space exhausted after 3 consecutive incremental messages.`
     - Send `{type: "substantive_gate_triggered"}`.
     - Set `running = False`.

3. **status.json write (2.3):** After arbiter and gate checks each round, call `write_status()` and send `{type: "status_update", status: {...}}`.

4. **Blackboard injection (2.4):** `build_prompt()` is called with an additional `blackboard: BlackboardState` argument. The blackboard is updated by the arbiter handler before the next round's prompts are built.

#### New helper functions in `app.py`

| Function | Signature | Responsibility |
|---|---|---|
| `classify_message` | `(text: str) -> str` | Heuristic classification (2.2) |
| `build_arbiter_prompt` | `(history_text: str) -> str` | Condensed history + JSON instruction template (2.1) |
| `write_status` | `(session_id: str, state: dict) -> None` | Write `status.json` atomically (2.3) |
| `get_status` | FastAPI route handler | `GET /sessions/{session_id}/status` (2.3) |

#### `build_prompt()` signature change

```python
# Before
def build_prompt(agent, history_text, ...) -> str

# After
def build_prompt(agent, history_text, ..., blackboard: BlackboardState | None = None) -> str
```

When `blackboard` is not `None`, prepend:

```
[SHARED STATE]
current_plan: <blackboard.current_plan or "(none)">
key_decisions: <newline-joined list or "(none)">
open_questions: <blackboard.open_questions or "(none)">
```

### 3.2 `conversation_engine.py`

No changes to `next_speaker()` round-robin logic. The arbiter is invoked externally by `_produce()`, not through `ConversationEngine`.

### 3.3 New module: `substantive_gate.py` (optional extraction)

If `classify_message()` grows beyond ~30 lines, extract it and its keyword/pattern constants to a dedicated `substantive_gate.py` module to keep `app.py` focused.

### 3.4 `classify_message()` heuristic rules (2.2)

Evaluated in this exact order:

1. `len(text.strip()) < 100` → `"incremental"`
2. Text contains `##` header markers, triple-backtick code fences, or a line matching `/^\d+\./` (numbered list item) → `"structural"`
3. Text contains any of: `"in summary"`, `"to conclude"`, `"as mentioned"`, `"similarly"` (case-insensitive) → `"incremental"`
4. Default → `"transformative"`

### 3.5 Arbiter prompt template (2.1)

`build_arbiter_prompt(history_text)` takes the last **10 lines** of `history_text` as `condensed_history` (split by newline, tail). `N` in the template is always 10.

`arbiter_chunk` WS messages are **always sent** during arbiter streaming (same as regular agent chunks), so the user can see the arbiter's raw output before the verdict is parsed.

```
You are an impartial arbiter reviewing a multi-agent conversation.

CONVERSATION SUMMARY (last {N} messages):
{condensed_history}

Evaluate whether the conversation should continue, be redirected, or concluded.

Respond with ONLY valid JSON in this exact format:
{"verdict": "continue" | "conclude" | "redirect", "feedback": "<one sentence>"}

- "continue": agents are making progress, no intervention needed
- "conclude": the conversation has reached a satisfactory conclusion
- "redirect": the conversation is off-track; use "feedback" to steer it
```

---

## 4. Frontend Changes (`static/index.html`)

### Status Badge (2.3)

- A small `<div id="session-status">` in the chat header, initially hidden.
- On `status_update` WS message: update inner text to `Phase: {phase} | Round: {round}`.
- Color coding via CSS class on the badge element:
  - `running` → neutral/grey
  - `arbiter_intervening` → amber
  - `concluded` → green
  - `exhausted` → red

### Arbiter Messages (2.1)

- `arbiter_thinking`: render a dimmed italics line, e.g., `[Arbiter is evaluating…]`.
- `arbiter_verdict`: render a bordered callout block showing `Verdict: {verdict}` and the feedback text.
- `arbiter_conclude`: render the feedback in a distinct "Session Concluded" block, then stop accepting further input.

### Substantive Gate (2.2)

- `substantive_gate_triggered`: render an amber warning block — `Session ended: conversation has reached its decision space limit.` — and disable the send controls.

### No new UI controls required for Phase 2

Session startup parameters (`arbiter_enabled`, `arbiter_interval`, `arbiter_agent_name`) are either sent as query parameters on WebSocket connect or hard-coded per session configuration. No settings panel is required in Phase 2.

---

## 5. Inter-Component Dependencies

```
2.1 Arbiter
  └── requires: existing stream_cli_agent(), agent config with arbiter entry
  └── produces: last_verdict, arbiter_count, redirect feedback → consumed by 2.4

2.2 Substantive Gate
  └── requires: full_text from each agent turn (already available in _produce())
  └── independent of 2.1, 2.3, 2.4

2.3 status.json
  └── requires: arbiter_count, last_verdict (from 2.1), consecutive_incremental (from 2.2)
  └── must run AFTER 2.1 and 2.2 checks each round
  └── produces: status.json read by GET /sessions/{id}/status

2.4 Blackboard
  └── requires: redirect/conclude feedback from 2.1
  └── consumed by build_prompt() — must be updated BEFORE next round's prompts are built
  └── BlackboardState.key_decisions updated on each conclude or redirect verdict
```

**Implementation order recommendation:** 2.3 → 2.2 → 2.1 → 2.4. Start with status.json scaffolding (lowest coupling), then the gate (self-contained heuristic), then the arbiter (most logic), then the blackboard (depends on arbiter output).

---

## 6. Error Handling

### Arbiter JSON parse failure (2.1)

- If the arbiter's streamed output cannot be parsed as valid JSON, log a warning and treat the verdict as `"continue"`.
- Do not propagate the exception to the WebSocket layer.

### Arbiter agent not found (2.1)

- If `arbiter_agent_name` does not match any entry in the loaded agent config, log a warning at session start and skip all arbiter invocations silently. Do not raise or send an error to the client.

### status.json write failure (2.3)

- Wrap the file write in a `try/except`. On failure, log the error but do not halt the round or close the WebSocket.
- The `GET /sessions/{id}/status` endpoint returns `404` if the file does not exist or `500` with an error body if the file is corrupt/unreadable.

### Substantive Gate threshold crossed mid-stream (2.2)

- The gate is checked only after `full_text` is complete (i.e., after the agent's `message_end` event), not during streaming. This avoids premature termination on partial output.

### Blackboard state corruption (2.4)

- `build_prompt()` must never fail due to a missing or partially populated `BlackboardState`. All fields default to empty strings/lists. If `blackboard` is `None`, the `[SHARED STATE]` block is omitted entirely — backward-compatible with sessions that do not use 2.4.

### WebSocket disconnect during arbiter invocation (2.1)

- If the WebSocket closes while the arbiter is streaming, the existing disconnect-detection mechanism in `_produce()` should catch the error and exit the loop. No special arbiter-specific handling is needed.

---

## 7. Testing Notes

### 2.1 Arbiter

- Unit test `build_arbiter_prompt()` with a known history — verify condensed output length and JSON template presence.
- Unit test verdict dispatch logic with mocked `stream_cli_agent()` returning each of `continue`, `conclude`, `redirect`, and malformed JSON.
- Integration test: session with `arbiter_interval=1` and a 4-round config; confirm `arbiter_count` caps at 3 and `conclude` is forced on the 4th trigger.
- Test that a missing arbiter agent in config produces no error and no arbiter WS messages.

### 2.2 Substantive Gate

- Unit test `classify_message()` with strings covering each heuristic branch (short string, string with `##`, string with summary phrases, generic string).
- Unit test the counter reset: sequence `incremental`, `transformative`, `incremental`, `incremental` should not trigger the gate (counter is 2 after the last `incremental`, not 3).
- Integration test: inject 3 consecutive short messages (<100 chars); confirm `substantive_gate_triggered` WS message is sent and `running` is set to `False`.

### 2.3 status.json

- Unit test `write_status()`: verify file is written to correct path with correct JSON schema.
- Unit test `GET /sessions/{id}/status` with TestClient: file present → 200 + JSON body; file absent → 404.
- Integration test: after each round, assert `status.json` `round` field increments correctly and `phase` transitions match session events.

### 2.4 Blackboard

- Unit test `build_prompt()` with and without a `BlackboardState` argument; verify `[SHARED STATE]` block appears/is absent accordingly.
- Unit test that `key_decisions` list grows correctly across multiple `redirect` and `conclude` verdicts.
- Integration test: run a session with arbiter returning `redirect`; confirm the next agent's prompt (captured via mock) contains the updated `[SHARED STATE]` section.

### General

- All new WS message types should be tested against a reference schema to catch field regressions.
- Ensure no regression in the existing round-robin behavior when `arbiter_enabled=false` (default) and no gate conditions are triggered.
