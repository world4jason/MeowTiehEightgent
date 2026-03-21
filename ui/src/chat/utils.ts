import { ChatMessage } from "./types";

/**
 * Transform a raw backend history message (from GET /sessions/{id}) to ChatMessage.
 * Backend format: { type: "message"|"user", agent?: string, text: string, timestamp?: string }
 */
export function toHistoryChatMessage(raw: Record<string, unknown>): ChatMessage {
  const isUser = raw.type === "user" || raw.role === "user";
  return {
    id: crypto.randomUUID(),
    role: isUser ? "user" : "agent",
    agentName: !isUser ? String(raw.agent ?? "") || undefined : undefined,
    content: String(raw.text ?? raw.content ?? ""),
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

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
