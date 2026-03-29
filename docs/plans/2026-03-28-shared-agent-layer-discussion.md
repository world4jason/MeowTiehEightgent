# Shared Agent Layer — 討論筆記

> 日期：2026-03-28
> 狀態：討論中，尚未決定方案
> 相關專案：Paperclip × MeowTiehEightgent

---

## 背景

### 起因

原本考慮將 Paperclip 後端從 TypeScript 改寫為 Python，以便與 MeowTiehEightgent（Python/FastAPI）合併。經過評估後，發現全面重寫風險太高（54K LOC 後端、59 張 DB 表、247 API endpoints），且之前已有一次 Python 重寫失敗的前例。

轉而聚焦在核心需求：**讓 Agent 系統可以共用** — 同一個 Agent 可以在兩個系統中出現，並且擁有共享的身份、技能和記憶。

### 兩個系統的本質差異

| | **MeowTiehEightgent (Meow)** | **Paperclip** |
|---|---|---|
| 語言 | Python / FastAPI | TypeScript / Express |
| 本質 | Agent 的**對話場** | Agent 的**管理場** |
| DB | 無（JSON 檔案） | PostgreSQL（59 tables） |
| 後端 LOC | ~8.6K | ~54K |
| API Endpoints | 63 | 247 |
| 節奏 | 即時、高頻、互動式 | 任務制、排程、批次 |
| Agent 視角 | 「我在跟人和其他 agent 聊天」 | 「我是員工，在執行任務」 |
| 記憶產出 | 對話摘要、討論結論 | 任務成果、工作日誌 |
| 成長方向 | 更豐富的對話體驗 | 更完整的企業治理 |

### Meow 獨有的有價值功能

- Token 計費追蹤（即時 per-agent, per-session）
- 聊天室主題（Topic-based 對話）
- 多人打斷機制（@mention + 輪替 + 機率靜默）
- Agent 模板 / Marketplace
- Scenario 模板（預設情境 + system prompt + 推薦 agents）
- 歷史壓縮（8K LOC 滑動視窗 + 摘要壓縮）
- 看板注入 Prompt（Kanban 狀態直接進 agent context）
- Skills（SKILL.md 檔案式技能包）
- Daily Memory（每日記憶摘要）
- Thinking Mode（chat/think 模式切換）

### 已確認的前提

| 項目 | 決定 |
|------|------|
| DB | 保留現有 PostgreSQL，不動 |
| Auth | 從新架構中拿掉 |
| 前端 | API contract 保持一致，前端不動 |
| LLM Adapters | 7 個全部搬 |

---

## 需求：Shared Agent Layer

### 核心需求

同一個 Agent 可以在 Meow 和 Paperclip 兩邊出現，共享：

1. **Agent 身份** — 名字、角色、個性、emoji、color
2. **Skills 技能** — 每個 Agent 獨立的技能定義
3. **Memory 記憶** — 跨系統的持久記憶（Meow 對話記憶 + Paperclip 任務記憶）
4. **Agent 模板** — Marketplace 可安裝的 agent template
5. **Scenario 模板** — 預設情境

---

## 方案分析

### 方案 A：獨立微服務

Agent Layer 作為獨立 Python/FastAPI 服務，自己的 port 和 DB，兩邊透過 HTTP API 呼叫。

### 方案 B：嵌入 Meow

Agent Layer 作為 Meow 的模組，Paperclip 透過 API 呼叫 Meow。

### 方案 C 精確版：Meow 透過 Paperclip API

Paperclip 新增 Agent API endpoints，Meow 寫 `PaperclipClient` 透過 HTTP 消費，不直連 DB。

### 方案 C 極簡版：兩邊直連 shared 表

Paperclip PostgreSQL 新增 3 張 `shared_` 前綴表，兩邊直連。

### 方案 D：Git 同步

Agent 定義為檔案資料夾（YAML + JSONL），用 git repo 同步。

### 方案 E（混合）：Git 身份/技能 + DB 記憶

