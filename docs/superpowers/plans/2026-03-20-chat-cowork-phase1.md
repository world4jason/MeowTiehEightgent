# Chat + Cowork Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Vanilla JS chat UI with a React UI forked from Paperclip, add a Chat module, and add a top-level Chat | Cowork mode toggle — all while keeping the Python backend unchanged.

**Architecture:** Copy Paperclip's `ui/` into our repo as the React frontend. Add a `chat/` module containing 4 new components (ChatPage, SessionSidebar, MessageList, AgentMembers). Add a ModeToggle to App.tsx. WebSocket to Python :8000 is managed by a singleton hook that persists across mode switches. The Python server gains a `GET /health` endpoint. Vitest (jsdom) handles unit/component tests; Playwright handles e2e.

**Tech Stack:** Python/FastAPI (existing), React 18 + TypeScript + Vite (from Paperclip fork), Vitest + jsdom, Playwright, pnpm, WebSocket

**Worktree:** `.worktrees/feat-chat-cowork-phase1` on branch `feat/chat-cowork-phase1`

**Spec:** `docs/superpowers/specs/2026-03-20-chat-cowork-platform-design.md`

**Pre-existing test failures (ignore):** `TestSessionFolders::test_list_sessions_finds_folder_sessions`, `TestWorkspaces::test_sessions_list_includes_workspace_id`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app.py` | Modify | Add `GET /health` endpoint |
| `test_api.py` | Modify | Add `TestHealth` class |
| `ui/` | Create (copy from Paperclip) | React frontend base |
| `ui/src/chat/types.ts` | Create | Shared TypeScript types for Chat module |
| `ui/src/context/ChatContext.tsx` | Create | Global chat state (sessions, badge, WS ref) |
| `ui/src/hooks/useWebSocket.ts` | Create | Singleton WS hook with deduplication |
| `ui/src/hooks/useHealthCheck.ts` | Create | 30s health check polling → offline state |
| `ui/src/chat/AgentMembers.tsx` | Create | Agent list + status in sidebar |
| `ui/src/chat/MessageList.tsx` | Create | Chat message stream display |
| `ui/src/chat/SessionSidebar.tsx` | Create | Session list sidebar |
| `ui/src/chat/ChatPage.tsx` | Create | Root Chat layout (orchestrates all Chat components) |
| `ui/src/chat/index.ts` | Create | Module barrel export |
| `ui/src/components/ModeToggle.tsx` | Create | Chat \| Cowork tab switcher |
| `ui/src/App.tsx` | Modify | Add ModeToggle, route /chat → ChatPage |
| `ui/vitest.config.ts` | Modify | Switch to jsdom environment |
| `ui/src/chat/__tests__/useWebSocket.test.ts` | Create | WS deduplication unit tests |
| `ui/src/chat/__tests__/useHealthCheck.test.ts` | Create | Health check unit tests |
| `ui/src/chat/__tests__/ModeToggle.test.tsx` | Create | Mode toggle component tests |
| `ui/src/chat/__tests__/ChatPage.test.tsx` | Create | ChatPage message logic tests |
| `ui/e2e/chat-mode.spec.ts` | Create | Playwright e2e for critical paths |
| `ui/playwright.config.ts` | Create | Playwright config |
| `ui/.env.local` | Create | VITE_CHAT_URL, VITE_COWORK_URL |
| `marketplace/README.md` | Create | Marketplace directory scaffold |
| `marketplace/agents/.gitkeep` | Create | Directory scaffold |
| `marketplace/skills/.gitkeep` | Create | Directory scaffold |

---

## Chunk 1: Python Backend — GET /health

### Task 1: Add health endpoint + test

**Files:**
- Modify: `app.py` (after existing router setup, before `if __name__ == "__main__"`)
- Modify: `test_api.py` (add `TestHealth` class at end of file)

- [ ] **Step 1: Write the failing test**

Append to `test_api.py`:
```python
class TestHealth:
    """Phase 1 — GET /health endpoint for offline badge detection."""

    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_returns_status_ok(self, client):
        r = client.get("/health")
        assert r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run to confirm FAIL**
