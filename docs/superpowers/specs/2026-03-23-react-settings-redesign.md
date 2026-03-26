# React Settings Page Redesign

**Date:** 2026-03-23
**Status:** Design approved, pending implementation plan

## Problem

The React Settings page (`ChatSettings.tsx`) is a 71-line read-only agent list. The original `static/index.html` has a full 7-tab Settings panel with complete CRUD for models, agents, skills, workspaces, default templates, marketplace, and system info. The React version needs feature parity.

## Design Principles

### Settings affects both Chat and Cowork

Settings is the shared configuration layer for both Chat (Python backend) and Cowork (Node.js/Mth backend). Changes made in Settings flow to both modes:
- Agent configuration determines which agents appear in Chat conversations
- Skill configuration determines what `/skill` commands are available
- Future: Cowork agents will be visible in Settings and invocable from Chat mode

### Marketplace = Read-Only Template Library

Marketplace items (agents and skills) are templates. They are READ-ONLY from the Settings perspective. Users interact with marketplace through:
- **Browse**: view available templates
- **Fork**: copy template → create a new installed agent/skill → customize

Marketplace content sources (current + future):
1. External push to `marketplace/` directory
2. Marketplace UI for creating new templates (future)
3. Git or external install (future)
4. Push from Settings after creation (future)
5. GitHub repo management (future)

### Agent Isolation

Each agent is unique with its own folder (`agents/{name}/`). An agent can only see:
- Its own `AGENT.md`, `IDENTITY.md`, `SOUL.md`
- Its own `memory/` directory
- Its assigned skills (via `skills[]` in config)

Agents cannot access each other's data.

### Two Paths to Create

Both agents and skills follow the same creation pattern:
1. **Fork from Marketplace** — copy template, then customize
2. **Create from scratch** — blank + `_default` template

## Architecture

### File Structure

```
ui/src/chat/settings/
├── SettingsShell.tsx        ← Tab nav framework + left sidebar
├── ModelsTab.tsx            ← Model CRUD (CLI + Ollama API)
├── AgentsTab.tsx            ← Agent CRUD + MD editing + skills
├── AgentMarketTab.tsx       ← Agent marketplace (browse + fork)
├── SkillsTab.tsx            ← Skill CRUD + upload (acts as skill marketplace too)
├── WorkspacesTab.tsx        ← Workspace CRUD + files + default agents
├── SoulTab.tsx              ← Default template editing (AGENT/IDENTITY/SOUL/USER.md)
├── AboutTab.tsx             ← Static system info
└── useSettingsApi.ts        ← Shared react-query hooks for all settings endpoints
```

### Layout

```
┌──────────────────────────────────────────────────┐
│  ModeToggle (Chat | Cowork | Settings)           │
├────────┬─────────────────────────────────────────┤
│ 模型   │                                         │
│ 代理人 │   Tab content area                       │
│ 市場   │   (each tab controls its own layout:     │
│ 技能   │    list+detail or grid or single-column) │
│ 工作區 │                                         │
│ 靈魂   │                                         │
│ 關於   │                                         │
└────────┴─────────────────────────────────────────┘
```

- Left nav: fixed ~200px, vertical tab items
- Content area: flex-1, each tab owns its internal layout
- No "← 返回" button (ModeToggle handles mode switching)

## Tab Specifications

### 1. Models Tab (模型)

**Layout:** List + Detail (two columns)

**Left column — Model list:**
- Each item: emoji + name (bold, colored) + type badge (`cli` / `api`)
- Bottom: "+ 新增模型" dashed button

**Right column — Model detail (selected):**
- Header: emoji + name + "ID: {model_id}"
- Section "基本資訊":
  - Display Name → backend field: `label` (string)
  - Emoji → backend field: `emoji` (string)
  - Color → backend field: `color` (hex string)
  - For CLI type: Command → backend field: `cmd` (**array of strings**, UI shows as single input, split on spaces)
  - For API/Ollama type: Base URL → `baseUrl` (string) + Model dropdown → `apiModel` (string, from GET `/providers/ollama/models`)
  - Model Name → optional, passed as `--model` flag (stored as part of cmd or apiModel)
- Actions: 儲存 (green) + 刪除 (outline, **hard delete**)

**Additional model fields** (advanced, shown but optional):
- `supports_image` (boolean) — whether model supports image input
- `supports_thinking` (boolean) — whether model supports thinking blocks
- `idle_timeout_seconds` (number) — timeout for idle connections
- `startup_timeout_seconds` (number) — timeout for startup

**New model form:**
- Type toggle: CLI / API
- Same fields as edit, minus delete button

