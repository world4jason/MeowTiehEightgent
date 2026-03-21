# 層次結構對比

---

## 你的架構

```
Config（全域 config.json）
├── Models（LLM 連線設定）
│   └── { name, type, command, model, ... }
├── Skills（技能包，skills/<slug>/SKILL.md）
├── Agents（角色，agents/<name>/）
│   ├── config.json（emoji, color, model ref, skills, enabled）
│   ├── AGENT.md（主要 prompt 指令）
│   ├── IDENTITY.md（角色是誰）
│   ├── SOUL.md（價值觀和動機）
│   ├── MEMORY.md（跨 session 記憶索引）
│   └── memory/（每日 session log）
└── Workspaces（workspaces/<id>/）
    ├── config.json（名稱、說明、預設 agents）
    ├── files/（共享文件，@filename 可注入）
    └── history/<session_id>/
            └── messages.json（對話紀錄）
```

**關鍵特性：**
- 扁平的 agent 關係，所有 agent 是平等的
- Session 是同步對話的紀錄（transcript）
- Workspace 是長期 context 容器
- Skills 是 prompt 注入機制

---

## Mth 的架構

```
Instance（伺服器實例）
└── Company（最小組織單位，multi-company 完全隔離）
    │
    ├── Goals（目標樹，自引用 parentId）
    │   ├── level: "initiative" | "objective" | "task"
    │   ├── status: planned | active | completed | cancelled
    │   ├── ownerAgentId（負責人）
    │   └── parentId（巢狀層級）
    │
    ├── Projects（工作容器，掛在 Goal 下）
    │   ├── goalId（追溯到目標）
    │   ├── leadAgentId（負責人）
    │   ├── targetDate（截止日）
    │   ├── status: backlog | active | paused | completed
    │   ├── Project Workspaces（git repo 環境設定）
    │   └── Execution Workspaces（per-issue 隔離環境）
    │       ├── mode / strategyType
    │       ├── cwd / repoUrl / baseRef / branchName
    │       ├── providerType: local_fs | ...
    │       ├── derivedFromExecutionWorkspaceId（fork 來源）
    │       └── cleanupEligibleAt（自動清理時間）
    │
    ├── Issues（任務票，自引用 parentId，無限子任務）
    │   ├── projectId + goalId（追溯）
    │   ├── assigneeAgentId（執行者）
    │   ├── status: triage | backlog | unstarted | started | completed | cancelled
    │   ├── priority: urgent | high | medium | low
    │   ├── requestDepth（委派深度，防止無限遞迴）
    │   ├── checkoutRunId / executionRunId（正在執行的 run）
    │   ├── executionWorkspaceId（隔離環境）
    │   ├── startedAt / completedAt / cancelledAt（時間戳）
    │   ├── Issue Comments（評論，agent 間的非同步溝通）
    │   ├── Issue Attachments（附件）
    │   ├── Issue Work Products（任務產出物：PR、文件、程式碼）
    │   ├── Issue Documents（版本化文件）
    │   └── Issue Labels（分類標籤）
    │
    ├── Agents（工作者，透過 reportsTo 形成 org chart）
    │   ├── reportsTo（上級 agent ID，形成樹狀）
    │   ├── role / title / icon / capabilities
    │   ├── adapterType + adapterConfig（使用哪個 CLI + 如何呼叫）
    │   ├── budgetMonthlyCents / spentMonthlyCents
    │   ├── status: idle | running | paused | terminated | pending_approval
    │   ├── permissions（細粒度操作權限）
    │   ├── Config Revisions（設定版本歷史，可回滾）
    │   ├── Runtime State（當前狀態快照：session_id、最後 run、token 累計）
    │   ├── Task Sessions（持久化 CLI session，保存 session_id 供 resume）
    │   ├── Wakeup Requests（排隊的 heartbeat 喚醒請求）
    │   └── API Keys（agent 自己的認證 token）
    │
    ├── Approvals（治理門）
    │   ├── type: hire_agent | strategy | budget_override | terminate_agent
    │   ├── requestedByAgentId（是哪個 agent 申請的）
    │   ├── status: pending | approved | rejected
    │   ├── payload（完整的申請內容）
    │   └── decisionNote / decidedByUserId（人類的批注）
    │
    ├── Secrets（公司層級 secret store）
    │   ├── secret_versions（歷史版本）
    │   └── config 只引用 key name，從不 inline 明文
    │
    ├── Budget Policies（預算規則）
    │   ├── scopeType: company | agent | project
    │   ├── windowKind: calendar_month_utc
    │   └── 80% 軟警告 / 100% 硬停
    │
    ├── Cost Events（每次 invocation 的費用記錄）
    │   ├── agentId / issueId / projectId / goalId（完整歸因）
    │   ├── provider / model / billingType
    │   ├── inputTokens / cachedInputTokens / outputTokens / costCents
    │   └── heartbeatRunId（對應哪次執行）
    │
    ├── Finance Events（收入/支出記錄，更高層）
    ├── Activity Log（所有操作的 audit trail）
    ├── Documents（公司層級版本化文件，有 revision history）
    ├── Labels（可貼到 issues 的標籤系統）
    └── Plugins（擴充系統：lifecycle hooks、event bus、UI injection）
```

