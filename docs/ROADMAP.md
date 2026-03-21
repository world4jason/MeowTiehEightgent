# 開發路線圖

> 更新日期：2026-03-18
> 依據：TODO.md + MassGen 競品研究 + 現有功能盤點

---

## 現有功能（已完成）

- 聊天室 add/remove agent、@mention 插隊路由
- 多人對話 round-robin + 隨機 pass + 打斷機制
- Workspace 長期情境（config、files、context injection、settings UI）
- WebSocket 自動重連、rate limit
- Session pagination、搜尋、重命名
- Agent 發言統計、圖片附件 Vision
- Streaming 輸出、Message 複製
- Export（Markdown / JSON / PDF）
- Client-side message queue（Cursor-style）
- Model variant 選擇（--model flag per agent）
- @filename 注入 workspace 文件全文

---

## Phase 0 — 可靠性補強

**目標**：把現有系統的脆弱點補好，再往上堆功能。

| # | 項目 | 說明 |
|---|------|------|
| 0.1 | **Subprocess 斷線復原** | 失敗時顯示錯誤 + 自動 skip 該 agent；進階：截斷並標 `[truncated]` 保留已輸出部分 |
| 0.2 | **History Condensing Phase 1（Sliding Window）** | 保留最近 N 輪，超出閾值丟棄舊訊息，先止血 |
| 0.3 | **圖片 --add-file 相容性** | agent config 加 `supports_image: bool`，不支援的 agent 不傳 |
| 0.4 | **Protected Paths** | workspace files API 加路徑白名單，防 agent 覆寫 guide.md / user config |

---

## Phase 1 — Agent 個體控制

**目標**：讓單個 agent 的行為更可控，與後續 Cowork Pattern 正交組合。

| # | 項目 | 說明 |
|---|------|------|
| 1.1 | **Agent 發言傾向（chat / think）** | prompt 注入「回答限 2-3 句」；`--extended-thinking` 切換；`/think` 全場切換；config 加 `supports_thinking: bool` |
| 1.2 | **Scenario 短期情境模板** | welcome screen 三選項（workspace / scenario / 空白）；scenario 自動填 system prompt + 建議 agents |

---

## Phase 2 — Cowork Pattern 核心

**目標**：引入結構化多 agent 協作，讓討論有品質保障。

| # | 項目 | 說明 |
|---|------|------|
| 2.1 | **Arbiter 仲裁者** | 每 N 輪 invoke arbiter subprocess；輸出 `{verdict, feedback}` JSON；硬限 3 輪修訂；用便宜 model（haiku）|
| 2.2 | **Substantive Gate** | 把輸出變動分 Structural / Transformative / Incremental；連續 Incremental → 標記 `decision_space_exhausted` 強制終止 |
| 2.3 | **Session 機器可讀狀態（status.json）** | 每輪更新 phase / agents / vote_distribution；WebSocket 廣播；供外部監控 |
| 2.4 | **Blackboard 結構化 header** | history 開頭加 `[SHARED STATE] current_plan / key_decisions / open_questions`；Orchestrator 讀 header 決定下輪 agent |

---

## Phase 3 — 進階品質控制

**目標**：任務型 session 的完成條件與決策溯源。

| # | 項目 | 說明 |
|---|------|------|
| 3.1 | **Quality Gate（Success Contract）** | agent 輸出標記 `STATUS: done / needs_revision / blocked`；Orchestrator 讀 STATUS 決定是否結束或路由 human |
| 3.2 | **Changedoc / 決策追蹤** | agent 輸出末尾加可選 `[RATIONALE]: ...` 區塊；Orchestrator 解析並貼入下輪 prompt header |
| 3.3 | **多層 Model 路由** | agent config 加 `model_tiers: {default, thinking, arbiter}`；Arbiter 用 haiku，核心推理用 opus/sonnet |
| 3.4 | **History Condensing Phase 2（Summarization）** | 超出閾值用輕量 model 壓縮舊段落為摘要，插在 history 開頭 |
| 3.5 | **Pipeline 模式** | subprocess 間 JSON 交接 `{stage, output, status}`；Orchestrator 收到 failed 立即停止；鏈長控制在 5 以內 |

---

## Phase 4 — 架構升級

**目標**：更靈活的 agent 路由，降低 CLI 依賴。

| # | 項目 | 說明 |
|---|------|------|
| 4.1 | **Swarm / Selector 模式** | 最後一行輸出 `HANDOFF: agent_name`；Selector LLM 只傳最近 3-5 則 + agent descriptions；保留 probabilistic silence 作 fallback |
| 4.2 | **Inject-and-Continue** | agent A 輸出後立即更新 shared history，B 在同輪可讀到（目前需等整輪結束） |
| 4.3 | **直接 API 支援（Anthropic / OpenAI）** | 參考 MassGen LLMBackend 架構；先從 Anthropic SDK 開始，作為 claude CLI 的 fallback |
| 4.4 | **Fairness Gate** | 有直接 API 後，強制等所有 model 完成輸出再進下一輪（防速度快的小 model 主導） |

---

## Phase 5 — 探索 / 長期

**目標**：探索性功能，需先評估技術可行性與成本。

| # | 項目 | 說明 |
|---|------|------|
| 5.1 | **跨 Session 向量記憶（Memory MCP）** | embedding + 本地向量庫（chromadb / faiss）；新 session 自動查詢語意相似過去片段注入 context |
| 5.2 | **Telegram 整合** | Bot token 管理 + message relay 到 WebSocket session |
| 5.3 | **Marketplace 開放投稿** | 讓社群貢獻 agent 模板（基礎架構已有） |
| 5.4 | **Mobile / PWA** | 對標 LibreChat 多裝置支援 |

---

## 設計原則

1. **Phase 間正交**：Agent 發言傾向（Phase 1）與 Cowork Pattern（Phase 2）可任意組合
2. **先止血再加功能**：Phase 0 補強可靠性，再往上堆複雜度
3. **無限迴圈防護**：所有 Cowork Pattern 共用 max round count + Substantive Gate
4. **便宜 model 做決策**：Arbiter / Selector 用 haiku，核心推理用高性能 model
5. **Human interrupt 點**：Pipeline / Arbiter 天然是人類介入的好時機

---

## 優先序依據

| 因素 | 說明 |
|------|------|
| 競品差距 | Streaming（已完成）、直接 API（Phase 4）是最大差距 |
| 使用者體驗 | Arbiter + Substantive Gate 讓多 agent 討論不再失控 |
| 技術風險 | Vector Memory 需評估 embedding 成本，放 Phase 5 |
| 可靠性優先 | 斷線復原、History Condensing 是使用者最先碰到的痛點 |
