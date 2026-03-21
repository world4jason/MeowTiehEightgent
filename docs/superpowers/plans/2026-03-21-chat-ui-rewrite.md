# Chat UI Arc-Style Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing basic Chat UI to a full Arc-style React interface that matches all UI and operation logic of the original Vanilla JS (`static/index.html`), and upgrade ModeToggle from 2-tab to 3-tab (Chat | Cowork | Settings).

**Architecture:** Build on the existing `feat/chat-cowork-phase1` worktree. Extend `ChatMode` type to include `"settings"`, upgrade `ModeToggle` and `AppShell`, then fully rewrite the Chat module components (SessionSidebar, ChatPage, panels, input area) using Paperclip's Tailwind design tokens while faithfully replicating all original logic.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (Paperclip design tokens), TanStack Query, Vitest + React Testing Library, Playwright e2e.

---

## Plan Review Notes (2026-03-21)

以下修改由 `/plan-eng-review` 決定，已納入計畫：

1. **Task 0.5 新增**：在 Task 1 前先加 CORS middleware 到 `app.py`（否則 chatClient 在瀏覽器全被 CORS 擋）
2. **Task 2 修改**：先建 `ui/src/lib/makeApiClient.ts` factory，再用它創建 chatClient（DRY — 避免三個幾乎相同的 client）
3. **Task 4 新增**：加 `SessionMoveDropdown.test.tsx`
4. **Task 5 新增**：加 `WorkspaceFolder.test.tsx`
5. **Task 6 新增**：加 `RunsPanel.test.tsx`

---

## Worktree Context

Working in: `.worktrees/feat-chat-cowork-phase1/`
All `ui/` paths below are relative to that worktree.

Python backend is running at `:8000`. All Chat API routes already exist — this plan is **frontend only**.

## Existing Endpoints (reference)
```
GET    /agents                     → AgentInfo[]
GET    /agents/{name}/agent-md
GET    /sessions?limit=&cursor=    → { sessions, nextCursor }
GET    /sessions/{id}/messages     → ChatMessage[]
POST   /sessions                   → { id, name }
PATCH  /sessions/{id}              → rename
DELETE /sessions/{id}
PUT    /sessions/{id}/workspace    → { workspaceId }
GET    /workspaces                 → WorkspaceInfo[]
GET    /workspaces/{id}            → WorkspaceDetail
POST   /sessions/{id}/download     → file
GET    /scenarios                  → ScenarioInfo[]
GET    /skills                     → SkillInfo[]
GET    /health                     → { version, status }
WS     /ws/{sessionId}             → streaming messages
```

---

## File Structure

```
ui/src/chat/
├── types.ts                   MODIFY  add WorkspaceInfo, SkillInfo, ScenarioInfo, update ChatMode
├── chatClient.ts              CREATE  fetch wrapper for :8000 (separate from Paperclip /api)
├── ChatPage.tsx               REWRITE full Arc-style layout
├── SessionSidebar.tsx         REWRITE Arc-style with workspace folders
├── SessionItem.tsx            CREATE  hover-reveal item (rename/delete/move/download)
├── WorkspaceFolder.tsx        CREATE  collapsible folder with nested sessions
├── SessionMoveDropdown.tsx    CREATE  move-to-workspace dropdown
├── ChatHeader.tsx             CREATE  agent pills + panel toggles
├── MembersPanel.tsx           CREATE  right slide-in: agent rows + add/remove
├── RunsPanel.tsx              CREATE  right slide-in: per-agent token runs
├── WelcomeScreen.tsx          CREATE  scenario cards + agent chips
├── ChatInputArea.tsx          CREATE  textarea + pickers + attach + send
├── SkillPicker.tsx            CREATE  "/" popup autocomplete
├── AgentPicker.tsx            CREATE  "@" popup autocomplete
├── hooks/
│   ├── useSkillPicker.ts      CREATE  "/" trigger logic
│   ├── useAgentPicker.ts      CREATE  "@" trigger logic
│   └── useImageAttachment.ts  CREATE  file → base64 preview
└── __tests__/
    ├── ModeToggle.test.tsx    EXISTS  update for 3-tab
    ├── SessionSidebar.test.tsx EXISTS  rewrite for Arc-style
    ├── SessionItem.test.tsx   CREATE
    ├── MembersPanel.test.tsx  CREATE
    └── ChatInputArea.test.tsx CREATE

ui/src/components/ModeToggle.tsx   MODIFY  add Settings tab + settingsOnline prop
ui/src/App.tsx                      MODIFY  ⌘3 shortcut + Settings mode + SettingsPage placeholder
ui/src/lib/makeApiClient.ts        CREATE  shared API client factory (DRY)
ui/e2e/chat-ui.spec.ts             CREATE  Arc-style e2e
```

---

## Task 0.5: Add CORS middleware to app.py

**Files:**
- Modify: `app.py` (Python backend)

Without CORS, `chatClient` calls from Vite dev server (:5173) to :8000 are blocked by the browser.

- [ ] **Step 1: Add CORSMiddleware**

```python
# app.py — add after imports
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 2: Restart server, verify CORS headers**

```bash
curl -H "Origin: http://localhost:5173" -I http://localhost:8000/health
# Expected: access-control-allow-origin: http://localhost:5173
```

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "fix(api): add CORS middleware for Vite dev server origins"
```

---

## Task 1: ChatMode type + ModeToggle 3-tab + AppShell ⌘3

**Files:**
- Modify: `ui/src/chat/types.ts`
- Modify: `ui/src/components/ModeToggle.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/chat/__tests__/ModeToggle.test.tsx`

- [ ] **Step 1: Update failing test for 3-tab ModeToggle**

```tsx
// ui/src/chat/__tests__/ModeToggle.test.tsx — update existing file
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeToggle } from "../../components/ModeToggle";

it("renders three tabs: Chat, Cowork, Settings", () => {
  const fn = vi.fn();
  render(
    <ModeToggle mode="chat" onModeChange={fn}
      chatOnline coworkOnline settingsOnline />
  );
  expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /cowork/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
});

it("calls onModeChange('settings') when Settings clicked", () => {
  const fn = vi.fn();
  render(
    <ModeToggle mode="chat" onModeChange={fn}
      chatOnline coworkOnline settingsOnline />
  );
  fireEvent.click(screen.getByRole("button", { name: /settings/i }));
  expect(fn).toHaveBeenCalledWith("settings");
});

it("shows offline dot on Settings tab when settingsOnline=false", () => {
  render(
    <ModeToggle mode="chat" onModeChange={vi.fn()}
      chatOnline coworkOnline settingsOnline={false} />
  );
  expect(screen.getByTestId("settings-offline")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test -- ModeToggle --run
```
Expected: FAIL (no settingsOnline prop, no Settings button)

- [ ] **Step 3: Update ChatMode type**

```typescript
// ui/src/chat/types.ts — add to existing file
export type ChatMode = "chat" | "cowork" | "settings";
```

- [ ] **Step 4: Update ModeToggle component**

