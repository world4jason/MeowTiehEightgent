# v0.11.1 Release Notes — Bug Fix + UI

**Release Date:** 2026-03-30
**Branch:** `rebirth`
**Previous:** v0.11.0

---

## Bug Fixes

### Model 連線修復（全部 4 個 CLI 驗證通過）

- **Token 用量不顯示** — `_get_json_output_flags` 改用 `cmd[0]` binary name 判斷（不再被 `model_id` 的 `_local` suffix 擋住）
- **Adapter preset 不匹配** — registry 加 suffix fallback（`_local`/`_api`/`_cloud`），`gemini_local` 能找到 `gemini` preset
- **Codex CLI 過時** — `-q -p` 改成 `exec`（codex 0.77+ breaking change）
- **Ollama 錯誤被吞** — `call_api_agent` 現在 surface API error message（quota limit、model not found）
- **Gemini 啟動慢** — 加 `-e ""` 跳過 extension loading（56s → 27s）
- **測試連線 undefined** — empty response 回清楚 error 而不是 `undefined`

### 測試連線重設計

- 搬到模型 tab（連線是 model 的事，不是 agent 的事）
- CLI model 用快 model 測（claude→sonnet, gemini→flash）
- API model 用用戶設定直接測（不覆蓋 ollama 的 model/baseUrl）
- 各 CLI 的 flag 順序硬編碼（避免 `-p --model` 順序問題）

### 其他

- **踢人時 turn hint 沒更新** — mode switch 後立即更新 hint text

---

## UI 改善

### 聊天室 Auto/Manual 切換

chat header 新增 A/M 按鈕，可在對話中隨時切換模式：
- A（綠色）= Auto 模式
- M（橘色）= Manual 模式 + 輪數輸入框
- Turn hint 顯示進度（「2/6 輪」「已暫停」「Auto」）
- 切換時系統訊息通知（「模式切換為 Manual（每 2 輪暫停）」）

### 成員面板

- 兩行佈局：名字+次數上面，Chat/Think 按鈕下面
- 面板加寬 260px
- 次數顯示改為「N 則」（不再是擠在一起的 ×N）
- Agent 之間加分隔線

### 情境編輯

- 儲存/刪除按鈕改 flex 排列，刪除縮小在右邊

---

## Session State 持久化（sessionStorage）

所有 session 內狀態統一存到 `sessionStorage`（key: `sess_{sessionId}`）：

| 狀態 | 說明 |
|------|------|
| agentRuns | 每個 agent 的 token 累計 |
| currentMode | Auto / Manual |
| activeSessionAgents | 參與的 agent 列表 |
| msgCountMap | 每個 agent 講了幾句 |
| _liveSessionParams | 重連參數 |
| historyTopic | 當前 topic |
| kanbanItems | Kanban 看板狀態 |
| membersPanelOpen | 成員面板開關 |
| runsPanelOpen | Token 面板開關 |

切 tab、斷線重連、點 sidebar 載入 session — 全部恢復。

**QA 狀態：** sessionStorage 持久化無法從 headless browser 驗證（SecurityError），需手動在真實瀏覽器確認。

---

## CLI 安裝教程

README 新增安裝表格：

| CLI | 安裝指令 |
|-----|---------|
| Claude | `npm install -g @anthropic-ai/claude-code` |
| Gemini | `npm install -g @google/gemini-cli` |
| Codex | `npm install -g @openai/codex` |
| Ollama | `brew install ollama` |

---

## Test Coverage

408 tests, all passing（與 v0.11.0 相同，本版無新增測試）

---

## Known Issues

- sessionStorage 持久化尚未從 UI 完整驗證
- Gemini CLI 每次呼叫仍需 ~14 秒（CLI 本身的限制，需直接 API 才能根本解決）
- Chat/Think 模式切換是否真的切換 model 尚未驗證
