# Space Mode — 空間化 Agent 互動介面設計

> **Date:** 2026-03-26
> **Status:** Draft
> **Scope:** MVP (Phase 1 — 單人 + Agent 空間互動)

## 1. 概述

在 MeowTiehEightgent 的 ModeToggle 中新增第四個模式 **Space (Cmd+4)**，提供 2D 像素風格虛擬空間，讓使用者以「走近 Agent」的方式開啟對話。Space mode 是 Chat + Cowork 的空間化前端，共用同一套後端 API 與 WebSocket，後端零改動。

### 核心價值

- **直覺互動**：走近 Agent NPC 就能開始對話，取代傳統的 sidebar 選擇
- **狀態視覺化**：Agent 的 idle/chatting/working 狀態、工具使用、Cowork 事件一目了然
- **無縫連動**：Space 裡的對話就是 Chat session，切到 Chat mode 繼續，歷史完全同步

### 靈感來源

| 專案 | 借鏡 |
|------|------|
| claude-office | Agent 生命週期空間隱喻、思考/說話泡泡、token 視覺化概念 |
| PixelHQ | 工具使用泡泡（📖 讀檔 / ✏️ 寫碼 / 💭 思考） |
| Pixel Agents | Tile grid pathfinding、Canvas 2D 渲染 |
| AgentOffice | 未來參考：perception-thought-action loop（Phase 3） |

### 與同類專案的差異

claude-office 和 PixelHQ 都是**單向觀察器**（看 AI 工作），我們的 Space mode 是**雙向互動**（走近就能對話、操控 Agent）。

## 2. 整體架構

### Mode 結構

```
ModeToggle (Cmd+1/2/3/4)
  ├── Chat    (Cmd+1)  → 文字聊天介面
  ├── Cowork  (Cmd+2)  → 專案管理介面
  ├── Settings(Cmd+3)  → 設定介面
  └── Space   (Cmd+4)  → 空間介面 ← NEW
```

### 系統架構

```
┌─────────────────────────────────────────────────┐
│              React UI (port 5173)                │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ SpacePage.tsx                               │  │
│  │  ┌──────────────┬───────────────────────┐  │  │
│  │  │ PixiJS       │ ChatPanel             │  │  │
│  │  │ Canvas       │ (右側浮動)             │  │  │
│  │  │              │                       │  │  │
│  │  │ 地圖 + 人物   │ 當前 proximity        │  │  │
│  │  │ + Agent NPC  │ session 的對話串       │  │  │
│  │  │              │                       │  │  │
│  │  └──────────────┴───────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                        │                          │
│                  同一條 Chat WS                    │
│                  同一套 REST API                   │
│                        │                          │
└────────────────────────┼──────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │  Node.js (port 3100) │
              │  後端不改             │
              └─────────────────────┘
```

### 關鍵原則

1. **Space 是 Chat 的空間化 view** — 不是新系統，是同一份資料的不同呈現
2. **一個 WS 連線** — SpacePage 連的就是 `/chat/ws`，跟 ChatPage 用同一條
3. **Agent 共享** — 讀同一個 `/chat/api/agents`，在空間裡以 NPC sprite 呈現
4. **Session 共享** — 在 Space 裡開的對話，切到 Chat mode 看得到；反之亦然
5. **Cowork 事件共享** — `cowork:update` 事件在空間裡以浮動通知呈現

### 模式切換行為

- **Chat → Space**：當前 active session 的 Agent 出現在地圖上，對話繼續
- **Space → Chat**：保持 session，只是換回文字介面
- **任何 mode → Cowork**：獨立，但 Cowork 事件仍然會在 Space 裡通知

## 3. 空間引擎

### 技術選型

- **PixiJS v8**：輕量 2D WebGL/WebGPU 渲染（~200KB）
- **@pixi/tilemap**：Tiled JSON 地圖渲染
- **地圖編輯**：Tiled 桌面工具 → 匯出 JSON
- **不用 Phaser**：自帶遊戲迴圈、物理引擎、音效系統都不需要，太重