**Ollama-specific:**
- GET `/providers/ollama/models?base_url={url}` → populate model dropdown
- POST `/providers/ollama/pull` → streaming model download (show progress)

**Empty state:** "尚未設定模型 — 點擊 + 新增模型"

**API endpoints:**
- `GET /models` → list
- `POST /models` → create (body: `{ id, type, label, emoji, color, cmd?, baseUrl?, apiModel? }`)
- `PUT /models/{mid}` → update (body: partial fields)
- `DELETE /models/{mid}` → **hard** delete

### 2. Agents Tab (代理人)

**Layout:** List + Detail (two columns)

**Left column — Agent list:**
- Each item: emoji + name (bold, colored) + model name subtitle + enabled green dot
- Bottom: "+ 新增代理人" dashed button

**Right column — Agent detail (selected):**
- Header: emoji + name + enable/disable toggle (top-right)
- Section "基本設定":
  - 描述 → `description` (string)
  - 顏色 → `color` (hex string)
  - 模型 → `model` (select dropdown, populated from GET /models)
- Section "AGENT.MD": textarea (auto-height), loaded from GET `/agents/{name}/agent-md`
- Section "IDENTITY.MD": textarea, loaded from GET `/agents/{name}/identity`
- Section "SOUL.MD": textarea, loaded from GET `/agents/{name}/soul`
- Section "技能": checkbox list (from GET /skills), multi-select → `skills[]`
- Actions: 儲存 button
- Test connection: POST `/agents/{name}/test` → shows success/error message

**Agent "delete" = disable:** `DELETE /agents/{name}` sets `enabled: false` (soft delete). The toggle in the header controls this. No hard delete button — agent data is preserved for history integrity.

**New agent form:**
- Two options presented: "從市場 Fork" (→ switches to Market tab) or "從零開始"
- From scratch: name, emoji, model select → creates with _default templates
- **Name validation:** no `/\. ` (slashes, backslash, dot, space), max 64 chars
- **Default behavior:** if no skills specified, backend auto-assigns ALL installed skills

**API endpoints:**
- `GET /agents` → list: `[{ name, emoji, color, description, model, skills[], enabled, source: "chat" }]`
- `GET /agents/{name}` → detail (full config.json)
- `POST /agents` → create (body: `{ name, emoji, color, description, model, skills?, enabled }`)
- `PUT /agents/{name}` → update config (body: partial fields)
- `DELETE /agents/{name}` → soft delete (sets enabled=false)
- `GET /agents/{name}/agent-md` → `{ content: string }`
- `PUT /agents/{name}/agent-md` → body: `{ content: string }`
- `GET /agents/{name}/identity` → `{ content: string }`
- `PUT /agents/{name}/identity` → body: `{ content: string }`
- `GET /agents/{name}/soul` → `{ content: string }`
- `PUT /agents/{name}/soul` → body: `{ content: string }`
- `POST /agents/{name}/test` → `{ ok: boolean, response?: string, error?: string }`

**Empty state:** "尚未建立代理人 — 從市場 Fork 或從零開始"

### 3. Agent Marketplace Tab (市場)

**Layout:** Single column, 2-col card grid

**Card grid:**
- Each card: emoji + name + description + "點擊查看 →"
- Installed agents show "已安裝" badge

**Installed detection:** Backend checks if `agents/{marketplace_agent_id}/` directory exists. **Known limitation:** if user forks with a custom name different from the marketplace ID, the badge will not show. This is acceptable for this phase.

**Card click → Detail view:**
- Preview: AGENT.md, IDENTITY.md, SOUL.md content (read-only)
- Fork action:
  - Custom name input (defaults to marketplace agent name)
  - Model select dropdown (from GET /models)
  - "安裝" button → POST `/marketplace/agents/{id}/install`
  - After install: invalidate agents query → switch to Agents tab with new agent selected

**Empty state:** "市場中沒有可用的模板"

**API endpoints:**
- `GET /marketplace/agents` → `[{ id, emoji, color, description, installed: bool }]`
- `GET /marketplace/agents/{id}` → `{ id, emoji, color, description, agent_md, identity_md, soul_md, installed }`
- `POST /marketplace/agents/{id}/install` → body: `{ name?, model? }` → `{ ok: true, name: string }`

### 4. Skills Tab (技能)

**Currently acts as both installed skills view AND skill marketplace.**

**Layout:** Single column

**Header:** "已安裝的技能" + "+ 新增" button + "上傳" button

**Grid:** 3-4 column cards
- Each card: 🔧 icon + `/slug` name + description preview
- Click → edit slide-in or inline expand

**Card click → Edit:**
- Name → `name` (string)
- Description → `description` (string)
- Body → `body` (markdown textarea, larger)
- 儲存 button
- **No delete button** — backend has no `DELETE /skills/{slug}` endpoint. Skill deletion is out of scope for this phase.