靜態資料（身份、技能、模板）走 Git，動態資料（記憶、Token/Cost）走 PostgreSQL。

---

## 七方分析結果

### 四角色分析

| 角色 | 推薦 | 核心論點 |
|------|------|---------|
| **MLOps 工程師** | A（微服務） | Memory 一致性最好、Adapter 統一管理、可觀測性最強 |
| **AI 工程師** | A（微服務） | 單一 source of truth、記憶分層乾淨、prompt context API |
| **CTO** | C（共享 DB） | 一人團隊維運 3 服務太奢侈、最低風險、可演進到 A |
| **架構師** | C（共享 DB） | Paperclip 外鍵完整性不能斷、PG LISTEN/NOTIFY、遷移成本最低 |

### 三模型分析

| 模型 | 推薦 | 核心論點 |
|------|------|---------|
| **Claude (Sonnet)** | C 精確版 | Meow 不直連 DB，走 Paperclip REST API；API 合約先行，未來可無痛抽成 A；最大風險：記憶語義不相容 |
| **Gemini** | C 極簡版 | 3 張 shared 表、2 天上線；JSONB 彈性欄位；memory append-only 不衝突 |
| **GPT** | D（Git 同步） | 零新 infra；Agent 本質是文字檔；YAML + JSONL + git = 最簡單能活下來的架構 |

### 全員共識

1. ❌ **方案 B 全員反對** — 讓 8.6K LOC 的聊天系統成為 54K LOC 控制平面的上游，方向搞反
2. ❌ **方案 A 當前不適合** — 一人團隊 + AI 維運 3 個服務過重
3. ✅ **先跑起來再優化** — 所有角色/模型都同意漸進式策略
4. ✅ **Paperclip 擁有 schema** — 它是成熟系統，agent 資料的 source of truth 應該在它這邊

---

## 方案終極對比

| | **C 精確版** | **C 極簡版** | **D Git** | **混合** |
|---|---|---|---|---|
| 上線時間 | 1.5-2 週 | 2-3 天 | 1-2 天 | 1 週 |
| 新 infra | 0 | 0 | 0 | 0 |
| Meow 改動量 | 中（HTTP client） | 小（DB client） | 極小 | 小 |
| Paperclip 改動量 | 中（新 API） | 小（3 張表） | 中（讀 git） | 小 |
| 即時性 | ✅ | ✅ | ❌ 延遲 | ✅ 記憶即時 |
| 查詢能力 | ✅ | ✅ | ❌ | ✅ |
| Agent 版本控制 | ❌ | ❌ | ✅ git log | ✅ git log |
| 雙寫風險 | ❌ 無 | ⚠️ 有 | ❌ 無 | ⚠️ memory 有 |
| 系統解耦 | 中 | 低 | 高 | 高 |
| 長期擴展 | → 拆成服務 A | → 拆成服務 A | → 加 DB | 穩定 |
| Meow 掛了影響 Paperclip | ❌ | ❌ | ❌ | ❌ |
| Paperclip 掛了影響 Meow | ⚠️ 是 | ❌ | ❌ | ⚠️ 記憶不可寫 |

### 混合方案的設計原則：靜態走 Git，動態走 DB

| 資料類型 | 變動頻率 | 存放位置 | 理由 |
|----------|----------|----------|------|
| Agent 身份 | 低 | Git | 版本控制有意義，可手動編輯 |
| Skills 定義 | 低 | Git | 本質是 Markdown 文件 |
| Agent Config | 低 | Git（per-system） | 各系統有自己的設定 |
| Memory | **高** | **PostgreSQL** | 需要查詢、聚合、壓縮 |
| Token/Cost | **高** | **PostgreSQL** | 需要 SUM、GROUP BY |
| 模板/Marketplace | 低 | Git | 版本控制，可分享 |

---

## 長期演進預測

兩個系統功能幾乎不重疊，**長期會越走越遠**：
- Meow → 更豐富的對話體驗（多模態、voice、更複雜的對話引擎）
- Paperclip → 更完整的企業治理（合規、審計、更複雜的 workflow）

