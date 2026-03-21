# Workspace 功能設計

> 撰寫日期：2026-03-17
> 狀態：設計確認，待實作

---

## 一、概念定位

Workspace 類似 ChatGPT Projects：
- 可包含多個 sessions（對話）
- 有自己的 system prompt（guide.md 角色 — 提醒 agents 這個區域的目標是什麼）
- 有可上傳的共享文件（資料來源）
- Session 也可以存在於 workspace 之外（獨立對話）

Workspace 的 system prompt 定位是「脈絡」而非「個性」— 就像開會前大家都看了同一份 brief，然後各自用自己的風格參與討論。Agent 的 SOUL/IDENTITY 完全不動。

---

## 二、資料模型

### 目錄結構

```
workspaces/
  <workspace_id>/            # e.g. "data-mle-arch"
    config.json
    files/
      guide.md               # workspace system prompt 主文件
      <其他上傳文件>

history/
  <session_id>/
    messages.json            # 新增 "workspace_id" 欄位（null = 無 workspace）
    workspace/               # session 層暫存（未來 agent 寫檔/執行用，現在留空）
```

### `config.json` Schema

```json
{
  "id": "data-mle-arch",
  "name": "[Jason] Data / MLE / Arch",
  "description": "推薦系統優化專案",
  "system_prompt": "這個 workspace 的目標是...",
  "default_agents": ["claude", "gemini"],
  "created_at": "2026-03-17T00:00:00Z"
}
```

### 兩層目錄用途區分

| 路徑 | 用途 | 比喻 |
|------|------|------|
| `workspaces/<id>/files/` | 所有 sessions 共享的文件 | 辦公室公用文件櫃 |
| `history/<session_id>/workspace/` | 這次對話的暫存/輸出（future） | 開會用的白板草稿 |

### Session 遷移

將 session 移至不同 workspace = 只改 `messages.json` 裡的 `workspace_id` 欄位，零成本遷移。刪除 workspace 時，sessions 不刪，`workspace_id` 改為 `null`（變成獨立對話）。

---

## 三、Context Injection 順序

每次 agent 發言前，prompt 組裝順序：

```
1. [Workspace Guide]
   config.system_prompt
   + files/ 內容（< 50KB 自動注入全文；超過只注入檔名清單）

2. [Agent Identity]
   AGENT.md → IDENTITY.md → SOUL.md（現有機制不變）

3. [Conversation History]
   過去對話記錄
```

### @filename 機制

對話中輸入 `@guide.md`：
- 後端查 `workspaces/<workspace_id>/files/guide.md`
- 把全文重新注入當下那輪 context（不限大小）
- 適合在討論過程中強調某份文件

---

## 四、UI 設計

### Sidebar（兩層結構）

```
+ 新對話
  ├ 在 Workspace 建立
  └ 建立獨立對話

[📁] Data / MLE / Arch
  ├ 推薦系統優化 CTR
  ├ Kaggle 推薦系統技能
  └ + 在此建立新對話

[無 workspace]
  ├ 科幻電影推薦
  └ 平板子選擇分析
```

新對話入口需清楚區分「在 workspace 內」vs「獨立對話」。

### 開新對話流程

Welcome screen 新增「選擇 Workspace」步驟（可選）：
- 選了 workspace → 預設 agents 自動勾選（可調整增減）
- 不選 → 現有流程不變

### Workspace 管理

- **建立**：輸入名稱 + system prompt + 選預設 agents
- **上傳文件**：workspace 設定頁的「資料來源」tab（類似截圖中 ChatGPT Projects 的 tab）
- **刪除 workspace**：sessions 不刪，改為 `workspace_id: null`
- **移動 session**：拖曳或右鍵選單，後端只更新 workspace_id 欄位

---

## 五、後端 API（新增端點）

| Method | Path | 說明 |
|--------|------|------|
| GET | `/workspaces` | 列出所有 workspaces |
| POST | `/workspaces` | 建立 workspace |
| GET | `/workspaces/<id>` | 取得 config + file 清單 |
| PUT | `/workspaces/<id>` | 更新 config（名稱/prompt/agents）|
| DELETE | `/workspaces/<id>` | 刪除 workspace（sessions 設為 null）|
| POST | `/workspaces/<id>/files` | 上傳文件 |
| DELETE | `/workspaces/<id>/files/<filename>` | 刪除文件 |
| PUT | `/sessions/<session_id>/workspace` | 移動 session 到不同 workspace |

---

## 六、實作 Phases

| Phase | 範圍 | 說明 |
|-------|------|------|
| 1 — 核心 | 後端資料層 | `workspaces/` 目錄建立、config.json CRUD、`messages.json` 加 workspace_id 欄位 |
| 2 — 注入 | Prompt 組裝 | Workspace guide 塞入每個 agent 發言前的 prompt |
| 3 — UI | Sidebar | Sidebar 兩層結構、開新對話選 workspace |
| 4 — 檔案 | 文件管理 | 文件上傳/刪除 + `@filename` 引用機制 |
| 5 — 管理頁 | Workspace 設定 | 資料來源 tab、預設 agents 設定 |
