# Settings Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared Settings mode — the third tab accessible from both Chat and Cowork — with 7 tabs: LLM, Agents (unified Chat+Cowork list), Skills, Workspaces, Marketplace (browse-only), Soul, About.

**Architecture:** Pure frontend dual-client approach: `chatClient` (`:8000`) for Chat data, `coworkClient` (`:3100`) for Cowork agents (read-only). All 7 tabs are separate components rendered inside a `SettingsPage` shell with left-nav routing. No new backend required.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, TanStack Query, Vitest + React Testing Library.

---

## Plan Review Notes (2026-03-21)

以下修改由 `/plan-eng-review` 決定，已納入計畫：

1. **Task 1 coworkClient 修改**：改用 `makeApiClient` factory（Plan 1 Task 2 建立的），保留 VITE_COWORK_URL 直連架構（Phase 2 合併方向）
2. **Task 3 AgentsTab 測試新增**：加 cowork 離線場景（`useCoworkAgents` error 時只顯示 chat agents，不崩潰）
3. **Task 2 useAutoSave 測試新增**：加三個支路測試（save fail、value 中途變更取消、unmount 不 memory leak）

---

## Prerequisite

This plan requires Plan 1 (`2026-03-21-chat-ui-rewrite.md`) to be complete:
- `chatClient.ts` already exists at `ui/src/chat/chatClient.ts`
- `ChatMode` already includes `"settings"`
- `AppShell` already renders `<SettingsPage>` placeholder when `mode === "settings"`

---

## Worktree Context

Working in: `.worktrees/feat-chat-cowork-phase1/`

## Existing Endpoints (Chat — `chatClient`)

```
GET /agents                      → AgentInfo[]
GET /agents/{name}               → AgentInfo (with config)
POST /agents                     → create
PUT /agents/{name}               → update
DELETE /agents/{name}
GET /agents/{name}/agent-md      → { content: string }
PUT /agents/{name}/agent-md      → { content: string }
GET /agents/{name}/soul          → { content: string }
PUT /agents/{name}/soul
GET /agents/{name}/identity      → { content: string }
PUT /agents/{name}/identity
GET /skills                      → SkillInfo[]
GET /skills/{slug}               → SkillInfo
PUT /skills/{slug}               → update SKILL.md
POST /skills                     → create
POST /skills/upload              → upload .zip
DELETE /skills/{slug}
GET /workspaces                  → WorkspaceInfo[]
GET /workspaces/{id}             → WorkspaceDetail
POST /workspaces                 → create
PUT /workspaces/{id}             → update
DELETE /workspaces/{id}
POST /workspaces/{id}/files      → upload file
DELETE /workspaces/{id}/files/{filename}
GET /marketplace/agents          → MarketplaceAgent[]
GET /marketplace/agents/{id}     → MarketplaceAgent
GET /health                      → { version, status }
```

## Existing Endpoints (Cowork — `coworkClient`)

```
GET /api/agents                  → CoworkAgent[] (read-only in Settings Phase 1)
GET /api/health                  → { status }
```

---

## File Structure

```
ui/src/settings/
├── SettingsPage.tsx             CREATE  shell + left nav + tab router
├── types.ts                     CREATE  UnifiedAgent, CoworkAgent, MarketplaceTemplate
├── coworkClient.ts              CREATE  fetch wrapper for :3100
├── hooks/
│   ├── useSettingsApi.ts        CREATE  all React Query hooks (chat + cowork)
│   └── useAutoSave.ts           CREATE  debounced save-on-change with status
├── tabs/
│   ├── LLMTab.tsx               CREATE  two-panel: agent list + config
│   ├── AgentsTab.tsx            CREATE  unified list with Chat/Cowork badge
│   ├── SkillsTab.tsx            CREATE  grid + edit + add panels
│   ├── WorkspacesTab.tsx        CREATE  list + detail panel
│   ├── MarketplaceTab.tsx       CREATE  browse-only template grid
│   ├── SoulTab.tsx              CREATE  4 markdown editors
│   └── AboutTab.tsx             CREATE  static + health status
└── __tests__/
    ├── SettingsPage.test.tsx    CREATE
    ├── AgentsTab.test.tsx       CREATE
    └── SkillsTab.test.tsx       CREATE
```

Also modify:
- `ui/src/App.tsx` — replace Settings placeholder with `<SettingsPage />`

---

## Task 1: SettingsPage shell + nav + coworkClient

**Files:**
- Create: `ui/src/settings/types.ts`
- Create: `ui/src/settings/coworkClient.ts`
- Create: `ui/src/settings/SettingsPage.tsx`
- Create: `ui/src/settings/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/settings/__tests__/SettingsPage.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "../SettingsPage";

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
}

it("renders all 7 nav items", () => {
  render(wrap(<SettingsPage />));
  expect(screen.getByRole("button", { name: /llm/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /agents/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /skills/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /workspaces/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /marketplace/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /soul|靈魂/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /about/i })).toBeInTheDocument();
});

it("defaults to Agents tab", () => {
  render(wrap(<SettingsPage />));
  expect(screen.getByRole("button", { name: /agents/i })).toHaveAttribute("aria-current", "page");
});

it("switches tab on nav click", () => {
  render(wrap(<SettingsPage />));
  fireEvent.click(screen.getByRole("button", { name: /skills/i }));
  expect(screen.getByRole("button", { name: /skills/i })).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test -- SettingsPage --run
```
Expected: FAIL

