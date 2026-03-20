# Chat + Cowork Platform Design Spec

> 日期：2026-03-20
> 狀態：Reviewed

---

## 一、產品定位

```
Chat mode  ≈  Sprint Planning
  └── 多 agent 即時討論、腦力激盪、決策

Cowork mode  ≈  Sprint Execution
  └── Agents 異步執行任務、產出程式碼/文件
```

同一個 app，頂部 `Chat | Cowork` 模式切換器。兩個模式共用 agent/skill template 來源，但各自維護獨立的執行狀態和記憶。

---

## 二、系統架構

```
┌─────────────────────────────────────────────────────┐
│              React UI（Paperclip fork）               │
│         頂部 [ Chat ]  [ Cowork ] 模式切換            │
└────────────────┬──────────────────┬─────────────────┘
                 │ WS/:8000         │ HTTP/:3100
                 ▼                  ▼
     Python FastAPI          Node.js / Hono
      (Chat Server)          (Cowork Server)
       （唯一寫入者）         （唯一寫入者）
         agents/               agents/ DB
         skills/               skills/ DB
         workspaces/           workspaces/ DB
                 │                  │
                 └────────┬─────────┘
                          ▼
              Shared Filesystem
              agents/  skills/  workspaces/
                          │ pull（定期或手動）
                          ▲
                GitHub Marketplace Repo
                (agent + skill templates)
```

### 檔案寫入所有權（避免並發衝突）

| 目錄 | 寫入者 | 說明 |
|---|---|---|
| `agents/<name>/` | Chat Server（Python）| agent 實例、MEMORY.md |
| `workspaces/<name>/` | Chat Server（Python）| session history、workspace config |
| `skills/<name>/` | 使用者手動或 CLI | skill 定義 |
| `marketplace/` | CLI sync 腳本 | 從 GitHub pull，不由 server 寫 |
| Cowork agents | Cowork Server DB | 存在 SQLite/Postgres，不用 filesystem |

> **原則：Chat Server 負責 filesystem，Cowork Server 負責 DB。兩者不交叉寫入。**

### 各層職責

| 層 | 技術 | 職責 |
|---|---|---|
| React UI | Paperclip fork + Chat module | 模式切換、Chat UI、Cowork UI |
| Chat Server | Python / FastAPI / UV | WebSocket、agent subprocess、session history |
| Cowork Server | Node.js / Hono / Drizzle | Issues、heartbeat、cost tracking、org chart |
| Shared FS | 本地檔案系統 | agents/、skills/、workspaces/ |
| Marketplace | GitHub repo | Agent + skill template registry |

---

## 三、Monorepo 結構

```
repo/
├── chat/                    ← Python Chat backend（保留，UV 管理）
│   ├── app.py
│   ├── conversation_engine.py
│   └── pyproject.toml
│
├── ui/                      ← Paperclip React UI + Chat module
│   └── src/
│       ├── pages/           ← Cowork pages（Paperclip 原有）
│       ├── chat/            ← Chat module（新增）
│       │   ├── ChatPage.tsx
│       │   ├── SessionSidebar.tsx
│       │   ├── MessageList.tsx
│       │   └── AgentMembers.tsx
│       └── App.tsx          ← 加入模式切換器
│
├── server/                  ← Paperclip Hono backend（Cowork）
├── packages/
│   ├── db/                  ← Drizzle schema（Cowork DB）
│   ├── shared/              ← 共用 TypeScript 型別
│   └── adapters/            ← Claude/Gemini/Codex adapter
│
├── agents/                  ← 本地 agent 實例（非 template）
├── skills/                  ← 本地 skill 實例
├── workspaces/              ← Chat workspace 資料
└── marketplace/             ← 本地 marketplace cache（從 GitHub sync）
    ├── agents/
    └── skills/
```

---

## 四、Agent Template 系統

### Template 結構

```
marketplace/agents/founding-engineer/
├── template.json          ← metadata（共用）
├── AGENT.md               ← Chat 個性 prompt（系統提示詞）
├── IDENTITY.md            ← 角色身份
├── SOUL.md                ← 價值觀與動機
├── HEARTBEAT.md           ← Cowork heartbeat context（見下方說明）
└── TOOLS.md               ← 可用工具說明
```

