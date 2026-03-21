# Chat Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the full Settings overlay from Vanilla JS to React — all 7 tabs (模型/代理人/市場/技能/工作區/靈魂/關於) with real API connections to Python :8000, designed to be shared between Chat and Cowork modes later.

**Architecture:** Full-screen fixed overlay triggered by settings button in ChatPage header. Left nav switches tabs. Each tab is an isolated component managing its own slide-in sub-panels. API calls use a `chatClient` (direct to `VITE_CHAT_URL`, not Paperclip's `/api`) wrapped in React Query hooks. Modals use the existing shadcn Dialog. All design tokens come from Paperclip's Tailwind config.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS (Paperclip design tokens), @tanstack/react-query, shadcn/ui (Dialog, Button, Input, Textarea, Switch, Select)

**Worktree:** `.worktrees/feat-chat-cowork-phase1` on branch `feat/chat-cowork-phase1`

**Source of truth:** `static/index.html` (original Vanilla JS) — all UI logic, API endpoints, and data shapes are documented there.

**Pre-existing test failures (ignore):** `TestSessionFolders::test_list_sessions_finds_folder_sessions`, `TestWorkspaces::test_sessions_list_includes_workspace_id`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `ui/src/chat/settings/chatClient.ts` | Create | fetch wrapper targeting `VITE_CHAT_URL` (no `/api` prefix) |
| `ui/src/chat/settings/types.ts` | Create | TypeScript types: Agent, Model, Skill, Workspace, Scenario, etc. |
| `ui/src/chat/settings/api.ts` | Create | All React Query hooks for settings data (agents, models, skills, workspaces, marketplace, defaults) |
| `ui/src/chat/settings/SettingsOverlay.tsx` | Create | Full-screen overlay + left nav + tab router |
| `ui/src/chat/settings/tabs/ModelsTab.tsx` | Create | 模型: two-panel (list + config form) |
| `ui/src/chat/settings/tabs/AgentsTab.tsx` | Create | 代理人: two-panel (list + config form with AGENT.md/IDENTITY.md/SOUL.md) |
| `ui/src/chat/settings/tabs/MarketTab.tsx` | Create | 市場: grid of marketplace agents + preview slide-in |
| `ui/src/chat/settings/tabs/SkillsTab.tsx` | Create | 技能: grid + add panel + edit panel |
| `ui/src/chat/settings/tabs/WorkspacesTab.tsx` | Create | 工作區: list + detail panel (instructions, files, agents) |
| `ui/src/chat/settings/tabs/SoulTab.tsx` | Create | 靈魂: four template cards + edit panel |
| `ui/src/chat/settings/tabs/AboutTab.tsx` | Create | 關於: static content |
| `ui/src/chat/settings/index.ts` | Create | Barrel export |
| `ui/src/chat/__tests__/SettingsOverlay.test.tsx` | Create | Opens/closes, tab switching, keyboard Escape |
| `ui/src/chat/ChatPage.tsx` | Modify | Add settings button + `<SettingsOverlay>` |

---

## Chunk 1: Foundation

### Task 1: chatClient + types + API hooks

**Files:**
- Create: `ui/src/chat/settings/chatClient.ts`
- Create: `ui/src/chat/settings/types.ts`
- Create: `ui/src/chat/settings/api.ts`

- [ ] **Step 1: Create chatClient**

Create `ui/src/chat/settings/chatClient.ts`:
```typescript
const BASE = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";

export class ChatApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { headers, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new ChatApiError(res.status, err, (err as { detail?: string } | null)?.detail ?? `${res.status}`);
  }
  return res.json();
}

export const chatClient = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body: unknown) => req<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) => req<T>(path, { method: "POST", body }),
  put: <T>(path: string, body: unknown) => req<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};
```

- [ ] **Step 2: Create types**

Create `ui/src/chat/settings/types.ts`:
```typescript
export interface AgentConfig {
  name: string;
  emoji: string;
  color: string;
  model: string;
  description?: string;
  enabled: boolean;
  skills?: string[];
}

export interface ModelConfig {
  id: string;
  label: string;
  emoji: string;
  color: string;
  type: "cli" | "ollama";
  // CLI fields
  cmd?: string;
  model_variant?: string;
  supports_image?: boolean;
  supports_thinking?: boolean;
  // Ollama fields
  base_url?: string;
  model?: string;
}

export interface Skill {
  slug: string;
  name: string;
  description: string;
  body?: string;
  source?: string;
  display_name?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  default_agents?: string[];
  files?: WorkspaceFile[];
}

export interface WorkspaceFile {
  filename: string;
  size: number;
}

export interface MarketAgent {
  id: string;
  name?: string;
  description?: string;
  agent_md?: string;
  identity_md?: string;
  soul_md?: string;
  installed?: boolean;
}

export interface DefaultTemplate {
  key: "agent_md" | "identity_md" | "soul_md" | "user_md";
  title: string;
  subtitle: string;
  description: string;
  icon: string;
}

export type SettingsTab = "models" | "agents" | "market" | "skills" | "workspaces" | "default" | "about";
```

- [ ] **Step 3: Create API hooks**

Create `ui/src/chat/settings/api.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatClient } from "./chatClient";
import type { AgentConfig, ModelConfig, Skill, Workspace, MarketAgent } from "./types";

// ── Query keys ──
export const chatQueryKeys = {
  agents: ["chat", "agents"] as const,
  agent: (name: string) => ["chat", "agents", name] as const,
  agentMd: (name: string) => ["chat", "agents", name, "agent-md"] as const,
  agentIdentity: (name: string) => ["chat", "agents", name, "identity"] as const,
  agentSoul: (name: string) => ["chat", "agents", name, "soul"] as const,
  models: ["chat", "models"] as const,
  skills: ["chat", "skills"] as const,
  skill: (slug: string) => ["chat", "skills", slug] as const,
  workspaces: ["chat", "workspaces"] as const,
  workspace: (id: string) => ["chat", "workspaces", id] as const,
  market: ["chat", "market"] as const,
  marketAgent: (id: string) => ["chat", "market", id] as const,
  defaultMd: (key: string) => ["chat", "defaults", key] as const,
};

// ── Agents ──
export function useAgents() {
  return useQuery({ queryKey: chatQueryKeys.agents, queryFn: () => chatClient.get<AgentConfig[]>("/agents") });
}
export function useAgentMd(name: string) {
  return useQuery({ queryKey: chatQueryKeys.agentMd(name), queryFn: () => chatClient.get<{ content: string }>(`/agents/${name}/agent-md`) });
}
export function useAgentIdentity(name: string) {
  return useQuery({ queryKey: chatQueryKeys.agentIdentity(name), queryFn: () => chatClient.get<{ content: string }>(`/agents/${name}/identity`) });
}
export function useAgentSoul(name: string) {
  return useQuery({ queryKey: chatQueryKeys.agentSoul(name), queryFn: () => chatClient.get<{ content: string }>(`/agents/${name}/soul`) });
}
export function useUpdateAgent(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AgentConfig>) => chatClient.put(`/agents/${name}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.agents }),
  });
}
export function useUpdateAgentMd(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatClient.put(`/agents/${name}/agent-md`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.agentMd(name) }),
  });
}
export function useUpdateAgentIdentity(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatClient.put(`/agents/${name}/identity`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.agentIdentity(name) }),
  });
}
export function useUpdateAgentSoul(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatClient.put(`/agents/${name}/soul`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.agentSoul(name) }),
  });
}
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AgentConfig>) => chatClient.post("/agents", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.agents }),
  });
}

