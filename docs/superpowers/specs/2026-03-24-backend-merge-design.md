# Backend Merge — Design Spec

> 合併 Python FastAPI Chat 後端與 Node.js Mth Cowork 後端為單一架構。

## 目標

- Agent 可以去 Mth 工作（issues/projects），也可以被找來 Chat 聊天
- 單一 agent 身份，兩個 runtime context（Chat 即時對話 + Cowork 背景任務）
- 所有 config/指令/memory 都是 file-based，可 git 追蹤
- 最終退役 Python 後端，Chat 功能移植到 Node.js

## 非目標

- Multi-tenant / SaaS 部署（目前單人用）
- 移除 PostgreSQL（runtime 資料仍用 DB）
- 改寫 Mth 核心架構（保留現有 service/route 結構）

---

## D1: 合併方向 — Node 吃 Python

Python Chat 功能（WebSocket 多人對話、conversation engine、session 管理、history、settings API）移植到 Node.js Mth server。

**策略：** Strangler fig — 逐步遷移，每個 phase 都能運作。兩個 backend 在遷移期間共存，UI 逐步從 `chatClient`（:8000）切到 `api`（:3100）。Python 最後一個 endpoint 遷完後自然退役。

---

## D2: Storage 分界

| 資料 | 儲存方式 | 備註 |
|------|----------|------|
| Agent config | **File** | `agents/{uuid}/config.json` |
| Agent 指令 | **File** | `AGENT.md`, `IDENTITY.md`, `SOUL.md` |
| Agent memory | **File** | `memory/YYYY-MM-DD.md`, `MEMORY.md` |
| Skills | **File** | `skills/{slug}/SKILL.md`，兩邊統一 |
| Chat history | **File** | `history/{session_id}/messages.json`，Chat 獨有 |
| Scenarios | **File** | `scenarios/{id}.json` |
| Workspaces | **File** | `workspaces/{id}/config.json + files/` |
| Marketplace | **File** | `marketplace/{id}/` |
| Company | **File** | `config.json → company` |
| Adapter presets | **File** | `config.json → adapter_presets` |
| Heartbeat runs | **DB** | + daily JSONL export |
| Task sessions | **DB** | + daily JSONL export |
| Cost/budget | **DB** | + daily JSONL export |
| Run events | **File** | NDJSON（Mth 現有作法）|
| Documents | **DB** | Mth 現有作法 |
| Issues/Projects | **DB** | Mth 現有作法 |

**架構方向：file-first。** DB agents table 是過渡期的 sync cache，不是終態。長期目標是讓 Mth 直接讀 file，移除 agents table FK 依賴。OpenClaw 已驗證此模式可行。

### Daily JSONL Export

- **觸發：** server heartbeat scheduler 每天凌晨執行
- **格式：** 集中式，按 table 匯出，一行一筆 record
- **路徑：** `server/data/exports/YYYY-MM-DD/{table_name}.jsonl`
- **保留：** 30 天，更舊的靠 git history
- **匯入：** 逐行 upsert by PK
- **v1 先全量匯出**，量大了再改增量

---

## D3: Agent 身份 — `agents/{UUID}/`

```
agents/
├── 550e8400-CTO/
│   ├── config.json         ← 統一格式（見 D4）
│   ├── AGENT.md            ← 指令（Chat & Cowork 共讀）
│   ├── IDENTITY.md         ← 人格
│   ├── SOUL.md             ← 驅動力
│   ├── MEMORY.md           ← 長期記憶
│   └── memory/
│       └── YYYY-MM-DD.md   ← 每日記憶
├── 7c9e6679-Gemini/
│   └── ...
```