**HEARTBEAT.md 的用途：** 在 Cowork 模式下，Paperclip 的 heartbeat service 每次喚醒 agent 時，會將 HEARTBEAT.md 的內容作為 system prompt 注入 CLI 呼叫（相當於 AGENT.md 在 Chat 模式的角色）。內容描述 agent 在執行任務時的行為準則、輸出格式要求（如 `STATUS: done | needs_revision | blocked`）、以及如何回報進度。Chat 模式不讀 HEARTBEAT.md；Cowork 模式不讀 AGENT.md。

### 既有 config.json 的遷移

現有 `marketplace/` 下的 agent 使用 `config.json`（欄位：`emoji`, `color`, `model`, `skills`, `enabled`）。Phase 1 期間兩種格式並存：

- Chat Server 繼續讀既有的 `config.json`（不改）
- `template.json` 只用於新的 marketplace-pulled agents
- Phase 2 再統一格式，提供一次性轉換腳本

### template.json 格式

```json
{
  "id": "founding-engineer",
  "name": "Founding Engineer",
  "version": "1.2.0",
  "description": "Full-stack engineering specialist",
  "author": "jason",
  "tags": ["engineering", "backend", "fullstack"],
  "icon": "🔨",
  "defaultAdapterType": "claude-local",
  "capabilities": "Full-stack engineering, technical implementation, code architecture",
  "role": "engineer",
  "supportsChat": true,
  "supportsCowork": true,
  "createdAt": "2026-03-20T00:00:00Z",
  "updatedAt": "2026-03-20T00:00:00Z"
}
```

### Skill Template 結構

```
marketplace/skills/systematic-debugging/
├── template.json
└── SKILL.md
```

```json
{
  "id": "systematic-debugging",
  "name": "Systematic Debugging",
  "version": "2.1.0",
  "description": "Forces exhaustive debugging methodology",
  "author": "jason",
  "tags": ["debugging", "engineering"],
  "supportsChat": true,
  "supportsCowork": true
}
```

---

## 五、Git-based Marketplace

### Marketplace Repo 結構

```
github.com/<username>/agent-marketplace/
├── agents/
│   ├── founding-engineer/
│   │   ├── template.json
│   │   ├── AGENT.md
│   │   ├── IDENTITY.md
│   │   ├── SOUL.md
│   │   ├── HEARTBEAT.md
│   │   └── TOOLS.md
│   └── researcher/
│       └── ...
└── skills/
    ├── systematic-debugging/
    └── brainstorming/
```

### Git = 版本控制系統

| 需求 | Git 原生提供 |
|---|---|
| 版本歷史 | 每次更新 = commit |
| Lineage 追蹤 | fork / clone 記錄 |
| Submit template | Pull Request |
| Sync 通知 | GitHub watch / releases |
| 手動 sync（A）| `git pull` |
| Auto-track（B）| git submodule 或 CLI cron |
| 私有 marketplace | private repo |
| 公開分享 | public repo |

### Sync 選項

**A — 手動 sync（有新版本通知）**
- 本地 `marketplace/registry.json` 記錄每個 template 的 commit hash
- 定期（或手動觸發）fetch remote，比對 hash 差異
- UI 顯示「⬆ 有新版本」badge

**B — Auto-track（可選，per template 設定）**
- 對特定 template 設定 `autoTrack: true`
- **觸發方式：UI 手動確認，不做無聲後台更新**（避免覆蓋使用者的本地客製）
- **Merge 策略：backup-and-overwrite**
  - 更新前自動備份到 `agents/<name>/history/<timestamp>/`
  - 以 remote 版本覆蓋 local（local 客製視為暫時性）
  - UI 顯示 diff 讓使用者確認後才執行
- Cowork 的 skills 目前不支援 auto-track（Paperclip 無 skill 概念）

### Registry 本地記錄

```json
// marketplace/registry.json
{
  "source": "https://github.com/jason/agent-marketplace",
  "lastSynced": "2026-03-20T10:00:00Z",
  "templates": {
    "agents/founding-engineer": {
      "installedVersion": "1.2.0",
      "installedCommit": "abc123",
      "autoTrack": false,
      "instances": {
        "chat": ["agents/founding-engineer/"],
        "cowork": ["agents/founding-engineer-cowork/"]
      }
    },
    "skills/systematic-debugging": {
      "installedVersion": "2.1.0",
      "installedCommit": "def456",
      "autoTrack": true,
      "instances": {
        "chat": ["skills/systematic-debugging/"],
        "cowork": []
      }
    }
  }
}
```

