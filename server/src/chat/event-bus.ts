import { EventEmitter } from "node:events";

export interface AgentStatusEvent {
  agentId: string;
  status: "idle" | "chatting" | "working";
  detail?: string;
  sessionId: string;
}

export interface CoworkUpdateEvent {
  event: "issue_created" | "issue_completed" | "issue_updated";
  issueId: string;
  title: string;
  agentId?: string;
  sessionId: string; // session scoping — listeners filter by this
}

export interface SessionControlEvent {
  action: "pause" | "resume" | "redirect" | "set_goal";
  agentId?: string;
  instruction?: string;
  goal?: string;
}

export interface AgentIntentEvent {
  intent: "create_issue";
  payload: { title: string; description: string; assignee?: string; projectId?: string };
  sessionId: string;
}

export interface ChatEventMap {
  "agent:status": AgentStatusEvent;
  "cowork:update": CoworkUpdateEvent;
  "session:control": SessionControlEvent;
  "agent:intent": AgentIntentEvent;
}

class ChatEventBus {
  private emitter = new EventEmitter();
  on<K extends keyof ChatEventMap>(event: K, handler: (data: ChatEventMap[K]) => void) { this.emitter.on(event, handler); }
  off<K extends keyof ChatEventMap>(event: K, handler: (data: ChatEventMap[K]) => void) { this.emitter.off(event, handler); }
  emit<K extends keyof ChatEventMap>(event: K, data: ChatEventMap[K]) { this.emitter.emit(event, data); }
  removeAllListeners() { this.emitter.removeAllListeners(); }
}

export const chatEventBus = new ChatEventBus();