### 地圖結構（MVP 簡單大廳）

```
┌─────────────────────────────────────────┐
│                                         │
│    🤖 Claude      🦎 Gemini             │
│                                         │
│                         🦉 Ollama       │
│         👤 You                          │
│                                         │
│    🧠 Codex                             │
│                                         │
└─────────────────────────────────────────┘
```

- 單一開放空間，tile size 32x32 px
- Agent 有固定「駐點」位置（從 agent config 的 `space` 欄位設定）
- 玩家用 WASD / 方向鍵移動，8 方向
- 地圖邊界碰撞（簡單 AABB，不需物理引擎）

### Proximity 機制

```
proximity_radius: 3 tiles (96px)

玩家進入 Agent proximity →
  1. Agent sprite 高亮（發光 / 放大 / 泡泡提示）
  2. 右側 ChatPanel 自動切換到該 Agent 的 session
  3. 可按 Enter 或點擊開始對話

玩家離開 proximity →
  1. Agent 回到 idle 外觀
  2. ChatPanel 對話不關閉，但標示 "已離開範圍"
  3. 對話可繼續（proximity 是 UI 提示不是硬限制）
```

### Agent 動畫行為

- **狀態泡泡**：idle 😴 / chatting 💬 / working 🔨
- **工具使用泡泡**（借鏡 PixelHQ）：讀檔 📖 / 寫碼 ✏️ / 思考 💭
- **走動動畫**（借鏡 Pixel Agents）：Agent 狀態變化時簡單 pathfind 走到玩家附近，不是瞬移
- **Cowork 通知**：issue 事件時頭上浮動通知（💡 建立 / 📝 更新 / ✅ 完成）

### Sprite 資源

- **玩家**：開源 16-bit RPG sprite sheet（如 LPC Universal Sprite Sheet）
- **Agent**：用 agent config 的 `emoji` + `color` 自動生成（彩色圓形 + emoji）
- MVP 不需要精美美術，能辨識就好

## 4. Chat / Cowork 連動

### 與 Chat 的整合

**Session 生命週期：**

```
Space 裡走近 Agent（進入 proximity）→ ChatPanel 顯示該 Agent 預覽（名稱、狀態、emoji）
  → 玩家按 Enter 或點擊 Agent sprite 確認互動 →
    ├── 有既有 session with this agent → 載入該 session，ChatPanel 顯示歷史訊息
    └── 沒有 → 自動建立新 session（POST /chat/api/sessions）→ connect WS
```

注意：proximity 觸發的是 UI 預覽，不是自動建立 session。必須有明確的使用者互動（Enter / click）才建立連線，避免頻繁走動產生大量空 session。

**對話流程：**

```
                Space                          Chat WS (現有)
                  │                                │
  走近 Claude ────┤                                │
                  │── connect /chat/ws ───────────▶│
                  │   { agents: ["Claude"] }       │
                  │                                │
  輸入訊息 ───────┤                                │
                  │── { type:"human", text } ─────▶│
                  │                                │
                  │◀── { type:"stream_start" } ────│
                  │◀── { type:"chunk", text } ─────│  完全複用
                  │◀── { type:"message_end" } ─────│  現有協議
                  │                                │
  走近 Gemini ────┤                                │
                  │── { type:"add_agent",          │
                  │     agent:"Gemini" } ─────────▶│  多 Agent
                  │                                │  自動輪播
```

**跨 mode 同步：**
- Space 裡的對話寫入 `history/{session_id}/messages.json` — 跟 Chat mode 同一份
- 切到 Chat mode (Cmd+1)，sidebar 看到同一個 session，繼續打字
- 切回 Space (Cmd+4)，地圖狀態保持，ChatPanel 自動更新

**多 Agent proximity 場景：**

