# Agent CLI Conversation

A multi-agent AI chat room. Multiple AI agents (Claude, Gemini, Ollama-based models) hold a live discussion on a topic, with a human facilitator who can interrupt or redirect at any time.

## Quick Start

```bash
pip install fastapi uvicorn httpx python-multipart
uvicorn app:app --reload
```

Open `http://localhost:8000`.

## Architecture

Two layers:

**Models** — LLM connection configs, stored in `config.json → models`.
Each entry describes how to reach an LLM: CLI subprocess (Claude, Gemini) or HTTP API (Ollama).

**Agents** — Personas that run on top of a model. Each lives in `agents/<name>/`:

```
agents/
  claude/
    config.json     ← emoji, color, model reference, skills, enabled
    AGENT.md        ← main instructions (injected into every prompt)
    IDENTITY.md     ← who this agent is
    SOUL.md         ← values and motivations
    MEMORY.md       ← persistent memory index
    memory/         ← dated session logs
  _default/         ← template for new agents
```

Multiple agents can share the same underlying model (e.g. two different personas both running Claude).

**Skills** — Optional capability packs in `skills/<slug>/SKILL.md` (or `SKILLS.md`).
Agents can hold skills; the prompt builder injects their content automatically.

## Running a Session

1. Pick a topic and select which agents to include
2. Set Auto or Manual round mode
3. Agents take turns responding; type to interrupt at any time
4. Sessions are saved to `history/` and appear in the sidebar

## Settings

| Tab | What it does |
|-----|-------------|
| 模型 | Add / edit / delete LLM connections |
| 代理人 | Add / edit agent personas, AGENT.md / IDENTITY.md / SOUL.md |
| 技能 | View installed skills, add manually or upload a `.zip` pack |
| 關於你 | Edit the `_default` templates used when creating new agents |
| 關於我 | Edit `USER.md` — shared context about the human facilitator |

## Ollama

For API-type models (Ollama), the settings card lets you:
- Refresh the list of locally available models
- Browse cloud-available models (`/api/tags?cloud=true`) and pull them with a live progress bar

## Session Export

Click ⬇ on any session in the sidebar to download it as **Markdown**, **JSON**, or **PDF**.

## Tests

```bash
python3 -m pytest test_api.py -v
```

49 tests covering models, agents, skills, and Ollama endpoints.

## File Layout

```
app.py              ← FastAPI backend + WebSocket
static/index.html   ← Single-page frontend
agents/             ← Agent personas
skills/             ← Installed skills
history/            ← Session JSON logs (gitignored)
config.json         ← Model connection configs (gitignored)
USER.md             ← About the human facilitator
test_api.py         ← Test suite
docs/               ← Architecture and API reference
devlogs/            ← Development notes
```
