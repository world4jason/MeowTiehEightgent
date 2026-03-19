# Phase 1 — Agent 個體控制 Design Spec

> **For agentic workers:** Use superpowers:executing-plans to implement this plan.

**Goal:** Give users fine-grained control over individual agent behaviour — both their response style (chat vs. think mode) and their conversational context (scenario templates) — without requiring backend restarts or config file edits.
**Tech Stack:** Python 3.11+, FastAPI, Vanilla JS, WebSocket

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model Changes](#2-data-model-changes)
3. [Backend Changes](#3-backend-changes)
4. [Frontend Changes](#4-frontend-changes)
5. [State Synchronization](#5-state-synchronization)
6. [Error Handling](#6-error-handling)
7. [Testing Notes](#7-testing-notes)

---

## 1. Overview

### 1.1 — Agent 發言傾向 (chat/think mode)

Each agent can operate in one of two modes: `chat` (concise, conversational) or `think` (extended reasoning, if supported). Mode defaults are declared per-agent in config and can be overridden at runtime via TUI slash commands or GUI toggles in the Members panel. Session state is maintained in the WebSocket handler and broadcast to all connected clients whenever a mode changes.

### 1.2 — Scenario 短期情境模板

Users can optionally load a pre-built scenario before starting a conversation. Scenarios are JSON files in a `scenarios/` directory and define a system prompt, a topic hint, and a suggested agent set. The welcome screen gains a three-way toggle (Workspace / Scenario / Blank) that controls which context is injected into `build_prompt()`.

---

## 2. Data Model Changes

### 2.1 Agent Config (per-agent fields in agents config)

Two new fields added alongside existing fields (`name`, `cmd`, `color`, `enabled`, `supports_image`, `idle_timeout_seconds`):

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `"chat" \| "think"` | `"chat"` | Default response mode for this agent |
| `supports_thinking` | `bool` | `false` | Whether this agent's CLI supports `--extended-thinking` |

Example agent config entry:

```json
{
  "name": "Claude",
  "cmd": "claude",
  "color": "#da7756",
  "enabled": true,
  "supports_image": true,
  "idle_timeout_seconds": 30,
  "mode": "think",
  "supports_thinking": true
}
```

### 2.2 Scenario Files

Location: `scenarios/` directory at project root. Each file is a JSON object with the following schema:

```json
{
  "id": "code-review",
  "name": "Code Review",
  "description": "深度審查程式碼品質與架構",
  "system_prompt": "You are reviewing code. Focus on correctness, performance, and maintainability.",
  "suggested_agents": ["claude", "gemini"],
  "topic_hint": "請貼上要審查的程式碼"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | URL-safe unique identifier, used as filename stem |
| `name` | `string` | yes | Human-readable display name |
| `description` | `string` | yes | Short description shown in scenario picker |
| `system_prompt` | `string` | yes | Injected into `build_prompt()` instead of (or alongside) workspace guide |
| `suggested_agents` | `string[]` | no | Agent names to pre-select; matched case-insensitively against agent config |
| `topic_hint` | `string` | no | Pre-filled placeholder text for the topic input |

### 2.3 Session State (WebSocket handler)

New in-memory state managed per WebSocket connection:

```python
agent_modes: dict[str, str]  # agent name → "chat" | "think"
selected_scenario_id: str | None  # None if Workspace or Blank mode
```

`agent_modes` is initialised from agent config defaults when the WS connection opens and the `start` message is received.

### 2.4 New WebSocket Message Types

#### Incoming (client → server)

| `type` | Additional fields | Description |
|---|---|---|
| `set_mode` | `agent: str`, `mode: "chat" \| "think"` | GUI toggle sends this to change one agent's mode |
| `start` | existing fields + `scenario_id: str \| null` | Extended to carry optional scenario selection |

#### Outgoing (server → client)

| `type` | Additional fields | Description |
|---|---|---|
| `mode_update` | `agent: str`, `mode: "chat" \| "think"` | Broadcast after any mode change (TUI command or GUI toggle) |
| `scenarios_list` | _(sent via HTTP, not WS — see §3.2)_ | — |

---

## 3. Backend Changes

### 3.1 `app.py` — WebSocket Handler

**Initialisation on `start` message:**
- Build `agent_modes` dict from each enabled agent's `mode` config field.
- If `scenario_id` is present in the `start` message **and is a non-null, non-empty string**, load the corresponding scenario file and store its `system_prompt` in session scope as `scenario_system_prompt`. Both `null` and absent `scenario_id` are treated identically as "no scenario selected" — fall back to Workspace or Blank mode depending on context.

**TUI command interception (before routing to agents):**

Intercept the following patterns in the user message handler, prior to the existing `/skill` interception:

| Command | Action |
|---|---|
| `/think` | Set all agents in `agent_modes` to `"think"`; broadcast `mode_update` for each agent |
| `/think @<Name>` | Set named agent to `"think"`; broadcast single `mode_update` |
| `/chat` | Set all agents in `agent_modes` to `"chat"`; broadcast `mode_update` for each agent |
| `/chat @<Name>` | Set named agent to `"chat"`; broadcast single `mode_update` |

**`set_mode` WS message handler:**
- Validate `agent` exists in `agent_modes` and `mode` is `"chat"` or `"think"`.
- Update `agent_modes[agent]`.
- Broadcast `{type: "mode_update", agent, mode}` to all clients.

### 3.2 `app.py` — HTTP Endpoints

**New endpoint:**

```
GET /scenarios
```

- Reads all `*.json` files from the `scenarios/` directory.
- Returns a JSON array of scenario objects (all fields from each file).
- Returns `[]` if `scenarios/` does not exist.

### 3.3 `build_prompt()` — Context Injection Priority

Current behaviour injects a workspace guide string. New priority order (highest wins):

1. **Scenario system prompt** — if `scenario_system_prompt` is set in session, use it as the primary context block.
2. **Workspace guide** — used only when no scenario is active (Workspace mode).
3. **No context** — Blank mode; neither workspace nor scenario injected.

Additionally, when the current agent's resolved mode is `"chat"` (from `agent_modes`), prepend:

```
Keep your response concise — 2-3 sentences max.
```

This prefix is NOT added in `"think"` mode.

### 3.4 `stream_cli_agent()` — Extended Thinking Flag

- Accept an additional parameter `mode: str` (or derive it from `agent_modes` in caller scope).
- If `mode == "think"` AND the agent's `supports_thinking` is `True`, append `--extended-thinking` to the CLI args list.
- If `mode == "think"` AND `supports_thinking` is `False`, proceed silently without the flag — no error, no warning to user.
- If `mode == "chat"`, do not add the flag regardless of `supports_thinking`.

### 3.5 `conversation_engine.py` — No Changes Required

Round-robin turn management is unchanged. Mode resolution happens in `app.py` before `stream_cli_agent()` is called.

---

## 4. Frontend Changes

### 4.1 Welcome Screen — Three-Way Toggle

Replace the existing workspace toggle with a segmented control offering three options:

| Option | Label | Behaviour |
|---|---|---|
| `workspace` | Workspace | Existing behaviour — workspace context injected (current default) |
| `scenario` | Scenario | Shows scenario picker grid below the toggle |
| `blank` | Blank | No context injected |

**Scenario picker grid** (visible only when Scenario is selected):
- Fetched from `GET /scenarios` on page load (cached in JS).
- Displayed as cards: `name` (bold), `description` (muted), `suggested_agents` as small badges.
- Clicking a card: sets `selected_scenario_id`, pre-fills topic input with `topic_hint`, pre-checks suggested agents in the agent selector, highlights the selected card.
- Clicking an already-selected card deselects it (returns to no-scenario state within Scenario mode).

**`start` WS message** gains `scenario_id: selected_scenario_id | null` field when sent.

### 4.2 Members Panel — Chat/Think Toggle

In the right-side Members panel, each agent row gains an inline mode toggle:

- Display: two small buttons `Chat` and `Think` side-by-side (or a pill toggle).
- `Think` button is disabled (greyed, non-interactive) when the agent's `supports_thinking` is `false` — tooltip: "This agent does not support extended thinking".
- Clicking an active button sends `{type: "set_mode", agent: <name>, mode: <mode>}` over the open WS connection.
- The toggle reflects the current `agent_modes` state (updated on `mode_update` messages).

### 4.3 WS Message Handling (client-side)

New handlers in the WS `onmessage` dispatcher:

| Message type | Client action |
|---|---|
| `mode_update` | Find the agent row in Members panel; update the Chat/Think toggle to reflect `mode`; if a TUI command caused the change, optionally show a transient status line in the chat area (e.g., `[System] Claude switched to think mode`) |

---

## 5. State Synchronization

### Source of Truth

The WebSocket handler (`app.py`) is the single source of truth for `agent_modes` during a session. The frontend reflects server state; it does not optimistically update.

### Sync Flow — TUI Command

```
User types /think @Claude
  → client sends {type: "message", text: "/think @Claude"}
  → server intercepts before routing to agents
  → server updates agent_modes["Claude"] = "think"
  → server broadcasts {type: "mode_update", agent: "Claude", mode: "think"}
  → all clients update Members panel toggle for Claude
  → command is NOT forwarded to agents
```

### Sync Flow — GUI Toggle

```
User clicks Think button for Gemini in Members panel
  → client sends {type: "set_mode", agent: "Gemini", mode: "think"}
  → server validates and updates agent_modes["Gemini"] = "think"
  → server broadcasts {type: "mode_update", agent: "Gemini", mode: "think"}
  → all clients (including sender) update toggle — no optimistic local update
```

### Session Initialisation Sync

When the WS connection opens and the `start` message is processed, the server broadcasts `mode_update` for every agent (reflecting config defaults) so newly connected clients get the current state without a separate handshake message.

---

## 6. Error Handling

### 6.1 Invalid `set_mode` Message

- Unknown `agent` name: server logs a warning and sends `{type: "error", message: "Unknown agent: <name>"}` back to the requesting client only. No broadcast.
- Invalid `mode` value (not `"chat"` or `"think"`): same — error reply to sender, no state change.

### 6.2 Unknown `/think` or `/chat` Target

- `/think @UnknownAgent`: server replies with a system message visible in the chat area: `[System] No agent named "UnknownAgent" found.` No state change.

### 6.3 Missing Scenario File

- If `scenario_id` in the `start` message does not match any file in `scenarios/`: log a warning server-side; proceed as Blank mode (no system prompt injected). Do not crash the session.

### 6.4 Malformed Scenario JSON

- If a scenario file fails JSON parsing: skip it silently in `GET /scenarios` response (do not return a 500). Log the error server-side.

### 6.5 `supports_thinking: false` in Think Mode

- Silently downgrade — agent runs without `--extended-thinking`. No error message surfaced to user. The GUI toggle is disabled for such agents, preventing accidental selection.

---

## 7. Testing Notes

### 7.1 Chat/Think Mode — Unit Tests

- `build_prompt()` includes concise prefix when mode is `"chat"` and omits it when mode is `"think"`.
- `stream_cli_agent()` adds `--extended-thinking` only when `mode == "think"` AND `supports_thinking == True`.
- `stream_cli_agent()` does NOT raise when `mode == "think"` AND `supports_thinking == False`.
- `agent_modes` is initialised correctly from agent config defaults on session start.

### 7.2 TUI Command Parsing

- `/think` sets all agents to think mode.
- `/think @Claude` sets only Claude; other agents unchanged.
- `/chat @Gemini` sets only Gemini back to chat; other agents unchanged.
- `/think @Nonexistent` returns error message; no state change.
- Commands are not forwarded to agents (no agent receives the slash command text).

### 7.3 WS `set_mode` Handling

- Valid `set_mode` triggers broadcast to all clients.
- Invalid agent name returns error to sender only.
- Invalid mode value returns error to sender only.

### 7.4 Scenario Endpoint

- `GET /scenarios` returns all valid scenario files as an array.
- Malformed JSON files are skipped; remaining valid scenarios are returned.
- Missing `scenarios/` directory returns `[]` with status 200.

### 7.5 Scenario Injection in `build_prompt()`

- Scenario system prompt takes priority over workspace guide when both would apply.
- Blank mode injects neither scenario nor workspace context.
- Workspace mode injects workspace guide when no scenario is selected.

### 7.6 Frontend Integration (manual / E2E)

- Selecting a scenario pre-fills topic hint in the input and highlights suggested agents.
- Members panel toggles reflect `mode_update` broadcasts in real time.
- Think button is visually disabled for agents with `supports_thinking: false`.
- Opening two browser tabs: mode change in one tab is reflected in the other within one WS round-trip.
- TUI `/think @Claude` command updates the Members panel toggle without appearing as a chat message sent to agents.