- Folder name = `{short-uuid}-{display-name}` 格式，兼顧可讀性和穩定性
- UUID prefix（前 8 碼）是穩定身份，直接對應 Mth DB primary key（完整 UUID 存在 config.json 的 `id` 欄位）
- **Folder 不會 rename。** 改名只改 `config.json` 裡的 `name` 欄位，folder 的 display-name suffix 是建立時的快照
- Startup sync 解析 folder name 時只取 UUID prefix 部分做 DB match
- `config.json` 裡的 `name` 欄位 = 正式顯示名稱（唯一來源）
- `agents/_default/` 保留為建立新 agent 的 template，**不參與 startup sync**（sync 只處理 UUID-prefixed folders）
- 一個 agent，兩個 runtime context：
  - **Chat context** — Python/Node 管理（session、對話歷史、mode toggle）
  - **Cowork context** — Mth DB 管理（heartbeat runs、task sessions、budget spent）

---

## D4: 統一 Agent Config

### config.json 格式

```jsonc
{
  "configVersion": 1,
  "id": "550e8400-e29b-41d4-a716-446655440000",  // 完整 UUID（folder name 只取前 8 碼）

  // === Identity ===
  "name": "CTO",
  "role": "cto",                     // engineer, designer, pm, qa, ceo, general...
  "title": "Chief Technology Officer",
  "emoji": "🟣",
  "color": "#a78bfa",
  "description": "Full-stack developer with deep reasoning",
  "enabled": true,

  // === Adapter ===
  "adapter": "claude_local",         // adapter type（對應 adapter_presets key）
  "adapterConfig": {                 // per-agent override（可選）
    "model": "claude-sonnet-4-6",
    "maxTurnsPerRun": 10
  },
  "model_tiers": {                   // 同 adapter 內切換 model variant
    "default": "claude-sonnet-4-6",
    "thinking": "claude-opus-4-6"
  },

  // === Skills ===
  "skills": ["brainstorming"],       // soft ref → skills/{slug}/

  // === Cowork 擴充（Chat 可忽略）===
  "reportsTo": null,                 // agent 階層（UUID ref）
  "permissions": {},                 // { canCreateAgents: bool }
  "budget": 5000,                    // 月預算（cents）
  "heartbeat": {                     // Cowork job scheduler 設定
    "cooldownSec": 10,
    "intervalSec": 3600
  }
}
```

### 欄位對照

| 統一欄位 | Chat 來源 | Mth 來源 | 說明 |
|----------|-----------|----------|------|
| `name` | folder name | DB `name` | 改為 config 內欄位 |
| `role` | 新增 | DB `role` | Chat 可用來塑造對話人格 |
| `title` | 新增 | DB `title` | UI 顯示在名字下方 |
| `emoji` | `emoji` | `icon` → emoji | 統一用 emoji |
| `color` | `color` | 新增 | 兩邊 UI 都能用 |
| `description` | `description` | `capabilities` | 合併為一 |
| `enabled` | `enabled` | `status` → bool | runtime status 另外追蹤 |
| `adapter` | `model` + `type` | `adapterType` | 統一用 Mth adapter 概念 |
| `adapterConfig` | cmd/baseUrl/timeouts | `adapterConfig` | per-agent override |
| `model_tiers` | `model_tiers` | 新增 | 同 adapter 切換 model variant |
| `skills` | `skills[]` | `desiredSkills` | top-level skills[] |
| `permissions` | 新增 | `permissions` | Cowork 用 |
| `budget` | 新增 | `budgetMonthlyCents` | 月預算 |
| `heartbeat` | 新增 | `runtimeConfig.heartbeat` | job scheduler |

### 刪除/移走的欄位

| 舊欄位 | 去向 | 原因 |
|--------|------|------|
| Chat `model` (soft ref) | `adapter` + `adapterConfig.model` | adapter 概念取代 |
| Chat `type` (cli/api) | `adapter` 隱含 | claude_local = CLI, ollama_api = API |
| Chat `supports_thinking` | `model_tiers.thinking` 存在即支持 | 不需要獨立 flag |
| Chat `mode` (chat/think) | runtime state | session 級別，不存 config |
| Mth `icon` (lucide name) | `emoji` 取代 | 更直覺 |
| Mth `status` | `enabled` + runtime state | config 只管 enabled |
| Mth `capabilities` | `description` 合併 | 沒必要分兩個 |
| Mth `metadata` | 不放 config.json | runtime metadata 由 DB 管 |

