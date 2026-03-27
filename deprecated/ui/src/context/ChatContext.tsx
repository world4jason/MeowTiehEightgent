import { createContext, useContext, useRef, useState, ReactNode } from "react";
import { ChatMessage, ChatSession, AgentInfo, ConnectionStatus } from "../chat/types";

interface ChatContextValue {
  // Sessions
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  // Messages
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  // Agents
  agents: AgentInfo[];
  setAgents: React.Dispatch<React.SetStateAction<AgentInfo[]>>;
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (s: ConnectionStatus) => void;
  // Background badge (unread while in Cowork mode)
  hasUnreadChat: boolean;
  setHasUnreadChat: (v: boolean) => void;
  // WS ref (singleton, shared across mode switches)
  wsRef: React.MutableRefObject<WebSocket | null>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  return (
    <ChatContext.Provider value={{
      sessions, setSessions, activeSessionId, setActiveSessionId,
      messages, setMessages,
      agents, setAgents,
      connectionStatus, setConnectionStatus,
      hasUnreadChat, setHasUnreadChat,
      wsRef,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