```tsx
// ui/src/components/ModeToggle.tsx — full replacement
import { ChatMode } from "../chat/types";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  chatOnline: boolean;
  coworkOnline: boolean;
  settingsOnline: boolean;
  hasUnreadChat?: boolean;
}

export function ModeToggle({
  mode, onModeChange, chatOnline, coworkOnline, settingsOnline, hasUnreadChat,
}: ModeToggleProps) {
  const btn = (m: ChatMode, label: string, offline: boolean, extra?: React.ReactNode) => (
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
    </div>
  );
}
```

- [ ] **Step 5: Update AppShell in App.tsx**

Find the `AppShell` function (around line 297) and update:

```tsx
// In AppShell function — update mode state type
const [mode, setMode] = useState<ChatMode>(() => {
  const stored = localStorage.getItem("preferred-mode");
  return stored === "chat" || stored === "cowork" || stored === "settings"
    ? stored : "chat";
});

// Add settingsOnline health check (Settings has no dedicated server — use chatOnline as proxy)
const { online: settingsOnline } = useHealthCheck(`${CHAT_URL}/health`);

// Add ⌘3 keyboard shortcut
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "1") { e.preventDefault(); setMode("chat"); }
    if ((e.metaKey || e.ctrlKey) && e.key === "2") { e.preventDefault(); setMode("cowork"); }
    if ((e.metaKey || e.ctrlKey) && e.key === "3") { e.preventDefault(); setMode("settings"); }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);

// Update ModeToggle render
<ModeToggle
  mode={mode}
  onModeChange={setMode}
  chatOnline={chatOnline}
  coworkOnline={coworkOnline}
  settingsOnline={settingsOnline}
  hasUnreadChat={hasUnreadChat}
/>

// Add Settings placeholder below cowork block
{mode === "settings" && (
  <div className="flex h-full flex-1 items-center justify-center text-muted-foreground text-sm">
    Settings — coming soon
  </div>
)}
```

- [ ] **Step 6: Run tests**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test -- ModeToggle --run
```
Expected: PASS (3 new tests green)

- [ ] **Step 7: Commit**

```bash
git add ui/src/chat/types.ts ui/src/components/ModeToggle.tsx ui/src/App.tsx ui/src/chat/__tests__/ModeToggle.test.tsx
git commit -m "feat(mode): upgrade ChatMode to 3-tab (Chat | Cowork | Settings) + ⌘3"
```

---

## Task 2: makeApiClient factory + chatClient.ts

Extract shared API client logic into a factory, then create chatClient using it. Avoids three near-identical client files (DRY — plan review decision).

**Files:**
- Create: `ui/src/lib/makeApiClient.ts`
- Create: `ui/src/chat/chatClient.ts`
- Create: `ui/src/chat/__tests__/chatClient.test.ts`

- [ ] **Step 1: Create makeApiClient factory**

```typescript
// ui/src/lib/makeApiClient.ts
export class ApiClientError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

export function makeApiClient(base: string) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiClientError(
        (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
        res.status,
        body,
      );
    }
    return res.json();
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    postForm: <T>(path: string, body: FormData) =>
      request<T>(path, { method: "POST", body }),
    put: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}
```

- [ ] **Step 1: Write failing test**

```typescript
// ui/src/chat/__tests__/chatClient.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We'll import after stubbing
import { chatClient } from "../chatClient";

describe("chatClient", () => {
  beforeEach(() => mockFetch.mockReset());

  it("GET prepends CHAT_URL base", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await chatClient.get("/agents");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/agents"),
      expect.any(Object)
    );
  });

  it("throws ChatApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });
    await expect(chatClient.get("/missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("POST sends JSON body with Content-Type header", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await chatClient.post("/sessions", { name: "Test" });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Test" });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test -- chatClient --run
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement chatClient.ts using makeApiClient factory**

```typescript
// ui/src/chat/chatClient.ts
import { makeApiClient } from "@/lib/makeApiClient";

const BASE = (import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000") as string;
export const chatClient = makeApiClient(BASE);
// Re-export error type for catch clauses
export { ApiClientError as ChatApiError } from "@/lib/makeApiClient";
```

Note: this is now 4 lines instead of 40. `ChatApiError` is an alias for `ApiClientError` for backwards compatibility if any catch clause checks `instanceof ChatApiError`.

Old implementation (for reference only — DO NOT USE):
```typescript
// OLD — kept here for test reference only; the actual impl uses makeApiClient above
export const chatClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- chatClient --run
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/chat/chatClient.ts ui/src/chat/__tests__/chatClient.test.ts
git commit -m "feat(chat): add chatClient fetch wrapper for :8000"
```

---

## Task 3: Extended types + API query hooks

**Files:**
- Modify: `ui/src/chat/types.ts`
- Create: `ui/src/chat/hooks/useChatApi.ts`

- [ ] **Step 1: Add types to types.ts**

Add to existing `ui/src/chat/types.ts`:

```typescript
export interface WorkspaceInfo {
  id: string;
  name: string;
  sessionCount?: number;
}

export interface WorkspaceDetail extends WorkspaceInfo {
  instructions: string;
  files: string[];          // filenames
  defaultAgents: string[];  // agent names
}

export interface SkillInfo {
  slug: string;
  name: string;
  description: string;
  source?: string;
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  agents: string[];
  systemPrompt?: string;
}

export interface SessionPage {
  sessions: ChatSession[];
  nextCursor?: string;
}
```

- [ ] **Step 2: Create API hooks**

```typescript
// ui/src/chat/hooks/useChatApi.ts
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { chatClient } from "../chatClient";
import type { AgentInfo, WorkspaceInfo, SkillInfo, ScenarioInfo, SessionPage, ChatSession } from "../types";

// ─── Query keys ───────────────────────────────────────────────
export const chatKeys = {
  agents: ["chat", "agents"] as const,
  workspaces: ["chat", "workspaces"] as const,
  workspace: (id: string) => ["chat", "workspace", id] as const,
  sessions: (workspaceId?: string) => ["chat", "sessions", workspaceId ?? "all"] as const,
  skills: ["chat", "skills"] as const,
  scenarios: ["chat", "scenarios"] as const,
  messages: (sessionId: string) => ["chat", "messages", sessionId] as const,
};

// ─── Agents ───────────────────────────────────────────────────
export function useAgentsList() {
  return useQuery({
    queryKey: chatKeys.agents,
    queryFn: () => chatClient.get<AgentInfo[]>("/agents"),
  });
}

// ─── Workspaces ───────────────────────────────────────────────
export function useWorkspaces() {
  return useQuery({
    queryKey: chatKeys.workspaces,
    queryFn: () => chatClient.get<WorkspaceInfo[]>("/workspaces"),
  });
}

export function useWorkspaceDetail(id: string) {
  return useQuery({
    queryKey: chatKeys.workspace(id),
    queryFn: () => chatClient.get<WorkspaceDetail>(`/workspaces/${id}`),
    enabled: Boolean(id),
  });
}

// ─── Sessions (paginated) ─────────────────────────────────────
export function useSessions(workspaceId?: string) {
  const params = workspaceId ? `?workspace_id=${workspaceId}&limit=50` : "?limit=50";
  return useInfiniteQuery({
    queryKey: chatKeys.sessions(workspaceId),
    queryFn: ({ pageParam = "" }) =>
      chatClient.get<SessionPage>(`/sessions${params}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: "",
  });
}