// ── Models ──
export function useModels() {
  return useQuery({ queryKey: chatQueryKeys.models, queryFn: () => chatClient.get<ModelConfig[]>("/models") });
}
export function useUpdateModel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ModelConfig>) => chatClient.put(`/models/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.models }),
  });
}
export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ModelConfig>) => chatClient.post("/models", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.models }),
  });
}
export function useDeleteModel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chatClient.delete(`/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.models }),
  });
}

// ── Skills ──
export function useSkills() {
  return useQuery({ queryKey: chatQueryKeys.skills, queryFn: () => chatClient.get<Skill[]>("/skills") });
}
export function useSkill(slug: string) {
  return useQuery({ queryKey: chatQueryKeys.skill(slug), queryFn: () => chatClient.get<Skill>(`/skills/${slug}`) });
}
export function useUpdateSkill(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Skill>) => chatClient.put(`/skills/${slug}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chatQueryKeys.skills }); qc.invalidateQueries({ queryKey: chatQueryKeys.skill(slug) }); },
  });
}
export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Pick<Skill, "slug" | "name" | "description" | "body">) => chatClient.post("/skills", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.skills }),
  });
}
export function useUploadSkillZip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return chatClient.postForm<{ ok: boolean; created: string[] }>("/skills/upload", fd); },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.skills }),
  });
}

// ── Workspaces ──
export function useWorkspaces() {
  return useQuery({ queryKey: chatQueryKeys.workspaces, queryFn: () => chatClient.get<Workspace[]>("/workspaces") });
}
export function useWorkspace(id: string) {
  return useQuery({ queryKey: chatQueryKeys.workspace(id), queryFn: () => chatClient.get<Workspace>(`/workspaces/${id}`), enabled: !!id });
}
export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Pick<Workspace, "name" | "description">) => chatClient.post("/workspaces", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.workspaces }),
  });
}
export function useUpdateWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Workspace>) => chatClient.put(`/workspaces/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chatQueryKeys.workspaces }); qc.invalidateQueries({ queryKey: chatQueryKeys.workspace(id) }); },
  });
}
export function useDeleteWorkspace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => chatClient.delete(`/workspaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.workspaces }),
  });
}
export function useUploadWorkspaceFile(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return chatClient.postForm(`/workspaces/${wsId}/files`, fd); },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.workspace(wsId) }),
  });
}
export function useDeleteWorkspaceFile(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => chatClient.delete(`/workspaces/${wsId}/files/${filename}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.workspace(wsId) }),
  });
}

// ── Marketplace ──
export function useMarketAgents() {
  return useQuery({ queryKey: chatQueryKeys.market, queryFn: () => chatClient.get<MarketAgent[]>("/marketplace/agents") });
}
export function useMarketAgent(id: string) {
  return useQuery({ queryKey: chatQueryKeys.marketAgent(id), queryFn: () => chatClient.get<MarketAgent>(`/marketplace/agents/${id}`), enabled: !!id });
}
export function useInstallMarketAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, model }: { id: string; name?: string; model?: string }) =>
      chatClient.post(`/marketplace/agents/${id}/install`, { name, model }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: chatQueryKeys.agents }); qc.invalidateQueries({ queryKey: chatQueryKeys.market }); },
  });
}

