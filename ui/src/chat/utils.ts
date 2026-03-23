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

export function applyThinking(prev: ChatMessage[], agentName: string, agentColor?: string): ChatMessage[] {
  const filtered = prev.filter(m => !m.thinking);
  return [...filtered, { id: crypto.randomUUID(), role: "agent", agentName, agentColor, content: "", timestamp: Date.now(), thinking: true }];
}

export function applyStreamStart(prev: ChatMessage[], agentName: string, agentColor?: string): ChatMessage[] {
  const filtered = prev.filter(m => !(m.thinking && m.agentName === agentName));
  return [...filtered, { id: crypto.randomUUID(), role: "agent", agentName, agentColor, content: "", timestamp: Date.now(), streaming: true }];
}

export function applyChunkMessage(prev: ChatMessage[], agentName: string, text: string): ChatMessage[] {
  // Find the last streaming message for this agent and append to it
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].streaming && prev[i].agentName === agentName) {
      return [...prev.slice(0, i), { ...prev[i], content: prev[i].content + text }, ...prev.slice(i + 1)];
    }
  }
  // No existing streaming message — create one
  return [...prev, { id: crypto.randomUUID(), role: "agent", agentName, content: text, timestamp: Date.now(), streaming: true }];
}

export function applyMessageEnd(prev: ChatMessage[], agentName: string): ChatMessage[] {
  // Mark the last streaming message for this agent as done
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].streaming && prev[i].agentName === agentName) {
      return [...prev.slice(0, i), { ...prev[i], streaming: false }, ...prev.slice(i + 1)];
    }
  }
  return prev;
}

// Legacy: kept for backward compatibility
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

export type TokenUsageMap = Record<string, { input: number; output: number }>;

export function applyTokenUpdate(prev: TokenUsageMap, agent: string, cumulative: { input: number; output: number }): TokenUsageMap {
  return { ...prev, [agent]: cumulative };
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