**New skill:** slug, name, description, body → POST `/skills`

**Upload:** file input → .zip → POST `/skills/upload` → shows result: `{ ok, created: [slugs], skipped: [slugs] }`

**Empty state:** "尚未安裝技能 — 點擊 + 新增或上傳 .zip"

**API endpoints:**
- `GET /skills` → `[{ slug, name, description, missing?, source?, source_url?, source_version? }]`
- `GET /skills/{slug}` → `{ slug, name, description, body, source?, source_url?, source_version? }`
- `POST /skills` → create (body: `{ slug, name, description, body }`)
- `PUT /skills/{slug}` → update (body: `{ name, description, body }`)
- `POST /skills/upload` → FormData with `file` (.zip)

### 5. Workspaces Tab (工作區)

**Layout:** List + Detail (two columns)

**Left column — Workspace list:**
- Each item: 📁 icon + workspace name
- Bottom: "+ 新增工作區" dashed button

**Right column — Workspace detail:**
- Header: 📁 emoji + workspace name
- Section "Instructions": system_prompt textarea + edit icon
- Section "Files": file list + "+" upload button
  - Each file: filename string + delete button
  - Empty state: "尚無文件 — 點擊 + 上傳"
- Section "預設 Agents": checkbox list (from GET /agents)
  - Hint: "開新對話時自動勾選這些 agents"
- Danger zone: "刪除此工作區（對話不會刪除）" + red 刪除 button (**hard delete**, sessions detached)

**Empty state:** "尚未建立工作區 — 點擊 + 新增工作區"

**API endpoints:**
- `GET /workspaces` → `[{ id, name, description, system_prompt, default_agents[], created_at, files[] }]`
- `POST /workspaces` → body: `{ name, description?, system_prompt?, default_agents? }` → `{ id, name, ... }`
- `GET /workspaces/{id}` → `{ id, name, description, system_prompt, default_agents[], files: string[] }` (files is flat filename list)
- `PUT /workspaces/{id}` → body: partial fields
- `DELETE /workspaces/{id}` → hard delete + sessions detached
- `POST /workspaces/{id}/files` → FormData with `file` → `{ ok, filename }`
- `DELETE /workspaces/{id}/files/{filename}` → `{ ok }`

### 6. Soul Tab (靈魂)

**Layout:** Single column, 2x2 card grid

**Four cards:**
1. **AGENT.md** — 行為指令: "每個新代理人的基礎行為規範。定義角色職責、工作流程與回應風格。"
2. **IDENTITY.md** — 身份設定: "代理人的基本身份：名字、背景、個性特質。讓 AI 知道「我是誰」。"
3. **SOUL.md** — 靈魂個性: "更深層的價值觀與思考風格。決定代理人如何思考、表達，以及與人互動的氣質。"
4. **USER.md** — 關於你自己: "告訴代理人你是誰、你的背景和偏好。每個代理人都會在對話前讀取這份文件。"

Each card shows content preview (first ~3 lines).

**Card click → Edit mode:**
- Full markdown textarea
- 儲存 button

**Bottom note:** "點選卡片即可編輯。新建代理人時會從這裡複製內容，{name} 會被替換成代理人名稱"

**API note:** The first three cards use `agents/_default/` endpoints. USER.md uses a separate endpoint (`/user/md`) and lives at `PROJECT_DIR/USER.md`, not under `agents/_default/`. Despite the different storage, the UI treats all four cards uniformly.

**API endpoints:**
- `GET/PUT /agents/_default/agent-md` → `{ content: string }`
- `GET/PUT /agents/_default/identity` → `{ content: string }`
- `GET/PUT /agents/_default/soul` → `{ content: string }`
- `GET/PUT /user/md` → `{ content: string }`

### 7. About Tab (關於)

**Layout:** Single column, static content

**Content:**
- Title: "MeowTiehEightgent" (purple, bold)
- Subtitle: "多 Agent 協作對話平台"
- Section "這是什麼": platform description
- Section "核心功能": feature list with emoji bullets
- Section "技術架構": tech stack description

**No API calls.** Pure static render.

## Shared API Hook — useSettingsApi.ts

React Query hooks shared across all tabs:

