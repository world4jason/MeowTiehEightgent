# 開發路線圖（整合 Mth 研究）

> 日期：2026-03-20
> 來源：TODO.md + MassGen 研究 + Mth 深度研究
> 原始版本：docs/plans/2026-03-20-roadmap.md

---

## 大方向定位

```
你的專案  ≈  Sprint Planning Meeting
  ├── 人類 = Product Owner（帶著需求進來）
  ├── Agents = Dev Team（討論、估算、拆分、提問）
  └── 輸出 = Sprint Backlog（可執行的任務清單）

未來的實作層  ≈  Sprint Execution
  └── Agents 實際把 backlog 裡的票做掉（Mth 的領域）
```

---

## 已完成

- [x] 聊天室 add-agent / remove-agent 指令
- [x] `@AgentName` 提及功能（插隊優先回答）
- [x] 多人對話隨機 pass（人數少時強制輪）
- [x] Workspace 長期情境（config、files、session 歸屬、context injection）
- [x] WebSocket 自動重連
- [x] Session pagination
- [x] Session 圖片 lightbox
- [x] WebSocket rate limit
- [x] Session 重命名
- [x] Agent 發言統計
- [x] 圖片附件 Vision
- [x] Streaming 輸出
- [x] Session 搜尋
- [x] Message 複製按鈕
- [x] Export（Markdown / JSON / PDF）
- [x] Client-side message queue
- [x] Model variant 選擇
- [x] @filename 注入 workspace 文件全文

---

## Phase 0.x — 基礎穩定（已有詳細實作計畫）

> 文件：`docs/plans/2026-03-18-phase0.1-subprocess-recovery.md` 等

- [ ] Phase 0.1：Subprocess 斷線復原（Partial Recovery）
- [ ] Phase 0.2：History 自動壓縮（Sliding Window → Summarization）
- [ ] Phase 0.3：圖片 --add-file 相容性（`supports_image` flag）
- [ ] Phase 0.4：Protected Paths（Workspace 寫入保護）

---

## Phase 1 — Agent 個體控制（已有詳細實作計畫）

> 文件：`docs/plans/2026-03-19-phase1-agent-control.md`

- [ ] Agent chat / think 模式切換（per-agent + 全場）
- [ ] Scenario 模板（辯論、brainstorm、創作…）

---

## Phase 2 — Cowork Patterns（已有詳細實作計畫）

> 文件：`docs/plans/2026-03-19-phase2-cowork-patterns.md`

- [ ] 2.3 Session status.json（機器可讀狀態）
- [ ] 2.2 Substantive Gate（增量漂移偵測，防無限迴圈）
- [ ] 2.1 Arbiter（品質評審 subprocess）
- [ ] 2.4 Blackboard（結構化共享狀態 header）

---

## Phase 3 — Mth 啟發：討論室強化

### 3.1 Token / 成本追蹤 ★★★

**實作方式：加 `--output-format stream-json` flag，parse JSONL output**
詳細機制見：`docs/paperclip/03-cli-token-tracking.md`

- [ ] Claude：加 `--output-format stream-json`，parse `result` event 的 usage
- [ ] Gemini：加 `--output-format stream-json`，累加所有 event 的 usage
- [ ] Codex：加 `exec --json`，parse `turn.completed` event 的 usage
- [ ] Session 結束後顯示 token summary（per-agent + 總計 + 估算費用）
- [ ] Members panel 顯示 per-agent 累計用量
- [ ] 注意：加了 stream-json 後，streaming 顯示要從 `type=assistant` event 取文字

**為什麼現在做：** 搭配 Phase 1 的 model 切換，要能看到省了多少。

---

### 3.2 Agent Task Session 持久化 ★★★

**Mth 的做法：** 把 Claude 的 `session_id`（或 Gemini 的 `checkpoint_id`）存到 DB，下次 heartbeat 帶 `--resume <session_id>` 呼叫，直接接續上次的對話。

**你可以做的版本：**
- [ ] `run_agent()` parse CLI JSON output 的 session_id
- [ ] 存到 `agents/<name>/session_state.json`（per-workspace）
- [ ] 下次呼叫同一個 agent + 同一個 session 時，帶 `--resume` 繼續
- [ ] 好處：省去重新建立 context 的 token 消耗，agent「記得」上次說了什麼

---

### 3.3 Pipeline Cowork Pattern ★★☆

- [ ] Subprocess 間 JSON 交接：`{ stage, output, status: "ok" | "failed" }`
- [ ] Orchestrator 收到 `failed` 立即停止
- [ ] 鏈長控制在 5 以內
- [ ] 每個 stage 結束是天然的 human interrupt 插入點
- [ ] UI：Pipeline 進度顯示（Stage 1 ✓ → Stage 2 ⟳ → Stage 3 …）

---

### 3.4 Quality Gate（Success Contract）★★☆

- [ ] Agent 輸出末尾標記 `STATUS: done | needs_revision | blocked`
- [ ] Orchestrator 讀 STATUS 決定是否繼續
- [ ] Session 完成後自動存 summary badge
- [ ] 僅在任務型 session 啟用

---

### 3.5 Changedoc / 決策追蹤 ★☆☆

- [ ] Agent 輸出末尾加可選的 `[RATIONALE]: ...` 區塊
- [ ] Orchestrator 解析並貼入下輪 prompt header
- [ ] 可折疊的「理由」UI 卡片

---

