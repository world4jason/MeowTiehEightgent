export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  agentName?: string;
  agentColor?: string;
  agentEmoji?: string;
  content: string;
  timestamp: number;
  streaming?: boolean;
}

export interface ChatSession {
  id: string;
  name: string;
  workspaceId?: string;
  updatedAt: number;
  preview?: string;
}

export interface AgentInfo {
  name: string;
  emoji: string;
  color: string;
  model: string;
  enabled: boolean;
  supportsThinking?: boolean;
  mode?: "chat" | "think";
  messageCount?: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type ChatMode = "chat" | "cowork";