```typescript
// Models
useModels()                    → GET /models
useCreateModel()               → POST /models
useUpdateModel(mid)            → PUT /models/{mid}
useDeleteModel(mid)            → DELETE /models/{mid}
useOllamaModels(baseUrl)       → GET /providers/ollama/models
usePullOllamaModel()           → POST /providers/ollama/pull

// Agents (extend existing useAgentsList)
useAgentDetail(name)           → GET /agents/{name}
useCreateAgent()               → POST /agents
useUpdateAgent(name)           → PUT /agents/{name}
useDeleteAgent(name)           → DELETE /agents/{name}  (soft: enabled=false)
useAgentMd(name)               → GET /agents/{name}/agent-md
useUpdateAgentMd(name)         → PUT /agents/{name}/agent-md
useAgentIdentity(name)         → GET /agents/{name}/identity
useUpdateAgentIdentity(name)   → PUT /agents/{name}/identity
useAgentSoul(name)             → GET /agents/{name}/soul
useUpdateAgentSoul(name)       → PUT /agents/{name}/soul
useTestAgent(name)             → POST /agents/{name}/test

// Marketplace
useMarketplaceAgents()         → GET /marketplace/agents
useMarketplaceAgentDetail(id)  → GET /marketplace/agents/{id}
useInstallMarketplaceAgent()   → POST /marketplace/agents/{id}/install

// Skills (no delete — backend endpoint doesn't exist)
useSkillDetail(slug)           → GET /skills/{slug}
useCreateSkill()               → POST /skills
useUpdateSkill(slug)           → PUT /skills/{slug}
useUploadSkill()               → POST /skills/upload

// Workspaces (extend existing useWorkspaces)
useCreateWorkspace()           → POST /workspaces
useUpdateWorkspace(id)         → PUT /workspaces/{id}
useDeleteWorkspace(id)         → DELETE /workspaces/{id}
useUploadWorkspaceFile(id)     → POST /workspaces/{id}/files
useDeleteWorkspaceFile(id,fn)  → DELETE /workspaces/{id}/files/{fn}

// Soul (Default Templates)
useDefaultAgentMd()            → GET /agents/_default/agent-md
useUpdateDefaultAgentMd()      → PUT /agents/_default/agent-md
useDefaultIdentity()           → GET /agents/_default/identity
useUpdateDefaultIdentity()     → PUT /agents/_default/identity
useDefaultSoul()               → GET /agents/_default/soul
useUpdateDefaultSoul()         → PUT /agents/_default/soul
useUserMd()                    → GET /user/md  (note: separate from _default, lives at PROJECT_DIR/USER.md)
useUpdateUserMd()              → PUT /user/md

// Config
useConfig()                    → GET /config
useUpdateConfig()              → POST /config
```

## Data Flow Diagrams

### Agent Creation via Marketplace Fork

```
User clicks "Fork" on marketplace agent
  → POST /marketplace/agents/{id}/install { name, model }
    → Backend copies marketplace/{id}/* → agents/{name}/
    → Backend writes config.json with chosen model
    → Returns { ok: true, name }
  → Invalidate agents query
  → Switch to Agents tab with new agent selected
```

### Agent Creation from Scratch

```
User clicks "+ 新增代理人"
  → User fills: name, emoji, model
  → POST /agents { name, emoji, model }
    → Backend copies _default/* → agents/{name}/
    → Backend replaces {name} placeholders
    → Backend auto-assigns ALL installed skills (when skills not specified)
    → Returns { ok: true, name }
  → Invalidate agents query
  → New agent selected for editing
```

### Workspace ↔ Session Flow

```
Workspace has default_agents[] and system_prompt
  → When user creates session in Chat with this workspace:
    → default_agents auto-selected
    → system_prompt injected into every agent prompt
  → When workspace deleted:
    → All sessions detached (workspace_id = null)
    → Session data preserved
```

## Non-Goals (This Phase)

- Skill deletion (no backend endpoint)
- Skill Marketplace as separate tab (currently merged with Skills)
- Marketplace CRUD (create/edit/delete templates in marketplace)
- Push agent/skill to marketplace
- GitHub-based marketplace management
- Cowork agent visibility in Settings (future integration)
- Invoking Cowork agents from Chat mode
- `POST /agents/{name}/daily-summary` (exists in backend but not exposed in Settings UI)

## General UI Behaviors

- **Loading states:** Show skeleton or spinner while API calls are in flight
- **Error states:** Red alert box below the form, auto-clear after 5 seconds
- **Success feedback:** Green flash or toast on successful save/delete
- **Empty states:** Each list/grid has a descriptive empty state message (documented per tab above)

## Technical Notes

- All API calls go to Python backend (port 8000) via `chatClient`
- Use existing shadcn/ui components (Button, Input, Textarea, Select, Dialog, Card, Checkbox, Tabs, ScrollArea)
- Follow existing codebase patterns: `useState` for forms, `useQuery`/`useMutation` for API
- UI language: zh-TW
- No routing changes — Settings is a ModeToggle tab, not a route
