# React Settings Page Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder 71-line `ChatSettings.tsx` with a full 7-tab Settings panel matching the original `static/index.html` feature set.

**Architecture:** Tab-per-file component architecture under `ui/src/chat/settings/`. A shared `useSettingsApi.ts` hook file provides all react-query hooks. `SettingsShell.tsx` manages tab navigation. Each tab component owns its internal layout (list+detail, grid, or single-column). The shell is wired into `App.tsx` replacing the existing `ChatSettingsPage`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, @tanstack/react-query, chatClient (fetch wrapper to Python backend :8000)

**Spec:** `docs/superpowers/specs/2026-03-23-react-settings-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `ui/src/chat/settings/useSettingsApi.ts` | All react-query hooks for settings endpoints |
| Create | `ui/src/chat/settings/SettingsShell.tsx` | Tab nav sidebar + content area framework |
| Create | `ui/src/chat/settings/ModelsTab.tsx` | Model CRUD (CLI + Ollama API) |
| Create | `ui/src/chat/settings/AgentsTab.tsx` | Agent CRUD + MD editing + skills assignment |
| Create | `ui/src/chat/settings/AgentMarketTab.tsx` | Marketplace browse + fork |
| Create | `ui/src/chat/settings/SkillsTab.tsx` | Skill CRUD + zip upload |
| Create | `ui/src/chat/settings/WorkspacesTab.tsx` | Workspace CRUD + files + default agents |
| Create | `ui/src/chat/settings/SoulTab.tsx` | Default template editing (4 cards) |
| Create | `ui/src/chat/settings/AboutTab.tsx` | Static system info |
| Modify | `ui/src/App.tsx:310-314` | Replace `ChatSettingsPage` with `SettingsShell` |
| Modify | `ui/src/chat/types.ts` | Add settings-related type interfaces |
| Delete | `ui/src/chat/ChatSettings.tsx` | Replaced by settings/ directory |

---

## Task 1: Types + Shared API Hooks

**Files:**
- Modify: `ui/src/chat/types.ts`
- Create: `ui/src/chat/settings/useSettingsApi.ts`

- [ ] **Step 1: Add settings types to types.ts**

Append these interfaces to `ui/src/chat/types.ts`:

```typescript
// ─── Settings types ──────────────────────────────────────────
export interface ModelInfo {
  id: string;
  type: "cli" | "api" | "ollama";
  label?: string;
  emoji?: string;
  color?: string;
  cmd?: string[];
  baseUrl?: string;
  apiModel?: string;
  supports_image?: boolean;
  supports_thinking?: boolean;
  idle_timeout_seconds?: number;
  startup_timeout_seconds?: number;
}

export interface AgentDetail {
  name: string;
  emoji: string;
  color: string;
  description: string;
  model: string;
  skills: string[];
  enabled: boolean;
  supports_thinking?: boolean;
}

export interface MarketplaceAgent {
  id: string;
  emoji: string;
  color: string;
  description: string;
  installed: boolean;
}

export interface MarketplaceAgentDetail extends MarketplaceAgent {
  agent_md: string;
  identity_md: string;
  soul_md: string;
}

export interface SkillDetail {
  slug: string;
  name: string;
  description: string;
  body: string;
  source?: string;
  source_url?: string;
  source_version?: string;
}

export interface MdContent {
  content: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
```

- [ ] **Step 2: Create useSettingsApi.ts with all hooks**

Create `ui/src/chat/settings/useSettingsApi.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatClient } from "../chatClient";
import { chatKeys } from "../hooks/useChatApi";
import type {
  ModelInfo, AgentInfo, AgentDetail, MarketplaceAgent,
  MarketplaceAgentDetail, SkillInfo, SkillDetail, MdContent,
} from "../types";