```bash
python3 -m pytest test_api.py::TestHealth -v
```
Expected: FAIL with `404 Not Found`

- [ ] **Step 3: Add the endpoint to `app.py`**

Find the first `@app.get` route in `app.py` and add ABOVE it:
```python
@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

- [ ] **Step 4: Run to confirm PASS**
```bash
python3 -m pytest test_api.py::TestHealth -v
```
Expected: 2 PASS

- [ ] **Step 5: Full suite check**
```bash
python3 -m pytest test_api.py -q
```
Expected: same as baseline (167 passing, 2 pre-existing failures)

- [ ] **Step 6: Commit**
```bash
git add app.py test_api.py
git commit -m "feat(api): add GET /health endpoint for offline badge detection"
```

---

## Chunk 2: UI Setup — Copy Paperclip UI

### Task 2: Copy and configure Paperclip UI

**Files:**
- Create: `ui/` (from `/Users/jasonyeh/code_ground/paperclip/ui/`)
- Create: `ui/.env.local`

- [ ] **Step 1: Copy Paperclip UI into worktree**
```bash
cp -r /Users/jasonyeh/code_ground/paperclip/ui ./ui
```

- [ ] **Step 2: Create `.env.local`**

Create `ui/.env.local`:
```
VITE_CHAT_URL=http://localhost:8000
VITE_COWORK_URL=http://localhost:3100
```

- [ ] **Step 3: Install dependencies**
```bash
cd ui && pnpm install
```
Expected: installs without errors

- [ ] **Step 4: Verify dev server starts**
```bash
cd ui && pnpm dev &
sleep 5 && curl -s http://localhost:5173 | head -5
kill %1
```
Expected: HTML response (Paperclip app loads)

- [ ] **Step 5: Update vitest.config.ts to jsdom**

Replace contents of `ui/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 6: Create test setup file**

Create `ui/src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom";
```

- [ ] **Step 7: Install test dependencies**
```bash
cd ui && pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 8: Add `@types/node` if missing**
```bash
cd ui && pnpm add -D @types/node
```

- [ ] **Step 9: Verify existing Paperclip tests still pass**
```bash
cd ui && pnpm test run
```
Expected: existing tests pass

- [ ] **Step 10: Commit**
```bash
git add ui/
git commit -m "chore(ui): copy Paperclip UI as React frontend base, configure jsdom test env"
```

---

## Chunk 3: Marketplace Directory Scaffold

### Task 3: Create marketplace structure

- [ ] **Step 1: Create scaffold**
```bash
mkdir -p marketplace/agents marketplace/skills
cat > marketplace/README.md << 'EOF'
# Marketplace

Local cache of agent and skill templates pulled from the marketplace GitHub repo.

## Structure

```
marketplace/
  agents/<slug>/        ← agent templates (from git pull)
  skills/<source>/<slug>/  ← skill templates (from git pull)
  registry.json         ← tracks installed versions and lineage
```

## Usage

- `/gstack:review` → resolves to `marketplace/skills/gstack/review/`
- `/review` → resolves to `skills/review/` (local instance or fork)
- To fork a template: `cp marketplace/skills/gstack/review/ skills/review/`

## Sync

Manual: `git pull` in this directory (or use the UI sync button in Phase 2).
EOF
touch marketplace/agents/.gitkeep marketplace/skills/.gitkeep
```

- [ ] **Step 2: Commit**
```bash
git add marketplace/
git commit -m "chore(marketplace): add directory scaffold and README"
```

---

## Chunk 4: Chat Types + Context

### Task 4: Define shared types

**Files:**
- Create: `ui/src/chat/types.ts`

- [ ] **Step 1: Create types file**

Create `ui/src/chat/types.ts`:
```typescript
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  agentName?: string;
  agentColor?: string;
  agentEmoji?: string;
  content: string;
  timestamp: number;
  streaming?: boolean;
}

export interface ChatSession {
  id: string;
  name: string;
  workspaceId?: string;
  updatedAt: number;
  preview?: string;
}

