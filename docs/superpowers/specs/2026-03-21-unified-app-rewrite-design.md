# Unified App Rewrite Design Spec

> 日期：2026-03-21
> 狀態：Draft
> Supersedes：`docs/superpowers/specs/2026-03-20-chat-cowork-platform-design.md`（高層架構保留，本文補全 UI + Settings 細節）

---

## 一、產品目標

把兩個獨立專案整併成一個統一的 app：

```
原本的 Chat 專案     +     Paperclip 專案
(Python :8000)             (Node.js :3100)
        │                         │
        └──────────┬──────────────┘
                   ▼
         統一的 React UI
         Chat | Cowork | Settings
```

**三個模式：**

| Mode | 內容 | Backend |
|------|------|---------|
| Chat | 原版多 agent 討論室，Arc-style UI，全功能重寫 | Python :8000 |
| Cowork | Paperclip 原版，不動 | Node.js :3100 |
| Settings | 共用設定頁，管理 LLM / Agents / Skills / Workspaces / Marketplace / Soul | :8000 + :3100 |

---

## 二、頂層架構

### App 結構

```
AppShell
├── <ModeToggle>         ← 頂部 3-tab bar（Chat | Cowork | Settings）
├── <ChatPage>           ← always mounted，mode !== "chat" 時 CSS hidden
├── <CoworkRoutes>       ← Paperclip 現有 routes（Outlet）
└── <SettingsPage>       ← mode === "settings" 時顯示
```

- Chat always-mount：保持 WebSocket 連線，mode 切換不斷線
- Cowork + Settings 按需渲染

### ModeToggle（擴充現有 2-tab → 3-tab）

```tsx
// 頂部
[ ● Chat ]  [ ○ Cowork ]  [ ⚙ Settings ]
   ⌘1            ⌘2             ⌘3
```

- 每個 tab 各自 offline dot（每 30s 輪詢 /health）
- Chat tab：有 unread badge（agent 在背景 streaming 完成時）
- 鍵盤：⌘1 / ⌘2 / ⌘3
- localStorage 記憶上次 mode（`preferred-mode`: `"chat" | "cowork" | "settings"`）

---

## 三、Chat Mode — 完整 Arc-style Rewrite

**原則：UI logic + operation logic 全部對齊 `static/index.html`，配色改用 Paperclip Tailwind design tokens。**

### 元件樹

```
ChatPage
├── SessionSidebar
│   ├── SidebarSpaceHeader        ← workspace name + gear icon（→ Settings mode）
│   ├── SessionSearch             ← 搜尋框（client-side filter）
│   ├── WorkspaceFolderList
│   │   ├── WorkspaceFolder       ← 可折疊 folder row（click → toggle）
│   │   │   ├── SessionItem...    ← 縮排（pl-6）
│   │   │   └── NewSessionBtn     ← folder 內新增 session
│   ├── StandaloneSessionList     ← 不屬於 workspace 的 sessions
│   ├── SessionItem               ← hover-reveal 操作
│   ├── LoadMoreBtn               ← pagination
│   └── SidebarDock               ← gear icon → setMode("settings")
│
├── ChatHeader
│   ├── AgentPills                ← per-agent chip with color dot
│   └── PanelToggleButtons        ← Members / Runs panel toggles
│
├── MessageList
│   ├── WelcomeScreen             ← no active session（scenario cards + agent chips）
│   ├── MessageItem               ← user / agent messages
│   │   ├── StreamingCursor       ← streaming 時顯示
│   │   └── AgentErrorBadge       ← WS error event
│   └── MessageQueuePanel         ← 排隊訊息
│
├── MembersPanel                  ← 右側 slide-in，width 0→220px
│   ├── AgentRow                  ← emoji + name + chat/think toggle
│   └── AddAgentMenu              ← 下拉選 agent 加入對話
│
├── RunsPanel                     ← 右側 slide-in，width 0→260px
│   │                                members open 時 right offset 220px
│   └── AgentRunBlock             ← per-agent token/cost 資訊
│
└── ChatInputArea
    ├── SkillPicker               ← "/" 觸發，↑↓ 選擇，Enter 送出
    ├── AgentPicker               ← "@" 觸發
    ├── AttachmentPreview         ← 圖片預覽（supports_image 判斷）
    └── SendButton
```

### Operation Logic 完整對齊清單

