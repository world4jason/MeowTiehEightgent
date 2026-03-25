import type { APIRequestContext } from "@playwright/test";

interface TrackedEntity {
  type: string;
  id: string;
  deleteUrl: string;
}

export class TestFactory {
  readonly prefix: string;
  private tracked: TrackedEntity[] = [];
  private request: APIRequestContext;
  private baseUrl: string;

  constructor(request: APIRequestContext, workerIndex = 0) {
    this.request = request;
    this.prefix = `test-${workerIndex}-${Date.now()}`;
    this.baseUrl = process.env.BASE_URL || "http://localhost:3100";
  }

  private async apiPost(path: string, data: Record<string, unknown>) {
    const resp = await this.request.post(`${this.baseUrl}${path}`, { data });
    if (!resp.ok()) {
      const body = await resp.text();
      throw new Error(`TestFactory seed failed: POST ${path} → ${resp.status()}: ${body}`);
    }
    return resp.json();
  }

  private async apiDelete(path: string) {
    const resp = await this.request.delete(`${this.baseUrl}${path}`);
    if (!resp.ok() && resp.status() !== 404) {
      console.warn(`TestFactory teardown warning: DELETE ${path} → ${resp.status()}`);
    }
  }

  // Chat
  async createSession(opts?: { agent?: string; withGoal?: string }) {
    const title = `${this.prefix}-session-${Date.now()}`;
    const result = await this.apiPost("/chat/api/sessions", { title, agent: opts?.agent || "claude" });
    this.tracked.push({ type: "session", id: result.id, deleteUrl: `/chat/api/sessions/${result.id}` });
    if (opts?.withGoal) {
      await this.apiPost(`/chat/api/sessions/${result.id}/config`, { room_goal: opts.withGoal });
    }
    return { id: result.id, title };
  }

  // Cowork
  async createIssue(opts?: { title?: string; status?: string }) {
    const title = opts?.title || `${this.prefix}-issue-${Date.now()}`;
    const result = await this.apiPost("/api/issues", { title, status: opts?.status || "open" });
    this.tracked.push({ type: "issue", id: result.id, deleteUrl: `/api/issues/${result.id}` });
    return { id: result.id, title };
  }

  async createProject(opts?: { name?: string }) {
    const name = opts?.name || `${this.prefix}-project-${Date.now()}`;
    const result = await this.apiPost("/api/projects", { name });
    this.tracked.push({ type: "project", id: result.id, deleteUrl: `/api/projects/${result.id}` });
    return { id: result.id, name };
  }

  async createGoal(opts?: { title?: string }) {
    const title = opts?.title || `${this.prefix}-goal-${Date.now()}`;
    const result = await this.apiPost("/api/goals", { title });
    this.tracked.push({ type: "goal", id: result.id, deleteUrl: `/api/goals/${result.id}` });
    return { id: result.id, title };
  }

  // Settings
  async createAgent(opts?: { name?: string; emoji?: string; color?: string; skills?: string[]; model?: string }) {
    const name = opts?.name || `${this.prefix}-agent-${Date.now()}`;
    const result = await this.apiPost("/chat/api/agents", {
      name, emoji: opts?.emoji || "🤖", color: opts?.color || "#6366F1",
      skills: opts?.skills || [], model: opts?.model || "claude",
    });
    this.tracked.push({ type: "agent", id: name, deleteUrl: `/chat/api/agents/${name}` });
    return { name };
  }

  async createSkill(opts?: { name?: string }) {
    const name = opts?.name || `${this.prefix}-skill-${Date.now()}`;
    const result = await this.apiPost("/chat/api/skills", { name });
    this.tracked.push({ type: "skill", id: name, deleteUrl: `/chat/api/skills/${name}` });
    return { slug: name };
  }

  async createModel(opts?: { name?: string; type?: string }) {
    const name = opts?.name || `${this.prefix}-model-${Date.now()}`;
    const result = await this.apiPost("/chat/api/models", { name, type: opts?.type || "cli" });
    this.tracked.push({ type: "model", id: name, deleteUrl: `/chat/api/models/${name}` });
    return { name };
  }

  async createWorkspace(opts?: { name?: string; systemPrompt?: string }) {
    const name = opts?.name || `${this.prefix}-ws-${Date.now()}`;
    const result = await this.apiPost("/chat/api/workspaces", { name, system_prompt: opts?.systemPrompt || "" });
    this.tracked.push({ type: "workspace", id: result.id, deleteUrl: `/chat/api/workspaces/${result.id}` });
    return { id: result.id, name };
  }

  async teardownAll() {
    for (const entity of [...this.tracked].reverse()) {
      await this.apiDelete(entity.deleteUrl);
    }
    this.tracked = [];
  }
}
