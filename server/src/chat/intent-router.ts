import { chatEventBus, type AgentIntentEvent } from "./event-bus.js";

export interface IntentResult {
  success: boolean;
  data?: { issueId: string; title: string; number?: number };
  error?: string;
}

const COWORK_BASE = `http://localhost:${process.env.PORT || 3100}/api`;

let defaultCompanyId: string | null = null;

export async function resolveDefaultCompany(): Promise<void> {
  try {
    const res = await fetch(`${COWORK_BASE}/companies`);
    if (res.ok) {
      const companies = await res.json();
      if (companies.length > 0) defaultCompanyId = companies[0].id;
    }
  } catch { /* non-fatal */ }
}

export async function handleIntent(intent: AgentIntentEvent): Promise<IntentResult> {
  try {
    if (intent.intent === "create_issue") {
      const { title, description, projectId, assignee } = intent.payload;
      const companyId = defaultCompanyId;
      if (!companyId) return { success: false, error: "No company found. Configure a project first." };

      const res = await fetch(`${COWORK_BASE}/companies/${companyId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, projectId, assigneeId: assignee }),
      });
      if (!res.ok) return { success: false, error: `Cowork API error ${res.status}: ${await res.text()}` };

      const issue = await res.json();
      chatEventBus.emit("cowork:update", {
        event: "issue_created", issueId: issue.id, title: issue.title, agentId: assignee, sessionId: intent.sessionId,
      });
      return { success: true, data: { issueId: issue.id, title: issue.title, number: issue.number } };
    }
    return { success: false, error: `Unknown intent: ${intent.intent}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