export interface AgentInfo {
  name: string;
  emoji: string;
  color: string;
  model: string;
  enabled: boolean;
  supportsThinking?: boolean;
  mode?: "chat" | "think";
  messageCount?: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type ChatMode = "chat" | "cowork";
```

### Task 5: Create ChatContext

**Files:**
- Create: `ui/src/context/ChatContext.tsx`

- [ ] **Step 1: Create context**

Create `ui/src/context/ChatContext.tsx`:
```typescript
import { createContext, useContext, useRef, useState, ReactNode } from "react";
import { ChatMessage, ChatSession, AgentInfo, ConnectionStatus } from "../chat/types";

interface ChatContextValue {
  // Sessions
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  // Messages
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  // Agents
  agents: AgentInfo[];
  setAgents: React.Dispatch<React.SetStateAction<AgentInfo[]>>;
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;
  // Background badge (unread while in Cowork mode)
  hasUnreadChat: boolean;
  setHasUnreadChat: (v: boolean) => void;
  // WS ref (singleton, shared across mode switches)
  wsRef: React.MutableRefObject<WebSocket | null>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  return (
    <ChatContext.Provider value={{
      sessions, setSessions, activeSessionId, setActiveSessionId,
      messages, setMessages,
      agents, setAgents,
      connectionStatus, setConnectionStatus,
      hasUnreadChat, setHasUnreadChat,
      wsRef,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
```

- [ ] **Step 2: No test needed** (context is pure state container, tested via hook tests)

- [ ] **Step 3: Commit**
```bash
git add ui/src/chat/types.ts ui/src/context/ChatContext.tsx
git commit -m "feat(chat): add ChatContext and shared types"
```

---

## Chunk 5: WS Hook (TDD)

### Task 6: useWebSocket — singleton with deduplication

**Files:**
- Create: `ui/src/hooks/useWebSocket.ts`
- Create: `ui/src/chat/__tests__/useWebSocket.test.ts`

- [ ] **Step 1: Write failing tests**

Create `ui/src/chat/__tests__/useWebSocket.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../../hooks/useWebSocket";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }
  send = vi.fn();
  close = vi.fn(() => { this.readyState = WebSocket.CLOSED; this.onclose?.(); });
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe("useWebSocket", () => {
  it("creates a WebSocket connection on mount", () => {
    const wsRef = { current: null as WebSocket | null };
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test", wsRef));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("does NOT create a second WS if one is already open", () => {
    const wsRef = { current: null as WebSocket | null };
    const { rerender } = renderHook(
      ({ sessionId }) => useWebSocket(`ws://localhost:8000/ws/${sessionId}`, wsRef),
      { initialProps: { sessionId: "abc" } }
    );
    // Manually set readyState to OPEN to simulate existing connection
    MockWebSocket.instances[0].readyState = WebSocket.OPEN;
    wsRef.current = MockWebSocket.instances[0] as unknown as WebSocket;

    rerender({ sessionId: "abc" });
    expect(MockWebSocket.instances).toHaveLength(1); // Still just one
  });

  it("closes and recreates WS when URL changes", async () => {
    const wsRef = { current: null as WebSocket | null };
    const { rerender } = renderHook(
      ({ sessionId }) => useWebSocket(`ws://localhost:8000/ws/${sessionId}`, wsRef),
      { initialProps: { sessionId: "abc" } }
    );
    MockWebSocket.instances[0].readyState = WebSocket.OPEN;
    wsRef.current = MockWebSocket.instances[0] as unknown as WebSocket;

    rerender({ sessionId: "xyz" });
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("stores WS instance in wsRef", async () => {
    const wsRef = { current: null as WebSocket | null };
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test", wsRef));
    // After mount, wsRef should be populated
    await act(async () => {});
    expect(wsRef.current).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**
```bash
cd ui && pnpm test run src/chat/__tests__/useWebSocket.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement useWebSocket**

Create `ui/src/hooks/useWebSocket.ts`:
```typescript
import { useEffect, useRef } from "react";

/**
 * Singleton WebSocket hook.
 *
 * Key design: wsRef is passed in from ChatContext so the connection
 * persists across mode switches (Chat → Cowork → Chat).
 * The hook will NOT create a new WS if wsRef.current is already OPEN.
 *
 *  URL changes → close old, open new
 *  Mode switch → wsRef survives, no reconnect
 *  Component unmount → does NOT close (persists for background streaming)
 */
export function useWebSocket(
  url: string | null,
  wsRef: React.MutableRefObject<WebSocket | null>,
  onMessage?: (data: unknown) => void,
) {
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;

    // Already connected to this exact URL — skip
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      urlRef.current === url
    ) {
      return;
    }

    // URL changed — close existing
    if (wsRef.current && urlRef.current !== url) {
      wsRef.current.close();
      wsRef.current = null;
    }

    urlRef.current = url;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    if (onMessage) {
      ws.onmessage = (e) => {
        try {
          onMessage(JSON.parse(e.data));
        } catch {
          onMessage(e.data);
        }
      };
    }

    // NOTE: intentionally NOT closing on unmount — the WS must survive
    // mode switches. Cleanup happens when URL changes or session ends.
  }, [url]);
}
```

- [ ] **Step 4: Run to confirm PASS**
```bash
cd ui && pnpm test run src/chat/__tests__/useWebSocket.test.ts
```
Expected: 4 PASS

- [ ] **Step 5: Commit**
```bash
git add ui/src/hooks/useWebSocket.ts ui/src/chat/__tests__/useWebSocket.test.ts
git commit -m "feat(chat): add singleton WebSocket hook with deduplication"
```

---

## Chunk 6: Health Check Hook (TDD)

### Task 7: useHealthCheck — 30s polling

**Files:**
- Create: `ui/src/hooks/useHealthCheck.ts`
- Create: `ui/src/chat/__tests__/useHealthCheck.test.ts`

- [ ] **Step 1: Write failing tests**

Create `ui/src/chat/__tests__/useHealthCheck.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHealthCheck } from "../../hooks/useHealthCheck";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useHealthCheck", () => {
  it("returns online=true when fetch succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(true);
  });

  it("returns online=false when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(false);
  });

  it("returns online=false when response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(false);
  });

  it("polls again after 30 seconds", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = mockFetch;
    renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**
```bash
cd ui && pnpm test run src/chat/__tests__/useHealthCheck.test.ts
```

- [ ] **Step 3: Implement useHealthCheck**

Create `ui/src/hooks/useHealthCheck.ts`:
```typescript
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

export function useHealthCheck(url: string) {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!cancelled) setOnline(res.ok);
      } catch {
        clearTimeout(timer);
        if (!cancelled) setOnline(false);
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [url]);

  return { online };
}
```

- [ ] **Step 4: Run to confirm PASS**
```bash
cd ui && pnpm test run src/chat/__tests__/useHealthCheck.test.ts
```
Expected: 4 PASS

- [ ] **Step 5: Commit**
```bash
git add ui/src/hooks/useHealthCheck.ts ui/src/chat/__tests__/useHealthCheck.test.ts
git commit -m "feat(chat): add useHealthCheck hook with 30s polling"
```

---

## Chunk 7: Chat Components

### Task 8: AgentMembers

**Files:**
- Create: `ui/src/chat/AgentMembers.tsx`

- [ ] **Step 1: Create component**

Create `ui/src/chat/AgentMembers.tsx`:
```tsx
import { AgentInfo } from "./types";

interface AgentMembersProps {
  agents: AgentInfo[];
  onModeChange?: (agentName: string, mode: "chat" | "think") => void;
}

export function AgentMembers({ agents, onModeChange }: AgentMembersProps) {
  if (agents.length === 0) return null;

  return (
    <div className="border-t border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Members</p>
      <div className="space-y-1">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
            <span>{agent.emoji}</span>
            <span className="flex-1 truncate" style={{ color: agent.color }}>
              {agent.name}
            </span>
            {agent.messageCount !== undefined && (
              <span className="text-xs text-muted-foreground">×{agent.messageCount}</span>
            )}
            {agent.supportsThinking && onModeChange && (
              <div className="flex gap-1">
                {(["chat", "think"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(agent.name, m)}
                    className={`rounded px-1.5 py-0.5 text-xs border transition-colors ${
                      (agent.mode ?? "chat") === m
                        ? "bg-muted border-border text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Task 9: MessageList

**Files:**
- Create: `ui/src/chat/MessageList.tsx`

- [ ] **Step 1: Create component**

Create `ui/src/chat/MessageList.tsx`:
```tsx
import { useEffect, useRef } from "react";
import { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
          {msg.role === "agent" && (
            <span className="mt-1 text-xl leading-none">{msg.agentEmoji ?? "🤖"}</span>
          )}
          <div
            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {msg.role === "agent" && msg.agentName && (
              <p className="mb-1 text-xs font-semibold" style={{ color: msg.agentColor }}>
                {msg.agentName}
              </p>
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
            {msg.streaming && <span className="ml-1 animate-pulse">▌</span>}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

### Task 10: SessionSidebar

**Files:**
- Create: `ui/src/chat/SessionSidebar.tsx`

- [ ] **Step 1: Create component**

Create `ui/src/chat/SessionSidebar.tsx`:
```tsx
import { ChatSession } from "./types";

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export function SessionSidebar({
  sessions, activeSessionId, onSelectSession, onNewSession
}: SessionSidebarProps) {
  return (
    <div className="flex h-full w-56 flex-col border-r border-border bg-sidebar">
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
              session.id === activeSessionId ? "bg-muted font-medium" : "text-muted-foreground"
            }`}
          >
            <p className="truncate">{session.name || "Untitled"}</p>
            {session.preview && (
              <p className="truncate text-xs text-muted-foreground">{session.preview}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Task 11: ChatPage (orchestrator)

**Files:**
- Create: `ui/src/chat/ChatPage.tsx`

- [ ] **Step 1: Create component**

Create `ui/src/chat/ChatPage.tsx`:
```tsx
import { useState, useCallback, useEffect } from "react";
import { useChatContext } from "../context/ChatContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { SessionSidebar } from "./SessionSidebar";
import { MessageList } from "./MessageList";
import { AgentMembers } from "./AgentMembers";
import { ChatMessage } from "./types";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const WS_BASE = CHAT_URL.replace(/^http/, "ws");

/**
 * ChatPage — isVisible tracks whether the Chat tab is the active mode.
 * Passed in from AppShell so the unread badge fires correctly.
 */
export function ChatPage({ isVisible = true }: { isVisible?: boolean }) {
  const {
    sessions, setSessions, activeSessionId, setActiveSessionId,
    messages, setMessages, agents, setAgents,
    setHasUnreadChat, wsRef,
  } = useChatContext();

  const [input, setInput] = useState("");

  // Fetch sessions on mount
  useEffect(() => {
    fetch(`${CHAT_URL}/sessions?limit=50`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [setSessions]);

  const wsUrl = activeSessionId ? `${WS_BASE}/ws/${activeSessionId}` : null;

  const handleMessage = useCallback((data: unknown) => {
    if (typeof data !== "object" || !data) return;
    const msg = data as Record<string, unknown>;

    if (msg.type === "token" || msg.type === "chunk") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming && last.agentName === msg.agent) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + String(msg.content ?? "") },
          ];
        }
        const newMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "agent",
          agentName: String(msg.agent ?? ""),
          content: String(msg.content ?? ""),
          timestamp: Date.now(),
          streaming: true,
        };
        return [...prev, newMsg];
      });
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
        return prev;
      });
    } else if (msg.type === "agents") {
      setAgents(msg.agents as typeof agents);
    }
  }, [isVisible, setHasUnreadChat, setMessages, setAgents]);

  useWebSocket(wsUrl, wsRef, handleMessage);

  function handleAgentModeChange(agentName: string, mode: "chat" | "think") {
    setAgents((prev) => prev.map((a) => a.name === agentName ? { ...a, mode } : a));
    wsRef.current?.send(JSON.stringify({ type: "set_mode", agent: agentName, mode }));
  }

  function sendMessage() {
    if (!input.trim() || !wsRef.current) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: input, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify({ type: "message", text: input }));
    setInput("");
  }

  return (
    <div className="flex h-full">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={() => setActiveSessionId(null)}
      />
      <div className="flex flex-1 flex-col">
        <MessageList messages={messages} />
        <div className="border-t border-border p-3 flex gap-2">
          <input
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Message agents…"
          />
          <button
            onClick={sendMessage}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send
          </button>
        </div>
      </div>
      <div className="w-48 border-l border-border">
        <AgentMembers agents={agents} onModeChange={handleAgentModeChange} />
      </div>
    </div>
  );
}
```

### Task 12: Module barrel export

**Files:**
- Create: `ui/src/chat/index.ts`

- [ ] **Step 1: Create barrel**

Create `ui/src/chat/index.ts`:
```typescript
export { ChatPage } from "./ChatPage";
export { SessionSidebar } from "./SessionSidebar";
export { MessageList } from "./MessageList";
export { AgentMembers } from "./AgentMembers";
export type { ChatMessage, ChatSession, AgentInfo, ConnectionStatus, ChatMode } from "./types";
```

### Task 11b: ChatPage message logic tests (TDD for non-trivial logic)

**Files:**
- Create: `ui/src/chat/__tests__/ChatPage.test.tsx`

- [ ] **Step A: Write tests for message accumulation logic**

The streaming token-accumulation logic in `handleMessage` is the most complex part of ChatPage. Extract it to a pure function and test it.

Create `ui/src/chat/__tests__/ChatPage.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { ChatMessage } from "../types";
// Import the exported pure functions directly from ChatPage
import { applyTokenMessage, applyDoneMessage } from "../ChatPage";