// ─── Session mutations ────────────────────────────────────────
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId?: string) =>
      chatClient.post<ChatSession>("/sessions", { workspaceId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      chatClient.patch(`/sessions/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatClient.delete(`/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
  });
}

export function useMoveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string | null }) =>
      chatClient.put(`/sessions/${id}/workspace`, { workspaceId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
  });
}

// ─── Skills ───────────────────────────────────────────────────
export function useSkillsList() {
  return useQuery({
    queryKey: chatKeys.skills,
    queryFn: () => chatClient.get<SkillInfo[]>("/skills"),
  });
}

// ─── Scenarios ────────────────────────────────────────────────
export function useScenarios() {
  return useQuery({
    queryKey: chatKeys.scenarios,
    queryFn: () => chatClient.get<ScenarioInfo[]>("/scenarios"),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/types.ts ui/src/chat/hooks/useChatApi.ts
git commit -m "feat(chat): extend types + React Query hooks for Chat API"
```

No Vitest tests for hooks — they depend on network; tested implicitly via component tests.

---

## Task 4: SessionItem (Arc-style hover-reveal)

**Files:**
- Create: `ui/src/chat/SessionItem.tsx`
- Create: `ui/src/chat/SessionMoveDropdown.tsx`
- Create: `ui/src/chat/__tests__/SessionItem.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/chat/__tests__/SessionItem.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionItem } from "../SessionItem";

const session = { id: "s1", name: "My Session", updatedAt: Date.now() };
const workspaces = [{ id: "w1", name: "Project A" }];

it("shows session name", () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  expect(screen.getByText("My Session")).toBeInTheDocument();
});

it("shows action buttons on hover", async () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  const item = screen.getByRole("button", { name: /my session/i });
  await userEvent.hover(item);
  expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
});

it("switches to inline rename input on double-click", async () => {
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  expect(screen.getByRole("textbox")).toHaveValue("My Session");
});

it("calls onRename on Enter with new name", async () => {
  const onRename = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={onRename}
    onDelete={vi.fn()} onMove={vi.fn()} />);
  await userEvent.dblClick(screen.getByText("My Session"));
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, "Renamed{Enter}");
  expect(onRename).toHaveBeenCalledWith("s1", "Renamed");
});

