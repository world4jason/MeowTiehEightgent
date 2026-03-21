// ui/src/chat/ChatPage.tsx — full rewrite
import { useState, useCallback, useEffect } from "react";
import { useChatContext } from "../context/ChatContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { SessionSidebar } from "./SessionSidebar";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MembersPanel } from "./MembersPanel";
import { RunsPanel } from "./RunsPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { ChatInputArea, SendPayload } from "./ChatInputArea";
import {
  useAgentsList, useWorkspaces, useSessions,
  useCreateSession, useRenameSession, useDeleteSession, useMoveSession,
  useSkillsList, useScenarios,
} from "./hooks/useChatApi";
import { ChatMessage, AgentInfo } from "./types";
import { applyTokenMessage, applyDoneMessage, toHistoryChatMessage, applyTokenUpdate, TokenUsageMap } from "./utils";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const WS_BASE = CHAT_URL.replace(/^http/, "ws");

export function ChatPage({ isVisible = true, onOpenSettings }: { isVisible?: boolean; onOpenSettings?: () => void }) {
  const { activeSessionId, setActiveSessionId, messages, setMessages, agents, setAgents, setHasUnreadChat, wsRef } = useChatContext();
  const [membersOpen, setMembersOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [agentRuns, setAgentRuns] = useState<{ agentName: string; tokens?: number }[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageMap>({});

  // Data queries
  const { data: allAgents = [] } = useAgentsList();
  const { data: workspaces = [] } = useWorkspaces();
  const sessionsQuery = useSessions();
  const { data: skills = [] } = useSkillsList();
  const { data: scenarios = [] } = useScenarios();

  // Flatten paginated sessions
  const sessions = sessionsQuery.data?.pages.flatMap((p) => p.sessions) ?? [];

  // Mutations
  const createSession = useCreateSession();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();
  const moveSession = useMoveSession();

  // WS message handler
  const handleMessage = useCallback((data: unknown) => {
    if (typeof data !== "object" || !data) return;
    const msg = data as Record<string, unknown>;
    if (msg.type === "token" || msg.type === "chunk") {
      setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? "")));
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages(applyDoneMessage);
    } else if (msg.type === "agents") {
      setAgents(msg.agents as AgentInfo[]);
    } else if (msg.type === "token_usage") {
      const { agent: name, tokens } = msg as { agent: string; tokens: number };
      setAgentRuns((prev) => {
        const idx = prev.findIndex((r) => r.agentName === name);
        if (idx >= 0) return prev.map((r, i) => i === idx ? { ...r, tokens } : r);
        return [...prev, { agentName: name, tokens }];
      });
    } else if (msg.type === "token_update") {
      const { agent: name, cumulative } = msg as { agent: string; cumulative: { input: number; output: number } };
      setTokenUsage((prev) => applyTokenUpdate(prev, name, cumulative));
    }
  }, [isVisible, setHasUnreadChat, setMessages, setAgents]);

  const wsUrl = activeSessionId ? `${WS_BASE}/ws/${activeSessionId}` : null;
  useWebSocket(wsUrl, wsRef, handleMessage);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    fetch(`${CHAT_URL}/sessions/${activeSessionId}`)
      .then((r) => r.json())
      .then((data) =>
        setMessages(Array.isArray(data) ? (data as Record<string, unknown>[]).map(toHistoryChatMessage) : [])
      )
      .catch(() => setMessages([]));
  }, [activeSessionId, setMessages]);

  function handleSend(payload: SendPayload) {
    if (!wsRef.current || !activeSessionId) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: payload.text, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify({
      type: "message",
      text: payload.text,
      images: payload.images?.length ? payload.images : undefined,
    }));
  }

  function handleModeChange(agentName: string, mode: "chat" | "think") {
    setAgents((prev) => prev.map((a) => a.name === agentName ? { ...a, mode } : a));
    wsRef.current?.send(JSON.stringify({ type: "set_mode", agent: agentName, mode }));
  }

  function handleAddAgent(agentName: string) {
    wsRef.current?.send(JSON.stringify({ type: "add_agent", agent: agentName }));
  }

  function handleRemoveAgent(agentName: string) {
    wsRef.current?.send(JSON.stringify({ type: "remove_agent", agent: agentName }));
    setAgents((prev) => prev.filter((a) => a.name !== agentName));
  }

  async function handleNewSession(workspaceId?: string) {
    const s = await createSession.mutateAsync(workspaceId);
    setActiveSessionId(s.id);
    setMessages([]);
  }

  async function handleScenarioStart(scenario: { agents: string[]; systemPrompt?: string }) {
    const s = await createSession.mutateAsync(undefined);
    setActiveSessionId(s.id);
    setMessages([]);
    // Brief delay to let WS connect, then send system setup
    setTimeout(() => {
      wsRef.current?.send(JSON.stringify({ type: "scenario_start", ...scenario }));
    }, 300);
  }

  const showWelcome = !activeSessionId;
  const isConnected = wsRef.current?.readyState === WebSocket.OPEN;

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <SessionSidebar
        workspaces={workspaces}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => { setActiveSessionId(id); setMessages([]); setAgentRuns([]); setTokenUsage({}); }}
        onNewSession={() => handleNewSession()}
        onNewSessionInWorkspace={handleNewSession}
        onRenameSession={(id, name) => renameSession.mutate({ id, name })}
        onDeleteSession={(id) => { deleteSession.mutate(id); if (id === activeSessionId) { setActiveSessionId(null); setMessages([]); } }}
        onMoveSession={(id, workspaceId) => moveSession.mutate({ id, workspaceId })}
        onOpenSettings={() => onOpenSettings?.()}
      />

      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        {!showWelcome && (
          <ChatHeader
            agents={agents}
            membersOpen={membersOpen}
            runsOpen={runsOpen}
            onToggleMembers={() => setMembersOpen((o) => !o)}
            onToggleRuns={() => setRunsOpen((o) => !o)}
          />
        )}

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            {showWelcome ? (
              <WelcomeScreen
                agents={allAgents}
                scenarios={scenarios}
                onStartSession={handleScenarioStart}
                onSelectAgents={() => {}}
              />
            ) : (
              <MessageList messages={messages} />
            )}

            {!showWelcome && (
              <ChatInputArea
                skills={skills}
                agents={allAgents}
                onSend={handleSend}
                disabled={!isConnected}
                supportsImage={allAgents.some((a) => a.name === agents[0]?.name && a.supportsImage)}
              />
            )}
          </main>

          <RunsPanel
            open={runsOpen}
            membersOpen={membersOpen}
            agents={agents}
            runs={agentRuns}
            onClose={() => setRunsOpen(false)}
          />
          <MembersPanel
            open={membersOpen}
            agents={agents}
            availableAgents={allAgents}
            onModeChange={handleModeChange}
            onAddAgent={handleAddAgent}
            onRemoveAgent={handleRemoveAgent}
            onClose={() => setMembersOpen(false)}
            tokenUsage={tokenUsage}
          />
        </div>
      </div>
    </div>
  );
}