- [ ] **Step 3: Create types.ts**

```typescript
// ui/src/settings/types.ts
import type { AgentInfo } from "../chat/types";

export type SettingsTab = "llm" | "agents" | "skills" | "workspaces" | "marketplace" | "soul" | "about";

// Agent from Cowork backend (Paperclip DB)
export interface CoworkAgent {
  id: string;
  name: string;
  emoji?: string;
  color?: string;
  role?: string;
  budget?: number;
  spentCents?: number;
  adapterType?: string; // "claude-local" | "gemini-local" | ...
}

// Unified agent for display in Settings/Agents tab
export type UnifiedAgent =
  | ({ source: "chat" } & AgentInfo)
  | ({ source: "cowork" } & CoworkAgent & { name: string; emoji: string; color: string });

// Marketplace template (agents or skills)
export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tags?: string[];
  version?: string;
  type: "agent" | "skill";
}

// Full skill content for editing
export interface SkillDetail {
  slug: string;
  name: string;
  description: string;
  source?: string;
  content: string; // full SKILL.md
}
```

- [ ] **Step 4: Create coworkClient.ts using makeApiClient factory**

Note: Plan Review decided to keep separate VITE_COWORK_URL (architecture: explicit dual-client, path toward Phase 2 merge).
Uses `makeApiClient` from Plan 1 Task 2 (prerequisite: Plan 1 must be complete).

```typescript
// ui/src/settings/coworkClient.ts
import { makeApiClient } from "@/lib/makeApiClient";

const BASE = (import.meta.env.VITE_COWORK_URL ?? "http://localhost:3100") as string;
// Read-only in Phase 1 — only GET is exposed
const _client = makeApiClient(BASE);
export const coworkClient = { get: _client.get };
export { ApiClientError as CoworkApiError } from "@/lib/makeApiClient";
```

- [ ] **Step 5: Create SettingsPage.tsx**

```tsx
// ui/src/settings/SettingsPage.tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SettingsTab } from "./types";
import { LLMTab } from "./tabs/LLMTab";
import { AgentsTab } from "./tabs/AgentsTab";
import { SkillsTab } from "./tabs/SkillsTab";
import { WorkspacesTab } from "./tabs/WorkspacesTab";
import { MarketplaceTab } from "./tabs/MarketplaceTab";
import { SoulTab } from "./tabs/SoulTab";
import { AboutTab } from "./tabs/AboutTab";

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: "llm", label: "LLM" },
  { id: "agents", label: "Agents" },
  { id: "skills", label: "Skills" },
  { id: "workspaces", label: "Workspaces" },
  { id: "marketplace", label: "Marketplace" },
  { id: "soul", label: "靈魂" },
  { id: "about", label: "About" },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("agents");

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left nav */}
      <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-hidden border-r border-border bg-sidebar p-2.5">
        <p className="mb-1 px-3 pt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Settings</p>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            aria-current={activeTab === item.id ? "page" : undefined}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              activeTab === item.id
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "llm" && <LLMTab />}
        {activeTab === "agents" && <AgentsTab />}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "workspaces" && <WorkspacesTab />}
        {activeTab === "marketplace" && <MarketplaceTab />}
        {activeTab === "soul" && <SoulTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create stub tabs** (so SettingsPage renders without errors)

Create minimal stub for each tab — they'll be filled in subsequent tasks:

```tsx
// ui/src/settings/tabs/LLMTab.tsx
export function LLMTab() { return <div className="p-8 text-muted-foreground text-sm">LLM tab — coming soon</div>; }

// ui/src/settings/tabs/AgentsTab.tsx
export function AgentsTab() { return <div className="p-8 text-muted-foreground text-sm">Agents tab</div>; }

// ui/src/settings/tabs/SkillsTab.tsx
export function SkillsTab() { return <div className="p-8 text-muted-foreground text-sm">Skills tab</div>; }

// ui/src/settings/tabs/WorkspacesTab.tsx
export function WorkspacesTab() { return <div className="p-8 text-muted-foreground text-sm">Workspaces tab</div>; }

// ui/src/settings/tabs/MarketplaceTab.tsx
export function MarketplaceTab() { return <div className="p-8 text-muted-foreground text-sm">Marketplace tab</div>; }

// ui/src/settings/tabs/SoulTab.tsx
export function SoulTab() { return <div className="p-8 text-muted-foreground text-sm">Soul tab</div>; }

// ui/src/settings/tabs/AboutTab.tsx
export function AboutTab() { return <div className="p-8 text-muted-foreground text-sm">About tab</div>; }
```

- [ ] **Step 7: Wire SettingsPage into App.tsx**

Replace the placeholder in `AppShell`:

```tsx
// Replace: {mode === "settings" && <div className="...">Settings — coming soon</div>}
// With:
import { SettingsPage } from "./settings/SettingsPage";
// ...
{mode === "settings" && <div className="flex h-full flex-1 overflow-hidden"><SettingsPage /></div>}
```

- [ ] **Step 8: Run tests**

```bash
pnpm test -- SettingsPage --run
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add ui/src/settings/ ui/src/App.tsx
git commit -m "feat(settings): SettingsPage shell + left nav + 7 stub tabs"
```

---

## Task 2: Settings API hooks + useAutoSave

**Files:**
- Create: `ui/src/settings/hooks/useSettingsApi.ts`
- Create: `ui/src/settings/hooks/useAutoSave.ts`

- [ ] **Step 1: Create useSettingsApi.ts**

```typescript
// ui/src/settings/hooks/useSettingsApi.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatClient } from "../../chat/chatClient";
import { coworkClient } from "../coworkClient";
import type { AgentInfo } from "../../chat/types";
import type { CoworkAgent, MarketplaceTemplate, SkillDetail, UnifiedAgent } from "../types";
import type { WorkspaceInfo, WorkspaceDetail, SkillInfo } from "../../chat/types";

