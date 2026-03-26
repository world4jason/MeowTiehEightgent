# Space Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "Space" mode (Cmd+4) to ModeToggle — a 2D PixiJS virtual space where users walk up to Agent NPCs to start conversations, with full Chat/Cowork integration.

**Architecture:** Pure frontend addition. SpacePage renders a PixiJS canvas with a tile map, player character, and Agent NPC sprites. Proximity detection triggers ChatPanel (right-side overlay) which reuses the existing Chat WS protocol. No backend changes needed for MVP.

**Tech Stack:** PixiJS v8, @pixi/tilemap, Tiled JSON maps, React 19, Tailwind CSS, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-26-space-mode-design.md`

---

## File Structure

```
ui/src/space/
  ├── SpacePage.tsx              ← Main page (PixiJS canvas + ChatPanel)
  ├── SpaceContext.tsx           ← Space state (player pos, agents, proximity)
  ├── engine/
  │   ├── SpaceEngine.ts         ← PixiJS app init, render loop, keyboard input
  │   ├── TileMap.ts             ← Load Tiled JSON, render tile layers
  │   ├── PlayerSprite.ts        ← Local player avatar, movement, collision
  │   ├── AgentSprite.ts         ← Agent NPC sprite, status bubbles, walk animation
  │   └── ProximitySystem.ts     ← Distance calc, enter/leave events
  ├── components/
  │   ├── SpaceChatPanel.tsx     ← Right-side chat panel (reuses MessageList + ChatInputArea)
  │   └── AgentPreview.tsx       ← Hover card when near agent (before Enter)
  └── hooks/
      ├── useSpaceWs.ts          ← WS message handling for space-specific events
      └── useProximity.ts        ← Proximity → session management bridge

maps/
  └── default/
      ├── map.json               ← Tiled JSON (simple hall)
      ├── tileset.png            ← 32x32 tile atlas
      └── config.json            ← Map metadata (size, spawn point)

ui/src/chat/types.ts             ← Modify: add "space" to ChatMode
ui/src/components/ModeToggle.tsx ← Modify: add Space button + Cmd+4
ui/src/App.tsx                   ← Modify: render SpacePage, add keyboard shortcut
```

---

### Task 1: Install Dependencies & Add ChatMode "space"

**Files:**
- Modify: `ui/package.json`
- Modify: `ui/src/chat/types.ts:53`
- Modify: `ui/src/components/ModeToggle.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Install PixiJS dependencies**

```bash
cd ui && pnpm add pixi.js@^8 @pixi/tilemap
```

- [ ] **Step 2: Add "space" to ChatMode type**

In `ui/src/chat/types.ts`, line 53, change:

```typescript
export type ChatMode = "chat" | "cowork" | "settings";
```

to:

```typescript
export type ChatMode = "chat" | "cowork" | "settings" | "space";
```

- [ ] **Step 3: Add Space button to ModeToggle**

In `ui/src/components/ModeToggle.tsx`, add a `spaceOnline` prop and a fourth button:

```typescript
import { ChatMode } from "../chat/types";
import type { ReactNode } from "react";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chatOnline: boolean;
  coworkOnline: boolean;
  settingsOnline: boolean;
  spaceOnline?: boolean;
  hasUnreadChat?: boolean;
}

export function ModeToggle({
  mode, onModeChange, chatOnline, coworkOnline, settingsOnline, spaceOnline = true, hasUnreadChat,
}: ModeToggleProps) {
  const btn = (m: ChatMode, label: string, offline: boolean, extra?: ReactNode) => (
    <button
      aria-pressed={mode === m}
      onClick={() => onModeChange(m)}
      className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        mode === m
          ? "bg-background shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {!offline && (
        <span
          data-testid={`${m}-offline`}
          className="h-1.5 w-1.5 rounded-full bg-destructive"
          title="Offline"
        />
      )}
      {extra}
    </button>
  );

  return (
    <div
      data-testid="mode-toggle"
      className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {btn("chat", "Chat", chatOnline,
        hasUnreadChat && mode !== "chat"
          ? <span data-testid="chat-unread-badge" className="h-1.5 w-1.5 rounded-full bg-primary" title="New message" />
          : undefined
      )}
      {btn("cowork", "Cowork", coworkOnline)}
      {btn("settings", "Settings", settingsOnline)}
      {btn("space", "Space", spaceOnline)}
    </div>
  );
}
```

- [ ] **Step 4: Add Cmd+4 shortcut and SpacePage placeholder in App.tsx**

In App.tsx, add the keyboard shortcut for Cmd+4. In the mode state initializer, add `"space"` to the valid stored values. Add a placeholder SpacePage div:

```typescript
// In useState initializer, add "space":
const [mode, setMode] = useState<ChatMode>(() => {
  const stored = localStorage.getItem("preferred-mode");
  return stored === "chat" || stored === "cowork" || stored === "settings" || stored === "space"
    ? stored : "chat";
});

// In keyboard handler, add:
if ((e.metaKey || e.ctrlKey) && e.key === "4") { e.preventDefault(); setMode("space"); }

// In render, add placeholder:
{mode === "space" && (
  <div className="flex flex-1 items-center justify-center text-muted-foreground">
    Space mode coming soon...
  </div>
)}
```

- [ ] **Step 5: Verify build compiles**

```bash
cd ui && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add ui/package.json ui/pnpm-lock.yaml ui/src/chat/types.ts ui/src/components/ModeToggle.tsx ui/src/App.tsx
git commit -m "feat(space): add Space mode to ModeToggle with Cmd+4 shortcut"
```

---

### Task 2: Space Types & Context

**Files:**
- Create: `ui/src/space/types.ts`
- Create: `ui/src/space/SpaceContext.tsx`
- Test: `ui/src/space/__tests__/SpaceContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `ui/src/space/__tests__/SpaceContext.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpaceProvider, useSpace } from "../SpaceContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SpaceProvider>{children}</SpaceProvider>
);

describe("SpaceContext", () => {
  it("provides default state", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    expect(result.current.localPlayer).toEqual({
      x: 10,
      y: 12,
      direction: "down",
    });
    expect(result.current.proximityAgents).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });

  it("updates player position", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.movePlayer(5, 3, "left");
    });
    expect(result.current.localPlayer).toEqual({ x: 5, y: 3, direction: "left" });
  });

  it("sets proximity agents", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.setProximityAgents(["Claude", "Gemini"]);
    });
    expect(result.current.proximityAgents).toEqual(["Claude", "Gemini"]);
  });

  it("sets active session id", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.setActiveSessionId("session-123");
    });
    expect(result.current.activeSessionId).toBe("session-123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ui && pnpm vitest run src/space/__tests__/SpaceContext.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create space types**

Create `ui/src/space/types.ts`:

```typescript
export interface PlayerState {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

export interface AgentPosition {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  status: "idle" | "chatting" | "working";
  currentTask?: string;
}

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawnPoint: { x: number; y: number };
}

export const DEFAULT_SPAWN = { x: 10, y: 12 } as const;
export const PROXIMITY_RADIUS = 3; // tiles
export const TILE_SIZE = 32; // px
```

- [ ] **Step 4: Create SpaceContext**

Create `ui/src/space/SpaceContext.tsx`:

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PlayerState, AgentPosition } from "./types";
import { DEFAULT_SPAWN } from "./types";