// ── Default templates ──
export function useDefaultMd(key: string) {
  return useQuery({ queryKey: chatQueryKeys.defaultMd(key), queryFn: () => chatClient.get<{ content: string }>(`/agents/_default/${key}`) });
}
export function useUpdateDefaultMd(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => chatClient.put(`/agents/_default/${key}`, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatQueryKeys.defaultMd(key) }),
  });
}
```

- [ ] **Step 4: No test (API hooks are thin wrappers — tested by tab integration tests)**

- [ ] **Step 5: Commit**
```bash
cd .worktrees/feat-chat-cowork-phase1
git add ui/src/chat/settings/chatClient.ts ui/src/chat/settings/types.ts ui/src/chat/settings/api.ts
git commit -m "feat(settings): add chatClient, types, and React Query hooks for settings API"
```

---

## Chunk 2: Settings Overlay Shell

### Task 2: SettingsOverlay + nav + Escape handling

**Files:**
- Create: `ui/src/chat/settings/SettingsOverlay.tsx`
- Create: `ui/src/chat/__tests__/SettingsOverlay.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `ui/src/chat/__tests__/SettingsOverlay.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsOverlay } from "../../chat/settings/SettingsOverlay";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SettingsOverlay", () => {
  it("does not render when open=false", () => {
    wrap(<SettingsOverlay open={false} onClose={vi.fn()} />);
    expect(screen.queryByText("模型")).not.toBeInTheDocument();
  });

  it("renders nav tabs when open=true", () => {
    wrap(<SettingsOverlay open={true} onClose={vi.fn()} />);
    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("代理人")).toBeInTheDocument();
    expect(screen.getByText("市場")).toBeInTheDocument();
    expect(screen.getByText("技能")).toBeInTheDocument();
    expect(screen.getByText("工作區")).toBeInTheDocument();
    expect(screen.getByText("靈魂")).toBeInTheDocument();
    expect(screen.getByText("關於")).toBeInTheDocument();
  });

  it("calls onClose when ← 返回 is clicked", () => {
    const onClose = vi.fn();
    wrap(<SettingsOverlay open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("← 返回"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn();
    wrap(<SettingsOverlay open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to Agents tab when clicked", () => {
    wrap(<SettingsOverlay open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("代理人"));
    const btn = screen.getByText("代理人").closest("button");
    expect(btn).toHaveClass("text-foreground");
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test run src/chat/__tests__/SettingsOverlay.test.tsx
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement SettingsOverlay**

Create `ui/src/chat/settings/SettingsOverlay.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { SettingsTab } from "./types";
import { ModelsTab } from "./tabs/ModelsTab";
import { AgentsTab } from "./tabs/AgentsTab";
import { MarketTab } from "./tabs/MarketTab";
import { SkillsTab } from "./tabs/SkillsTab";
import { WorkspacesTab } from "./tabs/WorkspacesTab";
import { SoulTab } from "./tabs/SoulTab";
import { AboutTab } from "./tabs/AboutTab";

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "models", label: "模型" },
  { id: "agents", label: "代理人" },
  { id: "market", label: "市場" },
  { id: "skills", label: "技能" },
  { id: "workspaces", label: "工作區" },
  { id: "default", label: "靈魂" },
  { id: "about", label: "關於" },
];

export function SettingsOverlay({ open, onClose, initialTab = "models" }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex bg-background">
      {/* Left nav */}
      <nav className="flex w-[220px] min-w-[220px] flex-col gap-0.5 border-r border-border bg-sidebar p-3">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              tab === id
                ? "bg-accent font-semibold text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          ← 返回
        </button>
      </nav>

      {/* Content */}
      <div className="relative flex flex-1 overflow-hidden">
        {tab === "models" && <ModelsTab />}
        {tab === "agents" && <AgentsTab />}
        {tab === "market" && <MarketTab />}
        {tab === "skills" && <SkillsTab />}
        {tab === "workspaces" && <WorkspacesTab />}
        {tab === "default" && <SoulTab />}
        {tab === "about" && <AboutTab />}
      </div>
    </div>
  );
}
```

Also create stub files for each tab so the overlay compiles:

`ui/src/chat/settings/tabs/ModelsTab.tsx` (stub — replaced in Task 3):
```tsx
export function ModelsTab() { return <div className="flex flex-1 items-center justify-center text-muted-foreground">模型</div>; }
```

Do the same for `AgentsTab`, `MarketTab`, `SkillsTab`, `WorkspacesTab`, `SoulTab`, `AboutTab` — each just renders its name as a placeholder.

- [ ] **Step 4: Run to confirm PASS**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test run src/chat/__tests__/SettingsOverlay.test.tsx
```
Expected: 5 PASS

- [ ] **Step 5: Commit**
```bash
git add ui/src/chat/settings/ ui/src/chat/__tests__/SettingsOverlay.test.tsx
git commit -m "feat(settings): add SettingsOverlay shell with nav + tab routing + Escape handler"
```

---

## Chunk 3: Wire Settings into ChatPage

### Task 3: Add settings button + overlay to ChatPage

**Files:**
- Modify: `ui/src/chat/ChatPage.tsx`
- Create: `ui/src/chat/settings/index.ts`

- [ ] **Step 1: Create barrel export**

Create `ui/src/chat/settings/index.ts`:
```typescript
export { SettingsOverlay } from "./SettingsOverlay";
export type { SettingsTab } from "./types";
```

- [ ] **Step 2: Add settings button + overlay to ChatPage**

In `ui/src/chat/ChatPage.tsx`, add a gear icon button to the header area and mount `<SettingsOverlay>`.

Add imports:
```typescript
import { useState } from "react"; // already exists if useCallback imported
import { SettingsOverlay } from "./settings";
```

Add state:
```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
```

In the JSX, add a settings button in the top bar (alongside the send button area or in a header row), and mount the overlay:
```tsx
{/* in the layout, after the main content */}
<button
  onClick={() => setSettingsOpen(true)}
  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
  title="設定"
  aria-label="設定"
>
  ⚙
</button>

<SettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />
```

- [ ] **Step 3: Run full Vitest suite**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test run 2>&1 | tail -10
```
Expected: all existing 58 tests + 5 new settings tests = 63+ pass

- [ ] **Step 4: Commit**
```bash
git add ui/src/chat/ChatPage.tsx ui/src/chat/settings/index.ts
git commit -m "feat(chat): wire SettingsOverlay into ChatPage with gear button"
```

---

## Chunk 4: Models Tab (模型)

### Task 4: ModelsTab — two-panel (list + config form)

**Files:**
- Modify: `ui/src/chat/settings/tabs/ModelsTab.tsx`

The models tab is a two-panel layout:
- Left panel (200px): list of models, each showing emoji + label + type, plus "＋ 新增模型" at bottom
- Right panel: config form for selected model (CLI fields or Ollama fields based on `type`)

- [ ] **Step 1: Replace stub with full implementation**

Replace `ui/src/chat/settings/tabs/ModelsTab.tsx`:
```tsx
import { useState } from "react";
import { useModels, useUpdateModel, useCreateModel, useDeleteModel } from "../api";
import type { ModelConfig } from "../types";

const EMPTY_CLI: Partial<ModelConfig> = { type: "cli", emoji: "🤖", color: "#6366f1", label: "", cmd: "claude", model_variant: "" };