---

## D5: Adapter Presets（取代 Global Models Table）

### 核心改動

Chat 的 `config.json → models` 重構為 `adapter_presets`。拆分「怎麼連」（adapter connection info）和「用什麼 model」（model variant parameter）。

### config.json 格式

```jsonc
{
  "company": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "MeowTiehEightgent"
  },

  "adapter_presets": {
    "claude_local": {
      "command": "claude",
      "defaultArgs": ["--print"],
      "defaultModel": "claude-sonnet-4-6",
      "timeoutSec": 120,
      "startupTimeoutSec": 120,
      "supports_image": true
    },
    "gemini_local": {
      "command": "gemini",
      "defaultArgs": ["-p"],
      "defaultModel": "gemini-2.5-flash",
      "timeoutSec": 600,
      "startupTimeoutSec": 120,
      "supports_image": true
    },
    "ollama_api": {
      "baseUrl": "http://127.0.0.1:11434",
      "defaultModel": "llama3.2",
      "timeoutSec": 120
    }
  }
}
```

### 解析流程

```
1. 讀 agents/{uuid}/config.json → adapter = "claude_local"
2. 讀 config.json → adapter_presets["claude_local"]
3. Merge: preset defaults + agent.adapterConfig overrides
   → model = agent.adapterConfig.model ?? preset.defaultModel
   → timeout = agent.adapterConfig.timeoutSec ?? preset.timeoutSec
   → command = agent.adapterConfig.command ?? preset.command
4. model_tiers 解析：同 adapter，只換 model 參數
   → 不需要在 global table 另建 entry
```

**Merge 優先級：** agent.adapterConfig > adapter_presets > hardcoded defaults

**澄清：** `adapter_presets`（config.json）是連線預設值（command path、timeout、default model）。Adapter **實作**（程式碼）仍在 `packages/adapters/` 裡，不受影響。Preset 只是把原本散落在 Chat `models` table 的連線資訊統一收攏。

---

## D6: Company — File-based

```jsonc
// config.json
{
  "company": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "MeowTiehEightgent"
  }
}
```

- 目前單人用，單一 default company
- 所有 file-based agents 歸此 company
- Mth startup sync 讀此 ID 作為 companyId

---

## D7: Startup Sync（過渡期）

過渡期方案。長期目標是移除 DB agents table，改 Mth 直接讀 file。

### 流程

```
Server 啟動：
1. 讀 config.json → company.id
2. 確保 DB 有此 company（沒有就建）
3. 掃描 agents/{uuid}-{name}/ 所有 folder
4. 對每個 folder：
   a. 讀 config.json
   b. 用 UUID 查 DB agents table
   c. 有 → 更新（upsert by id）
   d. 沒有 → 新建（INSERT with id = folder UUID, companyId = company.id）
   e. 自動注入 instructionsFilePath = agents/{folder}/AGENT.md
5. DB 有但 file 沒有 → 標記 file_managed=false（保留 runtime 資料）
```

### File → DB 欄位對應

