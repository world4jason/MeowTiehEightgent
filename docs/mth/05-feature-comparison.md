# 完整功能對比表

> 你的專案 vs Mth
> 評分：★★★ 高借鑑價值 / ★★☆ 中 / ★☆☆ 低 / — 不適用

---

## 核心定位

| 面向 | 你的專案 | Mth |
|---|---|---|
| **核心模型** | 討論室：agents 即時輪流說話 | 公司：agents 異步執行任務 |
| **時間維度** | 同步（秒級）| 異步（分鐘到天）|
| **人類角色** | 主持人（引導討論）| 董事會（審批、治理）|
| **Agent 關係** | 平等的討論參與者 | org chart 樹狀層級 |
| **主要產出** | 對話紀錄、集體決策 | 完成的任務、程式碼、文件 |
| **使用者** | 想讓 AI 幫你**思考**的人 | 想讓 AI 幫你**做事**的人 |

---

## Agent 設計

| 功能 | 你的專案 | Mth | 借鑑價值 |
|---|---|---|---|
| Agent 個性定義 | AGENT.md + IDENTITY.md + SOUL.md | adapterConfig 裡的 instructions | — 你的更豐富 |
| Org chart / 層級 | 無（扁平）| `reportsTo` 樹狀結構 | ★★★ 轉向實作後需要 |
| Agent 狀態追蹤 | 無 | idle/running/paused/terminated/pending_approval | ★★☆ |
| Config 版本控制 | 無（直接改 AGENT.md）| `agent_config_revisions` 可回滾 | ★☆☆ |
| CLI Session 持久化 | 無（每次重啟）| session_id 存 DB，下次 resume | ★★★ 省大量重新建立 context 的成本 |
| Agent 預算控制 | 無 | per-agent 月度預算，100% 硬停 | ★★☆ |
| Agent 權限控制 | 無 | 細粒度 permissions JSON | ★☆☆ |
| 跨 model 混搭 | 可以（同一討論室）| 不行（一個 agent 一個 adapter）| — 你的更靈活 |
| Agent Marketplace | 有（marketplace/）| ClipHub（公司模板）| 兩者方向不同 |

---

## 任務 / Session 管理

| 功能 | 你的專案 | Mth | 借鑑價值 |
|---|---|---|---|
| 任務層級 | 無（扁平 session）| Goal → Project → Issue → Sub-issue | ★★★ |
| 任務狀態機 | 無 | Triage/Backlog/Unstarted/Started/Done/Cancelled | ★★★ |
| 任務優先級 | 無 | urgent/high/medium/low | ★☆☆ |
| 任務指派 | 無 | assigneeAgentId + 原子 checkout | ★★★ |
| 子任務（無限巢狀）| 無 | parentId 自引用 | ★★☆ |
| 委派深度限制 | 無 | requestDepth 計數防止無限委派 | ★★☆ |
| 任務 Labels | 無 | 有 | ★☆☆ |
| 任務 Comments | 無（session 內直接對話）| 獨立的 issue_comments 表 | ★★☆ |
| 任務 Work Products | 無 | 產出物連結到 issue | ★★☆ |
| 任務 Attachments | 有（session 內圖片）| issue_attachments | — 類似 |
| 即時同步對話 | 有 | 無（異步）| — 你的核心 |
| Session 搜尋 | 有 | 無（靠 Issues 管理）| — |
| Session Export | 有（Markdown/JSON/PDF）| 無 | — |

---

## 工作環境（Workspace）

| 功能 | 你的專案 | Mth | 借鑑價值 |
|---|---|---|---|
| 長期 Context 容器 | 有（Workspace + files/）| Project + Project Workspace | 相似 |
| 共享文件注入 | 有（@filename）| 有（context injection）| 相似 |
| Per-issue 隔離環境 | 無 | Execution Workspace（獨立 git branch）| ★★★ 實作任務時必要 |
| Git 整合 | 無 | 完整（branch、PR、repo）| ★★★ 若做實作層需要 |
| 環境自動清理 | 無 | cleanupEligibleAt | ★☆☆ |
| Workspace 預設 Agents | 有 | Project 預設 agents | 相似 |