| 功能 | 原版行為 | 實作方式 |
|------|---------|---------|
| Session inline rename | double-click label → inline `<input>` → blur/Enter 送出 | `SessionItem` local state |
| Session hover-reveal | hover → 顯示 delete / download / move 按鈕 | Tailwind `group/group-hover` |
| Session move | move button → dropdown workspace list，點選移動 | `SessionMoveDropdown` |
| Workspace folder 折疊 | click folder header → toggle collapse | `useState(collapsed)` per folder |
| Workspace folder 新增 session | folder 內 "+ New Session" | POST /sessions with workspace_id |
| Session pagination | "Load more" → fetch next page | cursor-based，React Query |
| Skill picker | 輸入 "/" → popup，↑↓ focus，Enter 插入指令 | `useSkillPicker` hook |
| Agent picker | 輸入 "@name" → popup | `useAgentPicker` hook |
| Members panel slide | toggle button / keyboard → slide in/out | CSS `width` transition |
| Runs panel offset | members open → runs panel right = 220px | dynamic `right` style |
| Add agent | Members panel add menu → WS `add_agent` | WS send |
| Remove agent | agent row × → WS `remove_agent` | WS send |
| Per-agent mode toggle | chat / think button in Members panel → WS `set_mode` | WS send |
| Image attach | file input → FileReader base64 → preview → WS 含 image | `useImageAttachment` |
| Export | MD / JSON / PDF download | `useExport` hook |
| Scenario cards | welcome screen → 點擊預填 agents + system prompt | GET /scenarios |
| Session search | input → client-side filter sessions | `useMemo` filter |
| WS reconnect | 斷線 → auto-reconnect with backoff | 現有 `useWebSocket`（已實作）|
| Rate limit | WS rate limit msg → UI 提示 | WS `rate_limit` event handler |
| Message copy | hover message → copy button | clipboard API |

### Workspace Logic

```
Workspace
├── name              ← sidebar folder 顯示名稱
├── instructions      ← 長文 context（每次 session 開始注入 prompt）
├── files[]           ← 上傳的文件（@filename 注入全文）
└── defaultAgents[]   ← 新 session 自動加入的 agents

Session
└── workspaceId?      ← null = standalone session
```

- Workspace context 注入：Chat Server 在 `build_prompt()` 時自動帶入
- `@filename` 注入：Python Server 讀 workspace files 資料夾
- Session move：PATCH /sessions/:id `{ workspaceId }`
- Arc-style sidebar：workspace = folder，session = file in folder

---

## 四、Settings Mode

### 入口

- Top nav `Settings` tab（⌘3）
- Chat sidebar dock gear icon → `setMode("settings")`
- URL 不變（不是 route，是 mode state）

### API 架構：前端雙 client

```
SettingsPage
  ├── chatClient    → VITE_CHAT_URL  (:8000)   Chat agents / skills / workspaces
  └── coworkClient  → VITE_COWORK_URL (:3100)  Cowork agents（read-only）
```

`chatClient` 與現有 `api` client（Paperclip `/api`）分開，打不同 base URL。

### 統一 Agent 型別

```typescript
type UnifiedAgent = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  source: "chat" | "cowork";

  // Chat-specific
  model?: string;
  skills?: string[];
  agentMd?: string;
  soulMd?: string;
  identityMd?: string;

  // Cowork-specific (read-only)
  budget?: number;
  role?: string;
  adapterType?: string;
};
```

### Settings 元件樹

```
SettingsPage
├── SettingsNav（左側 220px）
│   └── SettingsNavItem × 7
│       LLM | Agents | Skills | Workspaces | Marketplace | 靈魂 | About
│
├── LLMTab
│   ├── LLMListPanel              ← 左：agent list（CLI/Ollama configs）
│   └── LLMConfigPanel            ← 右：model string、system prompt、temperature、+ Add
│
├── AgentsTab
│   ├── AgentListPanel            ← unified list
│   │   └── AgentRow              ← emoji + name + [Chat] or [Cowork] badge
│   └── AgentDetailPanel（slide-in）
│       ├── ChatAgentDetail       ← source=chat：AGENT.md / SOUL.md / IDENTITY.md editors + skills checklist
│       └── CoworkAgentDetail     ← source=cowork：read-only fields（budget、role、adapter）
│
├── SkillsTab
│   ├── SkillGrid                 ← installed skills（slug + description）
│   ├── SkillEditPanel（slide-in）← SKILL.md editor + frontmatter fields
│   └── AddSkillPanel（slide-in） ← paste YAML 或上傳 .zip
│
├── WorkspacesTab
│   ├── WorkspaceList
│   └── WorkspaceDetail（slide-in）
│       ├── InstructionsEditor    ← 長文 textarea
│       ├── FilesList             ← 已上傳文件 + upload button
│       └── DefaultAgentsPicker  ← checklist 選預設 agents
│
├── MarketplaceTab                ← Phase 1 browse-only
│   ├── TemplateTypeToggle        ← Agents / Skills 切換
│   ├── AgentTemplateGrid         ← template cards（from marketplace/ dir）
│   ├── SkillTemplateGrid
│   └── TemplateDetailPanel       ← 詳情（read-only），fork button（Phase 2 才實作）
│
├── SoulTab
│   └── SoulEditor                ← 四個 markdown editors
│       ├── AgentMdEditor         ← agent.md（預設人格 prompt）
│       ├── SoulMdEditor          ← soul.md（價值觀與動機）
│       ├── MemoryMdEditor        ← memory.md（預設記憶模板）
│       └── IdentityMdEditor      ← identity.md（角色身份）
│
└── AboutTab                      ← 靜態版本資訊 + 後端健康狀態
```

