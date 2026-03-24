# Backend Merge — Brainstorm QA Log

> 產品動腦過程中的關鍵 QA 對話，記錄設計決策與理由。

## Q1: 合併方向？

**問題：** Python 吃 Node？Node 吃 Python？Gateway？

**決定：** Node 吃 Python（A 方向）

**三方觀點：**
- **PM：** 分階段遷移，每個 phase 交付可見價值，不能 feature freeze
- **CEO：** Chat 畢業成完整平台。Chat + DB + Plugin + Job Scheduler = 產品解鎖
- **CTO：** Strangler fig pattern，一個 endpoint 一個 endpoint 遷移，Python 自然消亡

---

## Q2: File-based 還是 DB？

**問題：** 很多 file-based 的東西是不是該留著？

**背景：** Mth/Paperclip 自己也是 hybrid storage（Agent 指令 file-based、run logs NDJSON、skills 在 DB）。Mth 根本沒有 chat history 概念。

**決定：**

| 資料 | 方式 | 備註 |
|------|------|------|
| Agent 指令 | **File** | 整合兩邊格式 |
| Agent config | **File** | 兩邊統一規格 |
| Agent memory | **File** | |
| Run logs | **Mth 作法** | NDJSON + DB metadata |
| Skills | **File** | 兩邊統一改成 file |
| Documents | **DB** | Mth 作法 |
| Execution workspace | **各自獨立** | Chat 和 Mth 各自的 workspace，可互相看到 |
| Chat history | **File** | Chat 獨有，好 git |

**理由：**
- 大部分東西每天都會 commit 到 private git，file-based 對 git 友善
- 還沒有要變成 service 給人用，不需要 DB 的 multi-tenant 能力
- Chat history 是 Chat 獨有功能，保持 file-based 方便 git 追蹤

---

## Q3: Agent 身份怎麼統一？

**問題：** Chat agent（聊天人格）和 Mth agent（自主工作者）是完全不同的概念，怎麼合？

**選項：**
- A) **一個 agent，兩個 context** — `agents/{name}/` 是唯一來源，Mth 讀同一個 folder 的指令，但有自己的 runtime state（在 DB）
- B) 兩個 agent，共享身份 — Chat 有 chat-agent、Mth 有 mth-agent，link 到同一組指令

**決定：** A — 一個 agent，兩個 context

**理由：**
- B 已經像是兩個從同一個 agent template 走出來的不同 agent 了
- Agent config 兩邊要統一規格
- 核心目標：agent 可以去 Mth 工作（issues/projects），也可以被找來 Chat 聊天
- 兩邊 workspace 獨立但可見

---

## Q4: Global Models Table 怎麼處理？

**問題：** Chat 的 `config.json → models` 是共用連線資訊，直接刪掉會破壞 UI、model_tiers、Ollama endpoints。

**決定：** 重構為 `adapter_presets`

- 拆分「怎麼連」（adapter type + 連線資訊）和「用哪個 model」（model variant 參數）
- Chat 原本混在一起：`"claude"` 和 `"claude-opus"` 是不同 entry。統一後同一個 adapter 只需一個 preset，model 是參數
- `config.json → adapter_presets.claude_local` = 連線 defaults（command、timeout）
- `agents/{uuid}/config.json → adapterConfig.model` = 這個 agent 用哪個 model
- Merge 優先級：agent.adapterConfig > adapter_presets > hardcoded defaults
- model_tiers.thinking 不再需要 global entry，同 adapter 換 model 參數

---

## Q5: Agent folder 命名 & 身份

**問題：** 用 folder name 當 agent 身份會有 rename 斷裂問題。

**決定：** `agents/{UUID}/` — folder name 就是 UUID

- UUID 是穩定身份，直接當 folder name
- `config.json` 裡的 `name` 欄位 = 人類可讀的顯示名稱
- 改名 = 改 `config.json` 裡的 `name`，folder 不動
- 直接對應 Mth DB 的 primary key，不需要 mapping

---

## Q6: CompanyId 怎麼來？

**問題：** Mth 的所有 agent 都需要 companyId FK，但 file-based agent 沒有這個概念。

**決定：** 開一個 company 設定（file-based，在 `config.json` 裡）

```json
{
  "company": { "id": "uuid", "name": "MeowTiehEightgent" }
}
```

- 目前單人用，一個 default company 就夠
- 所有 file-based agents 歸這個 company
- File-based 好 git

---

## Q7: Agent config 要不要進 DB？

**問題：** Mth 的 agents table 存 agent config 在 DB。我們的 agent config 在 file。要 sync 嗎？

**決定：** Agent config 不進 DB。Runtime 資料進 DB + 每天匯出到 file 供 git。

- **File-only：** agent identity、config、指令、memory、skills
- **DB：** heartbeat_runs、task_sessions、budget spent、run events 等 runtime 資料
- **每天匯出：** DB runtime 資料 daily export 到 file，讓所有資料都能 git 追蹤
- Mth 執行時從 file 讀 agent config，runtime 資料寫 DB
- 不需要 file → DB sync bridge（agent config 不在 DB 裡）

**理由：**
- DB 給 runtime 查詢效能（最近 20 次 run、成本統計等）
- Daily export 確保所有資料都能 git
- 不做 sync bridge 省掉一整層複雜度

**修正（Stakeholder Review 後）：**
- Mth 有 17 個 table FK 指向 agents.id，不可能完全不用 DB
- 改為：**file 是 source of truth，DB agents table 是 sync cache**
- Startup sync：掃 agents/{uuid}/config.json → upsert DB agents table
- Mth 繼續從 DB 讀（不改 data access layer），但資料來源是 file

---

## Q8: Stakeholder Review 結論

**三方共識修正：**

1. **configVersion** — agent config.json 加 `configVersion: 1`，方便未來 migration
2. **Daily export 保留策略** — 保留 30 天，更舊的靠 git history
3. **UUID folder 可讀性** — 考慮 `{uuid}-{name}` 格式（如 `550e8400-CTO/`）

**Phase 1 修正：**
- 原 PM 建議：Phase 1 只做「agent 能去 Mth 工作」→ 被否決
- 修正：Phase 1 = 統一 agent config + **開始搬 Chat 功能進 Node.js**
- Phase 1 包含：adapter presets、WebSocket conversation engine 移植、UI 切換

**未來 TODO（不在本次 scope）：**
- DB 轉純 file（runtime 資料也改 file-based）— 留到後面評估