it("calls onDelete when delete button clicked", async () => {
  const onDelete = vi.fn();
  render(<SessionItem session={session} active={false}
    workspaces={workspaces} onSelect={vi.fn()} onRename={vi.fn()}
    onDelete={onDelete} onMove={vi.fn()} />);
  const item = screen.getByRole("button", { name: /my session/i });
  await userEvent.hover(item);
  fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledWith("s1");
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- SessionItem --run
```
Expected: FAIL

- [ ] **Step 3: Implement SessionItem.tsx**

```tsx
// ui/src/chat/SessionItem.tsx
import { useState, useRef, useEffect } from "react";
import { Trash2, Download, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { SessionMoveDropdown } from "./SessionMoveDropdown";

interface Props {
  session: ChatSession;
  active: boolean;
  workspaces: WorkspaceInfo[];
  indent?: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, workspaceId: string | null) => void;
}

export function SessionItem({ session, active, workspaces, indent, onSelect, onRename, onDelete, onMove }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.name);
  const [moveOpen, setMoveOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.name) onRename(session.id, trimmed);
    setRenaming(false);
  }

  return (
    <div className={cn("group relative flex items-center gap-1 rounded-md", indent && "pl-6")}>
      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(session.name); setRenaming(false); }
          }}
          className="flex-1 rounded border border-border bg-muted px-1.5 py-0.5 text-sm outline-none"
          aria-label={`Rename ${session.name}`}
        />
      ) : (
        <button
          aria-label={session.name}
          onClick={() => onSelect(session.id)}
          onDoubleClick={() => { setDraft(session.name); setRenaming(true); }}
          className={cn(
            "flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
            active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {session.name || "Untitled"}
        </button>
      )}

      {/* Hover-reveal actions */}
      {!renaming && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            aria-label="Delete session"
            onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              aria-label="Move session"
              onClick={(e) => { e.stopPropagation(); setMoveOpen((o) => !o); }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
            {moveOpen && (
              <SessionMoveDropdown
                currentWorkspaceId={session.workspaceId ?? null}
                workspaces={workspaces}
                onSelect={(wid) => { onMove(session.id, wid); setMoveOpen(false); }}
                onClose={() => setMoveOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement SessionMoveDropdown.tsx**

```tsx
// ui/src/chat/SessionMoveDropdown.tsx
import { useEffect, useRef } from "react";
import { WorkspaceInfo } from "./types";

interface Props {
  currentWorkspaceId: string | null;
  workspaces: WorkspaceInfo[];
  onSelect: (workspaceId: string | null) => void;
  onClose: () => void;
}

export function SessionMoveDropdown({ currentWorkspaceId, workspaces, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
    >
      {currentWorkspaceId && (
        <button
          className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted transition-colors"
          onClick={() => onSelect(null)}
        >
          Remove from workspace
        </button>
      )}
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          disabled={ws.id === currentWorkspaceId}
          className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={() => onSelect(ws.id)}
        >
          {ws.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test -- SessionItem --run
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/SessionItem.tsx ui/src/chat/SessionMoveDropdown.tsx ui/src/chat/__tests__/SessionItem.test.tsx ui/src/chat/__tests__/SessionMoveDropdown.test.tsx
git commit -m "feat(chat): Arc-style SessionItem with hover-reveal rename/delete/move"
```

> **Plan review note:** `useMoveSession` mutation must include `onError` to handle 409/500 responses — display a toast or inline error. Silent move failure is a critical gap (failure modes analysis). Implementation: add `onError: () => toast.error("Move failed")` to the `useMutation` call in `useChatApi.ts`.

---

## Task 5: WorkspaceFolder + full Arc-style SessionSidebar

**Files:**
- Create: `ui/src/chat/WorkspaceFolder.tsx`
- Rewrite: `ui/src/chat/SessionSidebar.tsx`
- Modify: `ui/src/chat/__tests__/SessionSidebar.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// ui/src/chat/__tests__/SessionSidebar.test.tsx — full replacement
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSidebar } from "../SessionSidebar";

const workspaces = [
  { id: "w1", name: "Project A" },
  { id: "w2", name: "Project B" },
];
const sessions = [
  { id: "s1", name: "Session 1", workspaceId: "w1", updatedAt: Date.now() },
  { id: "s2", name: "Session 2", workspaceId: "w2", updatedAt: Date.now() },
  { id: "s3", name: "Standalone", updatedAt: Date.now() },
];

const defaultProps = {
  workspaces,
  sessions,
  activeSessionId: null,
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onNewSessionInWorkspace: vi.fn(),
  onRenameSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onMoveSession: vi.fn(),
  onOpenSettings: vi.fn(),
};

it("renders workspace folders and standalone sessions", () => {
  render(<SessionSidebar {...defaultProps} />);
  expect(screen.getByText("Project A")).toBeInTheDocument();
  expect(screen.getByText("Project B")).toBeInTheDocument();
  expect(screen.getByText("Standalone")).toBeInTheDocument();
});

it("workspace folder is collapsed by default, sessions hidden", () => {
  render(<SessionSidebar {...defaultProps} />);
  expect(screen.queryByText("Session 1")).not.toBeInTheDocument();
});

it("clicking folder header expands sessions", async () => {
  render(<SessionSidebar {...defaultProps} />);
  fireEvent.click(screen.getByText("Project A"));
  expect(screen.getByText("Session 1")).toBeInTheDocument();
});

it("sidebar dock has settings button", () => {
  const onOpenSettings = vi.fn();
  render(<SessionSidebar {...defaultProps} onOpenSettings={onOpenSettings} />);
  fireEvent.click(screen.getByRole("button", { name: /settings/i }));
  expect(onOpenSettings).toHaveBeenCalled();
});

it("search filters sessions (standalone)", async () => {
  render(<SessionSidebar {...defaultProps} />);
  await userEvent.type(screen.getByPlaceholderText(/search/i), "Stand");
  expect(screen.getByText("Standalone")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- SessionSidebar --run
```
Expected: FAIL

- [ ] **Step 3: Implement WorkspaceFolder.tsx**

```tsx
// ui/src/chat/WorkspaceFolder.tsx
import { useState } from "react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { SessionItem } from "./SessionItem";

interface Props {
  workspace: WorkspaceInfo;
  sessions: ChatSession[];
  activeSessionId: string | null;
  allWorkspaces: WorkspaceInfo[];
  onSelectSession: (id: string) => void;
  onNewSession: (workspaceId: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onMoveSession: (id: string, workspaceId: string | null) => void;
}

export function WorkspaceFolder({
  workspace, sessions, activeSessionId, allWorkspaces,
  onSelectSession, onNewSession, onRenameSession, onDeleteSession, onMoveSession,
}: Props) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{workspace.name}</span>
      </button>
      {open && (
        <div className="pb-1">
          {sessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              workspaces={allWorkspaces}
              indent
              onSelect={onSelectSession}
              onRename={onRenameSession}
              onDelete={onDeleteSession}
              onMove={onMoveSession}
            />
          ))}
          <button
            onClick={() => onNewSession(workspace.id)}
            className="flex w-full items-center gap-1.5 rounded-md py-1 pl-6 pr-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
            New Session
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement new SessionSidebar.tsx**

```tsx
// ui/src/chat/SessionSidebar.tsx — full rewrite
import { useState, useMemo } from "react";
import { Settings, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatSession, WorkspaceInfo } from "./types";
import { WorkspaceFolder } from "./WorkspaceFolder";
import { SessionItem } from "./SessionItem";

interface Props {
  workspaces: WorkspaceInfo[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNewSessionInWorkspace: (workspaceId: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onDeleteSession: (id: string) => void;
  onMoveSession: (id: string, workspaceId: string | null) => void;
  onOpenSettings: () => void;
}

export function SessionSidebar({
  workspaces, sessions, activeSessionId,
  onSelectSession, onNewSession, onNewSessionInWorkspace,
  onRenameSession, onDeleteSession, onMoveSession, onOpenSettings,
}: Props) {
  const [search, setSearch] = useState("");

  // Group sessions by workspace
  const { byWorkspace, standalone } = useMemo(() => {
    const filtered = search.trim()
      ? sessions.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
      : sessions;
    const byWorkspace: Record<string, ChatSession[]> = {};
    const standalone: ChatSession[] = [];
    for (const s of filtered) {
      if (s.workspaceId) {
        (byWorkspace[s.workspaceId] ??= []).push(s);
      } else {
        standalone.push(s);
      }
    }
    return { byWorkspace, standalone };
  }, [sessions, search]);

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Space header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate">
          Workspaces
        </span>
      </div>

      {/* Search */}
      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            className="w-full rounded-md border border-border bg-muted py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 flex flex-col gap-0.5">
        {/* Workspace folders */}
        {workspaces.map((ws) => (
          <WorkspaceFolder
            key={ws.id}
            workspace={ws}
            sessions={byWorkspace[ws.id] ?? []}
            activeSessionId={activeSessionId}
            allWorkspaces={workspaces}
            onSelectSession={onSelectSession}
            onNewSession={onNewSessionInWorkspace}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
            onMoveSession={onMoveSession}
          />
        ))}

        {/* Standalone sessions */}
        {standalone.length > 0 && (
          <div className={cn("flex flex-col gap-0.5", workspaces.length > 0 && "mt-2 border-t border-border pt-2")}>
            {standalone.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                workspaces={workspaces}
                onSelect={onSelectSession}
                onRename={onRenameSession}
                onDelete={onDeleteSession}
                onMove={onMoveSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dock */}
      <div className="flex items-center gap-1 border-t border-border px-2 py-2">
        <button
          onClick={onNewSession}
          className="flex-1 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          + New Chat
        </button>
        <button
          aria-label="Settings"
          onClick={onOpenSettings}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm test -- SessionSidebar --run
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/WorkspaceFolder.tsx ui/src/chat/SessionSidebar.tsx ui/src/chat/__tests__/SessionSidebar.test.tsx
git commit -m "feat(chat): Arc-style SessionSidebar with workspace folders and search"
```

---

## Task 6: ChatHeader + MembersPanel + RunsPanel

**Files:**
- Create: `ui/src/chat/ChatHeader.tsx`
- Create: `ui/src/chat/MembersPanel.tsx`
- Create: `ui/src/chat/RunsPanel.tsx`
- Create: `ui/src/chat/__tests__/MembersPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// ui/src/chat/__tests__/MembersPanel.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MembersPanel } from "../MembersPanel";

const agents = [
  { name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true, mode: "chat" as const },
];
const available = [
  { name: "Gemini", emoji: "💎", color: "#2563eb", model: "gemini", enabled: true },
];

it("renders agent rows", () => {
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText("Claude")).toBeInTheDocument();
});

it("shows chat/think toggle per agent", () => {
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: /chat mode/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /think mode/i })).toBeInTheDocument();
});

it("calls onModeChange when mode toggle clicked", () => {
  const onModeChange = vi.fn();
  render(<MembersPanel open agents={agents} availableAgents={available}
    onModeChange={onModeChange} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /think mode/i }));
  expect(onModeChange).toHaveBeenCalledWith("Claude", "think");
});

it("renders hidden when open=false", () => {
  const { container } = render(
    <MembersPanel open={false} agents={agents} availableAgents={available}
      onModeChange={vi.fn()} onAddAgent={vi.fn()} onRemoveAgent={vi.fn()} onClose={vi.fn()} />
  );
  expect(container.firstChild).toHaveStyle({ width: "0px" });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- MembersPanel --run
```
Expected: FAIL

- [ ] **Step 3: Implement ChatHeader.tsx**

```tsx
// ui/src/chat/ChatHeader.tsx
import { Users, Activity } from "lucide-react";
import { AgentInfo } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  agents: AgentInfo[];
  membersOpen: boolean;
  runsOpen: boolean;
  onToggleMembers: () => void;
  onToggleRuns: () => void;
}

export function ChatHeader({ agents, membersOpen, runsOpen, onToggleMembers, onToggleRuns }: Props) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
      {/* Agent pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {agents.map((a) => (
          <span
            key={a.name}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: a.color }}
            />
            {a.emoji} {a.name}
          </span>
        ))}
      </div>

      {/* Panel toggles */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          aria-pressed={runsOpen}
          onClick={onToggleRuns}
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors",
            runsOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
          )}
          title="Token runs"
        >
          <Activity className="h-4 w-4" />
        </button>
        <button
          aria-pressed={membersOpen}
          onClick={onToggleMembers}
          className={cn(
            "rounded-md p-1.5 text-muted-foreground transition-colors",
            membersOpen ? "bg-muted text-foreground" : "hover:bg-muted hover:text-foreground",
          )}
          title="Members"
        >
          <Users className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement MembersPanel.tsx**

```tsx
// ui/src/chat/MembersPanel.tsx
import { useState } from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface Props {
  open: boolean;
  agents: AgentInfo[];
  availableAgents: AgentInfo[];
  onModeChange: (agentName: string, mode: "chat" | "think") => void;
  onAddAgent: (agentName: string) => void;
  onRemoveAgent: (agentName: string) => void;
  onClose: () => void;
}

export function MembersPanel({ open, agents, availableAgents, onModeChange, onAddAgent, onRemoveAgent, onClose }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const activeNames = new Set(agents.map((a) => a.name));
  const addable = availableAgents.filter((a) => !activeNames.has(a.name));

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-[width] duration-200",
        open ? "w-[220px]" : "w-0",
      )}
      style={{ width: open ? 220 : 0 }}
    >
      <div className="flex shrink-0 items-center justify-between px-3.5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.map((a) => (
          <div key={a.name} className="flex items-center gap-2 px-3.5 py-2">
            <span className="text-base">{a.emoji}</span>
            <span className="flex-1 truncate text-sm font-medium">{a.name}</span>
            {/* chat/think toggle */}
            <div className="flex gap-0.5">
              <button
                aria-label="Chat mode"
                onClick={() => onModeChange(a.name, "chat")}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs transition-colors",
                  a.mode === "chat" || !a.mode ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                C
              </button>
              <button
                aria-label="Think mode"
                onClick={() => onModeChange(a.name, "think")}
                disabled={!a.supportsThinking}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs transition-colors",
                  a.mode === "think" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                  !a.supportsThinking && "opacity-30 cursor-not-allowed",
                )}
              >
                T
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add agent */}
      <div className="shrink-0 border-t border-border">
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add agent
          <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", addOpen && "rotate-180")} />
        </button>
        {addOpen && addable.map((a) => (
          <button
            key={a.name}
            onClick={() => { onAddAgent(a.name); setAddOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <span>{a.emoji}</span>
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement RunsPanel.tsx**

```tsx
// ui/src/chat/RunsPanel.tsx
import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface AgentRun {
  agentName: string;
  tokens?: number;
  cost?: string;
}

interface Props {
  open: boolean;
  membersOpen: boolean;
  agents: AgentInfo[];
  runs: AgentRun[];
}

export function RunsPanel({ open, membersOpen, agents, runs }: Props) {
  const agentMap = Object.fromEntries(agents.map((a) => [a.name, a]));

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-[width,right] duration-200 z-10",
        open ? "w-[260px]" : "w-0",
      )}
      style={{ right: open && membersOpen ? 220 : 0 }}
    >
      <div className="shrink-0 px-3.5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runs</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-3">
        {runs.map((r) => {
          const a = agentMap[r.agentName];
          return (
            <div key={r.agentName} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a?.color ?? "#888" }} />
                {r.agentName}
              </div>
              {r.tokens != null && (
                <div className="pl-3.5 text-xs text-muted-foreground">
                  {r.tokens.toLocaleString()} tokens
                  {r.cost && <span className="ml-1">· {r.cost}</span>}
                </div>
              )}
            </div>
          );
        })}
        {runs.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">No runs yet</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test -- MembersPanel --run
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add ui/src/chat/ChatHeader.tsx ui/src/chat/MembersPanel.tsx ui/src/chat/RunsPanel.tsx ui/src/chat/__tests__/MembersPanel.test.tsx
git commit -m "feat(chat): ChatHeader + MembersPanel + RunsPanel slide-in panels"
```

---

## Task 7: SkillPicker + AgentPicker + ChatInputArea

**Files:**
- Create: `ui/src/chat/hooks/useSkillPicker.ts`
- Create: `ui/src/chat/hooks/useAgentPicker.ts`
- Create: `ui/src/chat/hooks/useImageAttachment.ts`
- Create: `ui/src/chat/SkillPicker.tsx`
- Create: `ui/src/chat/AgentPicker.tsx`
- Create: `ui/src/chat/ChatInputArea.tsx`
- Create: `ui/src/chat/__tests__/ChatInputArea.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/chat/__tests__/ChatInputArea.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInputArea } from "../ChatInputArea";

const skills = [{ slug: "brainstorming", name: "Brainstorming", description: "Ideation skill" }];
const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];

it("calls onSend with text on Enter", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");
  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
});

it("does not send on Shift+Enter (newline)", async () => {
  const onSend = vi.fn();
  render(<ChatInputArea skills={skills} agents={agents} onSend={onSend} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "hello{Shift>}{Enter}{/Shift}");
  expect(onSend).not.toHaveBeenCalled();
});

it("shows skill picker when typing /", async () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "/");
  expect(screen.getByText("Brainstorming")).toBeInTheDocument();
});

