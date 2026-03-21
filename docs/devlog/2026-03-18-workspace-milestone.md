# Devlog — 2026-03-18

## What was built

### Workspace 功能（全功能 Milestone）

完整的 Workspace 系統（類似 ChatGPT Projects）：

**資料模型**
- `workspaces/<id>/config.json` — name, description, system_prompt, default_agents, created_at
- `workspaces/<id>/files/` — 共享文件
- `messages.json` 加 `workspace_id` 欄位（null = standalone session）

**Backend API**（7 個端點）
- `GET/POST /workspaces` — 列出 / 建立
- `GET/PUT/DELETE /workspaces/{id}` — 取得 / 更新 / 刪除
- `POST/DELETE /workspaces/{id}/files` — 上傳 / 刪除文件
- `PUT /sessions/{id}/workspace` — 移動 session 至 workspace
- 刪除 workspace 不刪除 sessions，改 `workspace_id = null`

**Context Injection（Phase 2）**
- `build_prompt()` 接受 `workspace_id`，自動注入 system_prompt + files 全文（< 50KB）或只注入檔名清單
- @filename 語法在 `resolve_human_text()` 解析，把 workspace file 內容插入對話

**Sidebar UI（Phase 3）**
- 兩層結構：Workspace 資料夾（可展開/收合）+ 獨立 sessions
- 點 workspace 名稱 → 設定為預設 workspace，開新對話自動帶入 default_agents
- Session 移動 workspace：hover 顯示資料夾 icon → dropdown 選目標
- "+ 新增工作區" 按鈕在 sidebar 底部

**Settings — 工作區 tab（Phase 5）**
- 左欄：workspace 列表 + 新增按鈕
- 右欄：Instructions（edit modal）、Files（上傳 / 貼文字）、預設 Agents（checkbox）、刪除
- 兩個上傳路徑：本地文件 + 貼上文字內容（指定檔名）

---

### Phase C 功能補完

**Session 重命名**
- Sidebar session 標籤雙擊 → inline `<input>` 編輯
- Enter 確認 / Escape 取消 / blur 確認
- Backend: `PUT /sessions/{id}/topic` — 更新 messages.json 第一個 system message 的 text

**Agent 發言統計**
- Members panel 每個 agent 名稱旁顯示 `×N` 發言次數
- `msgCountMap` 追蹤每個 agent 的發言輪數
- 載入 session 時從歷史計算；即時 message_end 時遞增；開新 session 時歸零

**圖片附件（Vision）**
- 前端偵測 image/* 文件，readAsDataURL，顯示 32px thumbnail chip（vs 文字的 icon chip）
- base64 透過 WebSocket 傳送 `images: [{name, mime, base64}]`
- Backend 寫入 `history/<session_id>/images/<uuid>.ext`，存檔名參考進 messages.json
- CLI 端：用 `--add-file <tmpfile>` 把圖片注入 claude/gemini CLI，用後清除 temp file
- 圖片只消費一次（用完 `current_images` 即清空）
- 載入 session 時，human messages 的圖片從 `/sessions/{id}/images/{filename}` 讀取並顯示

---

### Message Queue（Cursor-style）

- 當有 agent 正在回覆時，新的 human 訊息不立即送出，而是 push 到 `msgQueue[]`
- 顯示 "queued" 樣式的 bubble
- Queue panel 顯示待送訊息 + 操作按鈕：✏ 編輯、↑ 調換順序、✕ 刪除
- `message_end` 收到後觸發 `flushMsgQueue()`，依序送出下一則

---

### 其他小功能

- **Model variant 選擇**：CLI 模型設定頁新增 Model Name 欄位（設定 `--model` flag，e.g. `claude-opus-4-6`）
- **Welcome screen 文件附件**：topic input 旁的 mth 按鈕，可在開新對話前附加文件
- **AGENT.md 記憶路徑警告**：加強警告 agents 不要寫入 `~/.claude/` 等 CLI 系統目錄

## Commits

- `d2f422b` Phase A+B — streaming, session search, copy button, @filename, default agents UI
- `6acc2b8` Cursor-style queue + model variant selector
- `1b6441b` Welcome screen file attach
- `4834d3e` AGENT.md memory path clarity + model name/display name distinction
- `f4c0fbb` Stronger memory path warning in all AGENT.md files
- `8870368` Phase C — session rename, agent stats, image attachments (vision)
- `(WIP)`  Image persistence in session (save to files, load on history view)