interface SpaceContextValue {
  localPlayer: PlayerState;
  movePlayer: (x: number, y: number, direction: PlayerState["direction"]) => void;
  agentPositions: AgentPosition[];
  setAgentPositions: (agents: AgentPosition[]) => void;
  proximityAgents: string[];
  setProximityAgents: (agents: string[]) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  interactingAgent: string | null;
  setInteractingAgent: (name: string | null) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [localPlayer, setLocalPlayer] = useState<PlayerState>({
    x: DEFAULT_SPAWN.x,
    y: DEFAULT_SPAWN.y,
    direction: "down",
  });
  const [agentPositions, setAgentPositions] = useState<AgentPosition[]>([]);
  const [proximityAgents, setProximityAgents] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [interactingAgent, setInteractingAgent] = useState<string | null>(null);

  const movePlayer = useCallback(
    (x: number, y: number, direction: PlayerState["direction"]) => {
      setLocalPlayer({ x, y, direction });
    },
    [],
  );

  return (
    <SpaceContext.Provider
      value={{
        localPlayer,
        movePlayer,
        agentPositions,
        setAgentPositions,
        proximityAgents,
        setProximityAgents,
        activeSessionId,
        setActiveSessionId,
        interactingAgent,
        setInteractingAgent,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export function useSpace(): SpaceContextValue {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
  return ctx;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ui && pnpm vitest run src/space/__tests__/SpaceContext.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add ui/src/space/types.ts ui/src/space/SpaceContext.tsx ui/src/space/__tests__/SpaceContext.test.tsx
git commit -m "feat(space): add SpaceContext and space types"
```

---

### Task 3: ProximitySystem

**Files:**
- Create: `ui/src/space/engine/ProximitySystem.ts`
- Test: `ui/src/space/engine/__tests__/ProximitySystem.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/src/space/engine/__tests__/ProximitySystem.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { ProximitySystem } from "../ProximitySystem";
import type { AgentPosition, PlayerState } from "../../types";

function makeAgent(name: string, x: number, y: number): AgentPosition {
  return { agentId: name, name, emoji: "🤖", color: "#000", x, y, status: "idle" };
}

describe("ProximitySystem", () => {
  it("detects agents within radius", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 5, 5), makeAgent("Gemini", 20, 20)];
    const player: PlayerState = { x: 4, y: 5, direction: "right" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual(["Claude"]);
  });

  it("returns empty when no agents nearby", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 20, 20)];
    const player: PlayerState = { x: 0, y: 0, direction: "down" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual([]);
  });

  it("detects multiple agents in range", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 5, 5), makeAgent("Gemini", 6, 5)];
    const player: PlayerState = { x: 5, y: 4, direction: "down" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual(["Claude", "Gemini"]);
  });

  it("fires enter/leave callbacks", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const system = new ProximitySystem(3);
    system.onEnter = onEnter;
    system.onLeave = onLeave;

    const agents = [makeAgent("Claude", 5, 5)];

    // Move into range
    system.update({ x: 4, y: 5, direction: "right" }, agents);
    expect(onEnter).toHaveBeenCalledWith("Claude");
    expect(onLeave).not.toHaveBeenCalled();

    // Stay in range — no re-fire
    onEnter.mockClear();
    system.update({ x: 5, y: 5, direction: "right" }, agents);
    expect(onEnter).not.toHaveBeenCalled();

    // Move out of range
    system.update({ x: 20, y: 20, direction: "right" }, agents);
    expect(onLeave).toHaveBeenCalledWith("Claude");
  });

  it("uses Euclidean distance", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 0, 0)];
    // Distance = sqrt(2*2 + 2*2) = 2.83 → within 3
    expect(system.getAgentsInRange({ x: 2, y: 2, direction: "down" }, agents)).toEqual(["Claude"]);
    // Distance = sqrt(3*3 + 3*3) = 4.24 → outside 3
    expect(system.getAgentsInRange({ x: 3, y: 3, direction: "down" }, agents)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/ProximitySystem.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ProximitySystem**

Create `ui/src/space/engine/ProximitySystem.ts`:

```typescript
import type { AgentPosition, PlayerState } from "../types";

export class ProximitySystem {
  private previouslyInRange = new Set<string>();
  public onEnter?: (agentName: string) => void;
  public onLeave?: (agentName: string) => void;

  constructor(private radius: number) {}

  getAgentsInRange(player: PlayerState, agents: AgentPosition[]): string[] {
    return agents
      .filter((a) => {
        const dx = player.x - a.x;
        const dy = player.y - a.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius;
      })
      .map((a) => a.name);
  }

  update(player: PlayerState, agents: AgentPosition[]): string[] {
    const currentlyInRange = new Set(this.getAgentsInRange(player, agents));

    // Fire enter for newly in-range agents
    for (const name of currentlyInRange) {
      if (!this.previouslyInRange.has(name)) {
        this.onEnter?.(name);
      }
    }

    // Fire leave for agents that left range
    for (const name of this.previouslyInRange) {
      if (!currentlyInRange.has(name)) {
        this.onLeave?.(name);
      }
    }

    this.previouslyInRange = currentlyInRange;
    return [...currentlyInRange];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/ProximitySystem.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add ui/src/space/engine/ProximitySystem.ts ui/src/space/engine/__tests__/ProximitySystem.test.ts
git commit -m "feat(space): add ProximitySystem with enter/leave events"
```

---

### Task 4: TileMap Loader

**Files:**
- Create: `ui/src/space/engine/TileMap.ts`
- Test: `ui/src/space/engine/__tests__/TileMap.test.ts`
- Create: `ui/public/maps/default/config.json`
- Create: `ui/public/maps/default/map.json`

- [ ] **Step 1: Write the failing test**

Create `ui/src/space/engine/__tests__/TileMap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { TileMap, type TiledMapData } from "../TileMap";

const MOCK_MAP: TiledMapData = {
  width: 20,
  height: 15,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    {
      name: "ground",
      type: "tilelayer",
      width: 20,
      height: 15,
      data: Array(300).fill(1),
    },
    {
      name: "walls",
      type: "tilelayer",
      width: 20,
      height: 15,
      data: (() => {
        const d = Array(300).fill(0);
        // Top wall
        for (let x = 0; x < 20; x++) d[x] = 2;
        // Bottom wall
        for (let x = 0; x < 20; x++) d[14 * 20 + x] = 2;
        // Left wall
        for (let y = 0; y < 15; y++) d[y * 20] = 2;
        // Right wall
        for (let y = 0; y < 15; y++) d[y * 20 + 19] = 2;
        return d;
      })(),
    },
  ],
  tilesets: [],
};

describe("TileMap", () => {
  it("loads map dimensions", () => {
    const map = new TileMap(MOCK_MAP);
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
    expect(map.tileSize).toBe(32);
  });

  it("detects wall collision", () => {
    const map = new TileMap(MOCK_MAP);
    // Top-left corner is a wall (walls layer)
    expect(map.isWalkable(0, 0)).toBe(false);
    // Interior tile is walkable
    expect(map.isWalkable(5, 5)).toBe(true);
    // Edge walls
    expect(map.isWalkable(19, 0)).toBe(false);
    expect(map.isWalkable(0, 14)).toBe(false);
  });

  it("treats out-of-bounds as not walkable", () => {
    const map = new TileMap(MOCK_MAP);
    expect(map.isWalkable(-1, 0)).toBe(false);
    expect(map.isWalkable(0, -1)).toBe(false);
    expect(map.isWalkable(20, 0)).toBe(false);
    expect(map.isWalkable(0, 15)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/TileMap.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement TileMap**

Create `ui/src/space/engine/TileMap.ts`:

```typescript
export interface TiledLayer {
  name: string;
  type: "tilelayer" | "objectgroup";
  width: number;
  height: number;
  data?: number[];
}

export interface TiledMapData {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: unknown[];
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private wallData: number[];

  constructor(data: TiledMapData) {
    this.width = data.width;
    this.height = data.height;
    this.tileSize = data.tilewidth;

    const wallLayer = data.layers.find((l) => l.name === "walls" && l.type === "tilelayer");
    this.wallData = wallLayer?.data ?? Array(this.width * this.height).fill(0);
  }

  isWalkable(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) {
      return false;
    }
    return this.wallData[tileY * this.width + tileX] === 0;
  }

  getTile(layerName: string, tileX: number, tileY: number): number {
    const layer = this.wallData; // simplified for MVP
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return 0;
    return layer[tileY * this.width + tileX];
  }

  /** Pixel dimensions */
  get pixelWidth(): number {
    return this.width * this.tileSize;
  }

  get pixelHeight(): number {
    return this.height * this.tileSize;
  }
}