it("shows agent picker when typing @", async () => {
  render(<ChatInputArea skills={skills} agents={agents} onSend={vi.fn()} disabled={false} />);
  await userEvent.type(screen.getByRole("textbox"), "@");
  expect(screen.getByText("Claude")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- ChatInputArea --run
```
Expected: FAIL

- [ ] **Step 3: Implement useSkillPicker.ts**

```typescript
// ui/src/chat/hooks/useSkillPicker.ts
import { useState, useCallback } from "react";
import { SkillInfo } from "../types";

export function useSkillPicker(skills: SkillInfo[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  const filtered = query
    ? skills.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.slug.includes(query.toLowerCase()))
    : skills;

  const check = useCallback((text: string) => {
    const match = text.match(/\/(\S*)$/);
    if (match) {
      setOpen(true);
      setQuery(match[1] ?? "");
      setFocusIdx(0);
    } else {
      setOpen(false);
      setQuery("");
    }
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  function onKeyDown(e: React.KeyboardEvent, onSelect: (slug: string) => void) {
    if (!open) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); return true; }
    if (e.key === "Enter" && filtered[focusIdx]) { e.preventDefault(); onSelect(filtered[focusIdx].slug); close(); return true; }
    if (e.key === "Escape") { close(); return true; }
    return false;
  }

  return { open, filtered, focusIdx, check, close, onKeyDown };
}
```

- [ ] **Step 4: Implement useAgentPicker.ts**

```typescript
// ui/src/chat/hooks/useAgentPicker.ts
import { useState, useCallback } from "react";
import { AgentInfo } from "../types";

export function useAgentPicker(agents: AgentInfo[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  const filtered = query
    ? agents.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : agents;

  const check = useCallback((text: string) => {
    const match = text.match(/@(\S*)$/);
    if (match) {
      setOpen(true);
      setQuery(match[1] ?? "");
      setFocusIdx(0);
    } else {
      setOpen(false);
    }
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  function onKeyDown(e: React.KeyboardEvent, onSelect: (name: string) => void) {
    if (!open) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); return true; }
    if (e.key === "Enter" && filtered[focusIdx]) { e.preventDefault(); onSelect(filtered[focusIdx].name); close(); return true; }
    if (e.key === "Escape") { close(); return true; }
    return false;
  }

  return { open, filtered, focusIdx, check, close, onKeyDown };
}
```

- [ ] **Step 5: Implement useImageAttachment.ts**

```typescript
// ui/src/chat/hooks/useImageAttachment.ts
import { useState, useCallback } from "react";

export interface AttachedImage {
  file: File;
  base64: string;
  preview: string; // object URL for display
}

export function useImageAttachment(supportsImage: boolean) {
  const [images, setImages] = useState<AttachedImage[]>([]);

  const attach = useCallback(async (file: File) => {
    if (!supportsImage) return;
    const base64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]!);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const preview = URL.createObjectURL(file);
    setImages((prev) => [...prev, { file, base64, preview }]);
  }, [supportsImage]);

  const remove = useCallback((idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx]!.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const clear = useCallback(() => {
    setImages((prev) => { prev.forEach((i) => URL.revokeObjectURL(i.preview)); return []; });
  }, []);

  return { images, attach, remove, clear };
}
```

- [ ] **Step 6: Implement SkillPicker.tsx**

```tsx
// ui/src/chat/SkillPicker.tsx
import { cn } from "@/lib/utils";
import { SkillInfo } from "./types";

interface Props {
  skills: SkillInfo[];
  focusIdx: number;
  onSelect: (slug: string) => void;
}

export function SkillPicker({ skills, focusIdx, onSelect }: Props) {
  if (skills.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg z-50">
      {skills.map((s, i) => (
        <button
          key={s.slug}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s.slug); }}
          className={cn(
            "flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition-colors",
            i === focusIdx ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="text-sm font-semibold text-foreground">/{s.name}</span>
          <span className="truncate text-xs text-muted-foreground">{s.description}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Implement AgentPicker.tsx**

```tsx
// ui/src/chat/AgentPicker.tsx
import { cn } from "@/lib/utils";
import { AgentInfo } from "./types";

interface Props {
  agents: AgentInfo[];
  focusIdx: number;
  onSelect: (name: string) => void;
}

export function AgentPicker({ agents, focusIdx, onSelect }: Props) {
  if (agents.length === 0) return null;
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg z-50">
      {agents.map((a, i) => (
        <button
          key={a.name}
          onMouseDown={(e) => { e.preventDefault(); onSelect(a.name); }}
          className={cn(
            "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
            i === focusIdx ? "bg-muted" : "hover:bg-muted/60",
          )}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
          <span className="text-sm font-medium">{a.emoji} {a.name}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Implement ChatInputArea.tsx**

```tsx
// ui/src/chat/ChatInputArea.tsx
import { useRef, useState } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentInfo, SkillInfo } from "./types";
import { SkillPicker } from "./SkillPicker";
import { AgentPicker } from "./AgentPicker";
import { useSkillPicker } from "./hooks/useSkillPicker";
import { useAgentPicker } from "./hooks/useAgentPicker";
import { useImageAttachment } from "./hooks/useImageAttachment";

export interface SendPayload {
  text: string;
  images?: string[]; // base64
}

interface Props {
  skills: SkillInfo[];
  agents: AgentInfo[];
  onSend: (payload: SendPayload) => void;
  disabled: boolean;
  supportsImage?: boolean;
}

export function ChatInputArea({ skills, agents, onSend, disabled, supportsImage = false }: Props) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const skill = useSkillPicker(skills);
  const agent = useAgentPicker(agents);
  const { images, attach, remove, clear } = useImageAttachment(supportsImage);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    skill.check(v);
    agent.check(v);
  }

  function insertSkill(slug: string) {
    setText((t) => t.replace(/\/\S*$/, `/${slug} `));
    skill.close();
  }

  function insertAgent(name: string) {
    setText((t) => t.replace(/@\S*$/, `@${name} `));
    agent.close();
  }

  function send() {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    onSend({ text: trimmed, images: images.map((i) => i.base64) });
    setText("");
    clear();
    skill.close();
    agent.close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (skill.onKeyDown(e, insertSkill)) return;
    if (agent.onKeyDown(e, insertAgent)) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="shrink-0 border-t border-border p-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2 flex gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative h-16 w-16">
              <img src={img.preview} className="h-full w-full rounded-md object-cover" alt="attachment" />
              <button
                onClick={() => remove(i)}
                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message queue notice slot — populated by parent if needed */}

      <div className="relative flex items-end gap-2">
        {/* Skill picker */}
        {skill.open && (
          <SkillPicker skills={skill.filtered} focusIdx={skill.focusIdx} onSelect={insertSkill} />
        )}
        {/* Agent picker */}
        {agent.open && !skill.open && (
          <AgentPicker agents={agent.filtered} focusIdx={agent.focusIdx} onSelect={insertAgent} />
        )}

        {supportsImage && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Attach image"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }}
            />
          </>
        )}

        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Message…"
          className={cn(
            "flex-1 resize-none rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground",
            "max-h-40 overflow-y-auto",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />

        <button
          onClick={send}
          disabled={disabled || (!text.trim() && images.length === 0)}
          className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run tests**

```bash
pnpm test -- ChatInputArea --run
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add ui/src/chat/hooks/ ui/src/chat/SkillPicker.tsx ui/src/chat/AgentPicker.tsx ui/src/chat/ChatInputArea.tsx ui/src/chat/__tests__/ChatInputArea.test.tsx
git commit -m "feat(chat): ChatInputArea with SkillPicker, AgentPicker, image attach"
```

---

## Task 8: WelcomeScreen

**Files:**
- Create: `ui/src/chat/WelcomeScreen.tsx`
- Create: `ui/src/chat/__tests__/WelcomeScreen.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/chat/__tests__/WelcomeScreen.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeScreen } from "../WelcomeScreen";

const agents = [{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }];
const scenarios = [{ id: "s1", name: "Brainstorm", description: "Idea generation", agents: ["Claude"], systemPrompt: "Let's brainstorm" }];

it("renders scenario cards", () => {
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()} />);
  expect(screen.getByText("Brainstorm")).toBeInTheDocument();
});

it("renders agent chips", () => {
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={vi.fn()} onSelectAgents={vi.fn()} />);
  expect(screen.getByLabelText(/toggle claude/i)).toBeInTheDocument();
});

it("calls onStartSession with scenario data when card clicked", () => {
  const onStartSession = vi.fn();
  render(<WelcomeScreen agents={agents} scenarios={scenarios} onStartSession={onStartSession} onSelectAgents={vi.fn()} />);
  fireEvent.click(screen.getByText("Brainstorm"));
  expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ systemPrompt: "Let's brainstorm" }));
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- WelcomeScreen --run
```
Expected: FAIL

- [ ] **Step 3: Implement WelcomeScreen.tsx**

```tsx
// ui/src/chat/WelcomeScreen.tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AgentInfo, ScenarioInfo } from "./types";

interface Props {
  agents: AgentInfo[];
  scenarios: ScenarioInfo[];
  onStartSession: (scenario: Pick<ScenarioInfo, "agents" | "systemPrompt">) => void;
  onSelectAgents: (agents: string[]) => void;
}

export function WelcomeScreen({ agents, scenarios, onStartSession, onSelectAgents }: Props) {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(agents.filter((a) => a.enabled).map((a) => a.name))
  );

  function toggleAgent(name: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      onSelectAgents([...next]);
      return next;
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Start a conversation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick agents and start chatting, or choose a scenario.</p>
      </div>

      {/* Agent chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {agents.map((a) => (
          <button
            key={a.name}
            aria-label={`Toggle ${a.name}`}
            aria-pressed={selectedAgents.has(a.name)}
            onClick={() => toggleAgent(a.name)}
            className={cn(
              "flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-all",
              selectedAgents.has(a.name)
                ? "border-transparent text-white"
                : "border-border bg-transparent text-muted-foreground hover:border-border/80",
            )}
            style={selectedAgents.has(a.name) ? { backgroundColor: a.color, borderColor: a.color } : {}}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
            {a.emoji} {a.name}
          </button>
        ))}
      </div>

      {/* Scenario cards */}
      {scenarios.length > 0 && (
        <div className="w-full max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenarios</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => onStartSession({ agents: s.agents, systemPrompt: s.systemPrompt })}
                className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted"
              >
                <p className="font-semibold text-sm">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.agents.map((name) => {
                    const a = agents.find((ag) => ag.name === name);
                    return a ? (
                      <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground border border-border">
                        {a.emoji} {name}
                      </span>
                    ) : null;
                  })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- WelcomeScreen --run
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/chat/WelcomeScreen.tsx ui/src/chat/__tests__/WelcomeScreen.test.tsx
git commit -m "feat(chat): WelcomeScreen with scenario cards and agent chips"
```

---

## Task 9: Full ChatPage rewrite

Wire all components together. Replace the existing `ChatPage.tsx`.

**Files:**
- Rewrite: `ui/src/chat/ChatPage.tsx`

- [ ] **Step 1: Rewrite ChatPage.tsx**

```tsx
// ui/src/chat/ChatPage.tsx — full rewrite
import { useState, useCallback, useEffect, useRef } from "react";
import { useChatContext } from "../context/ChatContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { SessionSidebar } from "./SessionSidebar";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MembersPanel } from "./MembersPanel";
import { RunsPanel } from "./RunsPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { ChatInputArea, SendPayload } from "./ChatInputArea";
import {
  useAgentsList, useWorkspaces, useSessions,
  useCreateSession, useRenameSession, useDeleteSession, useMoveSession,
  useSkillsList, useScenarios,
} from "./hooks/useChatApi";
import { ChatMessage } from "./types";
import { applyTokenMessage, applyDoneMessage } from "./utils"; // extract existing helpers

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const WS_BASE = CHAT_URL.replace(/^http/, "ws");

export function ChatPage({ isVisible = true, onOpenSettings }: { isVisible?: boolean; onOpenSettings?: () => void }) {
  const { activeSessionId, setActiveSessionId, messages, setMessages, agents, setAgents, setHasUnreadChat, wsRef } = useChatContext();
  const [membersOpen, setMembersOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [agentRuns, setAgentRuns] = useState<{ agentName: string; tokens?: number }[]>([]);

  // Data queries
  const { data: allAgents = [] } = useAgentsList();
  const { data: workspaces = [] } = useWorkspaces();
  const sessionsQuery = useSessions();
  const { data: skills = [] } = useSkillsList();
  const { data: scenarios = [] } = useScenarios();

  // Flatten paginated sessions
  const sessions = sessionsQuery.data?.pages.flatMap((p) => p.sessions) ?? [];

  // Mutations
  const createSession = useCreateSession();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();
  const moveSession = useMoveSession();

  // WS message handler
  const handleMessage = useCallback((data: unknown) => {
    if (typeof data !== "object" || !data) return;
    const msg = data as Record<string, unknown>;
    if (msg.type === "token" || msg.type === "chunk") {
      setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? "")));
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages(applyDoneMessage);
    } else if (msg.type === "agents") {
      setAgents(msg.agents as typeof agents);
    } else if (msg.type === "token_usage") {
      const { agent: name, tokens } = msg as { agent: string; tokens: number };
      setAgentRuns((prev) => {
        const idx = prev.findIndex((r) => r.agentName === name);
        if (idx >= 0) return prev.map((r, i) => i === idx ? { ...r, tokens } : r);
        return [...prev, { agentName: name, tokens }];
      });
    }
  }, [isVisible, setHasUnreadChat, setMessages, setAgents]);

  const wsUrl = activeSessionId ? `${WS_BASE}/ws/${activeSessionId}` : null;
  useWebSocket(wsUrl, wsRef, handleMessage);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    fetch(`${CHAT_URL}/sessions/${activeSessionId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => setMessages([]));
  }, [activeSessionId, setMessages]);

  function handleSend(payload: SendPayload) {
    if (!wsRef.current || !activeSessionId) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: payload.text, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify({
      type: "message",
      text: payload.text,
      images: payload.images?.length ? payload.images : undefined,
    }));
  }

  function handleModeChange(agentName: string, mode: "chat" | "think") {
    setAgents((prev) => prev.map((a) => a.name === agentName ? { ...a, mode } : a));
    wsRef.current?.send(JSON.stringify({ type: "set_mode", agent: agentName, mode }));
  }

  function handleAddAgent(agentName: string) {
    wsRef.current?.send(JSON.stringify({ type: "add_agent", agent: agentName }));
  }

  function handleRemoveAgent(agentName: string) {
    wsRef.current?.send(JSON.stringify({ type: "remove_agent", agent: agentName }));
    setAgents((prev) => prev.filter((a) => a.name !== agentName));
  }

  async function handleNewSession(workspaceId?: string) {
    const s = await createSession.mutateAsync(workspaceId);
    setActiveSessionId(s.id);
    setMessages([]);
  }

  async function handleScenarioStart(scenario: { agents: string[]; systemPrompt?: string }) {
    const s = await createSession.mutateAsync();
    setActiveSessionId(s.id);
    setMessages([]);
    // Brief delay to let WS connect, then send system setup
    setTimeout(() => {
      wsRef.current?.send(JSON.stringify({ type: "scenario_start", ...scenario }));
    }, 300);
  }

  const showWelcome = !activeSessionId;
  const isConnected = wsRef.current?.readyState === WebSocket.OPEN;

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <SessionSidebar
        workspaces={workspaces}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => { setActiveSessionId(id); setMessages([]); setAgentRuns([]); }}
        onNewSession={() => handleNewSession()}
        onNewSessionInWorkspace={handleNewSession}
        onRenameSession={(id, name) => renameSession.mutate({ id, name })}
        onDeleteSession={(id) => { deleteSession.mutate(id); if (id === activeSessionId) { setActiveSessionId(null); setMessages([]); } }}
        onMoveSession={(id, workspaceId) => moveSession.mutate({ id, workspaceId })}
        onOpenSettings={() => onOpenSettings?.()}
      />

      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        {!showWelcome && (
          <ChatHeader
            agents={agents}
            membersOpen={membersOpen}
            runsOpen={runsOpen}
            onToggleMembers={() => setMembersOpen((o) => !o)}
            onToggleRuns={() => setRunsOpen((o) => !o)}
          />
        )}

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            {showWelcome ? (
              <WelcomeScreen
                agents={allAgents}
                scenarios={scenarios}
                onStartSession={handleScenarioStart}
                onSelectAgents={() => {}}
              />
            ) : (
              <MessageList messages={messages} agents={agents} />
            )}

            {!showWelcome && (
              <ChatInputArea
                skills={skills}
                agents={allAgents}
                onSend={handleSend}
                disabled={!isConnected}
                supportsImage={allAgents.some((a) => a.name === agents[0]?.name && (a as any).supportsImage)}
              />
            )}
          </main>

          <RunsPanel
            open={runsOpen}
            membersOpen={membersOpen}
            agents={agents}
            runs={agentRuns}
          />
          <MembersPanel
            open={membersOpen}
            agents={agents}
            availableAgents={allAgents}
            onModeChange={handleModeChange}
            onAddAgent={handleAddAgent}
            onRemoveAgent={handleRemoveAgent}
            onClose={() => setMembersOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Extract helpers to `ui/src/chat/utils.ts`**

Move `applyTokenMessage` and `applyDoneMessage` from `ChatPage.tsx` to:

```typescript
// ui/src/chat/utils.ts
import { ChatMessage } from "./types";

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

- [ ] **Step 3: Update App.tsx to pass onOpenSettings**

In `AppShell`, update ChatPage usage to pass `onOpenSettings`:

```tsx
<ChatPage isVisible={mode === "chat"} onOpenSettings={() => setMode("settings")} />
```

- [ ] **Step 4: Run all chat tests**

```bash
pnpm test -- src/chat --run
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/chat/ChatPage.tsx ui/src/chat/utils.ts ui/src/App.tsx
git commit -m "feat(chat): full Arc-style ChatPage rewrite wiring all components"
```

---

## Task 10: Export + load-more + final e2e

**Files:**
- Create: `ui/src/chat/hooks/useExport.ts`
- Update: `ui/src/chat/hooks/useChatApi.ts` — load-more already in useInfiniteQuery
- Create: `ui/e2e/chat-ui.spec.ts`

- [ ] **Step 1: Implement useExport.ts**

```typescript
// ui/src/chat/hooks/useExport.ts
import { ChatMessage } from "../types";

export function useExport() {
  function exportMd(sessionName: string, messages: ChatMessage[]) {
    const md = `# ${sessionName}\n\n` + messages.map((m) =>
      `**${m.role === "user" ? "You" : m.agentName ?? "Agent"}:** ${m.content}`
    ).join("\n\n");
    download(`${sessionName}.md`, md, "text/markdown");
  }

  function exportJson(sessionName: string, messages: ChatMessage[]) {
    download(`${sessionName}.json`, JSON.stringify(messages, null, 2), "application/json");
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { exportMd, exportJson };
}
```

- [ ] **Step 2: Write e2e tests**

```typescript
// ui/e2e/chat-ui.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Chat UI Arc-style", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows workspace folders in sidebar", async ({ page }) => {
    // At minimum the sidebar exists
    await expect(page.locator('[class*="sidebar"]').first()).toBeVisible();
  });

  test("Settings tab opens settings mode", async ({ page }) => {
    const toggle = page.getByTestId("mode-toggle");
    await toggle.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByText(/settings/i, { exact: false })).toBeVisible();
  });

  test("⌘3 switches to settings mode", async ({ page }) => {
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+3");
    await expect(page.getByText(/settings/i, { exact: false })).toBeVisible();
  });

  test("sidebar settings gear icon switches to settings", async ({ page }) => {
    // Look for settings button in sidebar dock
    const settingsBtn = page.getByRole("button", { name: /settings/i }).first();
    await settingsBtn.click();
    await expect(page.getByTestId("mode-toggle").getByRole("button", { name: /settings/i })).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 3: Run e2e (requires servers running)**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm exec playwright test e2e/chat-ui.spec.ts
```

- [ ] **Step 4: Run all unit tests**

```bash
pnpm test --run
```
Expected: All PASS

- [ ] **Step 5: Build check**

```bash
pnpm build
```
Expected: No TypeScript errors, build succeeds.

- [ ] **Step 6: Final commit**

```bash
git add ui/src/chat/hooks/useExport.ts ui/e2e/chat-ui.spec.ts
git commit -m "feat(chat): useExport hook + chat-ui e2e tests"
```

---

## Completion Checklist

- [ ] `ChatMode` includes `"settings"`
- [ ] ModeToggle renders 3 tabs with ⌘1 / ⌘2 / ⌘3
- [ ] Sidebar has workspace folders (collapsible), standalone sessions, search
- [ ] SessionItem: inline rename on double-click, hover-reveal delete/move
- [ ] MembersPanel: per-agent chat/think toggle, add/remove agent
- [ ] RunsPanel: offsets when MembersPanel open
- [ ] ChatInputArea: `/ ` → skill picker, `@` → agent picker, Shift+Enter newline
- [ ] WelcomeScreen: scenario cards + agent chip toggles
- [ ] Gear icon in sidebar → switches to Settings mode
- [ ] All Vitest unit tests pass
- [ ] `pnpm build` succeeds with no errors
