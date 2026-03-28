# v0.10.0 Release Notes — Rebirth

**Release Date:** 2026-03-29
**Branch:** `rebirth` (from `v0.9.0`)

回歸 Python FastAPI 單後端架構，清除 JS/Node.js 系統，重構程式碼，新增 Kanban 討論看板。

---

## Highlights

### 1. Rebirth — 回歸 Python 單後端

v0.9.0 後嘗試將全部功能合併至 Node.js，但 paperclip 整合失敗。本版從 v0.9.0 開出 `rebirth` branch，回歸 Python chat backend。

- JS/Node.js 相關檔案（`ui/`、`server/`、`packages/`、`pnpm-workspace.yaml`、`tsconfig.*`、`Dockerfile.cowork`）全部移至 `deprecated/`
- 前端使用 `static/index.html`（vanilla JS），由 FastAPI 直接 serve
- 根目錄只剩 Python chat 核心

### 2. app.py 重構 — 2973 → 418 行

單檔 monolith 拆分為模組化架構：

```
core/
├── config.py      — model defaults, preset conversion
├── errors.py      — SubprocessError hierarchy, TokenUsage
├── history.py     — session persistence, hidden sessions
├── prompt.py      — build_prompt, skill resolution
├── registry.py    — agent registry, v0/v1 merge
├── runner.py      — CLI/API streaming, token tracking
├── security.py    — filename validation, path sanitization
├── skills.py      — skill parsing, file finding
├── templates.py   — (legacy, deprecated)
└── workspace.py   — workspace helpers

routes/
├── agents.py      — /agents CRUD
├── health.py      — /health, /
├── marketplace.py — /marketplace/agents CRUD + install
├── models.py      — /models, /adapter-presets, /config CRUD
├── providers.py   — /providers/ollama
├── scenarios.py   — /scenarios CRUD
├── sessions.py    — /sessions CRUD
├── skills.py      — /skills CRUD + upload
├── user.py        — /user/md
├── workspaces.py  — /workspaces CRUD + file upload
└── ws.py          — WebSocket conversation handler
```

### 3. Template Source of Truth — agents/_default/

移除所有 `DEFAULT_*_MD` 硬編碼字串。`agents/_default/` 資料夾是唯一的 template source of truth，必須存在於 git 中。Settings 的「靈魂」tab 編輯 `_default/` 即直接生效。

### 4. Mini Kanban 討論看板

對話頁面頂部新增 3 欄看板，追蹤討論進度：

- **TODO / In Progress / Done** 三欄
- 進入對話時 topic 自動放入 In Progress
- 支援 **drag & drop** 拖曳移動項目狀態
- 可在 TODO 欄新增項目
- **Agent 感知**：kanban 狀態透過 WS 即時同步，`build_prompt` 注入 `## Discussion Board`，每個 agent 回應前都能看到目前討論狀態

### 5. Scenario UX 改進

- **修復 onclick 引號衝突 bug**（`JSON.stringify` 雙引號 vs `onclick="..."` 雙引號）
- 選中的 scenario 卡片加綠色邊框 + 「已選定此情境」提示
- **解耦 scenario 與 agent**：選 scenario 不再自動勾選 suggested_agents
- Topic hint 改為 placeholder（灰色提示），不自動填入
- Settings 新增「情境」tab — 完整 CRUD（新增、編輯、刪除）

### 6. Bug Fix — 踢人時中斷正在回應的 agent

Previously：踢掉正在回應的 agent，subprocess 繼續跑完，回應照送到前端。
Now：`remove_agent` 時如果目標是當前 speaker，立即 cancel subprocess，跳到下一個 agent。

---

## Test Coverage

- 237 tests, all passing
- 新增 20 個測試：kanban prompt injection (7)、scenario CRUD (10)、build_prompt integration (3)

---

## Breaking Changes

- JS/Node.js 系統移至 `deprecated/`，不再維護
- `ui/` React 前端不再使用，改用 `static/index.html`
- `core/templates.py` 中的 `DEFAULT_*_MD` 不再生效，以 `agents/_default/` 為準

---

## Migration

從 v0.9.0 升級：

1. `agents/_default/` 必須存在於 repo 中
2. Python 後端啟動指令不變：`uvicorn app:app --host 0.0.0.0 --port 8000 --reload`
3. 前端直接瀏覽 `http://localhost:8000`