export async function loadMapData(mapPath: string): Promise<TiledMapData> {
  const res = await fetch(mapPath);
  if (!res.ok) throw new Error(`Failed to load map: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/TileMap.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Create default map assets**

Create `ui/public/maps/default/config.json`:

```json
{
  "id": "default",
  "name": "智囊團大廳",
  "width": 20,
  "height": 15,
  "tileSize": 32,
  "spawnPoint": { "x": 10, "y": 12 }
}
```

Create `ui/public/maps/default/map.json` — a minimal Tiled-format JSON with ground + walls layers:

```json
{
  "width": 20,
  "height": 15,
  "tilewidth": 32,
  "tileheight": 32,
  "orientation": "orthogonal",
  "renderorder": "right-down",
  "layers": [
    {
      "name": "ground",
      "type": "tilelayer",
      "width": 20,
      "height": 15,
      "data": [
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
      ]
    },
    {
      "name": "walls",
      "type": "tilelayer",
      "width": 20,
      "height": 15,
      "data": [
        2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,
        2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
      ]
    }
  ],
  "tilesets": [
    {
      "firstgid": 1,
      "name": "default",
      "tilewidth": 32,
      "tileheight": 32,
      "tilecount": 4,
      "columns": 2,
      "image": "tileset.png",
      "imagewidth": 64,
      "imageheight": 64
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/space/engine/TileMap.ts ui/src/space/engine/__tests__/TileMap.test.ts ui/public/maps/default/
git commit -m "feat(space): add TileMap loader with wall collision + default map"
```

---

### Task 5: SpaceEngine — PixiJS Canvas + Player Movement

**Files:**
- Create: `ui/src/space/engine/SpaceEngine.ts`
- Create: `ui/src/space/engine/PlayerSprite.ts`
- Create: `ui/src/space/engine/AgentSprite.ts`
- Test: `ui/src/space/engine/__tests__/PlayerSprite.test.ts`

- [ ] **Step 1: Write the failing test for player movement logic**

Create `ui/src/space/engine/__tests__/PlayerSprite.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeNextPosition, type MoveInput } from "../PlayerSprite";
import { TileMap, type TiledMapData } from "../TileMap";

const MOCK_MAP: TiledMapData = {
  width: 10,
  height: 10,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { name: "ground", type: "tilelayer", width: 10, height: 10, data: Array(100).fill(1) },
    {
      name: "walls",
      type: "tilelayer",
      width: 10,
      height: 10,
      data: (() => {
        const d = Array(100).fill(0);
        for (let x = 0; x < 10; x++) { d[x] = 2; d[90 + x] = 2; }
        for (let y = 0; y < 10; y++) { d[y * 10] = 2; d[y * 10 + 9] = 2; }
        return d;
      })(),
    },
  ],
  tilesets: [],
};

describe("computeNextPosition", () => {
  const map = new TileMap(MOCK_MAP);

  it("moves right when pressing right", () => {
    const input: MoveInput = { up: false, down: false, left: false, right: true };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toEqual({ x: 6, y: 5, direction: "right" });
  });

  it("moves diagonally", () => {
    const input: MoveInput = { up: true, down: false, left: false, right: true };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toEqual({ x: 6, y: 4, direction: "right" });
  });

  it("blocks movement into walls", () => {
    const input: MoveInput = { up: false, down: false, left: true, right: false };
    // At x=1, moving left hits x=0 which is a wall
    const result = computeNextPosition(1, 5, input, map);
    expect(result).toEqual({ x: 1, y: 5, direction: "left" });
  });

  it("returns null direction when no keys pressed", () => {
    const input: MoveInput = { up: false, down: false, left: false, right: false };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/PlayerSprite.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement PlayerSprite (pure logic + PixiJS rendering)**

Create `ui/src/space/engine/PlayerSprite.ts`:

```typescript
import { Container, Graphics, Text } from "pixi.js";
import type { TileMap } from "./TileMap";
import { TILE_SIZE } from "../types";

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface MoveResult {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

/**
 * Pure function: compute next tile position given input + collision map.
 * Returns null if no movement keys are pressed.
 */
export function computeNextPosition(
  currentX: number,
  currentY: number,
  input: MoveInput,
  map: TileMap,
): MoveResult | null {
  let dx = 0;
  let dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  if (dx === 0 && dy === 0) return null;

  // Determine direction (prefer horizontal for diagonals)
  let direction: MoveResult["direction"] = "down";
  if (dx > 0) direction = "right";
  else if (dx < 0) direction = "left";
  else if (dy < 0) direction = "up";
  else if (dy > 0) direction = "down";

  const newX = currentX + dx;
  const newY = currentY + dy;

  if (!map.isWalkable(newX, newY)) {
    // Try sliding: move on only one axis
    if (dx !== 0 && map.isWalkable(currentX + dx, currentY)) {
      return { x: currentX + dx, y: currentY, direction };
    }
    if (dy !== 0 && map.isWalkable(currentX, currentY + dy)) {
      return { x: currentX, y: currentY + dy, direction };
    }
    // Blocked on both axes — stay in place but update direction
    return { x: currentX, y: currentY, direction };
  }

  return { x: newX, y: newY, direction };
}

/**
 * PixiJS visual representation of the player.
 */
export class PlayerSpriteView extends Container {
  private body: Graphics;
  private label: Text;

  constructor(nickname: string = "You") {
    super();
    this.body = new Graphics();
    this.body.circle(0, 0, TILE_SIZE * 0.4);
    this.body.fill({ color: 0x3b82f6 }); // blue-500
    this.addChild(this.body);

    this.label = new Text({
      text: `👤 ${nickname}`,
      style: { fontSize: 10, fill: 0xffffff },
    });
    this.label.anchor.set(0.5, 1);
    this.label.y = -TILE_SIZE * 0.5;
    this.addChild(this.label);
  }

  setTilePosition(tileX: number, tileY: number) {
    this.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ui && pnpm vitest run src/space/engine/__tests__/PlayerSprite.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Create AgentSprite**

Create `ui/src/space/engine/AgentSprite.ts`:

```typescript
import { Container, Graphics, Text } from "pixi.js";
import { TILE_SIZE } from "../types";
import type { AgentPosition } from "../types";

const STATUS_EMOJI: Record<string, string> = {
  idle: "😴",
  chatting: "💬",
  working: "🔨",
};

export class AgentSpriteView extends Container {
  private body: Graphics;
  private nameLabel: Text;
  private statusBubble: Text;
  private highlight: Graphics;
  private _agentData: AgentPosition;

  constructor(agent: AgentPosition) {
    super();
    this._agentData = agent;

    // Highlight ring (hidden by default)
    this.highlight = new Graphics();
    this.highlight.circle(0, 0, TILE_SIZE * 0.55);
    this.highlight.stroke({ color: 0xfbbf24, width: 2 }); // amber-400
    this.highlight.alpha = 0;
    this.addChild(this.highlight);

    // Body circle with agent color
    const color = parseInt(agent.color.replace("#", ""), 16) || 0x6366f1;
    this.body = new Graphics();
    this.body.circle(0, 0, TILE_SIZE * 0.4);
    this.body.fill({ color });
    this.addChild(this.body);

    // Emoji label on body
    const emojiText = new Text({
      text: agent.emoji,
      style: { fontSize: 16 },
    });
    emojiText.anchor.set(0.5, 0.5);
    this.addChild(emojiText);

    // Name label below
    this.nameLabel = new Text({
      text: agent.name,
      style: { fontSize: 10, fill: 0xcccccc },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = TILE_SIZE * 0.5;
    this.addChild(this.nameLabel);

    // Status bubble above
    this.statusBubble = new Text({
      text: STATUS_EMOJI[agent.status] ?? "",
      style: { fontSize: 14 },
    });
    this.statusBubble.anchor.set(0.5, 1);
    this.statusBubble.y = -TILE_SIZE * 0.6;
    this.addChild(this.statusBubble);

    this.setTilePosition(agent.x, agent.y);
  }

  get agentData(): AgentPosition {
    return this._agentData;
  }

  setTilePosition(tileX: number, tileY: number) {
    this.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  }

  setHighlight(on: boolean) {
    this.highlight.alpha = on ? 1 : 0;
  }

  updateStatus(status: AgentPosition["status"], task?: string) {
    this._agentData = { ...this._agentData, status, currentTask: task };
    this.statusBubble.text = STATUS_EMOJI[status] ?? "";
  }

  showNotification(text: string) {
    const notif = new Text({
      text,
      style: { fontSize: 10, fill: 0xfbbf24 },
    });
    notif.anchor.set(0.5, 1);
    notif.y = -TILE_SIZE;
    this.addChild(notif);

    // Auto-remove after 3s
    setTimeout(() => {
      this.removeChild(notif);
      notif.destroy();
    }, 3000);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/space/engine/PlayerSprite.ts ui/src/space/engine/AgentSprite.ts ui/src/space/engine/__tests__/PlayerSprite.test.ts
git commit -m "feat(space): add PlayerSprite movement logic + AgentSprite NPC rendering"
```

---

### Task 6: SpaceEngine — Orchestration Layer

**Files:**
- Create: `ui/src/space/engine/SpaceEngine.ts`

- [ ] **Step 1: Implement SpaceEngine**

Create `ui/src/space/engine/SpaceEngine.ts`:

```typescript
import { Application, Graphics } from "pixi.js";
import { TileMap, loadMapData } from "./TileMap";
import { PlayerSpriteView, computeNextPosition, type MoveInput } from "./PlayerSprite";
import { AgentSpriteView } from "./AgentSprite";
import { ProximitySystem } from "./ProximitySystem";
import { TILE_SIZE, PROXIMITY_RADIUS, DEFAULT_SPAWN } from "../types";
import type { AgentPosition, PlayerState } from "../types";

export interface SpaceEngineCallbacks {
  onPlayerMove: (x: number, y: number, direction: PlayerState["direction"]) => void;
  onProximityEnter: (agentName: string) => void;
  onProximityLeave: (agentName: string) => void;
  onProximityChange: (agents: string[]) => void;
}

export class SpaceEngine {
  private app: Application;
  private tileMap: TileMap | null = null;
  private playerView: PlayerSpriteView;
  private agentViews = new Map<string, AgentSpriteView>();
  private proximitySystem: ProximitySystem;
  private keys: MoveInput = { up: false, down: false, left: false, right: false };
  private playerPos: PlayerState;
  private moveInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: SpaceEngineCallbacks;
  private groundGraphics: Graphics | null = null;

  constructor(callbacks: SpaceEngineCallbacks) {
    this.app = new Application();
    this.callbacks = callbacks;
    this.playerPos = { x: DEFAULT_SPAWN.x, y: DEFAULT_SPAWN.y, direction: "down" };
    this.playerView = new PlayerSpriteView();
    this.proximitySystem = new ProximitySystem(PROXIMITY_RADIUS);

    this.proximitySystem.onEnter = (name) => callbacks.onProximityEnter(name);
    this.proximitySystem.onLeave = (name) => callbacks.onProximityLeave(name);
  }

  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0x1a1a2e,
      antialias: false,
      resolution: 1,
    });
    container.appendChild(this.app.canvas);

    // Load map
    const mapData = await loadMapData("/maps/default/map.json");
    this.tileMap = new TileMap(mapData);

    // Draw simple ground + walls
    this.drawTiles();

    // Add player
    this.playerView.setTilePosition(this.playerPos.x, this.playerPos.y);
    this.app.stage.addChild(this.playerView);

    // Keyboard listeners
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    // Movement tick — 150ms per tile (game-like grid movement)
    this.moveInterval = setInterval(() => this.tick(), 150);
  }

  private drawTiles() {
    if (!this.tileMap) return;
    this.groundGraphics = new Graphics();

    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        const isWall = !this.tileMap.isWalkable(x, y);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        this.groundGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
        this.groundGraphics.fill({ color: isWall ? 0x2d2d44 : 0x16213e });
        this.groundGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
        this.groundGraphics.stroke({ color: 0x1a1a2e, width: 1 });
      }
    }

    this.app.stage.addChildAt(this.groundGraphics, 0);
  }

  setAgents(agents: AgentPosition[]) {
    // Remove stale views
    for (const [name, view] of this.agentViews) {
      if (!agents.find((a) => a.name === name)) {
        this.app.stage.removeChild(view);
        view.destroy();
        this.agentViews.delete(name);
      }
    }

    // Add/update views
    for (const agent of agents) {
      let view = this.agentViews.get(agent.name);
      if (!view) {
        view = new AgentSpriteView(agent);
        this.agentViews.set(agent.name, view);
        this.app.stage.addChild(view);
      }
      view.setTilePosition(agent.x, agent.y);
      view.updateStatus(agent.status, agent.currentTask);
    }
  }

  updateAgentStatus(agentName: string, status: AgentPosition["status"], task?: string) {
    const view = this.agentViews.get(agentName);
    if (view) view.updateStatus(status, task);
  }

  showAgentNotification(agentName: string, text: string) {
    const view = this.agentViews.get(agentName);
    if (view) view.showNotification(text);
  }

  highlightAgent(agentName: string, on: boolean) {
    const view = this.agentViews.get(agentName);
    if (view) view.setHighlight(on);
  }

  private tick() {
    if (!this.tileMap) return;

    const result = computeNextPosition(
      this.playerPos.x,
      this.playerPos.y,
      this.keys,
      this.tileMap,
    );

    if (!result) return;
    if (result.x === this.playerPos.x && result.y === this.playerPos.y && result.direction === this.playerPos.direction) return;

    this.playerPos = result;
    this.playerView.setTilePosition(result.x, result.y);
    this.callbacks.onPlayerMove(result.x, result.y, result.direction);

    // Update proximity
    const agentPositions = [...this.agentViews.values()].map((v) => v.agentData);
    const inRange = this.proximitySystem.update(this.playerPos, agentPositions);
    this.callbacks.onProximityChange(inRange);

    // Update highlights
    for (const [name, view] of this.agentViews) {
      view.setHighlight(inRange.includes(name));
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case "ArrowUp": case "w": case "W": this.keys.up = true; break;
      case "ArrowDown": case "s": case "S": this.keys.down = true; break;
      case "ArrowLeft": case "a": case "A": this.keys.left = true; break;
      case "ArrowRight": case "d": case "D": this.keys.right = true; break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp": case "w": case "W": this.keys.up = false; break;
      case "ArrowDown": case "s": case "S": this.keys.down = false; break;
      case "ArrowLeft": case "a": case "A": this.keys.left = false; break;
      case "ArrowRight": case "d": case "D": this.keys.right = false; break;
    }
  };

  destroy() {
    if (this.moveInterval) clearInterval(this.moveInterval);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.app.destroy(true);
  }
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd ui && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ui/src/space/engine/SpaceEngine.ts
git commit -m "feat(space): add SpaceEngine orchestration (PixiJS canvas, movement, proximity)"
```

---

### Task 7: SpaceChatPanel + AgentPreview

**Files:**
- Create: `ui/src/space/components/SpaceChatPanel.tsx`
- Create: `ui/src/space/components/AgentPreview.tsx`

- [ ] **Step 1: Create AgentPreview**

This component shows when the player is near an agent but hasn't pressed Enter yet.

Create `ui/src/space/components/AgentPreview.tsx`:

```typescript
import type { AgentPosition } from "../types";

interface AgentPreviewProps {
  agent: AgentPosition;
  onInteract: () => void;
}

export function AgentPreview({ agent, onInteract }: AgentPreviewProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{agent.emoji}</span>
        <div>
          <p className="font-medium text-sm">{agent.name}</p>
          <p className="text-xs text-muted-foreground">
            {agent.status === "idle" && "閒置中"}
            {agent.status === "chatting" && "對話中"}
            {agent.status === "working" && `處理中${agent.currentTask ? `: ${agent.currentTask}` : ""}`}
          </p>
        </div>
        <button
          onClick={onInteract}
          className="ml-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          對話 (Enter)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SpaceChatPanel**

This is the right-side chat overlay that reuses existing Chat components.

Create `ui/src/space/components/SpaceChatPanel.tsx`:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { MessageList } from "../../chat/MessageList";
import { ChatInputArea } from "../../chat/ChatInputArea";
import { useWebSocket } from "../../hooks/useWebSocket";
import type { ChatMessage, AgentInfo } from "../../chat/types";
import {
  applyThinking,
  applyStreamStart,
  applyChunkMessage,
  applyMessageEnd,
} from "../../chat/utils";

const CHAT_WS_BASE = `ws://${window.location.host}`;

interface SpaceChatPanelProps {
  sessionId: string;
  agents: AgentInfo[];
  onClose: () => void;
  onAgentStatus?: (agentName: string, status: "idle" | "chatting" | "working") => void;
  onCoworkUpdate?: (event: string, issueId: string, title: string, agentName?: string) => void;
}

export function SpaceChatPanel({
  sessionId,
  agents,
  onClose,
  onAgentStatus,
  onCoworkUpdate,
}: SpaceChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = `${CHAT_WS_BASE}/chat/ws?s=${sessionId}`;

  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as Record<string, unknown>;
      switch (msg.type) {
        case "thinking":
          setMessages((prev) => applyThinking(prev, msg.agent as string, msg.color as string | undefined));
          break;
        case "stream_start":
          setIsStreaming(true);
          setMessages((prev) => applyStreamStart(prev, msg.agent as string, msg.color as string | undefined));
          break;
        case "chunk":
          setMessages((prev) => applyChunkMessage(prev, msg.agent as string, msg.text as string));
          break;
        case "message_end":
          setIsStreaming(false);
          setMessages((prev) => applyMessageEnd(prev, msg.agent as string));
          break;
        case "ready":
          break;
        case "agent:status":
          onAgentStatus?.(msg.agentId as string, msg.status as "idle" | "chatting" | "working");
          break;
        case "cowork:update":
          onCoworkUpdate?.(msg.event as string, msg.issueId as string, msg.title as string, msg.agentId as string);
          break;
      }
    },
    [onAgentStatus, onCoworkUpdate],
  );

  const handleOpen = useCallback(() => {
    wsRef.current?.send(
      JSON.stringify({
        topic: "",
        agents: agents.map((a) => a.name),
        resume_from: sessionId,
        auto: true,
        rounds: 2,
      }),
    );
    setConnected(true);
  }, [sessionId, agents]);

  useWebSocket(wsUrl, wsRef, handleMessage, handleOpen);

  // Load existing messages
  useEffect(() => {
    fetch(`/chat/api/sessions/${sessionId}`)
      .then((res) => res.json())
      .then((data: { messages?: Array<{ agent: string; text: string; timestamp: string; color?: string }> }) => {
        if (data.messages) {
          setMessages(
            data.messages.map((m) => ({
              id: crypto.randomUUID(),
              role: m.agent === "Human" ? "user" as const : "agent" as const,
              agentName: m.agent === "Human" ? undefined : m.agent,
              agentColor: m.color,
              content: m.text,
              timestamp: new Date(m.timestamp).getTime(),
            })),
          );
        }
      })
      .catch(() => {});
  }, [sessionId]);

  const handleSend = useCallback(
    (payload: { text: string; images?: string[] }) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "human", text: payload.text, images: payload.images }));
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: payload.text,
          timestamp: Date.now(),
        },
      ]);
    },
    [],
  );

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {agents.map((a) => (
            <span key={a.name} title={a.name}>
              {a.emoji}
            </span>
          ))}
          <span className="text-sm font-medium">
            {agents.map((a) => a.name).join(", ")}
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <MessageList messages={messages} />
      </div>

      <div className="border-t border-border p-2">
        <ChatInputArea
          onSend={handleSend}
          isStreaming={isStreaming}
          disabled={!connected}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd ui && pnpm build
