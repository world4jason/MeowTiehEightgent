# Chat + Cowork 全新開發計劃 — Handoff

> 給下一個接手的人。讀完這份你就知道從哪裡開始。

---

## 你要做什麼

把這個多 agent 聊天室，變成一個兩模式的平台：

```
[ Chat ]  [ Cowork ]   ← 頂部切換器

Chat  = 現在的聊天室（Sprint Planning）
         多 agent 即時討論、腦力激盪
         Python FastAPI :8000

Cowork = Mth fork（Sprint Execution）
         Agents 異步執行任務、產出程式碼/文件
         Node.js / Hono :3100
```

兩個模式共用同一個 React UI，共用 `agents/`、`skills/` filesystem。

---

## 設計決策（不用再討論，已定案）

**完整 spec：** `docs/superpowers/specs/2026-03-20-chat-cowork-platform-design.md`

重點：

1. **不合併後端**。Chat 繼續用 Python，Cowork 是 Mth fork（Node.js）。Phase 3 才考慮統一（可選）。

2. **UI 用 Mth fork**。把 Chat module 加進去，不是重寫 Mth。

3. **Filesystem 寫入所有權**：
   - Chat Server 負責寫 `agents/`、`skills/`、`workspaces/`
   - Cowork Server 負責寫自己的 DB
   - 不交叉寫入

4. **Marketplace = GitHub repo**（參考 meowtieheightgent/companies）。
   - `marketplace/skills/<source>/<slug>/` — 從 git pull，唯讀
   - `skills/<slug>/` — 本地或 fork 下來的，可改
   - Source 由路徑判斷，不是 symlink（已移除 symlink 自動偵測）
   - Sync：A = 手動 + UI badge；B = auto-track（手動確認觸發，backup-and-overwrite）

5. **Agent lineage**：
   - Marketplace template → Chat instance（filesystem copy + `instance_meta.json`）
   - Marketplace template → Cowork instance（DB row，`source_template_id`）
   - 兩邊都指向同一份 marketplace template

6. **HEARTBEAT.md**：Cowork mode 的 system prompt（對應 Chat mode 的 AGENT.md）。兩個不互讀。

---

## 現在的 codebase 狀態

**已完成的（不用再做）：**
- Phase 0.1 Subprocess 斷線復原 ✅
- Phase 0.3 `supports_image` flag（codex 相容性）✅
- Phase 0.4 Protected Paths ✅
- Phase 1 per-agent chat/think mode UI + Scenario 模板 ✅
- Skill source namespace（frontmatter `source:`，`display_name = source:slug`）✅

**Bug 要順手修（待 Phase 2）：**
- `app.py:819` — `--extended-thinking` → `--effort max`（Claude CLI 正確 flag）
- Claude-based agent configs 缺 `supports_thinking: true`
- Gemini think mode = 換 model（無 CLI flag），`supports_thinking: false`

**還沒做：**
- Phase 0.2 History 自動壓縮（Sliding Window）— 獨立功能，不影響新平台開發

---

## Mth 在哪裡

```
$COWORK_SRC/
```

已 clone 在本機。你要 fork 它，把 Chat module 加進去。

**Mth 研究報告：** `docs/mth/`（README 先看）

---

## Phase 1 已完成 ✅

1. Fork Mth repo → Mth UI 已複製到 `ui/` ✅
2. Chat module (ChatPage, SessionSidebar, MessageList, AgentMembers) ✅
3. App.tsx ModeToggle（⌘1 / ⌘2）✅
4. Chat module 接 Python WebSocket :8000 (useWebSocket singleton hook) ✅
5. 環境變數：VITE_CHAT_URL / VITE_COWORK_URL ✅
6. GET /health (Python :8000) ✅
7. Vitest (58 tests) + Playwright e2e (5 tests) ✅

**Phase 2（之後的事）：**
- Marketplace UI（pull / lineage / sync badge）
- Token 追蹤（`--output-format stream-json`）
- Cowork → publish to marketplace

---

## 關鍵文件地圖

| 文件 | 說明 |
|---|---|
| `docs/superpowers/specs/2026-03-20-chat-cowork-platform-design.md` | 完整平台 spec（主要設計決策都在這）|
| `docs/mth/ROADMAP.md` | 功能路線圖（Phase 0-5）|
| `docs/mth/01-overview.md` | Mth 架構概覽 |
| `docs/mth/03-cli-token-tracking.md` | Claude/Gemini/Codex token 追蹤機制 |
| `docs/mth/05-feature-comparison.md` | 功能對比表（你有什麼 / Mth 有什麼）|
| `TODO.md` | 待辦清單（已更新至今天）|
| `app.py` | 現有 Chat backend（Python/FastAPI）|

---

## 不要踩的坑

- **不要 symlink 偵測 source**：已移除，source 只從 frontmatter 讀
- **不要合並兩個後端的 DB**：Chat 用 filesystem，Cowork 用自己的 SQLite
- **不要 auto-push git**：publish to marketplace 是使用者手動操作
- **Mth 的 54 張 DB table 幾乎全是 Cowork 的**：Chat 不需要 DB，別被嚇到
- **Gemini 沒有 thinking CLI flag**：切 model 就好，不要找 flag

---

## 一句話定位

> Chat = Sprint Planning（你說話，agents 幫你想）
> Cowork = Sprint Execution（你下指令，agents 幫你做）
> 同一個 app，兩個模式，共用 agents 和 skills。