| config.json 欄位 | DB agents 欄位 | 轉換邏輯 |
|-------------------|----------------|----------|
| (folder UUID prefix) | `id` | 完整 UUID 從 config.json `id` 欄位取 |
| (from global config) | `companyId` | `config.json → company.id` |
| `name` | `name` | 直接對應 |
| `role` | `role` | 直接對應，預設 `"general"` |
| `title` | `title` | 直接對應 |
| `emoji` | `icon` | emoji 寫入 icon 欄位（Mth UI 需適配） |
| `enabled` | `status` | `true` → `"idle"`, `false` → `"paused"` |
| `adapter` | `adapterType` | 直接對應 |
| `adapterConfig` + auto | `adapterConfig` | merge + 自動注入 `instructionsFilePath` |
| `heartbeat` | `runtimeConfig.heartbeat` | 包進 runtimeConfig JSONB |
| `skills` | `runtimeConfig.desiredSkills` | 包進 runtimeConfig JSONB |
| `permissions` | `permissions` | 直接對應，預設 `{}` |
| `budget` | `budgetMonthlyCents` | 直接對應 |
| `description` | `capabilities` | 直接對應 |
| `reportsTo` | `reportsTo` | 直接對應，預設 `null` |
| (folder name) | `file_key` | 完整 folder name（含 UUID prefix） |
| `true` | `file_managed` | sync 管理的 agent 固定為 true |

**`status` 欄位特殊處理：** startup sync 從 `enabled` 設定初始值（`true` → `"idle"`, `false` → `"paused"`）。但若 DB 中 status 已是 `"running"` 或 `"error"` 等動態狀態，sync **不覆蓋**（避免把正在跑的 agent 降級為 idle）。

**不同步的 DB 欄位（純 runtime state）：** `spentMonthlyCents`、`lastHeartbeatAt`、`pauseReason`、`pausedAt`、`metadata`。

### configVersion 規則

- `configVersion: 1` = 統一格式（本 spec）
- 缺少 `configVersion` = v0（legacy Chat 格式），startup sync 時自動 migrate 為 v1 並寫回 file

### DB Schema 變更

```sql
ALTER TABLE agents ADD COLUMN file_key TEXT;        -- folder name
ALTER TABLE agents ADD COLUMN file_managed BOOLEAN DEFAULT true;

CREATE UNIQUE INDEX agents_company_file_key_idx
  ON agents (company_id, file_key)
  WHERE file_key IS NOT NULL;
```

---

## Phase 規劃

### Phase 1: 基礎工程 + 開始搬 Chat

1. **統一 agent config 格式** — 寫 migration script 轉換現有 agents
2. **agents/ 改用 UUID folder** — `{uuid}-{name}` 格式
3. **config.json 重構** — `models` → `adapter_presets`，加 `company`
4. **Startup sync** — file → DB agents table
5. **開始移植 Chat** — WebSocket conversation engine、session 管理移到 Node.js
6. **UI 切換** — `chatClient` 逐步切到 `api`

### Phase 2: 完成 Chat 移植

7. 剩餘 Chat REST endpoints 全部移到 Node.js
8. History manager（壓縮/摘要）移植
9. Settings API 統一
10. 退役 Python 後端

### Phase 3: 穩定化 + 增強

11. Daily JSONL export
12. File watcher（config 改動即時 sync DB）
13. Chat ↔ Cowork 互通（Chat agent 能操作 issue、Cowork agent 能回 Chat 報告）

### 未來 TODO

- **DB 轉純 file** — runtime 資料也改 file-based，移除 agents table FK 依賴。OpenClaw 已驗證可行
- **Multi-company** — 如需多租戶再加

---

## 技術風險

| 風險 | 影響 | 緩解 |
|------|------|------|
| conversation_engine.py 移植 | async Python → async TypeScript 有 timing 差異 | 寫完整測試再移植 |
| Chat WebSocket protocol 差異 | Python WS 是 direct stream，Node WS 是 event-based | 寫 adapter layer |
| 兩個 "agent" runtime context | Chat streaming vs Cowork heartbeat job | 明確分離，config 共用但 runtime 各自管理 |
| ~30 個 FK 指向 agents table | 過渡期必須保留 agents table | startup sync，長期移除 |
| History migration | file→file 但 session format 可能需要調整 | migration script + validation |

---

## QA Log

完整的設計決策對話紀錄見：[backend-merge-brainstorm-qa.md](2026-03-24-backend-merge-brainstorm-qa.md)