// ─── Query keys ──────────────────────────────────────────────
export const settingsKeys = {
  models: ["settings", "models"] as const,
  agentDetail: (name: string) => ["settings", "agent", name] as const,
  agentMd: (name: string) => ["settings", "agent-md", name] as const,
  agentIdentity: (name: string) => ["settings", "agent-identity", name] as const,
  agentSoul: (name: string) => ["settings", "agent-soul", name] as const,
  marketplace: ["settings", "marketplace"] as const,
  marketplaceDetail: (id: string) => ["settings", "marketplace", id] as const,
  skillDetail: (slug: string) => ["settings", "skill", slug] as const,
  defaultAgentMd: ["settings", "default", "agent-md"] as const,
  defaultIdentity: ["settings", "default", "identity"] as const,
  defaultSoul: ["settings", "default", "soul"] as const,
  userMd: ["settings", "user-md"] as const,
  config: ["settings", "config"] as const,
  ollamaModels: (baseUrl: string) => ["settings", "ollama", baseUrl] as const,
};

// ─── Models ──────────────────────────────────────────────────
export function useModels() {
  return useQuery({
    queryKey: settingsKeys.models,
    queryFn: () => chatClient.get<ModelInfo[]>("/models"),
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ModelInfo> & { id: string; type: string }) =>
      chatClient.post<{ ok: boolean }>("/models", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.models }),
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ModelInfo> & { id: string }) =>
      chatClient.put<{ ok: boolean }>(`/models/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.models }),
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatClient.delete<{ ok: boolean }>(`/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.models }),
  });
}

export function useOllamaModels(baseUrl: string) {
  return useQuery({
    queryKey: settingsKeys.ollamaModels(baseUrl),
    queryFn: () =>
      chatClient.get<{ ok: boolean; models: string[] }>(
        `/providers/ollama/models?base_url=${encodeURIComponent(baseUrl)}`
      ),
    enabled: Boolean(baseUrl),
  });
}

