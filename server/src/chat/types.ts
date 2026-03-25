/**
 * types.ts — Chat-specific TypeScript types
 *
 * Mirrors the Python backend's message format so that both
 * servers can read/write the same history/{session_id}/messages.json files.
 */

export interface ChatMessage {
  type: "message" | "system";
  agent: string; // agent name or "Human"
  text: string;
  timestamp: string; // ISO 8601
  color?: string;
  skill?: string;
  images?: string[];
  mode?: "chat" | "think";
  duration_ms?: number;
  usage?: { input: number; output: number; cached?: number };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  workspaceId?: string | null;
  topic?: string;
}

export interface WsInitMessage {
  topic: string;
  agents: string[];
  auto?: boolean;
  rounds?: number;
  silence?: boolean;
  resume_from?: string;
  workspace_id?: string;
  scenario_id?: string;
  blank_mode?: boolean;
}

// WS message types from server to client
export type WsServerMessage =
  | { type: "thinking"; agent: string; color?: string }
  | { type: "stream_start"; agent: string; color?: string }
  | { type: "chunk"; agent: string; text: string }
  | {
      type: "message_end";
      agent: string;
      text?: string;
      duration_ms?: number;
      usage?: ChatMessage["usage"];
      truncated?: boolean;
    }
  | { type: "token_update"; agent: string; turn?: object; cumulative?: object }
  | { type: "ready"; auto?: boolean; pause?: boolean }
  | { type: "system"; text: string }
  | {
      type: "agent_error";
      agent: string;
      error_type: string;
      message: string;
    }
  | { type: "message"; agent: string; text: string; color?: string }
  | WsAgentStatus
  | WsCoworkUpdate
  | WsGoalChanged;

export interface WsAgentStatus {
  type: "agent:status";
  agentId: string;
  status: "idle" | "chatting" | "working";
  detail?: string;
}

export interface WsCoworkUpdate {
  type: "cowork:update";
  event: "issue_created" | "issue_completed" | "issue_updated";
  issueId: string;
  title: string;
  agentId?: string;
}

export interface WsGoalChanged {
  type: "session:goal_changed";
  goal: string;
}

// WS message types from client to server
export type WsClientMessage =
  | { type: "human"; text: string; images?: string[] }
  | { type: "set_mode"; agent: string; mode: "chat" | "think" }
  | { type: "add_agent"; agent: string }
  | { type: "remove_agent"; agent: string }
  | { type: "stop" }
  | { type: "next" }
  | WsSessionControl
  | WsAgentIntent;

export interface WsSessionControl {
  type: "session:control";
  action: "pause" | "resume" | "redirect" | "set_goal";
  agentId?: string;
  instruction?: string;
  goal?: string;
}

export interface WsAgentIntent {
  type: "agent:intent";
  intent: "create_issue";
  payload: {
    title: string;
    description: string;
    assignee?: string;
    projectId?: string;
  };
}
