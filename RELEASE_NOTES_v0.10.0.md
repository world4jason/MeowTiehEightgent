# v0.10.0 Release Notes

**Release Date:** 2026-03-25

MeowTiehEightgent v0.10.0 — Agent as Human: 讓 agent 從工具變隊友。

---

## Highlights

### Python Backend 正式退役

app.py 和所有 Python 檔案已移除。Node.js 是唯一 backend。`pnpm dev:server` 是唯一啟動方式。

### Event Bus — Chat ↔ Cowork 橋樑

Session-scoped typed EventEmitter 連接 Chat WS 和 Cowork routes。事件類型：
- `agent:status` — agent 狀態變更（idle/chatting/working）
- `cowork:update` — issue 建立/完成通知
- `session:control` — pause/resume/redirect/set_goal
- `agent:intent` — Chat → Cowork 意圖派發

### Pause/Resume/Redirect — 即時控制

- **Pause**: 同步處理（bypass event queue），AbortController 立即 kill agent subprocess
- **Resume**: 透過 `ConversationEngine.onMention()` 把 agent 排到下一輪
- **Redirect**: 暫停後注入新指令，agent 按新方向繼續
- Partial output 保存為 `[TRUNCATED]`，下一輪自動帶 continuation hint

### Room Goal — 討論聚焦

- Per-session 目標，存在 `session_config.json`
- 自動注入 agent prompt（`[當前目標] ...`）
- UI: 頂部 sticky bar，點擊編輯

### SUGGEST_ISSUE — Agent 主動建議開 Issue

- Prompt injection：agent 偵測到 task/bug 時輸出 `[SUGGEST_ISSUE: title]`
- UI: message hover 出現「建立 Issue」按鈕，自動 pre-fill title

### Intent Router — Chat → Cowork Issue 建立

- Chat 裡確認 → WS 發送 intent → intent-router → Cowork API
- Dynamic company resolution（啟動時從 Cowork API 取得）
- Error handling：失敗回傳 system message，不影響 Chat

### Cowork → Chat 通知

- Issue 完成（status → done/cancelled）自動通知所有 Chat sessions
- Session-scoped filtering 避免跨 session leak

### UI 新元件

- **AgentControlBar**: Pause/Resume/Redirect per agent（底部 bar）
- **RoomGoalBar**: 討論目標 sticky bar（頂部）
- **IssueCard**: 建立/確認 inline card
- **ActivityFeed**: Agent 狀態 right sidebar
- **Message hover button**: 「建立 Issue」on agent messages

---

## Test Coverage

| Suite | Tests |
|-------|-------|
| Server (chat + __tests__) | 515 |
| UI chat tests | 183 |
| **Total** | **698 tests, 0 failures** |

### E2E WS Protocol Verification

| Feature | Status |
|---------|--------|
| WS connection + session | PASS |
| Room Goal (set_goal) | PASS |
| Agent streaming | PASS |
| Pause (instant kill) | PASS — SIGTERM code 143 |
| Resume (re-stream) | PASS |
| Issue Intent | PASS — correct error when no company |
| Cowork → Chat bridge | PASS (code verified) |

---

## Architecture (v0.10.0)

```
React UI (:5173)
  │
  ├── /chat/api/*  ──→ Vite proxy ──→ Node.js Server (:3100)
  │                                    ├── Chat REST routes
  │                                    ├── /chat/ws (WebSocket)
  │                                    │   ├── ConversationEngine (turn-taking)
  │                                    │   ├── Pause/Resume (sync, bypass queue)
  │                                    │   ├── Room Goal (session_config.json)
  │                                    │   └── Intent Router → Cowork API
  │                                    ├── Event Bus (session-scoped)
  │                                    ├── Cowork routes (/api/*)
  │                                    │   └── Issue PATCH → emit cowork:update
  │                                    ├── PostgreSQL (runtime data)
  │                                    └── agents/ (file-based config)
  │
  └── /api/*  ──→ Vite proxy ──→ same server
```

---

## Commits (10)

```
d7599f3d chore: retire Python backend
fa21c0fd feat: add typed event bus (session-scoped) and extend WS message types
5b02f1ef feat: add AbortSignal support to streamCliAgent
55623c73 feat: sync pause/resume/redirect in Chat WS
d60642df feat: room goal + SUGGEST_ISSUE prompt injection
0c44025a feat: intent router — Chat→Cowork issue creation
7ffc4453 feat: bridge Cowork issue completion → Chat WS via event bus
8bafbd24 feat(ui): add AgentControlBar, RoomGoalBar, IssueCard + hover button
af75b568 feat(ui): activity feed + consolidated ChatPage wiring
9e33b611 docs: v0.10.0 implementation plan
```

---

## Deferred to v0.10.1

- [ ] JSONL export — daily cron, DB → file backup
- [ ] File watcher — chokidar, config → instant DB sync
- [ ] Cowork project mapping — Chat session ↔ Cowork project auto-binding
- [ ] RPG 招募體驗 — agent marketplace 的「招募」UX

## Design Reference

- Design spec: `~/.gstack/projects/world4jason-MeowTiehEightgent/jasonyeh-main-design-20260325-132205.md`
- Implementation plan: `docs/superpowers/plans/2026-03-25-v0.10.0-agent-as-human.md`
- Office hours: 3-model review (Codex GPT-5.4 + Claude Sonnet + Claude Haiku)
- Plan review: 3-stakeholder review (CEO + CTO + Plan Reviewer)