```
你站在 Claude 和 Gemini 中間（兩個都在 proximity 內）
  → session 自動包含兩個 agent
  → 變成多 Agent 對話（round-robin）
  → ChatPanel 顯示多人對話串

走離 Gemini（只剩 Claude 在 proximity）
  → Gemini 不踢出 session（軟限制）
  → UI 標示 Gemini "遠端參與"（灰色 avatar）
  → 可以手動 remove_agent 如果不需要
```

### 與 Cowork 的整合

**狀態映射：**

| Cowork Event | Space 呈現 |
|---|---|
| `cowork:update` issue_created | 💡 Agent 頭上浮動 "建立了 Issue #42" |
| `cowork:update` issue_updated | 📝 Agent 頭上浮動 "更新了 Issue #42" |
| `cowork:update` issue_completed | ✅ Agent 頭上浮動 "完成了 Issue #42" |
| `agent:status` idle | 😴 正常站立 |
| `agent:status` chatting | 💬 說話泡泡動畫 |
| `agent:status` working | 🔨 敲擊動畫 + 頭上顯示任務 |

**Intent 路由不變：**
- Agent 在 Space 對話中決定要建 issue → 送 `agent:intent` → intent-router 處理 → Cowork API → `cowork:update` event → 空間內即時通知
- 完全複用現有 pipeline，Space 只是多一個 event consumer

## 5. Data Model & 新增事件

### 後端擴展（Phase 2 多人時才需要）

MVP 是單人模式，不需要後端改動。Phase 2 多人同步時新增：

**新增 WS Client → Server：**
```typescript
| { type: "space:move"; x: number; y: number; direction: string }
| { type: "space:join"; mapId: string }
| { type: "space:leave" }
```

**新增 WS Server → Client：**
```typescript
| { type: "space:player_moved"; userId: string; nickname: string; x: number; y: number; direction: string }
| { type: "space:player_joined"; userId: string; nickname: string; x: number; y: number }
| { type: "space:player_left"; userId: string }
| { type: "space:state"; players: PlayerState[]; agents: AgentPosition[] }
```

### Agent 位置設定

在 agent config 加 optional `space` 欄位：

```jsonc
// agents/claude/config.json
{
  "name": "Claude",
  "emoji": "🤖",
  "color": "#7C3AED",
  "space": {              // ← NEW, optional
    "x": 5,              // tile 座標
    "y": 3,
    "sprite": "default"  // 未來可自訂 sprite sheet
  }
}
```

沒有 `space` 欄位的 agent → 自動分配隨機位置。

### 地圖資料

```
maps/
  └── default/
      ├── map.json        ← Tiled 匯出的 JSON
      ├── tileset.png     ← tile 圖片
      └── config.json     ← 地圖 metadata
```

```jsonc
// maps/default/config.json
{
  "id": "default",
  "name": "智囊團大廳",
  "width": 20,
  "height": 15,
  "tile_size": 32,
  "spawn_point": { "x": 10, "y": 12 }
}
```

### 前端狀態管理

```typescript
// ui/src/space/SpaceContext.tsx
interface SpaceState {
  mapId: string;
  localPlayer: PlayerState;
  remotePlayers: Map<string, PlayerState>;  // Phase 2
  agentPositions: Map<string, AgentPosition>;
  proximityAgents: string[];
  activeSessionId: string | null;
}

interface PlayerState {
  userId: string;
  nickname: string;
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

interface AgentPosition {
  agentId: string;
  x: number;
  y: number;
  status: "idle" | "chatting" | "working";
  currentTask?: string;
}
```

### 前端檔案結構