describe("ChatPage message logic", () => {
  it("starts a new streaming message when no prior agent message exists", () => {
    const result = applyTokenMessage([], "Claude", "Hello");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello");
    expect(result[0].streaming).toBe(true);
  });

  it("appends to the last message if same agent is still streaming", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: true,
    }];
    const result = applyTokenMessage(prev, "Claude", " world");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello world");
  });

  it("starts a new message if agent changes mid-stream", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hi", timestamp: 0, streaming: true,
    }];
    const result = applyTokenMessage(prev, "Gemini", "Hello");
    expect(result).toHaveLength(2);
  });

  it("marks the last message as done when type=done received", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: true,
    }];
    const result = applyDoneMessage(prev);
    expect(result[0].streaming).toBe(false);
  });

  it("does nothing on done if no streaming message", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: false,
    }];
    const result = applyDoneMessage(prev);
    expect(result).toEqual(prev);
  });
});
```

> **Note for implementer:** Export `applyTokenMessage` and `applyDoneMessage` as named exports from `ChatPage.tsx` alongside the component. This keeps the logic testable without a React test renderer.

- [ ] **Step B: Run to confirm FAIL**
```bash
cd ui && pnpm test run src/chat/__tests__/ChatPage.test.tsx
```

- [ ] **Step C: Add exports to ChatPage.tsx** — add before `export function ChatPage`:
```typescript
export function applyTokenMessage(prev: ChatMessage[], agentName: string, content: string): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last?.streaming && last.agentName === agentName) {
    return [...prev.slice(0, -1), { ...last, content: last.content + content }];
  }
  return [...prev, { id: crypto.randomUUID(), role: "agent", agentName, content, timestamp: Date.now(), streaming: true }];
}

