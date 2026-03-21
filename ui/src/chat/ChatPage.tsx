import { useState, useCallback, useEffect } from "react";
import { useChatContext } from "../context/ChatContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { SessionSidebar } from "./SessionSidebar";
import { MessageList } from "./MessageList";
import { AgentMembers } from "./AgentMembers";
import { ChatMessage } from "./types";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const WS_BASE = CHAT_URL.replace(/^http/, "ws");

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

export function ChatPage({ isVisible = true }: { isVisible?: boolean }) {
  const {
    sessions, setSessions, activeSessionId, setActiveSessionId,
    messages, setMessages, agents, setAgents,
    setHasUnreadChat, wsRef,
  } = useChatContext();

  const [input, setInput] = useState("");

  useEffect(() => {
    fetch(`${CHAT_URL}/sessions?limit=50`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [setSessions]);

  const wsUrl = activeSessionId ? `${WS_BASE}/ws/${activeSessionId}` : null;

  const handleMessage = useCallback((data: unknown) => {
    if (typeof data !== "object" || !data) return;
    const msg = data as Record<string, unknown>;

    if (msg.type === "token" || msg.type === "chunk") {
      setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? "")));
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages(applyDoneMessage);
    } else if (msg.type === "agents") {
      setAgents(msg.agents as typeof agents);
    }
  }, [isVisible, setHasUnreadChat, setMessages, setAgents]);

  useWebSocket(wsUrl, wsRef, handleMessage);

  function handleAgentModeChange(agentName: string, mode: "chat" | "think") {
    setAgents((prev) => prev.map((a) => a.name === agentName ? { ...a, mode } : a));
    wsRef.current?.send(JSON.stringify({ type: "set_mode", agent: agentName, mode }));
  }

  function sendMessage() {
    if (!input.trim() || !wsRef.current) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: input, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify({ type: "message", text: input }));
    setInput("");
  }

  return (
    <div className="flex h-full">
      <SessionSidebar
        workspaces={[]}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={() => setActiveSessionId(null)}
        onNewSessionInWorkspace={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onMoveSession={() => {}}
        onOpenSettings={() => {}}
      />
      <div className="flex flex-1 flex-col">
        <MessageList messages={messages} />
        <div className="border-t border-border p-3 flex gap-2">
          <input
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Message agents…"
          />
          <button
            onClick={sendMessage}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send
          </button>
        </div>
      </div>
      <div className="w-48 border-l border-border">
        <AgentMembers agents={agents} onModeChange={handleAgentModeChange} />
      </div>
    </div>
  );
}