// ─── Query keys ────────────────────────────────────────────────────────────
export const settingsKeys = {
  agents: ["settings", "agents"] as const,
  coworkAgents: ["settings", "cowork-agents"] as const,
  agentFile: (name: string, file: string) => ["settings", "agent-file", name, file] as const,
  skills: ["settings", "skills"] as const,
  skillDetail: (slug: string) => ["settings", "skill", slug] as const,
  workspaces: ["settings", "workspaces"] as const,
  workspaceDetail: (id: string) => ["settings", "workspace", id] as const,
  marketplace: ["settings", "marketplace"] as const,
  soul: ["settings", "soul"] as const,
  health: ["settings", "health"] as const,
};

// ─── Chat agents ────────────────────────────────────────────────────────────
export function useChatAgents() {
  return useQuery({
    queryKey: settingsKeys.agents,
    queryFn: () => chatClient.get<AgentInfo[]>("/agents"),
  });
}

export function useCreateChatAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AgentInfo> & { name: string }) =>
      chatClient.post<AgentInfo>("/agents", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.agents }),
  });
}

export function useUpdateChatAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...data }: Partial<AgentInfo> & { name: string }) =>
      chatClient.put<AgentInfo>(`/agents/${name}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.agents }),
  });
}

export function useDeleteChatAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => chatClient.delete(`/agents/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.agents }),
  });
}

// Per-file fetchers (agent-md, soul, identity)
export function useAgentFile(name: string, file: "agent-md" | "soul" | "identity") {
  return useQuery({
    queryKey: settingsKeys.agentFile(name, file),
    queryFn: () => chatClient.get<{ content: string }>(`/agents/${name}/${file}`),
    enabled: Boolean(name),
  });
}

export function useUpdateAgentFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, file, content }: { name: string; file: "agent-md" | "soul" | "identity"; content: string }) =>
      chatClient.put(`/agents/${name}/${file}`, { content }),
    onSuccess: (_, { name, file }) =>
      qc.invalidateQueries({ queryKey: settingsKeys.agentFile(name, file) }),
  });
}

// ─── Cowork agents (read-only) ──────────────────────────────────────────────
export function useCoworkAgents() {
  return useQuery({
    queryKey: settingsKeys.coworkAgents,
    queryFn: () => coworkClient.get<CoworkAgent[]>("/api/agents"),
    retry: false, // Cowork server may be offline — don't spam
  });
}

// ─── Unified agents ─────────────────────────────────────────────────────────
export function useUnifiedAgents() {
  const chat = useChatAgents();
  const cowork = useCoworkAgents();

  const unified: UnifiedAgent[] = [
    ...(chat.data ?? []).map((a): UnifiedAgent => ({ source: "chat", ...a })),
    ...(cowork.data ?? []).map((a): UnifiedAgent => ({
      source: "cowork",
      id: a.id,
      name: a.name,
      emoji: a.emoji ?? "🤖",
      color: a.color ?? "#888",
      ...a,
    })),
  ];

  return { unified, chatLoading: chat.isLoading, coworkLoading: cowork.isLoading, coworkError: cowork.error };
}

// ─── Skills ─────────────────────────────────────────────────────────────────
export function useSettingsSkills() {
  return useQuery({
    queryKey: settingsKeys.skills,
    queryFn: () => chatClient.get<SkillInfo[]>("/skills"),
  });
}

export function useSkillDetail(slug: string) {
  return useQuery({
    queryKey: settingsKeys.skillDetail(slug),
    queryFn: () => chatClient.get<SkillDetail>(`/skills/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, content }: { slug: string; content: string }) =>
      chatClient.put(`/skills/${slug}`, { content }),
    onSuccess: (_, { slug }) => qc.invalidateQueries({ queryKey: settingsKeys.skillDetail(slug) }),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => chatClient.delete(`/skills/${slug}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.skills }),
  });
}

export function useUploadSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return chatClient.postForm("/skills/upload", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.skills }),
  });
}

// ─── Workspaces ─────────────────────────────────────────────────────────────
export function useSettingsWorkspaces() {
  return useQuery({
    queryKey: settingsKeys.workspaces,
    queryFn: () => chatClient.get<WorkspaceInfo[]>("/workspaces"),
  });
}