---

## 五、Settings Tabs 詳細規格

### LLM Tab

- 左欄：list of agents（從 `GET /agents` 讀，filter by has model config）
- 右欄：selected agent 的 model config（model string、temperature、system prompt）
- 支援 CLI-based（claude、gemini、codex）和 Ollama
- "+ Add" 新增 LLM config（只在 Chat side）

### Agents Tab

**資料來源：**

```
chatClient.get("/agents")    → ChatAgent[]
coworkClient.get("/api/agents") → CoworkAgent[]
→ map both to UnifiedAgent
→ sort: chat agents first，cowork agents below（Phase 1）
```

**Chat agent actions：**
- Edit（開啟 detail slide-in）
- Delete（確認 modal）
- Enable / Disable toggle

**Cowork agent：**
- read-only badge
- 點擊開啟 detail panel（唯讀，顯示 role / adapter / budget）
- "在 Cowork 管理 →" link（切換到 Cowork mode 對應頁面）

### Skills Tab

**資料來源：** `chatClient.get("/skills")`（filesystem 掃 `skills/`）

**Skill 唯一性注意：** 同一個 skill file 被所有人 reference，UI 要顯示警告：「修改此 skill 會影響所有使用它的 agent」

**Actions：** Edit SKILL.md、Delete（有人使用時需確認）、+ Add

### Workspaces Tab

**資料來源：** `chatClient.get("/workspaces")`

**Detail panel：**
- Instructions textarea（自動 save on blur）
- Files list（顯示 workspace files 下的文件）+ 上傳
- Default agents：checklist

### Marketplace Tab（Phase 1 browse-only）

- 從本地 `marketplace/` 目錄讀取（`chatClient.get("/marketplace/agents")` + `"/marketplace/skills"`)
- Template cards：icon + name + description + tags
- Detail panel：完整資訊（唯讀）
- Fork button 顯示但 disabled，tooltip："Fork 功能將在 Phase 2 開放"

### 靈魂 Tab（Soul）

- 對應 `agents/_default/`（或 marketplace Default template）
- 四個 markdown editor（CodeMirror 或 textarea）
- Auto-save on blur

### About Tab

- App version（`GET /health` 取得）
- Chat server status（:8000）
- Cowork server status（:3100）
- 靜態說明文字

---

## 六、Phase 1 vs Phase 2 邊界

| 功能 | Phase 1 | Phase 2 |
|------|---------|---------|
| ModeToggle 3-tab | ✅ | — |
| Chat UI full rewrite | ✅ | — |
| Settings 7 tabs | ✅（Marketplace browse-only）| — |
| Agents unified list | ✅（display-only bridge）| — |
| Cowork agent edit in Settings | ❌ read-only | ✅ |
| Marketplace fork flow | ❌ | ✅ |
| Marketplace sync / lineage | ❌ | ✅ |
| Agent template registry.json | ❌ | ✅ |
| Chat ↔ Cowork agent unification | ❌ | ✅ |
| Settings as unified single backend | ❌ | ✅ |

---

## 七、不做的事（Phase 1）

- Settings 頁面自己的 URL / route（是 mode state，不是 /settings route）
- Cowork agents 在 Settings 內 edit / delete
- Marketplace fork、sync、lineage tracking
- Agent template registry（registry.json 更新）
- Chat ↔ Cowork agent 格式統一轉換
- Settings Gateway 中間層（純前端 dual-client 就夠）

---

## 八、現有 worktree 的銜接

目前 `feat/chat-cowork-phase1` 已完成：
- ✅ ModeToggle（2-tab Chat / Cowork）
- ✅ AppShell + mode state + health checks
- ✅ 基礎 ChatPage（無 Arc-style sidebar）
- ✅ ⌘1 / ⌘2 keyboard shortcuts
- ✅ Playwright e2e tests

新計畫在此 worktree 繼續，擴充：
- ModeToggle 2-tab → 3-tab + ⌘3
- ChatPage 重寫為完整 Arc-style
- 加入 SettingsPage
- 刪除舊的 `2026-03-21-chat-settings-panel.md` 計畫