### 3.6 跨 Session 向量記憶（Memory MCP）探索中

- [ ] 評估：embedding + 本地向量庫（chromadb / faiss）的成本與延遲
- [ ] 新 session 開始時，語意搜尋過去相關對話，自動注入 context

---

## Phase 4 — UI 機制借鑑

> 詳細設計見：`docs/paperclip/04-ui-design.md`

### 4.1 Token Summary UI ★★★

- [ ] Session header 旁顯示 token summary badge（完成後）
- [ ] Members panel 顯示 per-agent 用量
- [ ] Agent 思考中：`Claude is thinking...` 狀態文字

### 4.2 Kanban 任務看板（輕量版）★★★

- [ ] Workspace 頁加「Tasks」分頁
- [ ] 每條訊息旁加「📌 建立任務」icon
- [ ] Task list view：待辦 / 進行中 / 完成
- [ ] Task 可連結到來源 session

### 4.3 Dashboard ★★☆

- [ ] 首頁加 Dashboard 分頁（或強化 Workspace 首頁）
- [ ] 顯示：總 session 數、總 token 數、估算費用、最活躍 agent
- [ ] Bar chart：各 agent 發言比例（搭配已有的發言統計）

### 4.4 Approval Center UI ★★☆

- [ ] Arbiter 回傳 `needs_human` 時，chat 顯示審批卡片
- [ ] 卡片：建議行動 + 理由 + 繼續 / 修改 / 停止

### 4.5 Activity Feed ★☆☆

- [ ] Sidebar session 進行中動畫
- [ ] Session 完成後顯示 token badge

### 4.6 Agent Config 版本控制 ★☆☆

- [ ] AGENT.md 編輯前自動備份到 `agents/<name>/history/<timestamp>/`
- [ ] 設定頁加「還原上一版」按鈕

---

## Phase 5 — 從討論到實作的橋接層

> 這是最大的架構轉變。如果你決定從「討論室」擴展到「實作工作台」。
> Mth 走的這條路，你選擇性借鑑。

### 5.1 「建立任務」功能 ★★★（橋接入口）

這是讓討論和實作連接的第一步，也是最關鍵的。

- [ ] 每條 agent 訊息旁加「建立任務」icon
- [ ] 點擊 → 側邊面板，預填 title + 連結到 session
- [ ] Task 存到 workspace 的 `tasks.json`
- [ ] 可指定「負責 agent」

---

### 5.2 Heartbeat 任務執行模式 ★★★

**Mth 的核心機制。** 讓 agent 真的去「做事」。

- [ ] 任務型 session：agent 收到任務 → 執行 → 回報結果
- [ ] Context payload：`{ task_id, description, acceptance_criteria, prior_attempts }`
- [ ] Agent 輸出：`{ status, output, blockers }`
- [ ] Orchestrator 讀結果：完成 / 重試 / 升級到 human
- [ ] requestDepth 計數（防止無限自我委派，借鑑 Mth）
- [ ] max_attempts 硬停

---

### 5.3 多層 Model 路由（Task-Tiered）★★☆

- [ ] Agent config 加 `model_tiers: { default, thinking, arbiter }`
- [ ] 簡單判斷 / Arbiter verdict → haiku / gemini-flash（便宜）
- [ ] 核心推理 / 創作 → opus / sonnet（貴）
- [ ] 與 Phase 1 的 chat/think 模式正交

---

### 5.4 直接 API 支援 ★★★（長期基礎設施）

- [ ] 評估 Anthropic SDK 作為 claude CLI 的 fallback
- [ ] LLMBackend 抽象層：`CLIBackend` / `APIBackend`
- [ ] API 模式下可做真正的平行 streaming

---

### 5.5 Swarm / Selector Pattern ★★☆

- [ ] Selector LLM：只傳最近 3-5 則 + agent descriptions
- [ ] 最後一行輸出 `HANDOFF: agent_name`
- [ ] 保留 probabilistic silence 作為 fallback
- [ ] Agent description 是 routing 關鍵

---

## 實作順序建議

```
現在進行中
  Phase 0.x（穩定性）
  Phase 1（Agent 個體控制）
  Phase 2（Cowork Patterns）

Phase 1-2 完成後，立刻做
  Phase 3.1（Token 追蹤）    ← CLI flag 改動小，效益大
  Phase 3.2（Session 持久化）← 省 token，改動也小
  Phase 4.1（Token UI）      ← 搭配 3.1

討論功能成熟後
  Phase 4.2（Kanban / 任務建立）← 橋接討論與實作
  Phase 4.3（Dashboard）
  Phase 3.3（Pipeline Pattern）

決定要做實作功能後
  Phase 5.1（建立任務）      ← 最重要的入口
  Phase 5.2（Heartbeat 執行）← 核心架構改變
  Phase 5.4（直接 API）      ← 基礎設施現代化
  Phase 5.3（Model 路由）
  Phase 5.5（Swarm Selector）

探索中（需要評估）
  Phase 3.5（向量記憶）
  Telegram 整合
  Fairness Gate（平行架構才需要）
```

---

## 技術負債

- [ ] `app.py` 超過 1000 行，考慮拆 `orchestrator.py` / `agent_runner.py`
- [ ] `test_api.py` 在 Phase 2 後全面 review，確保 fixture 覆蓋新功能
- [ ] 加了 `--output-format stream-json` 後，streaming 顯示邏輯需對應調整