Shared Agent Layer 的角色是**兩者之間的薄橋樑**，不應該變成一個龐大的第三系統。

### 各方案的長期走向

| 方案 | 6 個月後 | 1 年後 |
|------|---------|--------|
| C 精確版 | Paperclip API 被兩方需求拉扯變臃腫 | 自然演進為獨立服務 A |
| C 極簡版 | schema 同步開始有摩擦 | 考慮抽出 Agent Service |
| D Git | memory 檔案變大，查詢需求增加 | memory 必須進 DB |
| 混合 | 穩定運作 | 可能把身份也進 DB（如需動態建立 agent） |

---

## 設計決策記錄

### 2026-03-29：狀態機不共享

**決定：** Agent 狀態（idle/paused/terminated）各系統自行管理，不放入共享層。

**理由：**
- 兩邊「暫停」的語義不同 — Paperclip 是停止執行任務，Meow 是不參與對話
- 強制同步會導致不合理行為（預算超支 → 聊天室也不能說話？）
- 現實類比：一個人在 A 公司被停職，不代表不能在家跟朋友聊天

**共享層只管：** 身份、Skills、Memory
**各自管理：** Paperclip（status, pauseReason, budget, approval, heartbeat）/ Meow（enabled, participation, turn order）

### 2026-03-29：跨 Agent 共享記憶不需要

**決定：** 不設計跨 Agent 記憶共享機制。每個 Agent 有自己的記憶。

**理由：**
- Agent A 讀 Agent B 的記憶 → 沒有實際場景需要
- 多 Agent 討論的結論 → 是 session 產出物（會議紀錄），不是腦內記憶
- Meow 的歷史壓縮已經處理「對話結論保留」的需求

### 2026-03-29：Pre-compaction memory flush 納入規劃

**決定：** 在 Meow 的歷史壓縮流程中，加入壓縮前的重要事實抽取步驟。

**來源：** OpenClaw 的 pre-compaction memory flush 模式 — 上下文快滿前先靜默寫入結構化事實，再做摘要壓縮。

**現有問題：** Meow 目前直接把溢出對話丟給 LLM 摘要，LLM 不知道哪些是重要事實（決策、deadline、action items），壓縮後容易丟失關鍵資訊。

**改進流程：**
```
對話進行中 → 接近壓縮閾值
  → Step 1: 呼叫 LLM 抽取重要事實（decisions, action items, key facts）
  → Step 2: 寫入 agent 的 daily memory（Meow 已有 append_memory 機制）
  → Step 3: 正常壓縮剩餘對話
```

**好處：**
- 結構化事實不會被摘要稀釋
- 自然銜接到共享 agent memory — 抽取出的事實就是寫入 memory 的最佳時機
- Meow 已有 `append_memory()` 和 `compress_history()`，改動不大

**實作位置：** `MeowTiehEightgent/history_manager.py` 的 `compress_history()` 前插入 fact extraction 步驟

---

## 待決定

- [ ] 選定方案（C 精確版 / C 極簡版 / D Git / 混合）
- [ ] Agent Memory 的 schema 設計（Meow 的對話記憶 vs Paperclip 的任務記憶語義是否相容）
- [ ] 先做哪一步（Agent CRUD → Skills → Memory → 模板）
- [ ] 是否需要畫更詳細的架構圖
- [ ] Pre-compaction fact extraction 的 prompt 設計與觸發閾值

---

## 關鍵教訓（來自分析過程）

1. **不要全面重寫** — 54K LOC + 59 張表的系統重寫風險極高，上次已經失敗過一次
2. **讓強系統承擔核心職責** — Paperclip 擁有 DB 和成熟 schema，應該是 agent 資料的 source of truth
3. **最好的架構是你能維護的架構** — 一人團隊 + AI，簡單比優雅重要
4. **先跑起來再說** — 任何方案都可以漸進演進，不需要一步到位
