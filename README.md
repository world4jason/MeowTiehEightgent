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

## CLI 安裝

Agent 透過 CLI subprocess 呼叫 LLM。需要安裝對應的 CLI 工具：

| CLI | 安裝指令 | 官方文件 |
|-----|---------|---------|
| **Claude** | `npm install -g @anthropic-ai/claude-code` | [claude.ai/code](https://claude.ai/code) |
| **Gemini** | `npm install -g @anthropic-ai/gemini-cli` 或 `npx @anthropic-ai/gemini-cli` | [github.com/anthropics/gemini-cli](https://github.com/anthropics/gemini-cli) |
| **Codex** | `npm install -g @openai/codex` | [github.com/openai/codex](https://github.com/openai/codex) |
| **Ollama** | `brew install ollama` 或 [ollama.com/download](https://ollama.com/download) | [ollama.com](https://ollama.com) |

安裝後在 Settings「模型」tab 點「測試連線」確認可用。

## Ollama

Ollama 走 HTTP API（不是 CLI subprocess），需要先啟動 server：

```bash
ollama serve          # 啟動 server（預設 http://localhost:11434）
ollama pull llama3.2  # 下載 model
```

Settings 的模型 tab 也可以直接 pull model（有進度條）。

Cloud model（如 `deepseek-v3.1:671b-cloud`）有週用量限制，超過會回 quota error。

## Session Export

Click ⬇ on any session in the sidebar to download it as **Markdown**, **JSON**, or **PDF**.

## Tests

```bash
python3 -m pytest test_api.py -v
```

408 tests covering models, agents, skills, memory system, and pipeline.

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
