# v0.9.0 Release Notes

**Release Date:** 2026-03-25

MeowTiehEightgent v0.9.0 — 從原型到統一架構的里程碑。涵蓋 03-17 至 03-25 的全部開發成果。

---

## Highlights

### 🏗️ Backend Merge — 雙後端合併為單一 Node.js Server

Python FastAPI (:8000) + Node.js Mth (:3100) → **統一 Node.js server**。

- Chat WebSocket 完整移植（ConversationEngine、build_prompt、stream-agent、session-store）
- 54 個 Chat REST endpoints 全部移植（sessions、agents、adapter-presets、skills、workspaces、scenarios、marketplace、history-manager）
- UI 切到 `/chat/api` + Vite proxy，不再直連 Python
- Agent config 升級至 v1：UUID folders (`agents/{uuid}-{name}/`)、adapter presets、role/title
- Startup file-sync：`agents/` → DB upsert
- Migration script：v0 → v1 自動轉換

### 🧠 Think Mode — model_tiers 動態切換

- `resolve_thinking_model()` — runtime 從 `model_tiers` dict 解析 thinking model
- `stream_agent()` — think mode 自動 dispatch 到 thinking model CLI
- WS system message 通知 model 切換
- 🧠 badge 標記 think mode 產出的訊息（persist in history）
- Settings UI: 支援思考模式 checkbox + thinking model dropdown

### 📝 History Summarization Phase 2

- `history_manager.py` — 獨立模組（從 app.py 提取 ~200 LOC）
- `compress_history()` — LLM 自動摘要 + summary.json cache + failure cooldown
- Per-session config override (`history/{session_id}/session_config.json`)
- SummaryCard UI — collapsible card 顯示壓縮統計 + 手動 re-compress
- Settings: summarization_model selector + threshold 設定

---

## Feature List

### Architecture (03-17)
- **Models + Agents 分層** — LLM connection config (models) 與 persona config (agents) 分離
- **Agent folder 結構** — `config.json` + `AGENT.md` + `IDENTITY.md` + `SOUL.md` + `memory/`
- **`_default/` 模板** — 新 agent 自動套用

### Settings UI (03-17, 03-23)
- 8-tab Settings Panel: 模型 / 代理人 / 代理人市場 / 技能 / 情境模板 / 工作區 / 靈魂 / 關於
- ModelsTab: CLI + Ollama API model CRUD, model pull
- AgentsTab: full CRUD + MD editors + skills assignment + test connection + Cowork agents (read-only)
- AgentMarketTab: marketplace browse + fork install + template CRUD (上架/編輯/刪除)
- ScenariosTab: scenario template CRUD
- SkillsTab: skill CRUD + .zip upload
- WorkspacesTab: workspace CRUD + file management + default agents
- SoulTab: 4-card default template editor
- AboutTab: system info + summarization config
- AdaptersTab: adapter preset CRUD (v0.9.0 新增)

### Chat (03-19, 03-20, 03-24)
- **History sliding window** — `truncate_history()` 防止 context 溢出，保留完整記錄
- **Image compatibility** — 自動偵測不支援 `--add-file` 的 agent，跳過圖片注入
- **Skill source/namespace** — gstack symlink 偵測、`source` metadata、`/gstack:review` 格式呼叫
- **Chat-Cowork Phase 1** — ModeToggle (Chat/Cowork/Settings)、雙 API client、健康狀態監控
- **Token tracking** — per-agent token 用量追蹤 (Runs panel)、stream-json 解析、TokenUsage class

### Backend Merge (03-24)
- **Plan A: Foundation** — v1 agent config、adapter presets、UUID folders、startup sync (9 tasks)
- **Plan B1: Chat WS** — ConversationEngine、session-store、build-prompt、stream-agent、chat-ws (6 tasks)
- **Plan B2: Chat REST** — 54 endpoints 移植、UI 切換、Vite proxy (7 tasks)

### Cleanup (03-22)
- Hermes Paperclip Adapter 完整移除
- React 前端修復（shared types、missing exports、Vite config）

---

## Test Coverage

| Module | Tests |
|--------|-------|
| Python API (test_api.py) | 276 |
| Migration (test_migration.py) | 23 |
| Agent Registry (test_agent_registry.py) | 23 |
| ConversationEngine (TS) | 16 |
| Session Store (TS) | 14 |
| build-prompt (TS) | 33 |
| stream-agent (TS) | 8 |
| Server unit tests (Mth) | 430 |
| **Total** | **820+** |

---

## Architecture (v0.9.0)

```
React UI (:5173)
  │
  ├── /chat/api/*  ──→ Vite proxy ──→ Node.js Mth Server (:3100)
  │                                    ├── Chat REST routes (54 endpoints)
  │                                    ├── /chat/ws (WebSocket: conversation engine)
  │                                    ├── Cowork routes (/api/*)
  │                                    ├── PostgreSQL (runtime data)
  │                                    └── agents/ (file-based config)
  │
  └── /api/*  ──→ Vite proxy ──→ same Node.js server

Python FastAPI (:8000)  ← deprecated, pending retirement
```

---

## Breaking Changes

- Agent folder format changed: `agents/{name}/` → `agents/{uuid}-{name}/` (auto-migrated)
- `config.json` `models` → `adapter_presets` (auto-migrated)
- Chat API base URL: `http://localhost:8000` → `/chat/api` (UI auto-switched)
- `config.json` is gitignored — new environments need migration or manual setup

## Known Issues

- Python backend still present (retirement planned for v0.10.0)
- `config.json` not tracked in git — requires manual migration on new environments
- Mth UI tests require per-workspace `vitest.config.ts` (run via `pnpm test:run`, not root `npx vitest`)

---

## Docs

- Devlogs: `docs/devlog/2026-03-17.md` through `2026-03-24.md`
- Specs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
