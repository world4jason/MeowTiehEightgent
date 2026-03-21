import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { chatClient } from "../chatClient";
import type { AgentInfo, WorkspaceInfo, WorkspaceDetail, SkillInfo, ScenarioInfo, SessionPage, ChatSession } from "../types";

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
    onError: () => {
      // Silent move failure is a critical gap — surface error to user
      console.error("Failed to move session");
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
export function useScenarios() {
  return useQuery({
    queryKey: chatKeys.scenarios,
    queryFn: () => chatClient.get<ScenarioInfo[]>("/scenarios"),
  });
}
