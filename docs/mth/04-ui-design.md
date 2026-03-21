# UI 設計模式與借鑑方向

> Mth 用 React + Vite，你用 Vanilla JS。
> 以下列出值得借鑑的 UI 概念，都可以用 Vanilla JS 實作。

---

## Mth UI 的主要頁面

從截圖和程式碼可以確認的頁面：

| 頁面 | 功能 |
|---|---|
| **Dashboard** | 公司活動總覽、token 用量、卡住任務 |
| **Issues（Kanban）** | 任務看板，六狀態：Triage → Backlog → Unstarted → Started → Completed / Cancelled |
| **Goals** | 目標樹，Initiative → Objective → Task |
| **Org（組織架構圖）** | Agent 層級樹，CEO 在最頂端 |
| **Costs** | 費用儀表板（token 數、cost_usd、per-agent breakdown）|
| **Activity** | Audit trail，所有操作記錄 |
| **Approvals** | 待審批項目列表（雇人、預算、策略）|
| **Inbox** | Agent 的通知中心（帶 badge 數字）|
| **Settings** | Company、agents、secrets 設定 |

---

## 值得借鑑的 UI 設計概念

### 1. Kanban 任務看板

**Mth 的做法：**
- 六狀態：Triage → Backlog → Unstarted → Started → Completed / Cancelled
- 每個 issue 有 priority badge（urgent / high / medium / low）
- 每個 issue 顯示 assignee avatar
- 完成時自動加 `completedAt` 時間戳

**你可以做的版本（Workspace 頁加 Tasks 分頁）：**
```
Tasks（list view，不需要完整 kanban）
  ├── [ ] 待辦
  ├── [→] 進行中
  └── [✓] 完成

每個 task：title + 來源 session link + assigned agent
```

**從討論室快速建立 task 的入口：**
- 每條 agent 訊息右上角加「📌 建立任務」icon
- 點擊 → 側邊面板，預填 title（取訊息第一行）+ session link

---

### 2. Costs 儀表板

**Mth 的設計（從截圖確認）：**
```
┌──────────┬──────────────┬──────────────┬──────────┐
│ Input    │ Output       │ Cached       │ Total    │
│ tokens   │ tokens       │ tokens       │ cost     │
│ 66       │ 16.4k        │ 1.9M         │ $0.00    │
└──────────┴──────────────┴──────────────┴──────────┘

Date        Run          Input    Output    Cost
Mar 20     405f2ca6       14       3.4k      -
Mar 20     a23018f8       21       4.2k      -
```

**你可以做的版本（Session 結束後顯示）：**
- Session header 旁加 token summary badge
- Members panel 顯示 per-agent token 數
- 首頁加 lifetime stats（總 sessions、總 tokens、估算費用）

---

### 3. Approval Center UI

**Mth 的設計（從截圖確認）：**
```
┌─────────────────────────────────────────┐
│ ✓ Approval confirmed                    │  [Review linked issue]
│ Requesting agent was notified...        │
└─────────────────────────────────────────┘

Hire Agent                        [approved]
  b3d947a7-4660-4c93-b300-a9ae2aee5f1d
  Requested by [C2] CEO 2

  Name        Founding Engineer
  Role        engineer
  Adapter     codex_local

  Linked Issues
  JAS-1  Create your CEO HEARTBEAT.md
```

**你可以做的輕量版：**
- 當 Arbiter 回傳 `needs_human` 時，chat 介面出現一個審批卡片
- 卡片顯示：建議行動 + agent 的理由 + 繼續 / 修改 / 停止 三個按鈕

---

### 4. Activity Feed（即時活動）

**Mth 的設計：**
- Inbox 有未讀 badge（紅點數字）
- Activity log 記錄所有操作：agent 做了什麼、board 批准了什麼、token 花了多少

**你可以做的版本：**
- Sidebar session 列表，進行中的 session 顯示動畫指示器
- 某個 agent 正在思考時：`Claude is thinking...`（而非空白）
- Session 完成後，sidebar 顯示 token 小 badge

---

### 5. Org Chart（組織架構圖）

**Mth 的設計：**
- 樹狀圖，CEO 在頂端，連線顯示 reportsTo 關係
- 每個 agent node 顯示：icon + name + status badge（idle/running/paused）
- 點擊 agent → 側邊面板顯示詳情

**你可以做的輕量版：**
- Members panel（你已有）加上「角色層級」顯示
- 若有 orchestrator + worker 架構，顯示箭頭表示委派方向

---

### 6. Issue 詳情頁

**Mth 的設計：**
- 頂部：status badge + identifier（JAS-1）
- 側邊欄：assignee、priority、project、goal、linked issues
- 主體：description + comments thread
- 底部：work products（產出的 PR / 文件）

**你可以做的輕量版（如果加了 Tasks）：**
- Task 詳情：title + description + 來源 session link + 評論
- 完成後記錄：agent 說了什麼、輸出了什麼

---

### 7. Connection String Onboarding

**Mth 的設計：**
- 創建 agent 時生成一個 connection string
- 包含：server URL + API key + 指令
- 一個字串搞定所有設定

**你可以借鑑的概念：**
- 新增 agent 時，生成一個「快速設定指令」
- 例如：`claude --add-dir agents/claude/ -p "..."`

---

## 不值得直接借鑑的 UI

| Mth 功能 | 原因 |
|---|---|
| 完整 Kanban 看板 | 你的主要產出是對話，不是任務；先做 list view |
| Budget Policies 設定 | 你目前不需要複雜的預算規則 |
| Multi-company 切換 | 單人使用不需要 |
| Plugin 管理介面 | 你的 skills 系統更輕量，不需要這個 |
| Org chart 全圖 | 你的 agents 是平等的，不需要層級圖 |

---

## 建議實作順序

```
立刻可做（不改架構）：
  1. Token summary badge（session 結束後顯示）
  2. Agent 思考中的 "is thinking..." 狀態
  3. Session sidebar 進行中動畫

加了 Tasks 功能後：
  4. 訊息 → 建立任務（橋接討論與實作）
  5. Task list view（待辦/進行/完成）

加了 Arbiter 後：
  6. needs_human 審批卡片
```
