# 比較報告：Paperclip vs Agent CLI Conversation

> https://github.com/paperclipai/paperclip
> 撰寫時間：2026-03-20

---

## Paperclip 是什麼

**定位：AI 公司的操控平台（orchestration control plane）**

Paperclip 讓你用 AI agents 組建並運營一整家公司。它不是聊天工具，不是 agent 框架，不是 workflow builder。

它解決的問題：當你有 20+ 個 AI coding agents 同時在跑，你面臨的不是技術問題，而是管理問題——沒有組織結構、沒有預算控制、沒有任務追蹤、沒有治理機制。Paperclip 給這一切加上公司層級的基礎設施。

Tagline：*"If OpenClaw is an employee, Paperclip is the company."*

30k stars、4.1k forks（2026-03-20）。

### Tech Stack

| 項目 | 技術 |
|------|------|
| 語言 | TypeScript (96.3%) |
| 後端框架 | Hono（明確選 REST，不用 tRPC）|
| 前端 | React + Vite |
| 資料庫 | PostgreSQL / PGlite（dev 嵌入式）|
| ORM | Drizzle ORM |
| 認證 | Better Auth |
| 即時通訊 | WebSocket（run output streaming）|
| 包管理 | pnpm 9.15+ / Node 20+ |

Database schema 共 54 個 table，涵蓋 agents、任務、預算、成本事件、審批、plugin 系統等。

### 核心設計原則

1. **不干涉 agent 執行** — Paperclip 只協調，agents 愛在哪跑就在哪跑
2. **公司是最小組織單位** — 所有資源（agent、任務、預算、secret）company-scoped 嚴格隔離
3. **任務是唯一溝通媒介** — 沒有 chat、沒有 DM；所有協調都透過 task 創建和評論（可審計）
4. **所有工作都追溯到目標** — Initiative → Project → Milestone → Issue → Sub-issue
5. **Board 永遠保有治理控制** — 人類永遠有控制面板，不會被鎖出去
6. **透明而非靜默自動化** — 卡住的任務顯示在儀表板，Paperclip 不會悄悄自動重分配

### 核心機制

**Heartbeat 協議**

Paperclip 控制 *何時* 和 *如何* 喚醒 agents，agents 不主動 poll。Context payload 分兩種：
- `fat`：完整任務 + 預算 + 評論（傳給 agent）
- `thin`：只有 ID + callback URL

**原子任務 Checkout**

SQL 層面保證同一時間只有一個 agent 能持有一個 issue（`409` conflict），防止雙重處理。

**預算硬停機制**

每 agent 有月度預算：80% 觸發軟警告，100% 硬停——新 checkout 和調用全部被阻塞，agent 自動暫停。

**跨團隊成本歸因**

Agent A 委派給 Agent B 時，成本算到 A 的預算，不是 B 的。

---

## 與你的專案比較

### 根本設計差異

| 面向 | Paperclip | 你的專案 |
|------|-----------|---------|
| 核心模型 | 公司組織：org chart、任務委派、預算治理 | 討論室：agents 自由輪流說話，human 隨時介入 |
| 人類的角色 | 董事會（Board）——審批、治理、預算控制 | 主持人——引導話題方向，隨時打斷 |
| 時間維度 | 異步任務（heartbeat 喚醒，可跨天、跨週）| 即時對話（WebSocket，同步進行）|
| 溝通方式 | 任務創建 + 評論（異步委派）| 即時輪流發言（同步討論）|
| Agent 目標 | 完成工作（寫程式、做分析、產報告）| 探索話題（腦力激盪、辯論、創作）|
| 使用者 | 想讓 AI 幫你做事的人 | 想讓 AI 幫你思考的人 |

兩者是**互補的**，不是競品。Paperclip 是「AI 員工」，你的專案是「AI 思想者」。

### Paperclip 有、你沒有

| 功能 | 說明 | 對你的借鑑價值 |
|------|------|--------------|
| **Heartbeat / 任務調度** | 定時或事件觸發喚醒 agent | ★★★ 若從討論變實作，這是核心機制 |
| **預算控制** | per-agent 月度預算，100% 硬停 | ★★☆ 可借鑑用於限制 agent 的 token 消耗 |
| **原子任務 Checkout** | 防止兩個 agent 同時做同一件事 | ★★☆ 若有 pipeline pattern，防重複執行 |
| **Config 版本控制** | adapter config 有 revision history | ★☆☆ 有 agent AGENT.md 版本控制的概念 |
| **Org chart（層級結構）** | CEO → 部門主管 → 執行 agent | ★★★ Hierarchical orchestration 的完整實作 |
| **Secret 管理** | 引用而非 inline，log 中自動 redact | ★☆☆ 安全性借鑑 |
| **Cost tracking（每輪）** | 記錄每次 invocation 的 tokens 和金額 | ★★☆ 可加到你的 session stats |
| **Plugin 系統** | lifecycle hooks、event bus、UI injection | ★★☆ 你的 skills 系統的延伸方向 |
| **ClipHub（模板市集）** | 公司模板分享，export 時 scrub secrets | ★★★ 你已有 marketplace，這是進化版 |