export function ModelsTab() {
  const { data: models = [], isLoading } = useModels();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<ModelConfig>>({});

  const selected = models.find((m) => m.id === selectedId);
  const updateModel = useUpdateModel(selectedId ?? "");
  const createModel = useCreateModel();
  const deleteModel = useDeleteModel(selectedId ?? "");

  function selectModel(id: string) {
    const m = models.find((x) => x.id === id);
    if (m) { setSelectedId(id); setDraft(m); setIsCreating(false); }
  }

  function startCreate() {
    setSelectedId(null);
    setIsCreating(true);
    setDraft(EMPTY_CLI);
  }

  async function save() {
    if (isCreating) {
      await createModel.mutateAsync(draft as ModelConfig);
      setIsCreating(false);
    } else if (selectedId) {
      await updateModel.mutateAsync(draft);
    }
  }

  async function del() {
    if (!selectedId || !confirm(`刪除 ${selected?.label}？`)) return;
    await deleteModel.mutateAsync();
    setSelectedId(null);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: model list */}
      <div className="flex h-full w-[200px] min-w-[200px] flex-col border-r border-border overflow-y-auto">
        {isLoading && <div className="p-4 text-sm text-muted-foreground">載入中…</div>}
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => selectModel(m.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
              selectedId === m.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="text-lg leading-none">{m.emoji}</span>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate font-medium">{m.label}</div>
              <div className="truncate text-xs opacity-60">{m.type}</div>
            </div>
          </button>
        ))}
        <button
          onClick={startCreate}
          className={`flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground ${isCreating ? "bg-accent text-foreground" : ""}`}
        >
          <span className="text-base">＋</span> 新增模型
        </button>
      </div>

      {/* Right: config form */}
      <div className="flex flex-1 flex-col overflow-y-auto p-6 gap-4 max-w-2xl">
        {!selected && !isCreating && (
          <p className="text-sm text-muted-foreground">← 從左側選擇模型</p>
        )}
        {(selected || isCreating) && (
          <>
            <div className="flex items-center gap-3">
              <input
                className="w-12 rounded-lg border border-border bg-muted px-2 py-1 text-center text-2xl focus:outline-none focus:ring-2 focus:ring-ring"
                value={draft.emoji ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                maxLength={2}
              />
              <div className="flex flex-col gap-1 flex-1">
                <input
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="顯示名稱"
                  value={draft.label ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                />
              </div>
              <input
                type="color"
                value={draft.color ?? "#6366f1"}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                className="h-8 w-10 cursor-pointer rounded border border-border"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">類型</label>
              <select
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none"
                value={draft.type ?? "cli"}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as "cli" | "ollama" }))}
              >
                <option value="cli">CLI (claude / gemini / codex)</option>
                <option value="ollama">Ollama API</option>
              </select>
            </div>

            {draft.type !== "ollama" && (
              <>
                <Field label="指令 (cmd)" value={draft.cmd ?? ""} onChange={(v) => setDraft((d) => ({ ...d, cmd: v }))} placeholder="claude" />
                <Field label="模型旗標" value={draft.model_variant ?? ""} onChange={(v) => setDraft((d) => ({ ...d, model_variant: v }))} placeholder="--model claude-opus-4-6" />
              </>
            )}
            {draft.type === "ollama" && (
              <>
                <Field label="Base URL" value={draft.base_url ?? ""} onChange={(v) => setDraft((d) => ({ ...d, base_url: v }))} placeholder="http://localhost:11434" />
                <Field label="模型名稱" value={draft.model ?? ""} onChange={(v) => setDraft((d) => ({ ...d, model: v }))} placeholder="llama3" />
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {isCreating ? "建立" : "儲存"}
              </button>
              {!isCreating && (
                <button
                  onClick={del}
                  className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  刪除
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm build 2>&1 | grep -E "error|Error" | head -10
```
Expected: no errors (or only pre-existing Paperclip errors)

- [ ] **Step 3: Commit**
```bash
git add ui/src/chat/settings/tabs/ModelsTab.tsx
git commit -m "feat(settings): implement Models tab (list + CLI/Ollama config form)"
```

---

## Chunk 5: Agents Tab (代理人)

### Task 5: AgentsTab — two-panel + AGENT.md / IDENTITY.md / SOUL.md editors

**Files:**
- Modify: `ui/src/chat/settings/tabs/AgentsTab.tsx`

The agents tab is two-panel:
- Left (200px): agent list (emoji + name + enabled dot) + "＋ 新增代理人"
- Right: full agent config — emoji, color, model selector, description, enabled toggle, skills checklist, three textarea editors (AGENT.md, IDENTITY.md, SOUL.md)

- [ ] **Step 1: Replace stub with full implementation**

Replace `ui/src/chat/settings/tabs/AgentsTab.tsx`:
```tsx
import { useState, useEffect } from "react";
import { useAgents, useModels, useSkills, useAgentMd, useAgentIdentity, useAgentSoul, useUpdateAgent, useUpdateAgentMd, useUpdateAgentIdentity, useUpdateAgentSoul, useCreateAgent } from "../api";
import type { AgentConfig } from "../types";

export function AgentsTab() {
  const { data: agents = [] } = useAgents();
  const { data: models = [] } = useModels();
  const { data: skills = [] } = useSkills();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<AgentConfig>>({});

  // Load markdown content when agent selected
  const { data: agentMdData } = useAgentMd(selectedName ?? "");
  const { data: identityData } = useAgentIdentity(selectedName ?? "");
  const { data: soulData } = useAgentSoul(selectedName ?? "");

  const [agentMd, setAgentMd] = useState("");
  const [identityMd, setIdentityMd] = useState("");
  const [soulMd, setSoulMd] = useState("");

  const updateAgent = useUpdateAgent(selectedName ?? "");
  const updateAgentMd = useUpdateAgentMd(selectedName ?? "");
  const updateIdentity = useUpdateAgentIdentity(selectedName ?? "");
  const updateSoul = useUpdateAgentSoul(selectedName ?? "");
  const createAgent = useCreateAgent();

  useEffect(() => { if (agentMdData) setAgentMd(agentMdData.content); }, [agentMdData]);
  useEffect(() => { if (identityData) setIdentityMd(identityData.content); }, [identityData]);
  useEffect(() => { if (soulData) setSoulMd(soulData.content); }, [soulData]);

  function selectAgent(name: string) {
    const a = agents.find((x) => x.name === name);
    if (a) { setSelectedName(name); setDraft(a); setIsCreating(false); }
  }

  function startCreate() {
    setSelectedName(null);
    setIsCreating(true);
    setDraft({ emoji: "🤖", color: "#6366f1", enabled: true, skills: [] });
    setAgentMd(""); setIdentityMd(""); setSoulMd("");
  }

  async function save() {
    if (isCreating) {
      await createAgent.mutateAsync(draft as AgentConfig);
      setIsCreating(false);
    } else if (selectedName) {
      await Promise.all([
        updateAgent.mutateAsync(draft),
        updateAgentMd.mutateAsync(agentMd),
        updateIdentity.mutateAsync(identityMd),
        updateSoul.mutateAsync(soulMd),
      ]);
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: agent list */}
      <div className="flex h-full w-[200px] min-w-[200px] flex-col border-r border-border overflow-y-auto">
        {agents.map((a) => (
          <button
            key={a.name}
            onClick={() => selectAgent(a.name)}
            className={`flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
              selectedName === a.name ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="text-lg leading-none">{a.emoji}</span>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate font-medium">{a.name}</div>
            </div>
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${a.enabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
          </button>
        ))}
        <button
          onClick={startCreate}
          className={`flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground ${isCreating ? "bg-accent text-foreground" : ""}`}
        >
          <span className="text-base">＋</span> 新增代理人
        </button>
      </div>

      {/* Right: config */}
      <div className="flex flex-1 flex-col overflow-y-auto p-6 gap-4 max-w-2xl">
        {!selectedName && !isCreating && <p className="text-sm text-muted-foreground">← 從左側選擇代理人</p>}
        {(selectedName || isCreating) && (
          <>
            {/* Header row */}
            <div className="flex items-center gap-3">
              <input
                className="w-12 rounded-lg border border-border bg-muted px-2 py-1 text-center text-2xl focus:outline-none"
                value={draft.emoji ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
                maxLength={2}
              />
              <input
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="代理人名稱"
                value={draft.name ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                readOnly={!isCreating}
              />
              <input type="color" value={draft.color ?? "#6366f1"} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-border" />
              {!isCreating && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={draft.enabled ?? true} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
                  啟用
                </label>
              )}
            </div>

            {/* Model selector */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">模型</label>
              <select
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none"
                value={draft.model ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              >
                <option value="">選擇模型…</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.label}</option>)}
              </select>
            </div>

            {/* Skills checklist */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">技能</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, skills: skills.map((s) => s.slug) }))}>全選</button>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, skills: [] }))}>清空</button>
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                {skills.map((s) => (
                  <label key={s.slug} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.skills?.includes(s.slug) ?? false}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        skills: e.target.checked
                          ? [...(d.skills ?? []), s.slug]
                          : (d.skills ?? []).filter((x) => x !== s.slug),
                      }))}
                    />
                    {s.display_name ?? s.slug}
                  </label>
                ))}
              </div>
            </div>

            {/* AGENT.md */}
            <TextareaField label="AGENT.md" value={agentMd} onChange={setAgentMd} rows={8} />
            {/* IDENTITY.md */}
            <TextareaField label="IDENTITY.md" value={identityMd} onChange={setIdentityMd} rows={6} />
            {/* SOUL.md */}
            <TextareaField label="SOUL.md" value={soulMd} onChange={setSoulMd} rows={6} />

            <div className="flex gap-2 pt-2">
              <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                {isCreating ? "建立" : "儲存"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TextareaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <textarea
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add ui/src/chat/settings/tabs/AgentsTab.tsx
git commit -m "feat(settings): implement Agents tab (list + full config with AGENT.md/IDENTITY.md/SOUL.md)"
```

---

## Chunk 6: Skills Tab (技能)

### Task 6: SkillsTab — grid + add panel + edit panel

**Files:**
- Modify: `ui/src/chat/settings/tabs/SkillsTab.tsx`

Skills tab:
- Header: "已安裝的技能" + "＋ 新增" button + "📦 上傳" file upload
- Grid of skill cards (slug, name, description, edit button)
- Slide-in add panel (form: slug, name, description, body textarea)
- Slide-in edit panel (form: name, description, body textarea)

- [ ] **Step 1: Replace stub**

Replace `ui/src/chat/settings/tabs/SkillsTab.tsx`:
```tsx
import { useState, useRef } from "react";
import { useSkills, useSkill, useCreateSkill, useUpdateSkill, useUploadSkillZip } from "../api";
import type { Skill } from "../types";

type Panel = "none" | "add" | "edit";

export function SkillsTab() {
  const { data: skills = [] } = useSkills();
  const [panel, setPanel] = useState<Panel>("none");
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState({ slug: "", name: "", description: "", body: "" });
  const uploadRef = useRef<HTMLInputElement>(null);
  const createSkill = useCreateSkill();
  const uploadZip = useUploadSkillZip();

  function openEdit(slug: string) { setEditSlug(slug); setPanel("edit"); }
  function openAdd() { setAddDraft({ slug: "", name: "", description: "", body: "" }); setPanel("add"); }
  function closePanel() { setPanel("none"); setEditSlug(null); }

  async function submitAdd() {
    await createSkill.mutateAsync(addDraft);
    closePanel();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadZip.mutateAsync(file);
    e.target.value = "";
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 flex-shrink-0">
        <span className="flex-1 text-sm text-muted-foreground">已安裝的技能</span>
        <button onClick={openAdd} className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors">＋ 新增</button>
        <label className="cursor-pointer rounded-md bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors" title="上傳 .zip 技能包">
          📦 上傳
          <input ref={uploadRef} type="file" accept=".zip" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {skills.map((s) => (
            <div key={s.slug} className="group relative rounded-xl border border-border bg-card p-4 hover:border-ring transition-colors">
              <div className="mb-1 text-xl">🔧</div>
              <div className="font-medium text-sm truncate">{s.display_name ?? s.name ?? s.slug}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">{s.description}</div>
              <button
                onClick={() => openEdit(s.slug)}
                className="absolute right-2 top-2 hidden rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex transition-colors"
              >
                ✏
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add panel */}
      <SlidePanel open={panel === "add"} title="新增技能" onBack={closePanel}>
        <FormField label="Slug（資料夾名稱）" value={addDraft.slug} onChange={(v) => setAddDraft((d) => ({ ...d, slug: v }))} placeholder="my-skill" />
        <FormField label="名稱" value={addDraft.name} onChange={(v) => setAddDraft((d) => ({ ...d, name: v }))} placeholder="My Skill" />
        <FormField label="描述" value={addDraft.description} onChange={(v) => setAddDraft((d) => ({ ...d, description: v }))} placeholder="一句話描述" />
        <div className="flex flex-1 min-h-0 flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">內容（Markdown）</label>
          <textarea
            className="flex-1 min-h-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            value={addDraft.body}
            onChange={(e) => setAddDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="# My Skill&#10;&#10;技能說明..."
          />
        </div>
        <div className="flex-shrink-0">
          <button onClick={submitAdd} className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">建立</button>
        </div>
      </SlidePanel>

      {/* Edit panel */}
      {editSlug && (
        <SkillEditPanel slug={editSlug} onBack={closePanel} />
      )}
    </div>
  );
}

function SkillEditPanel({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data: skill } = useSkill(slug);
  const updateSkill = useUpdateSkill(slug);
  const [draft, setDraft] = useState<Partial<Skill>>({});

  // Sync draft when skill loads
  useState(() => { if (skill) setDraft(skill); });

  if (!skill) return <SlidePanel open title={`編輯技能`} onBack={onBack}><div className="p-4 text-sm text-muted-foreground">載入中…</div></SlidePanel>;

  return (
    <SlidePanel open title={`編輯技能：/${slug}`} onBack={onBack}>
      <FormField label="名稱" value={draft.name ?? skill.name ?? ""} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
      <FormField label="描述" value={draft.description ?? skill.description ?? ""} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} />
      <div className="flex flex-1 min-h-0 flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">內容（Markdown）</label>
        <textarea
          className="flex-1 min-h-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          value={draft.body ?? skill.body ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        />
      </div>
      <div className="flex-shrink-0">
        <button
          onClick={async () => { await updateSkill.mutateAsync(draft); onBack(); }}
          className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          儲存
        </button>
      </div>
    </SlidePanel>
  );
}

function SlidePanel({ open, title, onBack, children }: { open: boolean; title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className={`absolute inset-y-0 right-0 flex w-[520px] flex-col border-l border-border bg-sidebar transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← 返回</button>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1 flex-shrink-0">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add ui/src/chat/settings/tabs/SkillsTab.tsx
git commit -m "feat(settings): implement Skills tab (grid + add/edit slide-in panels + zip upload)"
```

---

## Chunk 7: Market Tab (市場)

### Task 7: MarketTab — grid + preview + install

**Files:**
- Modify: `ui/src/chat/settings/tabs/MarketTab.tsx`

Market tab:
- Grid of agent cards from `/marketplace/agents`
- Click card → slide-in preview panel showing agent's three .md files + install button
- Install → POST to `/marketplace/agents/{id}/install`

- [ ] **Step 1: Replace stub**

Replace `ui/src/chat/settings/tabs/MarketTab.tsx`:
```tsx
import { useState } from "react";
import { useMarketAgents, useMarketAgent, useInstallMarketAgent, useAgents } from "../api";

export function MarketTab() {
  const { data: marketAgents = [] } = useMarketAgents();
  const { data: installedAgents = [] } = useAgents();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const installedNames = new Set(installedAgents.map((a) => a.name));

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {marketAgents.map((agent) => {
            const isInstalled = installedNames.has(agent.name ?? agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => setPreviewId(agent.id)}
                className="group rounded-xl border border-border bg-card p-4 text-left hover:border-ring transition-colors"
              >
                <div className="mb-2 text-2xl">🤖</div>
                <div className="font-medium text-sm">{agent.name ?? agent.id}</div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{agent.description ?? "—"}</div>
                <div className="mt-2 text-xs font-medium">
                  {isInstalled ? <span className="text-green-500">✓ 已安裝</span> : <span className="text-muted-foreground">點擊查看</span>}
                </div>
              </button>
            );
          })}
          {marketAgents.length === 0 && <p className="col-span-3 text-sm text-muted-foreground">市場暫無可用 Agent</p>}
        </div>
      </div>

      {/* Preview panel */}
      {previewId && (
        <MarketPreviewPanel id={previewId} onBack={() => setPreviewId(null)} installedNames={installedNames} />
      )}
    </div>
  );
}

function MarketPreviewPanel({ id, onBack, installedNames }: { id: string; onBack: () => void; installedNames: Set<string> }) {
  const { data: agent } = useMarketAgent(id);
  const install = useInstallMarketAgent();
  const isInstalled = agent ? installedNames.has(agent.name ?? agent.id) : false;

  async function handleInstall() {
    if (!agent) return;
    await install.mutateAsync({ id: agent.id });
    onBack();
  }

  return (
    <div className="absolute inset-y-0 right-0 flex w-[480px] flex-col border-l border-border bg-sidebar">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← 返回</button>
        <span className="font-medium text-sm flex-1 truncate">{agent?.name ?? id}</span>
        <button
          onClick={handleInstall}
          disabled={isInstalled || install.isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            isInstalled ? "bg-muted text-muted-foreground cursor-default" : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {isInstalled ? "已安裝" : install.isPending ? "安裝中…" : "安裝"}
        </button>
      </div>
      {!agent && <div className="p-4 text-sm text-muted-foreground">載入中…</div>}
      {agent && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {agent.agent_md && <MdSection title="Agent.md" content={agent.agent_md} />}
          {agent.identity_md && <MdSection title="Identity.md" content={agent.identity_md} />}
          {agent.soul_md && <MdSection title="Soul.md" content={agent.soul_md} />}
        </div>
      )}
    </div>
  );
}

function MdSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="rounded-lg bg-muted p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto">{content}</pre>
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add ui/src/chat/settings/tabs/MarketTab.tsx
git commit -m "feat(settings): implement Market tab (grid + install + preview panel)"
```

---

## Chunk 8: Workspaces Tab (工作區)

### Task 8: WorkspacesTab — list + detail (instructions, files, default agents)

**Files:**
- Modify: `ui/src/chat/settings/tabs/WorkspacesTab.tsx`

Workspaces tab is two-panel:
- Left (200px): workspace list + "＋ 新增工作區" button
- Right: workspace detail (name, description, instructions editor, files list + upload, default agents checklist, delete)

- [ ] **Step 1: Replace stub**

Replace `ui/src/chat/settings/tabs/WorkspacesTab.tsx`:
```tsx
import { useState, useRef } from "react";
import { useWorkspaces, useWorkspace, useCreateWorkspace, useUpdateWorkspace, useDeleteWorkspace, useUploadWorkspaceFile, useDeleteWorkspaceFile, useAgents } from "../api";

export function WorkspacesTab() {
  const { data: workspaces = [] } = useWorkspaces();
  const { data: agents = [] } = useAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ws } = useWorkspace(selectedId ?? "");
  const createWs = useCreateWorkspace();
  const updateWs = useUpdateWorkspace(selectedId ?? "");
  const deleteWs = useDeleteWorkspace(selectedId ?? "");
  const uploadFile = useUploadWorkspaceFile(selectedId ?? "");
  const deleteFile = useDeleteWorkspaceFile(selectedId ?? "");

  const [instructionsDraft, setInstructionsDraft] = useState("");

  // Sync instructions draft when workspace loads
  if (ws && instructionsDraft !== (ws.system_prompt ?? "") && selectedId) {
    setInstructionsDraft(ws.system_prompt ?? "");
  }

  async function submitCreate() {
    await createWs.mutateAsync({ name: createName, description: createDesc });
    setShowCreate(false); setCreateName(""); setCreateDesc("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    await uploadFile.mutateAsync(file);
    e.target.value = "";
  }

  async function toggleDefaultAgent(agentName: string, checked: boolean) {
    if (!ws || !selectedId) return;
    const current = ws.default_agents ?? [];
    const next = checked ? [...current, agentName] : current.filter((n) => n !== agentName);
    await updateWs.mutateAsync({ default_agents: next });
  }

  async function del() {
    if (!selectedId || !confirm(`刪除工作區 ${ws?.name}？`)) return;
    await deleteWs.mutateAsync();
    setSelectedId(null);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left: workspace list */}
      <div className="flex h-full w-[200px] min-w-[200px] flex-col border-r border-border">
        <div className="flex-1 overflow-y-auto">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelectedId(w.id)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                selectedId === w.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <span>📁</span>
              <span className="truncate">{w.name}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <span>＋</span> 新增工作區
          </button>
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex flex-1 flex-col overflow-y-auto p-6 gap-5 max-w-2xl">
        {!ws && !showCreate && <p className="text-sm text-muted-foreground">← 從左側選擇工作區</p>}

        {/* Create form */}
        {showCreate && (
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">建立工作區</h3>
            <Field label="名稱" value={createName} onChange={setCreateName} placeholder="My Workspace" />
            <Field label="描述（選填）" value={createDesc} onChange={setCreateDesc} placeholder="描述目標…" />
            <div className="flex gap-2">
              <button onClick={submitCreate} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">建立</button>
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">取消</button>
            </div>
          </div>
        )}

        {ws && (
          <>
            <div>
              <h3 className="font-semibold text-base">{ws.name}</h3>
              {ws.description && <p className="text-sm text-muted-foreground mt-0.5">{ws.description}</p>}
            </div>

            {/* Instructions */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">指示</span>
              </div>
              <textarea
                rows={6}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={instructionsDraft}
                onChange={(e) => setInstructionsDraft(e.target.value)}
                placeholder="這個工作區的 system prompt…"
              />
              <button
                onClick={() => updateWs.mutateAsync({ system_prompt: instructionsDraft })}
                className="self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                儲存指示
              </button>
            </div>

            {/* Files */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1">檔案</span>
                <button onClick={() => fileInputRef.current?.click()} className="text-xs text-muted-foreground hover:text-foreground">+ 上傳</button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
              </div>
              {(ws.files ?? []).length === 0 && <p className="text-xs text-muted-foreground">尚無檔案</p>}
              {(ws.files ?? []).map((f) => (
                <div key={f.filename} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{f.filename}</span>
                  <button onClick={() => deleteFile.mutateAsync(f.filename)} className="text-muted-foreground hover:text-destructive">✕</button>
                </div>
              ))}
            </div>

            {/* Default agents */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">預設代理人</span>
              <div className="grid grid-cols-2 gap-1">
                {agents.map((a) => (
                  <label key={a.name} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ws.default_agents?.includes(a.name) ?? false}
                      onChange={(e) => toggleDefaultAgent(a.name, e.target.checked)}
                    />
                    {a.emoji} {a.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div className="border-t border-border pt-4">
              <button onClick={del} className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                刪除工作區
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add ui/src/chat/settings/tabs/WorkspacesTab.tsx
git commit -m "feat(settings): implement Workspaces tab (list + detail + instructions + files + default agents)"
```

---

## Chunk 9: Soul Tab + About Tab

### Task 9: SoulTab + AboutTab

**Files:**
- Modify: `ui/src/chat/settings/tabs/SoulTab.tsx`
- Modify: `ui/src/chat/settings/tabs/AboutTab.tsx`

Soul tab (靈魂): four cards (Agent.md / Identity.md / Soul.md / User.md templates). Click card → slide-in editor.

About tab: static content mirroring index.html's `#tab-about-system`.

- [ ] **Step 1: Replace SoulTab stub**

Replace `ui/src/chat/settings/tabs/SoulTab.tsx`:
```tsx
import { useState } from "react";
import { useDefaultMd, useUpdateDefaultMd } from "../api";

const TEMPLATES = [
  { key: "agent-md", title: "Agent.md", subtitle: "行為與個性", icon: "🎭", description: "定義代理人預設的行為、說話風格與能力" },
  { key: "identity", title: "Identity.md", subtitle: "身份與背景", icon: "🪪", description: "代理人的身份故事、背景與角色設定" },
  { key: "soul", title: "Soul.md", subtitle: "核心信念", icon: "✨", description: "價值觀、動機與對世界的態度" },
] as const;

export function SoulTab() {
  const [editKey, setEditKey] = useState<string | null>(null);
  const editTemplate = TEMPLATES.find((t) => t.key === editKey);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-w-2xl">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setEditKey(t.key)}
              className="rounded-xl border border-border bg-card p-5 text-left hover:border-ring transition-colors"
            >
              <div className="text-2xl mb-2">{t.icon}</div>
              <div className="font-semibold text-sm">{t.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t.subtitle}</div>
              <div className="text-xs text-muted-foreground mt-2 leading-relaxed">{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Edit panel */}
      {editKey && editTemplate && (
        <DefaultEditPanel
          key={editKey}
          templateKey={editKey}
          title={`編輯 ${editTemplate.title}`}
          onBack={() => setEditKey(null)}
        />
      )}
    </div>
  );
}

function DefaultEditPanel({ templateKey, title, onBack }: { templateKey: string; title: string; onBack: () => void }) {
  const { data } = useDefaultMd(templateKey);
  const update = useUpdateDefaultMd(templateKey);
  const [content, setContent] = useState(data?.content ?? "");

  // Sync when data loads
  if (data && content === "" && data.content) setContent(data.content);

  return (
    <div className="absolute inset-y-0 right-0 flex w-[520px] flex-col border-l border-border bg-sidebar">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 flex-shrink-0">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">← 返回</button>
        <span className="font-medium text-sm">{title}</span>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 p-4">
        <textarea
          className="flex-1 min-h-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          onClick={async () => { await update.mutateAsync(content); onBack(); }}
          className="w-full flex-shrink-0 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          儲存
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace AboutTab stub**

Replace `ui/src/chat/settings/tabs/AboutTab.tsx`:
```tsx
export function AboutTab() {
  return (
    <div className="flex-1 overflow-y-auto p-8 md:p-10 flex flex-col gap-8 max-w-2xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
          MeowTiehEightgent
        </h1>
        <p className="text-sm text-muted-foreground">多 Agent 協作對話平台</p>
      </div>

      <Section title="這是什麼">
        讓多個 AI 代理人在同一個對話室裡輪流發言、互相回應的平台。你可以隨時打斷、引導話題，或是直接 @mention 指定發言順序。
      </Section>

      <Section title="核心功能">
        <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
          <li>🤝 多 Agent 輪流發言 — Claude、Gemini、Codex 同室對話</li>
          <li>⚡ 隨時打斷 — 任何時刻可插話重設輪次</li>
          <li>🎭 三層個性系統 — AGENT.md / IDENTITY.md / SOUL.md</li>
          <li>🗂 工作區 — 依專案整理對話，注入不同 system prompt</li>
          <li>🛠 技能系統 — /skill 語法快速注入指令</li>
          <li>🖼 圖片輸入 — 支援多圖上傳</li>
        </ul>
      </Section>

      <Section title="技術架構">
        <p className="text-sm text-muted-foreground leading-relaxed">
          FastAPI + React + TypeScript · WebSocket streaming · CLI subprocess 包裝 · Phase 0 穩定層（crash recovery、history sliding window、protected paths）
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      <div className="text-sm text-foreground leading-relaxed">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add ui/src/chat/settings/tabs/SoulTab.tsx ui/src/chat/settings/tabs/AboutTab.tsx
git commit -m "feat(settings): implement Soul tab (template editors) and About tab (static)"
```

---

## Chunk 10: Final Verification

### Task 10: Full test suite + build check

- [ ] **Step 1: Run Vitest**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm test run 2>&1 | tail -15
```
Expected: all tests pass (63+)

- [ ] **Step 2: TypeScript build check**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm build 2>&1 | tail -20
```
Expected: builds successfully (or pre-existing Paperclip errors only)

- [ ] **Step 3: Playwright smoke test**
```bash
cd .worktrees/feat-chat-cowork-phase1/ui && pnpm exec playwright test --reporter=list 2>&1 | tail -10
```
Expected: 5/5 pass (ModeToggle tests unaffected)

- [ ] **Step 4: Python test suite**
```bash
cd .worktrees/feat-chat-cowork-phase1 && python3 -m pytest test_api.py -q 2>&1 | tail -5
```
Expected: 169 passed, 2 pre-existing failures

- [ ] **Step 5: Final commit (update HANDOFF)**

In `docs/HANDOFF-chat-cowork.md`, add Settings section to completed list.

```bash
git add docs/HANDOFF-chat-cowork.md
git commit -m "docs: update HANDOFF with Settings panel completion"
```

---

## NOT in scope (Phase 2B)

- **Chat UI Arc-style redesign** — Sidebar with workspace folders/dock, Members panel (slide-in), Runs panel (token tracking), Welcome screen, message queue buffering. Separate plan.
- **Settings shared between Chat + Cowork** — Requires Phase 2B architecture decision. For now, Settings is triggered only from ChatPage.
- **Ollama model pull** — `POST /providers/ollama/pull` streaming progress bar. Deferred: complex SSE streaming, not critical for launch.
- **Agent test connection** — `POST /agents/{name}/test`. Deferred: nice-to-have.
- **Workspace text content upload** — "貼上文字" modal. Deferred: edge case.
- **Session download format picker** — Separate feature.

## What already exists

- `ui/src/api/client.ts` — Paperclip's API client (targets `/api`, NOT reused here — Chat backend has no `/api` prefix)
- `@tanstack/react-query` — Already installed in `ui/package.json`
- shadcn/ui components — `Button`, `Input`, `Dialog` available at `@/components/ui/*`
- `ui/src/chat/types.ts` — Existing chat types (ChatMessage, etc.) — Settings types are separate in `settings/types.ts`