// Ollama pull — streaming, returns a ReadableStream
export function usePullOllamaModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ baseUrl, model }: { baseUrl: string; model: string }) => {
      const BASE = (import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000") as string;
      const res = await fetch(`${BASE}/providers/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: baseUrl, model }),
      });
      if (!res.ok) throw new Error("Pull failed");
      return res; // caller reads res.body (ReadableStream) for progress
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "ollama"] });
    },
  });
}

// ─── Agents ──────────────────────────────────────────────────
export function useAgentDetail(name: string) {
  return useQuery({
    queryKey: settingsKeys.agentDetail(name),
    queryFn: () => chatClient.get<AgentDetail>(`/agents/${name}`),
    enabled: Boolean(name),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string; emoji?: string; color?: string; description?: string;
      model?: string; skills?: string[]; enabled?: boolean;
    }) => chatClient.post<{ ok: boolean; name: string }>("/agents", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...body }: Partial<AgentDetail> & { name: string }) =>
      chatClient.put<{ ok: boolean }>(`/agents/${name}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
      qc.invalidateQueries({ queryKey: settingsKeys.agentDetail(vars.name) });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => chatClient.delete<{ ok: boolean }>(`/agents/${name}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
    },
  });
}

export function useAgentMd(name: string) {
  return useQuery({
    queryKey: settingsKeys.agentMd(name),
    queryFn: () => chatClient.get<MdContent>(`/agents/${name}/agent-md`),
    enabled: Boolean(name),
  });
}

export function useUpdateAgentMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      chatClient.put<{ ok: boolean }>(`/agents/${name}/agent-md`, { content }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: settingsKeys.agentMd(vars.name) });
    },
  });
}

export function useAgentIdentity(name: string) {
  return useQuery({
    queryKey: settingsKeys.agentIdentity(name),
    queryFn: () => chatClient.get<MdContent>(`/agents/${name}/identity`),
    enabled: Boolean(name),
  });
}

export function useUpdateAgentIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      chatClient.put<{ ok: boolean }>(`/agents/${name}/identity`, { content }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: settingsKeys.agentIdentity(vars.name) });
    },
  });
}

export function useAgentSoul(name: string) {
  return useQuery({
    queryKey: settingsKeys.agentSoul(name),
    queryFn: () => chatClient.get<MdContent>(`/agents/${name}/soul`),
    enabled: Boolean(name),
  });
}

export function useUpdateAgentSoul() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      chatClient.put<{ ok: boolean }>(`/agents/${name}/soul`, { content }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: settingsKeys.agentSoul(vars.name) });
    },
  });
}

export function useTestAgent() {
  return useMutation({
    mutationFn: (name: string) =>
      chatClient.post<{ ok: boolean; response?: string; error?: string }>(
        `/agents/${name}/test`, {}
      ),
  });
}

// ─── Marketplace ─────────────────────────────────────────────
export function useMarketplaceAgents() {
  return useQuery({
    queryKey: settingsKeys.marketplace,
    queryFn: () => chatClient.get<MarketplaceAgent[]>("/marketplace/agents"),
  });
}

export function useMarketplaceAgentDetail(id: string) {
  return useQuery({
    queryKey: settingsKeys.marketplaceDetail(id),
    queryFn: () => chatClient.get<MarketplaceAgentDetail>(`/marketplace/agents/${id}`),
    enabled: Boolean(id),
  });
}

export function useInstallMarketplaceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, model }: { id: string; name?: string; model?: string }) =>
      chatClient.post<{ ok: boolean; name: string }>(
        `/marketplace/agents/${id}/install`, { name, model }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
      qc.invalidateQueries({ queryKey: settingsKeys.marketplace });
    },
  });
}

// ─── Skills ──────────────────────────────────────────────────
export function useSkillDetail(slug: string) {
  return useQuery({
    queryKey: settingsKeys.skillDetail(slug),
    queryFn: () => chatClient.get<SkillDetail>(`/skills/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { slug: string; name: string; description: string; body: string }) =>
      chatClient.post<{ ok: boolean; slug: string }>("/skills", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.skills }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, ...body }: { slug: string; name: string; description: string; body: string }) =>
      chatClient.put<{ ok: boolean }>(`/skills/${slug}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: chatKeys.skills });
      qc.invalidateQueries({ queryKey: settingsKeys.skillDetail(vars.slug) });
    },
  });
}

export function useUploadSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return chatClient.postForm<{ ok: boolean; created: string[]; skipped: string[] }>(
        "/skills/upload", fd
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.skills }),
  });
}

// ─── Workspaces ──────────────────────────────────────────────
export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; system_prompt?: string }) =>
      chatClient.post<{ id: string; name: string }>("/workspaces", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.workspaces }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; description?: string; system_prompt?: string; default_agents?: string[] }) =>
      chatClient.put<{ ok: boolean }>(`/workspaces/${id}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: chatKeys.workspaces });
      qc.invalidateQueries({ queryKey: chatKeys.workspace(vars.id) });
    },
  });
}

export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatClient.delete<{ ok: boolean }>(`/workspaces/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.workspaces });
      qc.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}

export function useUploadWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return chatClient.postForm<{ ok: boolean; filename: string }>(
        `/workspaces/${id}/files`, fd
      );
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: chatKeys.workspace(vars.id) });
    },
  });
}

export function useDeleteWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      chatClient.delete<{ ok: boolean }>(`/workspaces/${id}/files/${filename}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: chatKeys.workspace(vars.id) });
    },
  });
}

// ─── Soul (Default Templates) ────────────────────────────────
export function useDefaultAgentMd() {
  return useQuery({
    queryKey: settingsKeys.defaultAgentMd,
    queryFn: () => chatClient.get<MdContent>("/agents/_default/agent-md"),
  });
}

export function useUpdateDefaultAgentMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/agent-md", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.defaultAgentMd }),
  });
}

export function useDefaultIdentity() {
  return useQuery({
    queryKey: settingsKeys.defaultIdentity,
    queryFn: () => chatClient.get<MdContent>("/agents/_default/identity"),
  });
}

export function useUpdateDefaultIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/identity", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.defaultIdentity }),
  });
}

export function useDefaultSoul() {
  return useQuery({
    queryKey: settingsKeys.defaultSoul,
    queryFn: () => chatClient.get<MdContent>("/agents/_default/soul"),
  });
}

export function useUpdateDefaultSoul() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/soul", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.defaultSoul }),
  });
}