```
ui/src/space/
  ├── SpacePage.tsx          ← 主頁面（PixiJS canvas + ChatPanel）
  ├── SpaceContext.tsx       ← 空間狀態管理
  ├── engine/
  │   ├── SpaceEngine.ts     ← PixiJS 初始化、渲染迴圈
  │   ├── TileMap.ts         ← 地圖載入與渲染
  │   ├── PlayerSprite.ts    ← 玩家角色
  │   ├── AgentSprite.ts     ← Agent NPC 角色 + 泡泡動畫
  │   └── ProximitySystem.ts ← proximity 偵測邏輯
  ├── components/
  │   ├── ChatPanel.tsx      ← 右側對話面板（複用 Chat 元件）
  │   └── AgentBubble.tsx    ← Agent 頭上的狀態/通知泡泡
  └── hooks/
      ├── useSpaceWs.ts      ← space 相關 WS 訊息處理
      └── useProximity.ts    ← proximity 計算 + session 管理
```

## 6. MVP Scope

### ✅ MVP 做

| 功能 | 說明 |
|------|------|
| Space mode (Cmd+4) | ModeToggle 加第四個 tab |
| PixiJS 地圖渲染 | 簡單大廳，Tiled JSON 載入 |
| 玩家移動 | WASD / 方向鍵，8 方向，邊界碰撞 |
| Agent NPC 呈現 | emoji + color 化身，固定駐點 |
| Proximity 偵測 | 3 tile 範圍，高亮 + 泡泡提示 |
| ChatPanel 連動 | 走近 Agent 自動開 session，右側面板對話 |
| Agent 狀態泡泡 | idle 😴 / chatting 💬 / working 🔨 |
| 工具使用泡泡 | 讀檔 📖 / 寫碼 ✏️ / 思考 💭 |
| Agent 走動動畫 | 狀態變化時簡單 pathfind 到玩家附近 |
| Cowork 事件通知 | issue 建立/完成浮動通知 |
| Session 共享 | 跟 Chat mode 同一份 history |
| 多 Agent proximity | 同時走近多個 Agent → 多人對話 |

### ❌ MVP 不做

| 功能 | 原因 | Phase |
|------|------|-------|
| 多人同步 | 先驗證單人核心體驗 | Phase 2 |
| 視訊/語音 | 小團隊用外部工具 | Phase 2 |
| 地圖編輯器 | 用 Tiled 桌面工具 | Phase 3 |
| 自訂 sprite sheet | emoji + color 夠用 | Phase 2 |
| MiniMap | 大廳夠小 | Phase 2 |
| Agent-to-Agent 互動 | 複雜度太高 | Phase 3 |
| 動態地圖生成 | 同時解兩個難題 | Phase 3 |
| Token 視覺化 gauge | 非核心 | Phase 2 |

### Phase 規劃

```
Phase 1 (MVP)      → 單人 + Agent 空間互動 + Chat/Cowork 連動
Phase 2 (多人)     → space:* WS 訊息、多人同步、token gauge、主題分區、自訂 sprite
Phase 3 (智慧空間)  → 動態地圖、Agent 自主移動策略、workspace ↔ zone 綁定
```

## 7. 測試策略

| 層級 | 方式 | 覆蓋範圍 |
|------|------|----------|
| Unit | Vitest | ProximitySystem、TileMap 載入、SpaceContext 狀態邏輯 |
| Integration | Vitest + mock WS | ChatPanel 連動、session 自動建立、agent:status 映射 |
| E2E | Playwright | 進入 Space → 移動 → 走近 Agent → 對話 → 切 Chat mode 驗證 session |
| Visual | Playwright screenshot | 地圖渲染、Agent sprite、泡泡動畫 |

## 8. 成功標準

1. 進入 Space mode 看到地圖 + 所有 enabled Agent 的 NPC
2. 走近 Agent → 高亮 + 泡泡 → ChatPanel 出現 → 能對話 → 收到回應
3. 切到 Chat mode (Cmd+1) → 看到剛才的 session + 完整對話歷史
4. Agent 收到 cowork:update → 頭上出現對應通知泡泡
5. Agent chatting 時顯示說話泡泡動畫，idle 時回到待機狀態