### 你有、Paperclip 沒有

| 功能 | 說明 |
|------|------|
| **即時自由對話** | Agent 沒有任務，就是在討論，不需終點 |
| **Human-as-moderator** | 主持人隨時打斷、導向，對話方向由人引導 |
| **Agent 個性（三層 md）** | AGENT.md + IDENTITY.md + SOUL.md，有「靈魂」的角色 |
| **跨 model 支援（CLI 無關）** | Claude、Gemini、Ollama 混在同一個討論室 |
| **Skills 注入語法** | 對話中途 `/skill` 改變當下所有 agent 的行為 |
| **即時 Streaming** | 逐字打字，對話感更強 |
| **Session 搜尋 / Export** | Markdown / JSON / PDF |

---

## 適合你的改進方向

以下依「你現有 TODO 的脈絡」+ 「從 Paperclip 學到的」整合出建議。

### 短期：向 Paperclip 借鑑的具體功能

#### 1. Token / 成本追蹤（Cost Tracking）

Paperclip 對每次 invocation 記錄 tokens + 金額，累計到 per-agent 預算。

你可以做輕量版：
- 每輪 agent 回應後，從 CLI 輸出解析 token usage（claude/gemini CLI 有時會輸出）
- 或用字元數估算（1 token ≈ 4 chars）
- Session 結束後在 sidebar 顯示總 token 數 + 預估費用
- 可搭配你 TODO 裡的「多層 Model 路由」——貴的 model 用在真正需要的地方

#### 2. Agent 執行狀態 JSON（status.json）

你 TODO 裡有這個 item，Paperclip 的做法驗證了這個需求：
- 每輪更新 `history/<session_id>/status.json`
- 包含：`phase`（誰在說話）、`agents`（per-agent 狀態）、`round`
- 讓外部監控或 automation 可以讀取

#### 3. Heartbeat 概念 → 任務型 Session

Paperclip 的 heartbeat 協議可以啟發「任務型 session」的設計：
- 現在：開啟討論，agents 輪流說話直到你停
- 可以加：「任務模式」—— agent 完成特定任務後自動停止（對應你 TODO 的 Quality Gate）
- Agent 輸出 `STATUS: done | needs_revision | blocked`，orchestrator 讀取決定是否繼續

---

### 中長期：如果你要從「討論」轉向「實作」

這是更大的架構轉變。Paperclip 走的這條路，你可以選擇性借鑑。

#### 方向 A：在現有討論室上加「實作模式」

不需要從頭做 Paperclip，而是在你的架構上加一個「任務執行層」：

```
現況：
  討論室（Human + Agents 即時對話）

加上：
  任務看板（類似 Paperclip 的 issue tracker）
  ├── 討論室可以「建立任務」（把討論結論轉成待辦）
  ├── 任務分配給 agent（呼叫 CLI 執行）
  └── 執行結果回報到討論室
```

這樣討論和實作就能在同一個介面裡流動，你的專案變成「從討論到執行的完整工作台」。

#### 方向 B：Cowork Pattern → Pipeline 實作

你 TODO 裡的 Pipeline pattern 其實就是 Paperclip 的任務鏈：
- Stage A → Stage B → Stage C，JSON 交接
- 失敗時立即停止
- 每個 stage 結束是天然的 human interrupt 點

Paperclip 的 `blocks / blocked_by` issue relation 是這個機制的成熟版本，可以借鑑。

#### 方向 C：Agent Org Chart（層級 orchestration）

Paperclip 的 org chart 對應你 TODO 的「Swarm / Selector」：
- 不需要完整的 CEO → Manager → Worker 層級
- 可以做輕量版：一個 orchestrator agent，根據任務類型把工作分派給專門 agent
- 這比目前的 round-robin 更有效率，特別是任務明確時

#### 方向 D：Secret / Config 安全化

如果你加了「任務執行模式」，agents 可能需要存取 API keys、資料庫連線等。Paperclip 的做法：
- 用 `company_secrets` 表儲存，config 只引用 key name
- Log 中自動 redact
- 你目前的 `config.json` 是 gitignored，但若加 secret 管理，應做同樣的隔離

---

## 結論

Paperclip 和你的專案**目前沒有重疊**，但如果你要從「討論」轉向「實作」，Paperclip 就是最直接的參考對象。

它最有價值的設計思路（依對你的優先度排序）：

1. **任務作為唯一溝通媒介** — 讓討論結論可追蹤、可執行
2. **Heartbeat 協議** — 定義 agent 如何被呼叫、何時停止、如何恢復
3. **Stage-based pipeline** — 對應你的 Pipeline cowork pattern，有成熟實作可參考
4. **成本追蹤** — 每輪記錄 token，控制無謂消耗
5. **Status JSON** — 機器可讀的 session 狀態，讓外部工具可以接入

最近期可做的：先在討論室裡加「建立任務」功能，把好的討論結論一鍵轉成 issue，開始建立你的任務管理層。