export function useUserMd() {
  return useQuery({
    queryKey: settingsKeys.userMd,
    queryFn: () => chatClient.get<MdContent>("/user/md"),
  });
}

export function useUpdateUserMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      chatClient.put<{ ok: boolean }>("/user/md", { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.userMd }),
  });
}

// ─── Config ──────────────────────────────────────────────────
export function useConfig() {
  return useQuery({
    queryKey: settingsKeys.config,
    queryFn: () => chatClient.get<Record<string, unknown>>("/config"),
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      chatClient.post<{ ok: boolean }>("/config", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.config }),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd ui && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors from our files (pre-existing errors OK)

- [ ] **Step 4: Commit**

```bash
git add ui/src/chat/types.ts ui/src/chat/settings/useSettingsApi.ts
git commit -m "feat(settings): add types and shared API hooks for all settings endpoints"
```

---

## Task 2: SettingsShell + App.tsx Wiring

**Files:**
- Create: `ui/src/chat/settings/SettingsShell.tsx`
- Modify: `ui/src/App.tsx:310-314,364-368`
- Delete: `ui/src/chat/ChatSettings.tsx`

- [ ] **Step 1: Create SettingsShell.tsx**

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ModelsTab } from "./ModelsTab";
import { AgentsTab } from "./AgentsTab";
import { AgentMarketTab } from "./AgentMarketTab";
import { SkillsTab } from "./SkillsTab";
import { WorkspacesTab } from "./WorkspacesTab";
import { SoulTab } from "./SoulTab";
import { AboutTab } from "./AboutTab";

type SettingsTab = "models" | "agents" | "market" | "skills" | "workspaces" | "soul" | "about";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "models", label: "模型" },
  { id: "agents", label: "代理人" },
  { id: "market", label: "市場" },
  { id: "skills", label: "技能" },
  { id: "workspaces", label: "工作區" },
  { id: "soul", label: "靈魂" },
  { id: "about", label: "關於" },
];

interface Props {
  coworkOnline: boolean;
}