---

## 層次對應關係

| 你的概念 | Mth 概念 | 差異 |
|---|---|---|
| Config（全域）| Instance settings | 相似 |
| Model | Agent adapter config | 你的 model 是連線設定，他的 agent 直接包含 adapter 設定 |
| Agent（角色）| Agent | 你的 agent 是對話角色；他的 agent 是有預算、有層級、有 CLI session 的工作者 |
| AGENT.md | Agent `adapterConfig` 裡的 HEARTBEAT.md / system prompt | 相似概念，形式不同 |
| SOUL/IDENTITY.md | 沒有對應 | **你有、他沒有**——agent 個性/價值觀層 |
| Skills | 沒有對應（Plugin 是類似但更底層）| **你有、他沒有**——prompt 注入技能 |
| Workspace | Project + Execution Workspace | 你的 workspace 是 context 容器；他的更複雜，有 git branch 隔離 |
| Session | Issue（部分）+ Agent Task Session | **根本差異**（見下方）|
| messages.json | Issue Comments + Heartbeat Runs | 他把對話拆成兩層 |
| 沒有 | Goals | **你缺少目標層**——沒有「為什麼做」 |
| 沒有 | Approvals | **你缺少治理門** |
| 沒有 | Cost Events | **你缺少財務追蹤** |
| 沒有 | Work Products | **你缺少產出物概念** |

---

## 最關鍵的本質差異

### Session vs Issue

| | 你的 Session | Mth Issue |
|---|---|---|
| **生命週期** | 一場對話，結束就結束 | 一張票，跨天、跨次執行 |
| **性質** | 對話紀錄（transcript）| 任務狀態機 + 執行歷史 + 產出物 |
| **關係** | 屬於 Workspace | 屬於 Project，掛在 Goal 下 |
| **CLI 狀態** | 每次重啟 CLI | session_id 持久化，下次可 resume |
| **可指派** | 不可指派，誰說話誰說 | 有 assigneeAgentId，有原子 checkout |
| **層級** | 扁平 | 可以有 parentId 子任務，無限巢狀 |
| **計費歸因** | 無 | issue → project → goal → company |

### Agent 扁平 vs org chart

你的 agents 是**平等的討論參與者**，無上下級關係。
Mth 的 agents 有 `reportsTo`，形成 CEO → Manager → Worker 的樹狀結構，委派就是在這個樹上流動。

---

## 你的專案獨有的設計

Mth 沒有、你有的，而且**不應該拋棄**的：

1. **即時同步對話** — agents 同時在線，互相「聽」彼此說話
2. **Human-as-moderator** — 主持人在對話中途介入，不是等 task 完成後才看結果
3. **Agent 個性三層**（SOUL/IDENTITY/AGENT.md）— 有「靈魂」的角色扮演，不只是 role/capability
4. **Skills 動態注入** — 對話中途改變所有 agent 的行為模式
5. **跨 model 混搭** — 同一討論室 Claude + Gemini + Ollama，Mth 一個 agent 只有一個 adapter
6. **Markdown persona 文件** — 人類可讀可編輯的角色設定，不是 code/JSON
