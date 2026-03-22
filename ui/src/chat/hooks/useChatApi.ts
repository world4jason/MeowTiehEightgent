import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { chatClient } from "../chatClient";
import type { AgentInfo, WorkspaceInfo, WorkspaceDetail, SkillInfo, ScenarioInfo, SessionPage, ChatSession } from "../types";

// ─── Raw backend shapes (before transformation) ───────────────
interface RawSession {
  id: string;
  first_message: string;
  workspace_id?: string;
  message_count: number;
}

interface RawSessionList {
  sessions: RawSession[];
  total: number;
  offset: number;
  limit: number;
}

interface RawWorkspace {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  default_agents?: string[];
  created_at?: string;
  files?: string[];
}

// ─── Transformers ─────────────────────────────────────────────
function toSession(raw: RawSession): ChatSession {
  return {
    id: raw.id,
    name: raw.first_message || raw.id.slice(0, 8),
    workspaceId: raw.workspace_id,
    updatedAt: Date.now(),
    preview: raw.first_message,
  };
}

function toWorkspaceInfo(raw: RawWorkspace): WorkspaceInfo {
  return { id: raw.id, name: raw.name };
}

function toWorkspaceDetail(raw: RawWorkspace): WorkspaceDetail {
  return {
    id: raw.id,
    name: raw.name,
    instructions: raw.system_prompt ?? "",
    files: raw.files ?? [],
    defaultAgents: raw.default_agents ?? [],
  };
}

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
    queryFn: () =>
      chatClient.get<RawWorkspace[]>("/workspaces").then((ws) => ws.map(toWorkspaceInfo)),
  });
}

export function useWorkspaceDetail(id: string) {
  return useQuery({
    queryKey: chatKeys.workspace(id),
    queryFn: () =>
      chatClient.get<RawWorkspace>(`/workspaces/${id}`).then(toWorkspaceDetail),
    enabled: Boolean(id),
  });
}

// ─── Sessions (offset-based infinite query) ───────────────────
const PAGE_SIZE = 50;

export function useSessions(workspaceId?: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.sessions(workspaceId),
    queryFn: ({ pageParam = 0 }) =>
      chatClient
        .get<RawSessionList>(`/sessions?limit=${PAGE_SIZE}&offset=${pageParam}`)
        .then((raw): SessionPage => ({
          sessions: raw.sessions
            .map(toSession)
            .filter((s) => !workspaceId || s.workspaceId === workspaceId),
          total: raw.total,
          offset: raw.offset,
          limit: raw.limit,
        })),
    getNextPageParam: (last) => {
      const nextOffset = last.offset + last.limit;
      return nextOffset < last.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
  });
}

// ─── Session mutations ────────────────────────────────────────
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId?: string) =>
      chatClient.post<{ id: string; name: string }>("/sessions", workspaceId ? { workspaceId } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
  });
}

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      chatClient.put(`/sessions/${id}/topic`, { topic: name }),
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
      chatClient.put(`/sessions/${id}/workspace`, { workspace_id: workspaceId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "sessions"] }),
    onError: (error) => {
      console.error("Failed to move session", error);
    },
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
interface RawScenario {
  id: string;
  name: string;
  description: string;
  agents?: string[];
  suggested_agents?: string[];
  system_prompt?: string;
  systemPrompt?: string;
}

function toScenario(raw: RawScenario): ScenarioInfo {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    agents: raw.agents ?? raw.suggested_agents ?? [],
    systemPrompt: raw.systemPrompt ?? raw.system_prompt,
  };
}

export function useScenarios() {
  return useQuery({
    queryKey: chatKeys.scenarios,
    queryFn: () =>
      chatClient.get<RawScenario[]>("/scenarios").then((list) => list.map(toScenario)),
  });
}