export function applyDoneMessage(prev: ChatMessage[]): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
  return prev;
}
```

Then in `handleMessage`, replace the inline logic with calls to these functions:
```typescript
if (msg.type === "token" || msg.type === "chunk") {
  setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? "")));
  if (!isVisible) setHasUnreadChat(true);
} else if (msg.type === "done") {
  setMessages(applyDoneMessage);
}
```

- [ ] **Step D: Run to confirm PASS**
```bash
cd ui && pnpm test run src/chat/__tests__/ChatPage.test.tsx
```
Expected: 5 PASS

- [ ] **Step 2: Commit all chat components**
```bash
git add ui/src/chat/ ui/src/context/ChatContext.tsx
git commit -m "feat(chat): add Chat module (ChatPage, SessionSidebar, MessageList, AgentMembers, logic tests)"
```

---

## Chunk 8: Mode Toggle + App.tsx

### Task 13: ModeToggle component (TDD)

**Files:**
- Create: `ui/src/components/ModeToggle.tsx`
- Create: `ui/src/chat/__tests__/ModeToggle.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ui/src/chat/__tests__/ModeToggle.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeToggle } from "../../components/ModeToggle";

describe("ModeToggle", () => {
  it("renders Chat and Cowork buttons", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline />);
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Cowork")).toBeInTheDocument();
  });

  it("marks the active mode button", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline />);
    const chatBtn = screen.getByText("Chat").closest("button");
    expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onModeChange when Cowork is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeToggle mode="chat" onModeChange={onModeChange} chatOnline coworkOnline />);
    fireEvent.click(screen.getByText("Cowork"));
    expect(onModeChange).toHaveBeenCalledWith("cowork");
  });

  it("shows offline indicator when chatOnline=false", () => {
    render(<ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline={false} coworkOnline />);
    expect(screen.getByTestId("chat-offline")).toBeInTheDocument();
  });

  it("shows unread badge on Chat tab when hasUnreadChat=true", () => {
    render(
      <ModeToggle mode="cowork" onModeChange={vi.fn()} chatOnline coworkOnline hasUnreadChat />
    );
    expect(screen.getByTestId("chat-unread-badge")).toBeInTheDocument();
  });

  it("hides unread badge when in Chat mode", () => {
    render(
      <ModeToggle mode="chat" onModeChange={vi.fn()} chatOnline coworkOnline hasUnreadChat />
    );
    expect(screen.queryByTestId("chat-unread-badge")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**
```bash
cd ui && pnpm test run src/chat/__tests__/ModeToggle.test.tsx
```

- [ ] **Step 3: Implement ModeToggle**

Create `ui/src/components/ModeToggle.tsx`:
```tsx
import { ChatMode } from "../chat/types";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chatOnline: boolean;
  coworkOnline: boolean;
  hasUnreadChat?: boolean;
}

export function ModeToggle({ mode, onModeChange, chatOnline, coworkOnline, hasUnreadChat }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
      <button
        aria-pressed={mode === "chat"}
        onClick={() => onModeChange("chat")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Chat
        {!chatOnline && (
          <span data-testid="chat-offline" className="h-1.5 w-1.5 rounded-full bg-destructive" title="Offline" />
        )}
        {hasUnreadChat && mode !== "chat" && (
          <span data-testid="chat-unread-badge" className="h-1.5 w-1.5 rounded-full bg-primary" title="New message" />
        )}
      </button>
      <button
        aria-pressed={mode === "cowork"}
        onClick={() => onModeChange("cowork")}
        className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          mode === "cowork" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Cowork
        {!coworkOnline && (
          <span data-testid="cowork-offline" className="h-1.5 w-1.5 rounded-full bg-destructive" title="Offline" />
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run to confirm PASS**
```bash
cd ui && pnpm test run src/chat/__tests__/ModeToggle.test.tsx
```
Expected: 6 PASS

### Task 14: Wire ModeToggle into App.tsx

**Files:**
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Add ChatProvider + ModeToggle to App.tsx**

In `ui/src/App.tsx`, add after existing imports:
```typescript
import { ChatProvider, useChatContext } from "./context/ChatContext";
import { ChatPage } from "./chat";
import { ModeToggle } from "./components/ModeToggle";
import { useHealthCheck } from "./hooks/useHealthCheck";
import { useState, useEffect } from "react";
import type { ChatMode } from "./chat/types";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const COWORK_URL = import.meta.env.VITE_COWORK_URL ?? "http://localhost:3100";
```

Wrap the root `<Routes>` tree with `<ChatProvider>`. Add a top-level `AppShell` component that renders the `ModeToggle` and conditionally renders either `<ChatPage />` or the existing Cowork routes:

```tsx
function AppShell({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ChatMode>(() => {
    return (localStorage.getItem("preferred-mode") as ChatMode) ?? "chat";
  });
  const { hasUnreadChat, setHasUnreadChat } = useChatContext();
  const { online: chatOnline } = useHealthCheck(`${CHAT_URL}/health`);
  const { online: coworkOnline } = useHealthCheck(`${COWORK_URL}/health`);

  useEffect(() => {
    localStorage.setItem("preferred-mode", mode);
    if (mode === "chat") setHasUnreadChat(false);
  }, [mode, setHasUnreadChat]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setMode("chat"); }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setMode("cowork"); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-center border-b border-border px-4 py-2">
        <ModeToggle
          mode={mode}
          onModeChange={setMode}
          chatOnline={chatOnline}
          coworkOnline={coworkOnline}
          hasUnreadChat={hasUnreadChat}
        />
      </header>
      <main className="flex-1 overflow-hidden">
        {/* ChatPage always mounts so WS persists; isVisible controls unread badge */}
        <div className={mode === "chat" ? "flex h-full" : "hidden"}>
          <ChatPage isVisible={mode === "chat"} />
        </div>
        {mode === "cowork" && <div className="flex h-full">{children}</div>}
      </main>
    </div>
  );
}
```

Then wrap the existing `<Routes>` return value with `<ChatProvider><AppShell>...</AppShell></ChatProvider>`.

- [ ] **Step 2: Verify app loads in dev mode**
```bash
cd ui && pnpm dev &
sleep 5 && curl -s http://localhost:5173 | grep -c "html"
kill %1
```
Expected: returns `1` (HTML response)

- [ ] **Step 3: Commit**
```bash
git add ui/src/App.tsx ui/src/components/ModeToggle.tsx ui/src/chat/__tests__/ModeToggle.test.tsx
git commit -m "feat(ui): add ModeToggle + ChatPage into App.tsx with keyboard shortcuts ⌘1/⌘2"
```

---

## Chunk 9: Playwright E2E Tests

### Task 15: Set up Playwright

**Files:**
- Create: `e2e/chat-mode.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Install Playwright**
```bash
cd ui && pnpm add -D @playwright/test && pnpm exec playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

Create `ui/playwright.config.ts`:
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Create e2e tests**

Create `ui/e2e/chat-mode.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

test.describe("Mode Toggle", () => {
  test("Chat and Cowork tabs are visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Chat")).toBeVisible();
    await expect(page.getByText("Cowork")).toBeVisible();
  });

  test("⌘1 switches to Chat mode", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    await page.keyboard.press("Meta+1");
    const chatBtn = page.getByRole("button", { name: "Chat" });
    await expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("⌘2 switches to Cowork mode", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    const coworkBtn = page.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("mode preference persists after reload", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    await page.reload();
    const coworkBtn = page.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("offline badge shows when chat server unreachable", async ({ page }) => {
    // Mock health check to return error
    await page.route("**/health", (route) => route.abort("connectionrefused"));
    await page.goto("/");
    // Wait for first health check to complete (up to 5s)
    await expect(page.getByTestId("chat-offline")).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 4: Verify tests run (may need servers running)**
```bash
cd ui && pnpm exec playwright test --reporter=list 2>&1 | head -30
```

- [ ] **Step 5: Commit**
```bash
git add ui/e2e/ ui/playwright.config.ts
git commit -m "test(e2e): add Playwright tests for mode toggle, keyboard shortcuts, offline badge"
```

---

## Chunk 10: Full Test Suite + Final Checks

### Task 16: Final verification

- [ ] **Step 1: Run full Python test suite**
```bash
python3 -m pytest test_api.py -q
```
Expected: 169 passing (167 base + 2 new health tests), 2 pre-existing failures

- [ ] **Step 2: Run full Vitest suite**
```bash
cd ui && pnpm test run
```
Expected: all new tests pass + existing Paperclip tests pass

- [ ] **Step 3: Update HANDOFF doc to mark Phase 1 items as done**

In `docs/HANDOFF-chat-cowork.md`, mark these as done:
- Fork Paperclip ✅
- Chat UI React 化 ✅
- Chat | Cowork 模式切換器 ✅
- GET /health 兩個 server ✅ (Python done; Cowork server has its own)
- Vitest + Playwright ✅

- [ ] **Step 4: Final commit**
```bash
git add docs/HANDOFF-chat-cowork.md
git commit -m "docs: update HANDOFF to reflect Phase 1 completion"
```
