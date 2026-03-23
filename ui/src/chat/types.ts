export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  agentName?: string;
  agentColor?: string;
  agentEmoji?: string;
  content: string;
  timestamp: number;
  streaming?: boolean;
  thinking?: boolean;
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
  description?: string;
  skills?: string[];
  type?: string;
  supportsThinking?: boolean;
  mode?: "chat" | "think";
  messageCount?: number;
  supportsImage?: boolean;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type ChatMode = "chat" | "cowork" | "settings";

export interface WorkspaceInfo {
  id: string;
  name: string;
  sessionCount?: number;
}

export interface WorkspaceDetail extends WorkspaceInfo {
  instructions: string;
  files: string[];          // filenames
  defaultAgents: string[];  // agent names
}

export interface SkillInfo {
  slug: string;
  name: string;
  description: string;
  source?: string;
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  agents: string[];
  systemPrompt?: string;
  topicHint?: string;
}

export interface SessionPage {
  sessions: ChatSession[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Settings types ──────────────────────────────────────────
export interface ModelInfo {
  id: string;
  type: "cli" | "api" | "ollama";
  label?: string;
  emoji?: string;
  color?: string;
  cmd?: string[];
  baseUrl?: string;
  apiModel?: string;
  supports_image?: boolean;
  supports_thinking?: boolean;
  idle_timeout_seconds?: number;
  startup_timeout_seconds?: number;
}

export interface AgentDetail {
  name: string;
  emoji: string;
  color: string;
  description: string;
  model: string;
  skills: string[];
  enabled: boolean;
  supports_thinking?: boolean;
}

export interface MarketplaceAgent {
  id: string;
  emoji: string;
  color: string;
  description: string;
  installed: boolean;
}

export interface MarketplaceAgentDetail extends MarketplaceAgent {
  agent_md: string;
  identity_md: string;
  soul_md: string;
}

export interface SkillDetail {
  slug: string;
  name: string;
  description: string;
  body: string;
  source?: string;
  source_url?: string;
  source_version?: string;
}

export interface MdContent {
  content: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}