export function SettingsShell({ coworkOnline }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("models");
  // For cross-tab navigation (e.g., marketplace install → switch to agents)
  const [navigateToAgent, setNavigateToAgent] = useState<string | null>(null);

  function handleInstalled(agentName: string) {
    setNavigateToAgent(agentName);
    setActiveTab("agents");
  }

  return (
    <div className="flex h-full w-full">
      {/* Left nav */}
      <nav className="flex w-[200px] min-w-[200px] flex-col gap-0.5 border-r border-border bg-muted/30 p-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              activeTab === tab.id
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content — each tab handles its own overflow-y-auto */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "models" && <ModelsTab />}
        {activeTab === "agents" && (
          <AgentsTab
            initialAgent={navigateToAgent}
            onClearInitial={() => setNavigateToAgent(null)}
          />
        )}
        {activeTab === "market" && <AgentMarketTab onInstalled={handleInstalled} />}
        {activeTab === "skills" && <SkillsTab />}
        {activeTab === "workspaces" && <WorkspacesTab />}
        {activeTab === "soul" && <SoulTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create stub files for all tabs**

Create 7 stub files so TypeScript can import them. Each follows same pattern:

`ModelsTab.tsx`:
```tsx
export function ModelsTab() {
  return <div className="p-6 text-sm text-muted-foreground">模型 — 開發中</div>;
}
```

Repeat for: `AgentsTab.tsx` (with `initialAgent` / `onClearInitial` props), `AgentMarketTab.tsx` (with `onInstalled` prop), `SkillsTab.tsx`, `WorkspacesTab.tsx`, `SoulTab.tsx`, `AboutTab.tsx`.

- [ ] **Step 3: Wire into App.tsx**

In `ui/src/App.tsx`:

Replace the `ChatSettingsPage` function (line 310-314) and its usage (line 364-368):

```tsx
// Remove ChatSettingsPage function entirely
// Remove: import { ChatSettings } from "./chat/ChatSettings";
// Remove: import { useAgentsList } from "./chat/hooks/useChatApi";
// Add:
import { SettingsShell } from "./chat/settings/SettingsShell";
```

Replace the settings render block:
```tsx
{mode === "settings" && (
  <div className="flex h-full flex-1">
    <SettingsShell coworkOnline={coworkOnline} />
  </div>
)}
```

- [ ] **Step 4: Delete ChatSettings.tsx**

```bash
rm ui/src/chat/ChatSettings.tsx
```

- [ ] **Step 5: Verify in browser**

Open http://localhost:5173, switch to Settings tab.
Expected: Left nav with 7 tabs, clicking each shows "開發中" placeholder.

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/settings/ ui/src/App.tsx
git rm ui/src/chat/ChatSettings.tsx
git commit -m "feat(settings): add SettingsShell with tab navigation, replace placeholder"
```

---

## Task 3: About Tab (simplest, warmup)

**Files:**
- Modify: `ui/src/chat/settings/AboutTab.tsx`

- [ ] **Step 1: Implement AboutTab**

```tsx
export function AboutTab() {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-violet-400">MeowTiehEightgent</h1>
          <p className="mt-1 text-sm text-muted-foreground">多 Agent 協作對話平台</p>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            這是什麼
          </h2>
          <p className="text-sm leading-relaxed">
            讓多個 AI 代理人在同一個對話室裡輪流發言、互相回應的平台。你可以隨時打斷、引導話題，或是直接 @mention 指定發言順序。
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            核心功能
          </h2>
          <ul className="space-y-2 text-sm">
            <li>🤝 多 Agent 輪流發言 — Claude、Gemini、Codex 同室對話</li>
            <li>⚡ 隨時打斷 — 任何時刻可插話重設輪次</li>
            <li>🐾 三層個性系統 — AGENT.md / IDENTITY.md / SOUL.md</li>
            <li>📁 工作區 — 依專案整理對話，注入不同 system prompt</li>
            <li>🔧 技能系統 — /skill 語法快速注入指令</li>
            <li>🖼️ 圖片輸入 — 支援多圖上傳（對應 agent 能力自動判斷）</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            技術架構
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            FastAPI + Vanilla JS，WebSocket streaming，CLI subprocess 包裝，Phase 0 穩定層（crash recovery、history sliding window、protected paths）
          </p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open Settings → 關於.
Expected: Purple title, sections rendered.

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/AboutTab.tsx
git commit -m "feat(settings): implement About tab with system info"
```

---

## Task 4: Soul Tab (4-card default templates)

**Files:**
- Modify: `ui/src/chat/settings/SoulTab.tsx`

- [ ] **Step 1: Implement SoulTab**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  useDefaultAgentMd, useUpdateDefaultAgentMd,
  useDefaultIdentity, useUpdateDefaultIdentity,
  useDefaultSoul, useUpdateDefaultSoul,
  useUserMd, useUpdateUserMd,
} from "./useSettingsApi";

interface CardDef {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  emoji: string;
}

const CARDS: CardDef[] = [
  {
    key: "agent-md",
    title: "AGENT.md",
    subtitle: "行為指令",
    description: "每個新代理人的基礎行為規範。定義角色職責、工作流程與回應風格。",
    emoji: "🤖",
  },
  {
    key: "identity",
    title: "IDENTITY.md",
    subtitle: "身份設定",
    description: "代理人的基本身份：名字、背景、個性特質。讓 AI 知道「我是誰」。",
    emoji: "🪪",
  },
  {
    key: "soul",
    title: "SOUL.md",
    subtitle: "靈魂個性",
    description: "更深層的價值觀與思考風格。決定代理人如何思考、表達，以及與人互動的氣質。",
    emoji: "✨",
  },
  {
    key: "user-md",
    title: "USER.md",
    subtitle: "關於你自己",
    description: "告訴代理人你是誰、你的背景和偏好。每個代理人都會在對話前讀取這份文件。",
    emoji: "👤",
  },
];

export function SoulTab() {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const agentMd = useDefaultAgentMd();
  const identity = useDefaultIdentity();
  const soul = useDefaultSoul();
  const userMd = useUserMd();

  const updateAgentMd = useUpdateDefaultAgentMd();
  const updateIdentity = useUpdateDefaultIdentity();
  const updateSoul = useUpdateDefaultSoul();
  const updateUserMd = useUpdateUserMd();

  const contentMap: Record<string, string | undefined> = {
    "agent-md": agentMd.data?.content,
    identity: identity.data?.content,
    soul: soul.data?.content,
    "user-md": userMd.data?.content,
  };

  const mutationMap: Record<string, { mutateAsync: (c: string) => Promise<unknown>; isPending: boolean }> = {
    "agent-md": updateAgentMd,
    identity: updateIdentity,
    soul: updateSoul,
    "user-md": updateUserMd,
  };

  function startEdit(key: string) {
    setEditing(key);
    setDraft(contentMap[key] ?? "");
  }

  async function save() {
    if (!editing) return;
    await mutationMap[editing].mutateAsync(draft);
    setEditing(null);
  }

  if (editing) {
    const card = CARDS.find((c) => c.key === editing)!;
    const m = mutationMap[editing];
    return (
      <div className="flex h-full flex-col p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-2xl">{card.emoji}</span>
          <h2 className="text-lg font-semibold">{card.title}</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            ← 返回
          </Button>
        </div>
        <textarea
          className="flex-1 resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="mt-4">
          <Button onClick={save} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            儲存
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const content = contentMap[card.key];
          const preview = content?.split("\n").slice(0, 4).join("\n") ?? "";
          return (
            <button
              key={card.key}
              onClick={() => startEdit(card.key)}
              className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/30"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">{card.emoji}</span>
                <div>
                  <div className="text-sm font-semibold">{card.title}</div>
                  <div className="text-xs text-muted-foreground">{card.subtitle}</div>
                </div>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{card.description}</p>
              {preview && (
                <pre className="overflow-hidden rounded-md bg-muted/40 p-3 text-xs text-muted-foreground line-clamp-4">
                  {preview}
                </pre>
              )}
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
        點選卡片即可編輯。新建代理人時會從這裡複製內容，{"{{name}}"} 會被替換成代理人名稱
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open Settings → 靈魂. Expected: 4 cards with previews. Click one → edit textarea loads content. Save → returns to grid.

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/SoulTab.tsx
git commit -m "feat(settings): implement Soul tab with 4 default template cards"
```

---

## Task 5: Models Tab (list + detail CRUD)

**Files:**
- Modify: `ui/src/chat/settings/ModelsTab.tsx`

- [ ] **Step 1: Implement ModelsTab**

Full implementation of the list+detail two-column layout:
- Left: model list with emoji, name (colored), type badge, "+ 新增模型" button
- Right: selected model form (label, emoji, color, cmd/baseUrl+apiModel depending on type)
- Save (PUT) and delete (DELETE) buttons
- New model form with type toggle (CLI/API)
- Ollama: model dropdown from GET `/providers/ollama/models`

Key implementation details:
- `cmd` field is `string[]` — join with spaces for display, split on spaces for save
- Type badge: "cli" or "api"
- Color field shown with colored dot preview
- Delete confirmation via window.confirm (simple, no dialog component needed)

The component uses:
- `useModels()` for list
- `useCreateModel()`, `useUpdateModel()`, `useDeleteModel()` for CRUD
- `useOllamaModels(baseUrl)` conditionally when type is "api"/"ollama"
- `usePullOllamaModel()` for Ollama model download — reads response.body as ReadableStream, parses NDJSON lines for progress, shows progress bar (status + completed/total bytes)
- Local `useState` for form fields, synced when selected model changes

- [ ] **Step 2: Verify in browser**

Settings → 模型.
- Expected: Shows existing models (claude, gemini, ollama, codex)
- Click model → detail form loads
- Edit label → Save → list updates
- Click "+ 新增模型" → new model form
- Delete → model removed

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/ModelsTab.tsx
git commit -m "feat(settings): implement Models tab with full CRUD"
```

---

## Task 6: Skills Tab (grid + edit + upload)

**Files:**
- Modify: `ui/src/chat/settings/SkillsTab.tsx`

- [ ] **Step 1: Implement SkillsTab**

Implementation details:
- Header: "已安裝的技能" title + "+ 新增" + "上傳" buttons
- Grid: 3-4 column responsive card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- Each card: 🔧 icon + `/slug` + description truncated
- Click card → detail view (replace grid): name, description, body (tall textarea)
- Save button (PUT `/skills/{slug}`)
- New skill: dialog or inline form for slug, name, description, body (POST `/skills`)
- Upload: hidden file input triggered by button, accept=".zip" (POST `/skills/upload` as FormData)
- Show upload result: created slugs + skipped slugs

Uses: `useSkillsList()` (existing), `useSkillDetail()`, `useCreateSkill()`, `useUpdateSkill()`, `useUploadSkill()`

- [ ] **Step 2: Verify in browser**

Settings → 技能.
- Expected: Grid of installed skills with 🔧 icons
- Click card → shows edit form with name, description, body
- Edit body → Save → returns to grid
- "+ 新增" → shows new skill form
- "上傳" → file picker for .zip

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/SkillsTab.tsx
git commit -m "feat(settings): implement Skills tab with CRUD and zip upload"
```

---

## Task 7: Agent Marketplace Tab (browse + fork)

**Files:**
- Modify: `ui/src/chat/settings/AgentMarketTab.tsx`

- [ ] **Step 1: Implement AgentMarketTab**

Implementation details:
- 2-column card grid
- Each card: emoji + name + description + "點擊查看 →" link
- Installed badge: green "已安裝" badge if `installed: true`
- Click card → detail view:
  - Read-only preview of agent_md, identity_md, soul_md in collapsible sections
  - Fork form: name input (default = marketplace id), model select (from `useModels()`)
  - "安裝" button → `useInstallMarketplaceAgent()`
  - After success: call `onInstalled(name)` prop to switch to Agents tab

Props: `onInstalled: (agentName: string) => void`

Uses: `useMarketplaceAgents()`, `useMarketplaceAgentDetail()`, `useInstallMarketplaceAgent()`, `useModels()`

- [ ] **Step 2: Verify in browser**

Settings → 市場.
- Expected: Cards for marketplace agents (Creative Writer, Culinary Master, etc.)
- Click card → detail with MD previews
- Fill name + select model → 安裝 → switches to Agents tab

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/AgentMarketTab.tsx
git commit -m "feat(settings): implement Agent Marketplace tab with browse and fork"
```

---

## Task 8: Workspaces Tab (list + detail with files)

**Files:**
- Modify: `ui/src/chat/settings/WorkspacesTab.tsx`

- [ ] **Step 1: Implement WorkspacesTab**

Two-column layout:
- Left: workspace list (📁 + name) + "+ 新增工作區"
- Right: selected workspace detail:
  - Header: 📁 + workspace name
  - Instructions section: textarea for `system_prompt`, save on blur or button
  - Files section: list of filenames with ✕ delete buttons, "+" upload button (hidden file input)
  - 預設 Agents section: checkbox list from `useAgentsList()` (existing hook), checkboxes for `default_agents[]`
  - Delete section: red "刪除" button with confirm dialog text "刪除此工作區（對話不會刪除）"

Uses: `useWorkspaces()`, `useWorkspaceDetail()` (existing hooks), `useCreateWorkspace()`, `useUpdateWorkspace()`, `useDeleteWorkspace()`, `useUploadWorkspaceFile()`, `useDeleteWorkspaceFile()`, `useAgentsList()` (for default agents checkboxes)

Key detail: save workspace updates (name, system_prompt, default_agents) via single PUT call on "儲存" button click.

- [ ] **Step 2: Verify in browser**

Settings → 工作區.
- Expected: Shows workspaces (Default, 思想發散)
- Click workspace → detail with instructions, files, agent checkboxes
- Upload file → appears in files list
- Delete file → removed
- Check agent → Save → default_agents updated
- "刪除" → workspace deleted, list updates

- [ ] **Step 3: Commit**

```bash
git add ui/src/chat/settings/WorkspacesTab.tsx
git commit -m "feat(settings): implement Workspaces tab with files and default agents"
```

---

## Task 9: Agents Tab (most complex — CRUD + MD editing + skills)

**Files:**
- Modify: `ui/src/chat/settings/AgentsTab.tsx`

- [ ] **Step 1: Implement AgentsTab — list + basic detail**

Two-column layout:
- Left: agent list (emoji + name colored + model subtitle + green dot if enabled) + "+ 新增代理人"
- Right: selected agent detail header (emoji + name + enable/disable toggle)
- Basic fields: 描述 (input), 顏色 (input with colored dot preview), 模型 (select from `useModels()`)

Props: `initialAgent?: string | null`, `onClearInitial?: () => void` — used for marketplace install navigation.

Uses `useEffect` to auto-select `initialAgent` when set, then calls `onClearInitial()`.

- [ ] **Step 2: Add MD editing sections**

Three textarea sections below basic fields:
- AGENT.MD: loaded from `useAgentMd(name)`, saved via `useUpdateAgentMd()`
- IDENTITY.MD: loaded from `useAgentIdentity(name)`, saved via `useUpdateAgentIdentity()`
- SOUL.MD: loaded from `useAgentSoul(name)`, saved via `useUpdateAgentSoul()`

Each section: label + textarea (auto-height, min 120px)

- [ ] **Step 3: Add skills checkbox list**

Section "技能": uses `useSkillsList()` for full skill list.
Renders checkboxes, checked if skill slug is in agent's `skills[]`.
Changes accumulated in local state, saved with the main "儲存" button.

- [ ] **Step 4: Add save + test + new agent**

- "儲存" button: PUT `/agents/{name}` for config fields + PUT each MD content if changed
- "測試連線" button: POST `/agents/{name}/test` → show green/red result message
- "+ 新增代理人" form:
  - Two options: "從市場 Fork" (calls parent to switch to market tab) or "從零開始"
  - From scratch: name input, emoji, model select
  - **Name validation:** `const isValidName = (n: string) => n.length > 0 && n.length <= 64 && !/[/\\.\s]/.test(n);`
  - Show error message: "名稱不可包含 / \\ . 空格，最長 64 字元"
  - POST `/agents` → select new agent
- Enable/disable toggle: calls `useUpdateAgent()` with `{ name, enabled: !current }`

- [ ] **Step 5: Verify in browser**

Settings → 代理人.
- Expected: List of agents (Default_Claude, Default_Gemini, claude, gemini, ollama)
- Click agent → detail form with basic fields + 3 MD textareas + skills checkboxes
- Edit AGENT.MD → Save → content persisted
- Toggle enable/disable → green dot updates
- "測試連線" → shows response/error
- "+ 新增代理人" → create new agent

- [ ] **Step 6: Commit**

```bash
git add ui/src/chat/settings/AgentsTab.tsx
git commit -m "feat(settings): implement Agents tab with CRUD, MD editing, skills, and test"
```

---

## Task 10: Final Integration + Cleanup

**Files:**
- Modify: `ui/src/App.tsx` (verify clean)
- Verify: All tab imports resolve

- [ ] **Step 1: Remove any remaining dead imports**

Check `App.tsx` for unused imports (e.g., old `ChatSettings`, `useAgentsList` if no longer used at App level). Clean up.

- [ ] **Step 2: Full end-to-end verification**

Test all 7 tabs in browser:
1. 模型 — list models, edit, create, delete ✓
2. 代理人 — list agents, edit config + MDs, toggle enable, test, create ✓
3. 市場 — browse marketplace, view detail, fork/install ✓
4. 技能 — list skills, edit, create new, upload zip ✓
5. 工作區 — list workspaces, edit instructions, manage files, set default agents, delete ✓
6. 靈魂 — 4 template cards, edit and save each ✓
7. 關於 — static content ✓

Cross-tab: Install from 市場 → auto-navigates to 代理人 with new agent selected ✓

- [ ] **Step 3: Commit final cleanup**

```bash
git add -A ui/src/chat/settings/ ui/src/App.tsx
git commit -m "feat(settings): complete 7-tab settings page with full CRUD"
```
