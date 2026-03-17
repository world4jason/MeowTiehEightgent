# Architecture

## Overview

```
Browser ──WebSocket──▶ FastAPI (app.py) ──subprocess/HTTP──▶ LLMs
                           │
                      history/*.json
```

The server owns the conversation loop. The browser is a thin client: it renders messages and sends user input. All agent orchestration, prompt building, and turn management happens server-side.

## Models

Defined in `config.json → models`. Two types:

### CLI (`type: "cli"`)

Spawns a subprocess for each turn. The agent's workspace folder is passed as `cwd`, so the CLI tool automatically picks up its native config file (e.g. `CLAUDE.md` for Claude Code, `GEMINI.md` for Gemini CLI).

```json
{
  "claude": {
    "type": "cli",
    "cmd": ["claude", "--print"],
    "emoji": "🟣",
    "color": "#a78bfa"
  }
}
```

### API (`type: "api"`)

Sends requests to an OpenAI-compatible HTTP endpoint. Used for Ollama.

```json
{
  "ollama-local": {
    "type": "api",
    "baseUrl": "http://127.0.0.1:11434",
    "apiModel": "llama3.2",
    "emoji": "🦙",
    "color": "#f97316"
  }
}
```

## Agents

Each agent lives in `agents/<name>/`. The folder is the agent's workspace.

### config.json

```json
{
  "emoji": "🟣",
  "color": "#a78bfa",
  "description": "Claude agent",
  "model": "claude",
  "skills": ["discussion"],
  "enabled": true
}
```

`model` references a key in the models registry.

### Prompt construction (`build_prompt`)

For each agent turn, the server builds a system prompt by concatenating:

1. `AGENT.md` — main operational instructions
2. `IDENTITY.md` — who the agent is
3. `SOUL.md` — values and motivations
4. `USER.md` — context about the human facilitator
5. Today's memory file (`memory/YYYY-MM-DD.md`) if it exists
6. Any skills listed in `config.json → skills`

The full conversation history is then appended as the user message.

### _default template

`agents/_default/` holds template files. When a new agent is created via the UI, these files are copied with `{name}` substituted. Editing the "關於你" settings tab edits these templates.

## Skills

Skills live in `skills/<slug>/SKILL.md` (or `SKILLS.md` — both accepted).

File format:

```markdown
---
name: My Skill
description: One-line description used in the UI
---

# My Skill

Full skill content injected into the agent's system prompt.
```

Skills can also be uploaded as a `.zip` where each top-level directory is a skill folder.

## WebSocket Protocol

All real-time communication uses a single WebSocket at `/ws`.

### Client → Server

| Message | Fields | When |
|---------|--------|------|
| `start` | `topic`, `agents[]`, `auto`, `rounds`, `resume_from?` | Session start |
| `human` | `text` | User sends a message mid-session |
| `stop` | — | User clicks Stop |

### Server → Client

| Message | Fields | When |
|---------|--------|------|
| `system` | `text` | Session topic header |
| `thinking` | `agent`, `color` | Agent is computing |
| `message` | `agent`, `color`, `text`, `timestamp` | Agent response |
| `human` | `agent: "Human"`, `text` | User message echo |
| `ready` | `pause: bool` | Turn complete (manual mode) |
| `done` | — | Session ended |
| `error` | `text` | Error |

### Session resume

Pass `resume_from: "<session_id>"` in the `start` message. The server loads the history file, builds `history_text` from it, and prepends the first incoming `human` message before starting the agent loop — so the first agent responds to what the user just said, not the old thread.

## Sessions

Stored as `history/<uuid>.json` — a flat array of message objects. The same format is used for export (JSON download) and for Markdown/PDF generation client-side.

Hidden sessions are tracked in `hidden_sessions.json` (a simple set of IDs). The history file is kept on disk; only the sidebar entry is hidden.