---

## 財務 / 成本追蹤

| 功能 | 你的專案 | Mth | 借鑑價值 |
|---|---|---|---|
| Token 追蹤 | 無 | per-run token 數 + cost_usd | ★★★ |
| 成本歸因 | 無 | agent → issue → project → goal | ★★★ |
| 預算控制 | 無 | per-agent 月度預算，80%/100% 警告/停止 | ★★☆ |
| Cost dashboard | 無 | 有（provider/model/agent 多維度）| ★★☆ |
| Prompt cache 追蹤 | 無 | cachedInputTokens 單獨計 | ★★★ cache 占比很大 |
| Finance Events | 無 | 更高層的收支記錄 | — 你用不到 |

---

## 治理 / 審批

| 功能 | 你的專案 | Mth | 借鑑價值 |
|---|---|---|---|
| Approval 系統 | 無 | hire/strategy/budget/terminate 都要人類確認 | ★★☆ |
| 審批通知 | 無 | Inbox badge | ★★☆ |
| Audit trail | 無（session log 是對話，不是操作記錄）| activity_log 記錄所有操作 | ★★☆ |
| 人類隨時介入 | 有（隨時打字）| Board approval gate | 不同機制 |

---

## 技術能力

| 功能 | 你的專案 | Mth | 備註 |
|---|---|---|---|
| Streaming 輸出 | 有（逐字）| 有（WebSocket）| 相似 |
| Token 追蹤 | 無 | 有（parse CLI JSON output）| ★★★ 可立刻實作 |
| CLI Session Resume | 無 | 有（持久化 session_id）| ★★★ |
| 多 Agent 並行 | 無（循序）| 有（concurrent runs per agent）| ★★☆ |
| Plugin 系統 | Skills（prompt 注入）| 完整 plugin runtime | 方向不同 |
| Secrets 管理 | config.json（gitignored）| 中央 secret store + 版本 | ★☆☆ |
| 直接 API | 無（只有 CLI）| 看 adapter 設定 | ★★★ 長期方向 |
| WebSocket | 有 | 有 | 相似 |
| 認證 | 無 | Better Auth（session + API key）| ★★☆ 若需要多用戶 |
| Multi-tenant | 無 | 完整 company 隔離 | — 你不需要 |

---

## Mth 獨有、你完全沒有的概念

按借鑑優先度排序：

| 概念 | 說明 | 為何重要 |
|---|---|---|
| **CLI Session 持久化** | `session_id` 存 DB，下次 heartbeat 直接 resume | 省去每次重新建立 context 的 token 消耗 |
| **Issue 作為任務票** | 永久存在的任務單元，跨天執行 | 讓討論結論有地方落地 |
| **Goal 層級** | Initiative → Objective → Task | 讓所有工作有「為什麼做」 |
| **Per-issue Execution Workspace** | 每個任務有獨立 git branch | 並行執行多個任務不互相干擾 |
| **Work Products** | 任務的產出物（PR、文件）連結到 issue | 追蹤「做了什麼」 |
| **requestDepth 限制** | 防止 agent 無限自我委派 | 你的 Cowork Pattern 也需要類似機制 |
| **Approval 治理門** | 重要行動需人類確認才繼續 | 搭配你的 Arbiter + Quality Gate |

---

## 你有、Mth 沒有的核心優勢

| 概念 | 你的設計 | 為何要保留 |
|---|---|---|
| **即時同步討論** | agents 同時在線互相「聽」 | Mth 是異步，無法做這個 |
| **Human-as-moderator** | 主持人在進行中隨時介入 | Mth 的人類是 Board，在任務完成後才看結果 |
| **Agent 個性層** | SOUL/IDENTITY/AGENT.md | 角色扮演、多元觀點討論的基礎 |
| **Skills 動態注入** | 對話中途改變 agent 行為 | Mth 沒有這個概念 |
| **跨 model 混搭** | 同一討論室 Claude + Gemini + Ollama | Mth 一個 agent 只有一個 adapter |
| **Markdown 設定** | 人類可讀可編輯 | Mth 的 agent config 是 JSON，需要 UI 才能改 |