export function useSettingsWorkspaceDetail(id: string) {
  return useQuery({
    queryKey: settingsKeys.workspaceDetail(id),
    queryFn: () => chatClient.get<WorkspaceDetail>(`/workspaces/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<WorkspaceDetail> & { id: string }) =>
      chatClient.put(`/workspaces/${id}`, data),
    onSuccess: (_, { id }) => qc.invalidateQueries({ queryKey: settingsKeys.workspaceDetail(id) }),
  });
}

export function useUploadWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, file }: { workspaceId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return chatClient.postForm(`/workspaces/${workspaceId}/files`, form);
    },
    onSuccess: (_, { workspaceId }) =>
      qc.invalidateQueries({ queryKey: settingsKeys.workspaceDetail(workspaceId) }),
  });
}

// ─── Marketplace ─────────────────────────────────────────────────────────────
export function useMarketplace() {
  return useQuery({
    queryKey: settingsKeys.marketplace,
    queryFn: async () => {
      const [agents, skills] = await Promise.all([
        chatClient.get<MarketplaceTemplate[]>("/marketplace/agents"),
        chatClient.get<MarketplaceTemplate[]>("/marketplace/skills").catch(() => [] as MarketplaceTemplate[]),
      ]);
      return { agents: agents.map((a) => ({ ...a, type: "agent" as const })), skills: skills.map((s) => ({ ...s, type: "skill" as const })) };
    },
  });
}

// ─── Soul (default agent template) ──────────────────────────────────────────
// Soul uses agent-md/soul/identity endpoints on the "_default" or "Default" agent
const SOUL_AGENT = "_default";

export function useSoulFiles() {
  const agentMd = useAgentFile(SOUL_AGENT, "agent-md");
  const soul = useAgentFile(SOUL_AGENT, "soul");
  const identity = useAgentFile(SOUL_AGENT, "identity");
  return { agentMd, soul, identity };
}

// ─── Health ─────────────────────────────────────────────────────────────────
export function useSettingsHealth() {
  return useQuery({
    queryKey: settingsKeys.health,
    queryFn: () => chatClient.get<{ version?: string; status?: string }>("/health"),
    retry: false,
  });
}
```

- [ ] **Step 2: Create useAutoSave.ts**

```typescript
// ui/src/settings/hooks/useAutoSave.ts
import { useState, useEffect, useCallback, useRef } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave<T>(
  value: T,
  save: (value: T) => Promise<unknown>,
  delay = 800,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveRef = useRef(save);
  saveRef.current = save;

  const trigger = useCallback((v: T) => {
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveRef.current(v);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch {
        setStatus("error");
      }
    }, delay);
  }, [delay]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { status, trigger };
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/settings/hooks/
git commit -m "feat(settings): Settings API hooks + useAutoSave"
```

---

## Task 3: AgentsTab (unified list with Chat/Cowork badge)

**Files:**
- Rewrite: `ui/src/settings/tabs/AgentsTab.tsx`
- Create: `ui/src/settings/__tests__/AgentsTab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/settings/__tests__/AgentsTab.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentsTab } from "../tabs/AgentsTab";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("http://localhost:8000/agents", () =>
    HttpResponse.json([{ name: "Claude", emoji: "🤖", color: "#7c3aed", model: "claude", enabled: true }])
  ),
  http.get("http://localhost:3100/api/agents", () =>
    HttpResponse.json([{ id: "c1", name: "CoworkAgent", emoji: "💼", color: "#2563eb", role: "engineer" }])
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
}

it("lists chat agents with Chat badge", async () => {
  render(wrap(<AgentsTab />));
  expect(await screen.findByText("Claude")).toBeInTheDocument();
  expect(screen.getByText("Chat")).toBeInTheDocument();
});

it("lists cowork agents with Cowork badge", async () => {
  render(wrap(<AgentsTab />));
  expect(await screen.findByText("CoworkAgent")).toBeInTheDocument();
  expect(screen.getByText("Cowork")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- AgentsTab --run
```
Expected: FAIL

Note: Install `msw` if not present: `pnpm add -D msw`

- [ ] **Step 3: Implement AgentsTab.tsx**

```tsx
// ui/src/settings/tabs/AgentsTab.tsx
import { useState } from "react";
import { Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnifiedAgents, useAgentFile, useUpdateAgentFile } from "../hooks/useSettingsApi";
import { useAutoSave } from "../hooks/useAutoSave";
import { UnifiedAgent } from "../types";

export function AgentsTab() {
  const { unified, coworkLoading } = useUnifiedAgents();
  const [selected, setSelected] = useState<UnifiedAgent | null>(null);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: agent list */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Agents</h2>
          <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="New agent">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {unified.map((a) => (
            <button
              key={`${a.source}-${a.name}`}
              onClick={() => setSelected(a)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                selected?.name === a.name && selected?.source === a.source
                  ? "bg-muted border border-border"
                  : "hover:bg-muted/60 border border-transparent",
              )}
            >
              <span className="text-lg shrink-0">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.source === "chat" ? a.model : (a as any).role ?? "cowork"}
                </p>
              </div>
              <span className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                a.source === "chat" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground",
              )}>
                {a.source === "chat" ? "Chat" : "Cowork"}
              </span>
            </button>
          ))}
          {coworkLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading Cowork agents…</p>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          selected.source === "chat"
            ? <ChatAgentDetail agent={selected} />
            : <CoworkAgentReadonly agent={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an agent to edit
          </div>
        )}
      </div>
    </div>
  );
}

function ChatAgentDetail({ agent }: { agent: UnifiedAgent & { source: "chat" } }) {
  const agentMdQ = useAgentFile(agent.name, "agent-md");
  const soulQ = useAgentFile(agent.name, "soul");
  const identityQ = useAgentFile(agent.name, "identity");
  const update = useUpdateAgentFile();

  const agentMdSave = useAutoSave(agentMdQ.data?.content ?? "", (content) =>
    update.mutateAsync({ name: agent.name, file: "agent-md", content })
  );
  const soulSave = useAutoSave(soulQ.data?.content ?? "", (content) =>
    update.mutateAsync({ name: agent.name, file: "soul", content })
  );
  const identitySave = useAutoSave(identityQ.data?.content ?? "", (content) =>
    update.mutateAsync({ name: agent.name, file: "identity", content })
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{agent.emoji}</span>
        <div>
          <h2 className="text-lg font-semibold">{agent.name}</h2>
          <p className="text-xs text-muted-foreground">{agent.model}</p>
        </div>
      </div>

      {[
        { label: "AGENT.md", value: agentMdQ.data?.content ?? "", save: agentMdSave },
        { label: "SOUL.md", value: soulQ.data?.content ?? "", save: soulSave },
        { label: "IDENTITY.md", value: identityQ.data?.content ?? "", save: identitySave },
      ].map(({ label, value, save }) => (
        <div key={label} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
            {save.status === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
            {save.status === "saved" && <span className="text-xs text-primary">Saved</span>}
            {save.status === "error" && <span className="text-xs text-destructive">Save failed</span>}
          </div>
          <textarea
            defaultValue={value}
            onChange={(e) => save.trigger(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-lg border border-border bg-muted p-3 font-mono text-xs outline-none focus:border-ring"
          />
        </div>
      ))}
    </div>
  );
}

function CoworkAgentReadonly({ agent }: { agent: UnifiedAgent & { source: "cowork" } }) {
  const coworkAgent = agent as any;
  return (
    <div className="flex flex-col gap-4 p-6 max-w-xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{agent.emoji}</span>
        <div>
          <h2 className="text-lg font-semibold">{agent.name}</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Cowork agent</span>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
        <p className="text-muted-foreground mb-3 text-xs">Read-only. Manage this agent in Cowork mode.</p>
        {coworkAgent.role && <div className="flex gap-2"><span className="text-muted-foreground w-20">Role</span><span>{coworkAgent.role}</span></div>}
        {coworkAgent.adapterType && <div className="flex gap-2 mt-1"><span className="text-muted-foreground w-20">Adapter</span><span>{coworkAgent.adapterType}</span></div>}
        {coworkAgent.budget != null && <div className="flex gap-2 mt-1"><span className="text-muted-foreground w-20">Budget</span><span>${(coworkAgent.budget / 100).toFixed(2)}</span></div>}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="h-3 w-3" />
        Switch to Cowork mode to edit this agent.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- AgentsTab --run
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/settings/tabs/AgentsTab.tsx ui/src/settings/__tests__/AgentsTab.test.tsx
git commit -m "feat(settings): AgentsTab with unified Chat+Cowork agent list"
```

---

## Task 4: LLMTab

**Files:**
- Rewrite: `ui/src/settings/tabs/LLMTab.tsx`

LLM tab reuses the existing `GET /agents` endpoint — agents have a `model` field that represents their LLM config.

- [ ] **Step 1: Implement LLMTab.tsx**

```tsx
// ui/src/settings/tabs/LLMTab.tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatAgents, useUpdateChatAgent } from "../hooks/useSettingsApi";
import { useAutoSave } from "../hooks/useAutoSave";
import type { AgentInfo } from "../../chat/types";

export function LLMTab() {
  const { data: agents = [], isLoading } = useChatAgents();
  const [selected, setSelected] = useState<AgentInfo | null>(null);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: agent list */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">LLM Configs</h2>
          <button className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>}
          {agents.map((a) => (
            <button
              key={a.name}
              onClick={() => setSelected(a)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
                selected?.name === a.name ? "bg-muted border border-border" : "hover:bg-muted/60 border border-transparent",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{a.emoji} {a.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{a.model}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: config */}
      <div className="flex-1 overflow-y-auto">
        {selected
          ? <LLMConfigPanel agent={selected} />
          : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select an LLM to configure</div>
        }
      </div>
    </div>
  );
}

function LLMConfigPanel({ agent }: { agent: AgentInfo }) {
  const update = useUpdateChatAgent();
  const modelSave = useAutoSave(agent.model, (model) => update.mutateAsync({ name: agent.name, model }));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{agent.emoji}</span>
        <h2 className="text-lg font-semibold">{agent.name}</h2>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model String</label>
          {modelSave.status === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
          {modelSave.status === "saved" && <span className="text-xs text-primary">Saved</span>}
        </div>
        <input
          defaultValue={agent.model}
          onChange={(e) => modelSave.trigger(e.target.value)}
          placeholder="e.g. claude-opus-4-6, gemini-2.5-pro, ollama/llama3"
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono outline-none focus:border-ring"
        />
        <p className="text-xs text-muted-foreground">
          For Claude: <code>claude-sonnet-4-6</code> · Gemini: <code>gemini-2.5-pro</code> · Ollama: <code>ollama/llama3</code>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Enabled</label>
        <button
          onClick={() => update.mutate({ name: agent.name, enabled: !agent.enabled })}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            agent.enabled ? "bg-primary" : "bg-border",
          )}
        >
          <span className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            agent.enabled ? "translate-x-4" : "translate-x-0.5",
          )} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/settings/tabs/LLMTab.tsx
git commit -m "feat(settings): LLMTab two-panel LLM config editor"
```

---

## Task 5: SkillsTab

**Files:**
- Rewrite: `ui/src/settings/tabs/SkillsTab.tsx`
- Create: `ui/src/settings/__tests__/SkillsTab.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// ui/src/settings/__tests__/SkillsTab.test.tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkillsTab } from "../tabs/SkillsTab";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("http://localhost:8000/skills", () =>
    HttpResponse.json([
      { slug: "brainstorming", name: "Brainstorming", description: "Ideation" },
      { slug: "debugging", name: "Debugging", description: "Debug methodology" },
    ])
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
}

it("renders skill grid", async () => {
  render(wrap(<SkillsTab />));
  expect(await screen.findByText("Brainstorming")).toBeInTheDocument();
  expect(screen.getByText("Debugging")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm test -- SkillsTab --run
```
Expected: FAIL

- [ ] **Step 3: Implement SkillsTab.tsx**

```tsx
// ui/src/settings/tabs/SkillsTab.tsx
import { useState, useRef } from "react";
import { Plus, Upload, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsSkills, useSkillDetail, useUpdateSkill, useDeleteSkill, useUploadSkill } from "../hooks/useSettingsApi";
import { useAutoSave } from "../hooks/useAutoSave";
import type { SkillInfo } from "../../chat/types";

type Panel = { type: "edit"; slug: string } | { type: "add" } | null;

export function SkillsTab() {
  const { data: skills = [], isLoading } = useSettingsSkills();
  const [panel, setPanel] = useState<Panel>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadSkill = useUploadSkill();

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Skills</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { uploadRef.current?.click(); }}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />Upload .zip
            </button>
            <button
              onClick={() => setPanel({ type: "add" })}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />New Skill
            </button>
            <input
              ref={uploadRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadSkill.mutate(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <p className="text-sm text-muted-foreground">Loading skills…</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((s) => (
              <SkillCard
                key={s.slug}
                skill={s}
                onEdit={() => setPanel({ type: "edit", slug: s.slug })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Slide-in panel */}
      {panel && (
        <div className="flex w-[420px] shrink-0 flex-col border-l border-border overflow-hidden">
          {panel.type === "edit"
            ? <SkillEditPanel slug={panel.slug} onClose={() => setPanel(null)} allSkills={skills} />
            : <AddSkillPanel onClose={() => setPanel(null)} />
          }
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill, onEdit }: { skill: SkillInfo; onEdit: () => void }) {
  const deleteSkill = useDeleteSkill();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group rounded-xl border border-border p-4 hover:bg-muted/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{skill.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{skill.description}</p>
          {skill.source && (
            <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {skill.source}:{skill.slug}
            </span>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => confirmDelete ? deleteSkill.mutate(skill.slug) : setConfirmDelete(true)}
            className={cn(
              "rounded p-1 transition-colors",
              confirmDelete
                ? "bg-destructive text-white"
                : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
            )}
            title={confirmDelete ? "Click to confirm delete" : "Delete skill"}
          >
            {confirmDelete ? <AlertTriangle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillEditPanel({ slug, onClose, allSkills }: { slug: string; onClose: () => void; allSkills: SkillInfo[] }) {
  const { data } = useSkillDetail(slug);
  const update = useUpdateSkill();
  const save = useAutoSave(data?.content ?? "", (content) => update.mutateAsync({ slug, content }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Edit — /{slug}</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="flex flex-col gap-2 flex-1 overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SKILL.md</label>
          {save.status === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
          {save.status === "saved" && <span className="text-xs text-primary">Saved</span>}
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Modifying this skill affects all agents that use it.
        </p>
        <textarea
          defaultValue={data?.content ?? ""}
          onChange={(e) => save.trigger(e.target.value)}
          className="flex-1 resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs outline-none focus:border-ring"
        />
      </div>
    </div>
  );
}

function AddSkillPanel({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("---\nname: my-skill\ndescription: Description here\n---\n\n# My Skill\n\n");
  const qc = useQueryClient();

  async function handleCreate() {
    await chatClient.post("/skills", { content });
    qc.invalidateQueries({ queryKey: ["settings", "skills"] });
    onClose();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">New Skill</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-hidden p-4">
        <p className="text-xs text-muted-foreground">Paste SKILL.md content below.</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 resize-none rounded-lg border border-border bg-muted p-3 font-mono text-xs outline-none focus:border-ring"
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create Skill
        </button>
      </div>
    </div>
  );
}

// Need to import chatClient and useQueryClient for AddSkillPanel
import { chatClient } from "../../chat/chatClient";
import { useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- SkillsTab --run
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/settings/tabs/SkillsTab.tsx ui/src/settings/__tests__/SkillsTab.test.tsx
git commit -m "feat(settings): SkillsTab with grid, edit panel, add panel, upload"
```

---

## Task 6: WorkspacesTab

**Files:**
- Rewrite: `ui/src/settings/tabs/WorkspacesTab.tsx`

- [ ] **Step 1: Implement WorkspacesTab.tsx**

```tsx
// ui/src/settings/tabs/WorkspacesTab.tsx
import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSettingsWorkspaces, useSettingsWorkspaceDetail,
  useUpdateWorkspace, useUploadWorkspaceFile,
} from "../hooks/useSettingsApi";
import { useChatAgents } from "../hooks/useSettingsApi";
import { useAutoSave } from "../hooks/useAutoSave";
import type { WorkspaceInfo } from "../../chat/types";
import { chatClient } from "../../chat/chatClient";
import { useQueryClient } from "@tanstack/react-query";
import { settingsKeys } from "../hooks/useSettingsApi";

export function WorkspacesTab() {
  const { data: workspaces = [] } = useSettingsWorkspaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  async function handleCreate() {
    const ws = await chatClient.post<WorkspaceInfo>("/workspaces", { name: "New Workspace" });
    qc.invalidateQueries({ queryKey: settingsKeys.workspaces });
    setSelectedId(ws.id);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: workspace list */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Workspaces</h2>
          <button onClick={handleCreate} className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setSelectedId(ws.id)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors border",
                selectedId === ws.id ? "bg-muted border-border" : "border-transparent hover:bg-muted/60",
              )}
            >
              {ws.name}
            </button>
          ))}
          {workspaces.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No workspaces yet</p>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedId
          ? <WorkspaceDetail id={selectedId} />
          : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a workspace</div>
        }
      </div>
    </div>
  );
}

function WorkspaceDetail({ id }: { id: string }) {
  const { data } = useSettingsWorkspaceDetail(id);
  const update = useUpdateWorkspace();
  const upload = useUploadWorkspaceFile();
  const { data: allAgents = [] } = useChatAgents();
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const instrSave = useAutoSave(data?.instructions ?? "", (instructions) =>
    update.mutateAsync({ id, instructions })
  );

  const nameSave = useAutoSave(data?.name ?? "", (name) =>
    update.mutateAsync({ id, name })
  );

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  function toggleDefaultAgent(agentName: string) {
    const current = data!.defaultAgents ?? [];
    const next = current.includes(agentName)
      ? current.filter((a) => a !== agentName)
      : [...current, agentName];
    update.mutate({ id, defaultAgents: next });
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</label>
        <input
          defaultValue={data.name}
          onChange={(e) => nameSave.trigger(e.target.value)}
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instructions</label>
          {instrSave.status === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
          {instrSave.status === "saved" && <span className="text-xs text-primary">Saved</span>}
        </div>
        <p className="text-xs text-muted-foreground">Injected into every session in this workspace.</p>
        <textarea
          defaultValue={data.instructions}
          onChange={(e) => instrSave.trigger(e.target.value)}
          rows={6}
          className="resize-y rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</label>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-primary hover:underline"
          >
            + Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ workspaceId: id, file: f }); e.target.value = ""; }}
          />
        </div>
        <div className="flex flex-col gap-1">
          {(data.files ?? []).map((f) => (
            <div key={f} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>@{f}</span>
              <button
                onClick={() => {
                  chatClient.delete(`/workspaces/${id}/files/${f}`).then(() =>
                    qc.invalidateQueries({ queryKey: settingsKeys.workspaceDetail(id) })
                  );
                }}
                className="text-xs text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {(data.files ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No files. Upload files to use @filename in chat.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default Agents</label>
        <p className="text-xs text-muted-foreground">Auto-added to new sessions in this workspace.</p>
        <div className="flex flex-wrap gap-2">
          {allAgents.map((a) => {
            const active = (data.defaultAgents ?? []).includes(a.name);
            return (
              <button
                key={a.name}
                onClick={() => toggleDefaultAgent(a.name)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm transition-all",
                  active ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-border/80",
                )}
                style={active ? { backgroundColor: a.color, borderColor: a.color } : {}}
              >
                {a.emoji} {a.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/settings/tabs/WorkspacesTab.tsx
git commit -m "feat(settings): WorkspacesTab with instructions, files, default agents"
```

---

## Task 7: MarketplaceTab (browse-only) + SoulTab + AboutTab

**Files:**
- Rewrite: `ui/src/settings/tabs/MarketplaceTab.tsx`
- Rewrite: `ui/src/settings/tabs/SoulTab.tsx`
- Rewrite: `ui/src/settings/tabs/AboutTab.tsx`

- [ ] **Step 1: Implement MarketplaceTab.tsx (browse-only)**

```tsx
// ui/src/settings/tabs/MarketplaceTab.tsx
import { useState } from "react";
import { useMarketplace } from "../hooks/useSettingsApi";
import { cn } from "@/lib/utils";
import type { MarketplaceTemplate } from "../types";

export function MarketplaceTab() {
  const { data, isLoading } = useMarketplace();
  const [type, setType] = useState<"agent" | "skill">("agent");
  const [selected, setSelected] = useState<MarketplaceTemplate | null>(null);

  const items = type === "agent" ? (data?.agents ?? []) : (data?.skills ?? []);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Marketplace</h2>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {(["agent", "skill"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors capitalize",
                  type === t ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && <p className="text-sm text-muted-foreground">Loading templates…</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors hover:bg-muted/40",
                  selected?.id === t.id ? "border-ring bg-muted/40" : "border-border",
                )}
              >
                {t.icon && <span className="text-xl">{t.icon}</span>}
                <p className="mt-1 font-medium text-sm">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                {t.tags && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
            {items.length === 0 && !isLoading && (
              <p className="col-span-full text-sm text-muted-foreground">
                No {type} templates found. Run <code className="font-mono">git pull</code> in <code className="font-mono">marketplace/</code> to sync.
              </p>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div className="flex w-[320px] shrink-0 flex-col border-l border-border overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">{selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {selected.icon && <span className="text-4xl">{selected.icon}</span>}
            <p className="mt-3 text-sm">{selected.description}</p>
            {selected.version && <p className="mt-2 text-xs text-muted-foreground">v{selected.version}</p>}
            {selected.tags && (
              <div className="mt-3 flex flex-wrap gap-1">
                {selected.tags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>
                ))}
              </div>
            )}
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Fork is available in Phase 2.</p>
              <button
                disabled
                className="mt-2 w-full rounded-lg border border-border py-2 text-sm text-muted-foreground cursor-not-allowed opacity-50"
                title="Fork available in Phase 2"
              >
                Fork →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement SoulTab.tsx**

```tsx
// ui/src/settings/tabs/SoulTab.tsx
import { useSoulFiles, useUpdateAgentFile } from "../hooks/useSettingsApi";
import { useAutoSave } from "../hooks/useAutoSave";

const SOUL_AGENT = "_default";

export function SoulTab() {
  const { agentMd, soul, identity } = useSoulFiles();
  const update = useUpdateAgentFile();

  const sections = [
    { label: "AGENT.md", file: "agent-md" as const, query: agentMd, description: "Default personality and behavior prompt" },
    { label: "SOUL.md", file: "soul" as const, query: soul, description: "Values, motivations, and core character" },
    { label: "IDENTITY.md", file: "identity" as const, query: identity, description: "Role and identity definition" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold">靈魂 (Soul)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Default agent template. These files define the baseline personality for new agents created without a specific template.
        </p>

        <div className="mt-6 flex flex-col gap-8">
          {sections.map(({ label, file, query, description }) => (
            <SoulEditor
              key={file}
              label={label}
              description={description}
              defaultValue={query.data?.content ?? ""}
              onSave={(content) => update.mutateAsync({ name: SOUL_AGENT, file, content })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SoulEditor({
  label, description, defaultValue, onSave,
}: {
  label: string;
  description: string;
  defaultValue: string;
  onSave: (content: string) => Promise<unknown>;
}) {
  const save = useAutoSave(defaultValue, onSave);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-semibold">{label}</label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {save.status === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
        {save.status === "saved" && <span className="text-xs text-primary">Saved</span>}
        {save.status === "error" && <span className="text-xs text-destructive">Save failed</span>}
      </div>
      <textarea
        defaultValue={defaultValue}
        onChange={(e) => save.trigger(e.target.value)}
        rows={8}
        className="resize-y rounded-lg border border-border bg-muted p-3 font-mono text-xs outline-none focus:border-ring"
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement AboutTab.tsx**

```tsx
// ui/src/settings/tabs/AboutTab.tsx
import { useSettingsHealth } from "../hooks/useSettingsApi";
import { coworkClient } from "../coworkClient";
import { useQuery } from "@tanstack/react-query";

export function AboutTab() {
  const { data: chatHealth } = useSettingsHealth();
  const { data: coworkHealth } = useQuery({
    queryKey: ["settings", "cowork-health"],
    queryFn: () => coworkClient.get<{ status?: string }>("/api/health"),
    retry: false,
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold">About</h2>
          <p className="mt-1 text-sm text-muted-foreground">Unified Chat + Cowork platform</p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</h3>
          <ServiceRow
            label="Chat Server (:8000)"
            status={chatHealth ? "online" : "offline"}
            detail={chatHealth?.version ? `v${chatHealth.version}` : undefined}
          />
          <ServiceRow
            label="Cowork Server (:3100)"
            status={coworkHealth ? "online" : "offline"}
          />
        </div>
      </div>
    </div>
  );
}

function ServiceRow({ label, status, detail }: { label: string; status: "online" | "offline"; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        <span className={`flex items-center gap-1.5 text-xs font-medium ${status === "online" ? "text-primary" : "text-destructive"}`}>
          <span className={`h-2 w-2 rounded-full ${status === "online" ? "bg-primary" : "bg-destructive"}`} />
          {status}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/settings/tabs/
git commit -m "feat(settings): MarketplaceTab (browse-only) + SoulTab + AboutTab"
```

---

## Task 8: Final wiring + tests

- [ ] **Step 1: Run all tests**

```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test --run
```
Expected: All tests PASS

- [ ] **Step 2: TypeScript build check**

```bash
pnpm build
```
Expected: No errors, build succeeds

- [ ] **Step 3: Smoke test manually**

Start servers:
```bash
# Terminal 1
cd chat && uv run uvicorn app:app --host 0.0.0.0 --port 8000

# Terminal 2
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm dev
```

Verify:
- [ ] `⌘3` opens Settings mode
- [ ] Sidebar gear icon in Chat → switches to Settings
- [ ] Settings/Agents lists Chat agents with `[Chat]` badge
- [ ] Settings/Agents lists Cowork agents (or empty if :3100 not running)
- [ ] Settings/Skills shows installed skills
- [ ] Settings/Workspaces shows workspaces list
- [ ] Settings/Soul opens with editors
- [ ] Settings/About shows server health

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(settings): complete Settings mode — all 7 tabs functional"
```

---

## Completion Checklist

- [ ] `SettingsPage` renders with 7-tab left nav
- [ ] LLMTab: two-panel agent list + model config editor
- [ ] AgentsTab: unified Chat + Cowork list, Chat agents editable, Cowork read-only
- [ ] SkillsTab: grid + edit slide-in + add panel + zip upload + delete confirmation
- [ ] WorkspacesTab: list + instructions editor + file upload + default agents picker
- [ ] MarketplaceTab: browse-only, fork button disabled with tooltip
- [ ] SoulTab: 3 markdown editors with auto-save
- [ ] AboutTab: Chat + Cowork server status
- [ ] All unit tests pass
- [ ] `pnpm build` succeeds