```

Expected: Build succeeds. (Note: ChatInputArea and MessageList props may need minor adjustments based on exact signatures — check imports at build time and fix any missing props.)

- [ ] **Step 4: Commit**

```bash
git add ui/src/space/components/AgentPreview.tsx ui/src/space/components/SpaceChatPanel.tsx
git commit -m "feat(space): add SpaceChatPanel and AgentPreview components"
```

---

### Task 8: useProximity Hook — Proximity → Session Bridge

**Files:**
- Create: `ui/src/space/hooks/useProximity.ts`

- [ ] **Step 1: Implement useProximity**

Create `ui/src/space/hooks/useProximity.ts`:

```typescript
import { useCallback, useRef } from "react";
import { useSpace } from "../SpaceContext";
import { chatClient } from "../../chat/chatClient";
import type { AgentInfo } from "../../chat/types";

/**
 * Bridges proximity events to session management.
 * - Proximity enter → show preview (SpaceContext.interactingAgent is null = preview mode)
 * - User presses Enter/clicks → create or load session → open ChatPanel
 */
export function useProximity(allAgents: AgentInfo[]) {
  const {
    proximityAgents,
    setProximityAgents,
    activeSessionId,
    setActiveSessionId,
    interactingAgent,
    setInteractingAgent,
    agentPositions,
  } = useSpace();

  // Track the closest proximity agent for preview
  const closestAgent = proximityAgents.length > 0 ? proximityAgents[0] : null;
  const closestAgentPosition = agentPositions.find((a) => a.name === closestAgent) ?? null;

  // Session cache: agentName → sessionId
  const sessionCache = useRef<Map<string, string>>(new Map());

  const startInteraction = useCallback(async () => {
    if (!closestAgent) return;

    // Check cache first
    const cached = sessionCache.current.get(closestAgent);
    if (cached) {
      setActiveSessionId(cached);
      setInteractingAgent(closestAgent);
      return;
    }

    // Create new session
    try {
      const result = await chatClient.post<{ id: string; name: string }>("/sessions", {});
      sessionCache.current.set(closestAgent, result.id);
      setActiveSessionId(result.id);
      setInteractingAgent(closestAgent);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [closestAgent, setActiveSessionId, setInteractingAgent]);

  const endInteraction = useCallback(() => {
    setInteractingAgent(null);
    // Don't clear activeSessionId — session persists, just hide panel
  }, [setInteractingAgent]);

  // Get AgentInfo objects for currently interacting agents
  const interactingAgents: AgentInfo[] = interactingAgent
    ? allAgents.filter((a) => proximityAgents.includes(a.name))
    : [];

  return {
    closestAgent: closestAgentPosition,
    isShowingPreview: closestAgent !== null && interactingAgent === null,
    isShowingChat: interactingAgent !== null && activeSessionId !== null,
    interactingAgents,
    startInteraction,
    endInteraction,
  };
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd ui && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ui/src/space/hooks/useProximity.ts
git commit -m "feat(space): add useProximity hook for session management bridge"
```

---

### Task 9: useSpaceWs Hook — Agent Status + Cowork Event Handling

**Files:**
- Create: `ui/src/space/hooks/useSpaceWs.ts`

- [ ] **Step 1: Implement useSpaceWs**

Create `ui/src/space/hooks/useSpaceWs.ts`:

```typescript
import { useCallback } from "react";
import { useSpace } from "../SpaceContext";
import type { AgentPosition } from "../types";

/**
 * Handles space-relevant WS events from SpaceChatPanel callbacks.
 * Updates agent statuses and shows cowork notifications via SpaceEngine.
 */
export function useSpaceWs(
  engineRef: React.MutableRefObject<{ updateAgentStatus: (name: string, status: AgentPosition["status"], task?: string) => void; showAgentNotification: (name: string, text: string) => void } | null>,
) {
  const { agentPositions, setAgentPositions } = useSpace();

  const handleAgentStatus = useCallback(
    (agentName: string, status: "idle" | "chatting" | "working") => {
      setAgentPositions(
        agentPositions.map((a) =>
          a.name === agentName ? { ...a, status } : a,
        ),
      );
      engineRef.current?.updateAgentStatus(agentName, status);
    },
    [agentPositions, setAgentPositions, engineRef],
  );

  const handleCoworkUpdate = useCallback(
    (event: string, issueId: string, title: string, agentName?: string) => {
      if (!agentName) return;
      const emoji =
        event === "issue_created" ? "💡" : event === "issue_completed" ? "✅" : "📝";
      const text = `${emoji} ${title}`;
      engineRef.current?.showAgentNotification(agentName, text);
    },
    [engineRef],
  );

  return { handleAgentStatus, handleCoworkUpdate };
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/space/hooks/useSpaceWs.ts
git commit -m "feat(space): add useSpaceWs hook for agent status + cowork events"
```

---

### Task 10: SpacePage — Main Page Component

**Files:**
- Create: `ui/src/space/SpacePage.tsx`
- Modify: `ui/src/App.tsx` — replace placeholder with SpacePage

- [ ] **Step 1: Implement SpacePage**

Create `ui/src/space/SpacePage.tsx`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { SpaceEngine } from "./engine/SpaceEngine";
import { SpaceProvider, useSpace } from "./SpaceContext";
import { AgentPreview } from "./components/AgentPreview";
import { SpaceChatPanel } from "./components/SpaceChatPanel";
import { useProximity } from "./hooks/useProximity";
import { useSpaceWs } from "./hooks/useSpaceWs";
import { useAgents } from "../chat/hooks/useChatApi";
import type { AgentPosition } from "./types";

function SpaceContent() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpaceEngine | null>(null);
  const { movePlayer, setProximityAgents, setAgentPositions, agentPositions } = useSpace();

  // Fetch agents from API
  const { data: agents = [] } = useAgents();
  const enabledAgents = agents.filter((a) => a.enabled);

  const { handleAgentStatus, handleCoworkUpdate } = useSpaceWs(
    engineRef as React.MutableRefObject<SpaceEngine | null>,
  );

  const {
    closestAgent,
    isShowingPreview,
    isShowingChat,
    interactingAgents,
    startInteraction,
    endInteraction,
  } = useProximity(enabledAgents);

  // Initialize engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new SpaceEngine({
      onPlayerMove: (x, y, dir) => movePlayer(x, y, dir),
      onProximityEnter: () => {},
      onProximityLeave: () => {},
      onProximityChange: (names) => setProximityAgents(names),
    });

    engineRef.current = engine;
    engine.init(canvasRef.current);

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [movePlayer, setProximityAgents]);

  // Sync agents to engine
  useEffect(() => {
    if (!engineRef.current || enabledAgents.length === 0) return;

    // Generate positions for agents that don't have space config
    const positions: AgentPosition[] = enabledAgents.map((agent, i) => {
      // Spread agents across the room
      const col = (i % 4) * 4 + 3;
      const row = Math.floor(i / 4) * 3 + 3;
      return {
        agentId: agent.name,
        name: agent.name,
        emoji: agent.emoji,
        color: agent.color,
        x: col,
        y: row,
        status: "idle" as const,
      };
    });

    setAgentPositions(positions);
    engineRef.current.setAgents(positions);
  }, [enabledAgents, setAgentPositions]);

  // Handle Enter key for interaction
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && isShowingPreview && !isShowingChat) {
        e.preventDefault();
        startInteraction();
      }
      if (e.key === "Escape" && isShowingChat) {
        e.preventDefault();
        endInteraction();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isShowingPreview, isShowingChat, startInteraction, endInteraction]);

  const { activeSessionId } = useSpace();

  return (
    <div className="flex h-full w-full">
      {/* Canvas area */}
      <div className="relative flex-1">
        <div ref={canvasRef} className="h-full w-full" />

        {/* Agent preview overlay */}
        {isShowingPreview && closestAgent && (
          <AgentPreview agent={closestAgent} onInteract={startInteraction} />
        )}
      </div>

      {/* Chat panel */}
      {isShowingChat && activeSessionId && (
        <SpaceChatPanel
          sessionId={activeSessionId}
          agents={interactingAgents}
          onClose={endInteraction}
          onAgentStatus={handleAgentStatus}
          onCoworkUpdate={handleCoworkUpdate}
        />
      )}
    </div>
  );
}

export function SpacePage() {
  return (
    <SpaceProvider>
      <SpaceContent />
    </SpaceProvider>
  );
}
```

- [ ] **Step 2: Wire SpacePage into App.tsx**

In `ui/src/App.tsx`, replace the Space placeholder with the real component:

```typescript
// Add import at top:
import { SpacePage } from "./space/SpacePage";

// Replace the placeholder div:
// FROM:
{mode === "space" && (
  <div className="flex flex-1 items-center justify-center text-muted-foreground">
    Space mode coming soon...
  </div>
)}
// TO:
{mode === "space" && <SpacePage />}
```

- [ ] **Step 3: Verify build compiles**

```bash
cd ui && pnpm build
```

Expected: Build succeeds. (Fix any import issues that surface — check exact prop types of `ChatInputArea` and `MessageList` and adjust `SpaceChatPanel` accordingly.)

- [ ] **Step 4: Manual smoke test**

```bash
cd ui && pnpm dev
```

1. Open `http://localhost:5173`
2. Press Cmd+4 → Space mode loads
3. See dark canvas with tile grid + Agent NPCs (emoji circles)
4. Move with WASD → player circle moves
5. Walk near an Agent → yellow highlight + preview card appears at bottom
6. Press Enter → right-side ChatPanel opens
7. Type a message → send to WS → get Agent response
8. Press Escape → close ChatPanel
9. Press Cmd+1 → switch back to Chat mode

- [ ] **Step 5: Commit**

```bash
git add ui/src/space/SpacePage.tsx ui/src/App.tsx
git commit -m "feat(space): add SpacePage with full PixiJS canvas + Chat integration"
```

---

### Task 11: Create Tileset Image

**Files:**
- Create: `ui/public/maps/default/tileset.png`

- [ ] **Step 1: Generate a minimal 64x64 tileset PNG**

Create a simple 2x2 tileset (4 tiles, each 32x32) using a script:

```bash
cd ui && node -e "
const { createCanvas } = require('canvas');
// If canvas not available, use a data-URL approach
// For MVP: just use a solid-color placeholder
// The real tileset can be replaced later with pixel art
console.log('Tileset needs to be created manually or with an image tool');
console.log('For MVP, SpaceEngine.drawTiles() uses Graphics primitives, not tileset images');
console.log('Tileset PNG is only needed when switching to @pixi/tilemap renderer');
"
```

For MVP, `SpaceEngine.drawTiles()` already renders tiles with PixiJS `Graphics` primitives (colored rectangles). The tileset.png is a placeholder for future Tiled editor workflow. Create a minimal 64x64 placeholder:

```bash
# Create a 1x1 transparent PNG as placeholder
cd ui/public/maps/default && printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00@\x00\x00\x00@\x08\x02\x00\x00\x00%\x0b\xe6\x89\x00\x00\x00\x19IDAT\x08\xd7c\xfc\x0f\x00\x01\x01\x00\x00\x00\xff\xff\x03\x00\x00\x02\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB\x60\x82' > tileset.png
```

Note: For a proper tileset, use any image editor to create a 64x64 PNG with 4 tiles (2x2 grid): tile 1 = floor color `#16213e`, tile 2 = wall color `#2d2d44`, tiles 3-4 = reserved. This is a cosmetic improvement and not blocking for MVP since we use Graphics primitives.

- [ ] **Step 2: Commit**

```bash
git add ui/public/maps/default/tileset.png
git commit -m "chore(space): add placeholder tileset PNG for default map"
```

---

### Task 12: Integration Test — Space ↔ Chat Session Sync

**Files:**
- Test: `ui/src/space/__tests__/integration.test.tsx`

- [ ] **Step 1: Write integration test**

Create `ui/src/space/__tests__/integration.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpaceProvider, useSpace } from "../SpaceContext";
import { ProximitySystem } from "../engine/ProximitySystem";
import type { AgentPosition } from "../types";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SpaceProvider>{children}</SpaceProvider>
);

describe("Space ↔ Chat Integration", () => {
  it("proximity system updates context proximity agents", () => {
    const system = new ProximitySystem(3);
    const agents: AgentPosition[] = [
      { agentId: "claude", name: "Claude", emoji: "🤖", color: "#7C3AED", x: 5, y: 5, status: "idle" },
    ];

    const { result } = renderHook(() => useSpace(), { wrapper });

    // Simulate proximity update
    const inRange = system.update({ x: 4, y: 5, direction: "right" }, agents);
    act(() => {
      result.current.setProximityAgents(inRange);
    });

    expect(result.current.proximityAgents).toEqual(["Claude"]);
  });

  it("session id persists across proximity changes", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });

    // Set session
    act(() => {
      result.current.setActiveSessionId("session-abc");
      result.current.setInteractingAgent("Claude");
    });

    expect(result.current.activeSessionId).toBe("session-abc");
    expect(result.current.interactingAgent).toBe("Claude");

    // Clear interaction (simulates Escape)
    act(() => {
      result.current.setInteractingAgent(null);
    });

    // Session id still available (for Chat mode sync)
    expect(result.current.activeSessionId).toBe("session-abc");
    expect(result.current.interactingAgent).toBeNull();
  });

  it("agent positions can be set and read", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });

    const agents: AgentPosition[] = [
      { agentId: "claude", name: "Claude", emoji: "🤖", color: "#7C3AED", x: 5, y: 5, status: "idle" },
      { agentId: "gemini", name: "Gemini", emoji: "🦎", color: "#34A853", x: 10, y: 3, status: "chatting" },
    ];

    act(() => {
      result.current.setAgentPositions(agents);
    });

    expect(result.current.agentPositions).toHaveLength(2);
    expect(result.current.agentPositions[0].name).toBe("Claude");
    expect(result.current.agentPositions[1].status).toBe("chatting");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd ui && pnpm vitest run src/space/__tests__/integration.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add ui/src/space/__tests__/integration.test.tsx
git commit -m "test(space): add integration tests for Space ↔ Chat session sync"
```

---

### Task 13: E2E Test — Space Mode Flow

**Files:**
- Create: `ui/e2e/features/space/space-basic.feature`
- Create: `ui/e2e/steps/space/space-basic.steps.ts`

- [ ] **Step 1: Write BDD feature**

Create `ui/e2e/features/space/space-basic.feature`:

```gherkin
Feature: Space Mode 基本互動

  Scenario: 進入 Space mode
    Given 使用者開啟首頁
    When 使用者按下 Cmd+4
    Then 應該看到 Space mode 的 canvas

  Scenario: 移動角色
    Given 使用者在 Space mode
    When 使用者按下方向鍵右
    Then 玩家角色應該向右移動

  Scenario: 走近 Agent 顯示預覽
    Given 使用者在 Space mode
    When 使用者走到 Agent 附近
    Then 應該看到 Agent 預覽卡片
    And 預覽卡片顯示 Agent 名稱

  Scenario: 開始對話
    Given 使用者看到 Agent 預覽卡片
    When 使用者按下 Enter
    Then 右側應該出現對話面板

  Scenario: 切換到 Chat mode 保留 session
    Given 使用者在 Space mode 正在對話
    When 使用者按下 Cmd+1
    Then 應該切換到 Chat mode
```

- [ ] **Step 2: Write step definitions**

Create `ui/e2e/steps/space/space-basic.steps.ts`:

```typescript
import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { BddWorld } from "../../support/world";

Given("使用者開啟首頁", async function (this: BddWorld) {
  await this.page.goto("/");
  await this.page.waitForLoadState("networkidle");
});

When("使用者按下 Cmd+4", async function (this: BddWorld) {
  await this.page.keyboard.press("Meta+4");
});

Then("應該看到 Space mode 的 canvas", async function (this: BddWorld) {
  const canvas = this.page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 5000 });
});

Given("使用者在 Space mode", async function (this: BddWorld) {
  await this.page.goto("/");
  await this.page.waitForLoadState("networkidle");
  await this.page.keyboard.press("Meta+4");
  const canvas = this.page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 5000 });
});

When("使用者按下方向鍵右", async function (this: BddWorld) {
  await this.page.keyboard.press("ArrowRight");
  await this.page.waitForTimeout(200);
});

Then("玩家角色應該向右移動", async function (this: BddWorld) {
  // Visual verification — canvas renders player; check screenshot or DOM state
  const canvas = this.page.locator("canvas");
  await expect(canvas).toBeVisible();
});

When("使用者走到 Agent 附近", async function (this: BddWorld) {
  // Move multiple times toward default agent position (3, 3)
  for (let i = 0; i < 10; i++) {
    await this.page.keyboard.press("ArrowUp");
    await this.page.waitForTimeout(160);
  }
  for (let i = 0; i < 8; i++) {
    await this.page.keyboard.press("ArrowLeft");
    await this.page.waitForTimeout(160);
  }
});

Then("應該看到 Agent 預覽卡片", async function (this: BddWorld) {
  const preview = this.page.locator("text=對話 (Enter)");
  await expect(preview).toBeVisible({ timeout: 3000 });
});

Then("預覽卡片顯示 Agent 名稱", async function (this: BddWorld) {
  const preview = this.page.locator("[class*='backdrop-blur']");
  await expect(preview).toBeVisible();
});

Given("使用者看到 Agent 預覽卡片", async function (this: BddWorld) {
  // Navigate to space mode and walk to agent
  await this.page.goto("/");
  await this.page.waitForLoadState("networkidle");
  await this.page.keyboard.press("Meta+4");
  const canvas = this.page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 5000 });

  for (let i = 0; i < 10; i++) {
    await this.page.keyboard.press("ArrowUp");
    await this.page.waitForTimeout(160);
  }
  for (let i = 0; i < 8; i++) {
    await this.page.keyboard.press("ArrowLeft");
    await this.page.waitForTimeout(160);
  }
  const preview = this.page.locator("text=對話 (Enter)");
  await expect(preview).toBeVisible({ timeout: 3000 });
});

When("使用者按下 Enter", async function (this: BddWorld) {
  await this.page.keyboard.press("Enter");
});

Then("右側應該出現對話面板", async function (this: BddWorld) {
  const panel = this.page.locator("[class*='border-l'][class*='w-80']");
  await expect(panel).toBeVisible({ timeout: 3000 });
});

Given("使用者在 Space mode 正在對話", async function (this: BddWorld) {
  // Full flow: open → space → walk → interact
  await this.page.goto("/");
  await this.page.waitForLoadState("networkidle");
  await this.page.keyboard.press("Meta+4");
  const canvas = this.page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 5000 });

  for (let i = 0; i < 10; i++) {
    await this.page.keyboard.press("ArrowUp");
    await this.page.waitForTimeout(160);
  }
  for (let i = 0; i < 8; i++) {
    await this.page.keyboard.press("ArrowLeft");
    await this.page.waitForTimeout(160);
  }
  await this.page.waitForTimeout(500);
  await this.page.keyboard.press("Enter");
  const panel = this.page.locator("[class*='border-l'][class*='w-80']");
  await expect(panel).toBeVisible({ timeout: 3000 });
});

When("使用者按下 Cmd+1", async function (this: BddWorld) {
  await this.page.keyboard.press("Meta+1");
});

Then("應該切換到 Chat mode", async function (this: BddWorld) {
  const modeToggle = this.page.locator("[data-testid='mode-toggle']");
  const chatBtn = modeToggle.locator("button", { hasText: "Chat" });
  await expect(chatBtn).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 3: Commit**

```bash
git add ui/e2e/features/space/ ui/e2e/steps/space/
git commit -m "test(space): add BDD E2E tests for Space mode basic flow"
```

---

### Task 14: Final Wiring & Polish

**Files:**
- Modify: `ui/src/space/SpacePage.tsx` — ensure keyboard focus management
- Modify: `ui/src/App.tsx` — ensure SpacePage stays mounted (like ChatPage) for state preservation

- [ ] **Step 1: Keep SpacePage mounted when switching modes**

In `ui/src/App.tsx`, apply the same pattern as ChatPage — always mount SpacePage but hide it with CSS:

```typescript
// ChatPage is always mounted (hidden div pattern):
// <div className={mode === "chat" ? "flex flex-1 overflow-hidden" : "hidden"}>
//   <ChatPage ... />
// </div>

// Apply same pattern for SpacePage:
<div className={mode === "space" ? "flex flex-1 overflow-hidden" : "hidden"}>
  <SpacePage />
</div>
```

This preserves PixiJS canvas and WS connections across mode switches.

- [ ] **Step 2: Add focus management in SpacePage**

In `SpacePage.tsx`, ensure the canvas container receives focus when Space mode becomes active, so keyboard events work immediately:

```typescript
// In SpaceContent, add:
const containerRef = useRef<HTMLDivElement>(null);

// When mode becomes active, focus the container
useEffect(() => {
  containerRef.current?.focus();
}, []);

// Add tabIndex to make container focusable:
<div ref={containerRef} className="relative flex-1" tabIndex={0}>
```

- [ ] **Step 3: Run all unit tests**

```bash
cd ui && pnpm vitest run src/space/
```

Expected: All tests pass.

- [ ] **Step 4: Run build**

```bash
cd ui && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add ui/src/App.tsx ui/src/space/SpacePage.tsx
git commit -m "feat(space): keep SpacePage mounted across mode switches + focus management"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Install deps, ChatMode type, ModeToggle, Cmd+4 | Build check |
| 2 | SpaceContext, space types | 4 unit tests |
| 3 | ProximitySystem | 5 unit tests |
| 4 | TileMap loader + default map | 3 unit tests |
| 5 | PlayerSprite + AgentSprite | 4 unit tests |
| 6 | SpaceEngine orchestration | Build check |
| 7 | SpaceChatPanel + AgentPreview | Build check |
| 8 | useProximity hook | Build check |
| 9 | useSpaceWs hook | Build check |
| 10 | SpacePage full wiring | Manual smoke test |
| 11 | Tileset placeholder | N/A |
| 12 | Integration tests | 3 integration tests |
| 13 | E2E BDD tests | 5 scenarios |
| 14 | Final wiring + polish | Full test suite |

**Total: 14 tasks, ~19 unit/integration tests, 5 E2E scenarios**

## Known Simplifications (to iterate on after MVP works)

1. **Agent walk animation** — Spec calls for agents to pathfind toward player when status changes. Current implementation uses instant `setTilePosition`. Add lerp/tween animation after core flow works.
2. **Tool-specific bubbles** — Spec calls for 📖 (read) / ✏️ (write) / 💭 (think). Current AgentSprite maps to status-level emojis only. Tool-type-specific mapping needs WS `thinking`/`stream_start` events to differentiate.
3. **Tileset rendering** — MVP uses PixiJS `Graphics` primitives. Switch to `@pixi/tilemap` + real tileset.png for proper pixel art visuals.
4. **ChatInputArea props** — SpaceChatPanel assumes `onSend({ text, images })`, `isStreaming`, `disabled` props. Exact prop names may need adjustment based on the actual ChatInputArea interface — fix at build time.
