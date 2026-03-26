import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { MessageList } from "@/chat/MessageList";
import { ChatInputArea, SendPayload } from "@/chat/ChatInputArea";
import { useWebSocket } from "@/hooks/useWebSocket";
import { chatClient } from "@/chat/chatClient";
import {
  applyThinking,
  applyStreamStart,
  applyChunkMessage,
  applyMessageEnd,
  toHistoryChatMessage,
} from "@/chat/utils";
import type { ChatMessage, AgentInfo } from "@/chat/types";

const CHAT_URL = (import.meta.env.VITE_CHAT_URL ?? "/chat/api") as string;
const WS_BASE = CHAT_URL.replace(/^http/, "ws");
const wsPath = import.meta.env.VITE_CHAT_WS === "node" ? "/chat/ws" : "/ws";
const CHAT_WS_BASE =
  import.meta.env.VITE_CHAT_WS === "node"
    ? `ws://${window.location.host}`
    : WS_BASE;

interface SpaceChatPanelProps {
  sessionId: string;
  agents: AgentInfo[];
  onClose: () => void;
  onAgentStatus?: (agentId: string, status: string) => void;
  onCoworkUpdate?: (event: string, data: Record<string, unknown>) => void;
}

export function SpaceChatPanel({
  sessionId,
  agents,
  onClose,
  onAgentStatus,
  onCoworkUpdate,
}: SpaceChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const agentsRef = useRef<AgentInfo[]>(agents);
  agentsRef.current = agents;

  const wsUrl = `${CHAT_WS_BASE}${wsPath}?s=${sessionId}`;

  // Load history on mount
  useEffect(() => {
    chatClient
      .get<Record<string, unknown>[]>(`/sessions/${sessionId}`)
      .then((data) => {
        if (!Array.isArray(data)) return;
        const history = (data as Record<string, unknown>[])
          .filter((m) => m.type !== "system")
          .map(toHistoryChatMessage);
        setMessages(history);
      })
      .catch(() => {
        // silently ignore — session may not have history yet
      });
  }, [sessionId]);

  const handleMessage = useCallback(
    (data: unknown) => {
      if (typeof data !== "object" || !data) return;
      const msg = data as Record<string, unknown>;

      if (msg.type === "thinking") {
        const agentName = String(msg.agent ?? "");
        const agentColor = msg.color ? String(msg.color) : undefined;
        setMessages((prev) => applyThinking(prev, agentName, agentColor));
      } else if (msg.type === "stream_start") {
        const agentName = String(msg.agent ?? "");
        const agentColor = msg.color ? String(msg.color) : undefined;
        setMessages((prev) => applyStreamStart(prev, agentName, agentColor));
        setIsStreaming(true);
      } else if (msg.type === "chunk") {
        const agentName = String(msg.agent ?? "");
        const text = String(msg.text ?? msg.content ?? "");
        setMessages((prev) => applyChunkMessage(prev, agentName, text));
      } else if (msg.type === "message_end") {
        const agentName = String(msg.agent ?? "");
        setMessages((prev) => applyMessageEnd(prev, agentName));
        setIsStreaming(false);
      } else if (msg.type === "agent:status") {
        const { agentId, status } = msg as { agentId: string; status: string };
        onAgentStatus?.(agentId, status);
      } else if (msg.type === "cowork:update") {
        const event = String(msg.event ?? "");
        onCoworkUpdate?.(event, msg);
      }
    },
    [onAgentStatus, onCoworkUpdate],
  );

  const handleOpen = useCallback(() => {
    if (!wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        agents: agentsRef.current.map((a) => a.name),
        resume_from: sessionId,
        auto: false,
        rounds: 1,
        silence: true,
      }),
    );
  }, [sessionId]);

  useWebSocket(wsUrl, wsRef, handleMessage, handleOpen);

  const handleSend = useCallback((payload: SendPayload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Optimistically add user message to UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: payload.text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    wsRef.current.send(
      JSON.stringify({
        type: "human",
        text: payload.text,
        images: payload.images,
      }),
    );
  }, []);

  return (
    <div className="h-full w-80 shrink-0 border-l border-border bg-background flex flex-col z-10 shadow-xl">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1 flex-1 overflow-hidden">
          {agents.slice(0, 4).map((a) => (
            <span key={a.name} className="text-lg" title={a.name}>
              {a.emoji}
            </span>
          ))}
          <span className="ml-1 truncate text-sm font-medium text-foreground">
            {agents.map((a) => a.name).join(", ")}
          </span>
        </div>
        <button
          aria-label="Close chat panel"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <MessageList messages={messages} />
      </div>

      {/* Input */}
      <ChatInputArea
        skills={[]}
        agents={agents}
        onSend={handleSend}
        disabled={false}
        isStreaming={isStreaming}
      />
    </div>
  );
}
