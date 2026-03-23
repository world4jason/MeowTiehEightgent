import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatClient } from "../chatClient";
import { chatKeys } from "../hooks/useChatApi";
import type {
  ModelInfo,
  AgentDetail,
  MarketplaceAgent,
  MarketplaceAgentDetail,
  SkillDetail,
  MdContent,
} from "../types";

const BASE_URL = (import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000") as string;

// ─── Query keys ───────────────────────────────────────────────
export const settingsKeys = {
  models: ["settings", "models"] as const,
  ollamaModels: (baseUrl: string) => ["settings", "ollama", "models", baseUrl] as const,
  agentDetail: (name: string) => ["settings", "agent", name] as const,
  agentMd: (name: string) => ["settings", "agent", name, "agent-md"] as const,
  agentIdentity: (name: string) => ["settings", "agent", name, "identity"] as const,
  agentSoul: (name: string) => ["settings", "agent", name, "soul"] as const,
  marketplace: ["settings", "marketplace"] as const,
  marketplaceDetail: (id: string) => ["settings", "marketplace", id] as const,
  skillDetail: (slug: string) => ["settings", "skill", slug] as const,
  defaultAgentMd: ["settings", "_default", "agent-md"] as const,
  defaultIdentity: ["settings", "_default", "identity"] as const,
  defaultSoul: ["settings", "_default", "soul"] as const,
  userMd: ["settings", "user", "md"] as const,
  config: ["settings", "config"] as const,
};

// ─── Models ───────────────────────────────────────────────────
export function useModels() {
  return useQuery({
    queryKey: settingsKeys.models,
    queryFn: () => chatClient.get<ModelInfo[]>("/models"),
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ModelInfo>) =>
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

export function usePullOllamaModel() {
  return useMutation({
    mutationFn: async (body: { model: string; base_url?: string }) => {
      const res = await fetch(`${BASE_URL}/providers/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.body as ReadableStream;
    },
  });
}

// ─── Agents ───────────────────────────────────────────────────
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
      name: string;
      emoji?: string;
      color?: string;
      description?: string;
      model?: string;
      skills?: string[];
      enabled?: boolean;
    }) => chatClient.post<{ ok: boolean; name: string }>("/agents", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.agents }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      ...body
    }: Partial<AgentDetail> & { name: string }) =>
      chatClient.put<{ ok: boolean }>(`/agents/${name}`, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
      qc.invalidateQueries({ queryKey: settingsKeys.agentDetail(variables.name) });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => chatClient.delete<{ ok: boolean }>(`/agents/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.agents }),
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
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: settingsKeys.agentMd(variables.name) }),
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
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: settingsKeys.agentIdentity(variables.name) }),
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
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: settingsKeys.agentSoul(variables.name) }),
  });
}

export function useTestAgent() {
  return useMutation({
    mutationFn: (name: string) =>
      chatClient.post<{ ok: boolean; response?: string; error?: string }>(
        `/agents/${name}/test`,
        {}
      ),
  });
}

// ─── Marketplace ──────────────────────────────────────────────
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
    mutationFn: ({
      id,
      ...body
    }: { id: string; name?: string; model?: string }) =>
      chatClient.post<{ ok: boolean; name: string }>(
        `/marketplace/agents/${id}/install`,
        body
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
      qc.invalidateQueries({ queryKey: settingsKeys.marketplace });
    },
  });
}

export function useCreateMarketplaceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      id: string; emoji?: string; color?: string; description?: string;
      agent_md?: string; identity_md?: string; soul_md?: string;
    }) => chatClient.post<{ ok: boolean; id: string }>("/marketplace/agents", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.marketplace });
    },
  });
}

export function useUpdateMarketplaceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string; emoji?: string; color?: string; description?: string;
      agent_md?: string; identity_md?: string; soul_md?: string;
    }) => chatClient.put<{ ok: boolean }>(`/marketplace/agents/${id}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: settingsKeys.marketplace });
      qc.invalidateQueries({ queryKey: settingsKeys.marketplaceDetail(vars.id) });
    },
  });
}

export function useDeleteMarketplaceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      chatClient.delete<{ ok: boolean }>(`/marketplace/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.marketplace });
    },
  });
}

// ─── Skills ───────────────────────────────────────────────────
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
    mutationFn: ({
      slug,
      ...body
    }: { slug: string; name: string; description: string; body: string }) =>
      chatClient.put<{ ok: boolean }>(`/skills/${slug}`, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: chatKeys.skills });
      qc.invalidateQueries({ queryKey: settingsKeys.skillDetail(variables.slug) });
    },
  });
}

export function useUploadSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      chatClient.postForm<{ ok: boolean; created: string[]; skipped: string[] }>(
        "/skills/upload",
        formData
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.skills }),
  });
}

// ─── Workspaces ───────────────────────────────────────────────
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
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      system_prompt?: string;
      default_agents?: string[];
    }) => chatClient.put<{ ok: boolean }>(`/workspaces/${id}`, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: chatKeys.workspaces });
      qc.invalidateQueries({ queryKey: chatKeys.workspace(variables.id) });
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
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      chatClient.postForm<{ ok: boolean; filename: string }>(
        `/workspaces/${id}/files`,
        formData
      ),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: chatKeys.workspace(variables.id) }),
  });
}

export function useDeleteWorkspaceFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      chatClient.delete<{ ok: boolean }>(`/workspaces/${id}/files/${encodeURIComponent(filename)}`),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: chatKeys.workspace(variables.id) }),
  });
}

// ─── Soul (Default Templates) ─────────────────────────────────
export function useDefaultAgentMd() {
  return useQuery({
    queryKey: settingsKeys.defaultAgentMd,
    queryFn: () => chatClient.get<MdContent>("/agents/_default/agent-md"),
  });
}

export function useUpdateDefaultAgentMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string }) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/agent-md", body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: settingsKeys.defaultAgentMd }),
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
    mutationFn: (body: { content: string }) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/identity", body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: settingsKeys.defaultIdentity }),
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
    mutationFn: (body: { content: string }) =>
      chatClient.put<{ ok: boolean }>("/agents/_default/soul", body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: settingsKeys.defaultSoul }),
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
    mutationFn: (body: { content: string }) =>
      chatClient.put<{ ok: boolean }>("/user/md", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.userMd }),
  });
}

// ─── Cowork Agents (read-only) ────────────────────────────────

export interface CoworkAgent {
  id: string;
  name: string;
  status: string;
  model?: string;
  emoji?: string;
  urlKey?: string;
}

export function useCoworkAgents() {
  return useQuery({
    queryKey: ["settings", "cowork-agents"] as const,
    queryFn: async (): Promise<CoworkAgent[]> => {
      try {
        const healthRes = await fetch("/api/health");
        if (!healthRes.ok) return [];
        const companies = await fetch("/api/companies")
          .then((r) => r.json())
          .catch(() => []);
        if (!Array.isArray(companies) || companies.length === 0) return [];
        const companyId = companies[0].id;
        const agents = await fetch(`/api/companies/${companyId}/agents`)
          .then((r) => r.json())
          .catch(() => []);
        return Array.isArray(agents) ? agents : [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─── Config ───────────────────────────────────────────────────
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