> **統一格式：instances 都用 filesystem 路徑。** Chat 實例用 `agents/<name>/`；Cowork 實例用 `agents/<name>-cowork/`（Cowork server 讀這個路徑取 HEARTBEAT.md，DB 只存路徑 pointer）。Sync badge 查詢時只需掃 filesystem，不需查 DB。

---

## 六、Agent Lineage 模型

### Pull from Marketplace → 建立 Instance

```
Marketplace template
  founding-engineer v1.2.0 (commit abc123)
        │
        ├── Pull → Chat Instance
        │         agents/founding-engineer/
        │         + 自己的 MEMORY.md、memory/（獨立）
        │         + instance_meta.json { sourceTemplate, version, commit }
        │
        └── Pull → Cowork Instance
                  DB: agents 表
                  adapterConfig.instructionsFilePath = agents/founding-engineer/HEARTBEAT.md
                  + 自己的 runtime state、budget、issues（獨立）
                  + DB 欄位: source_template_id, template_version
```

### instance_meta.json（Chat 側）

```json
{
  "sourceTemplate": "agents/founding-engineer",
  "templateVersion": "1.2.0",
  "templateCommit": "abc123",
  "pulledAt": "2026-03-20T10:00:00Z",
  "autoTrack": false
}
```

### Submit Cowork Agent → Marketplace

Cowork 的 agent 跑了一段時間、效果好，Board 點「Publish as template」：

1. 從 DB 讀取 agent 的 `adapterConfig`（instructionsFilePath 等）
2. 讀取對應的 HEARTBEAT.md、IDENTITY.md、SOUL.md、TOOLS.md 檔案內容
3. **Strip runtime state**（以下欄位不進 template）：
   - budget、spentCents、issues、sessionId、API key
   - 任何含個人資訊的欄位（workspace 路徑、用戶名）
   - MEMORY.md 和 memory/ 資料夾（instance 私有）
4. 產生 `template.json` metadata（id、name、version、role 等）
5. 寫入 `marketplace/agents/<slug>/`
6. **Push 為使用者手動步驟**：UI 顯示 git 指令，使用者自行執行（`git push`），或透過 GitHub PR。App 本身不自動 push。

---

## 七、模式切換器 UI

```tsx
// 頂部切換器
<ModeToggle>
  <ModeButton mode="chat" shortcut="⌘1">Chat</ModeButton>
  <ModeButton mode="cowork" shortcut="⌘2">Cowork</ModeButton>
</ModeToggle>
```

- Chat mode：載入 Chat UI（WebSocket 連 Python :8000）
- Cowork mode：載入 Paperclip UI（HTTP/WS 連 Node.js :3100）
- API 端點在 React 環境變數設定（`VITE_CHAT_URL=http://localhost:8000`、`VITE_COWORK_URL=http://localhost:3100`）
- 若某一 server 無回應，模式按鈕顯示 offline badge，不影響另一模式
- 模式偏好存在 localStorage
- 鍵盤快捷鍵：⌘1 / ⌘2

### 本地開發啟動

```bash
# 三個 process 分開啟動
cd chat && uv run uvicorn app:app --port 8000   # Chat backend
cd server && pnpm dev                            # Cowork backend
cd ui && pnpm dev                                # React UI
```

---

## 八、遷移策略（漸進式）

### Phase 1：並存（先出貨）

- Fork Paperclip
- Chat UI 用 React 重寫（呼叫既有 Python server）
- 加入頂部模式切換器
- 共用 `agents/`、`skills/` filesystem
- Marketplace GitHub repo 建立

### Phase 2：深度整合

- Agent pull from marketplace 的 UI 流程
- Lineage 追蹤（instance_meta.json + registry.json）
- Sync 通知（A 選項）+ Auto-track UI（B 選項，手動確認觸發）
- Cowork → Submit to marketplace 流程
- Token 追蹤（stream-json flag）

### Phase 3：統一 stack（可選）

- Chat backend 模組逐步從 Python 搬進 TypeScript
- Python server 退場
- 單一 monorepo 單一語言

---

## 九、不做的事

- 複雜共用 DB（Marketplace 用 git + registry.json 就夠）
- 認證系統（local_trusted 模式，先不做）
- Multi-tenant（單人使用）
- Real-time sync（定期 fetch 就夠）
- 完整 CI/CD（先 local）
