// ui/src/chat/ChatPage.tsx — full rewrite
import { useState, useCallback, useEffect, useRef } from "react";
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
  useSkillsList, useScenarios, useSessionSummary, useRecompressSession,
} from "./hooks/useChatApi";
import { SummaryCard } from "./SummaryCard";
import { ChatMessage, AgentInfo } from "./types";
import { applyTokenMessage, applyDoneMessage, applyStreamStart, applyChunkMessage, applyMessageEnd, applyThinking, toHistoryChatMessage, applyTokenUpdate, applyReadyMessage, TokenUsageMap } from "./utils";

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000";
const WS_BASE = CHAT_URL.replace(/^http/, "ws");

export function ChatPage({ isVisible = true, onOpenSettings }: { isVisible?: boolean; onOpenSettings?: () => void }) {
  const { activeSessionId, setActiveSessionId, messages, setMessages, agents, setAgents, setHasUnreadChat, wsRef } = useChatContext();
  const [membersOpen, setMembersOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [agentRuns, setAgentRuns] = useState<{ agentName: string; tokens?: number }[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageMap>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [rounds, setRounds] = useState(2);
  const [paused, setPaused] = useState(false);
  const [topic, setTopic] = useState("");
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Refs to avoid stale closures in useCallback
  const autoModeRef = useRef(autoMode);
  autoModeRef.current = autoMode;
  const roundsRef = useRef(rounds);
  roundsRef.current = rounds;

  // Data queries
  const { data: allAgents = [] } = useAgentsList();
  const { data: workspaces = [] } = useWorkspaces();
  const sessionsQuery = useSessions();
  const { data: skills = [] } = useSkillsList();
  const { data: scenarios = [] } = useScenarios();
  const { data: summaryData } = useSessionSummary(activeSessionId);
  const recompress = useRecompressSession();

  // Flatten paginated sessions
  const sessions = sessionsQuery.data?.pages.flatMap((p) => p.sessions) ?? [];

  // Mutations
  const createSession = useCreateSession();
  const renameSession = useRenameSession();
  const deleteSession = useDeleteSession();
  const moveSession = useMoveSession();

  // Keep a ref to allAgents so onOpen always sends the latest list
  const allAgentsRef = useRef<typeof allAgents>([]);
  allAgentsRef.current = allAgents;

  // WS message handler
  const handleMessage = useCallback((data: unknown) => {
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
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "chunk") {
      const agentName = String(msg.agent ?? "");
      const text = String(msg.text ?? msg.content ?? "");
      setMessages((prev) => applyChunkMessage(prev, agentName, text));
    } else if (msg.type === "message_end") {
      const agentName = String(msg.agent ?? "");
      setMessages((prev) => applyMessageEnd(prev, agentName));
    } else if (msg.type === "token" ) {
      // Legacy token messages
      setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? msg.text ?? "")));
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages(applyDoneMessage);
    } else if (msg.type === "message" && String(msg.agent ?? "") !== "Human") {
      // Final full message (fallback if no stream_start/chunk flow)
      const agentName = String(msg.agent ?? "");
      const text = String(msg.text ?? msg.content ?? "");
      setMessages((prev) => {
        // If already have a streaming message for this agent, finalize it
        const idx = [...prev].reverse().findIndex(m => m.streaming && m.agentName === agentName);
        if (idx >= 0) return applyMessageEnd(prev, agentName);
        // Otherwise add as completed message
        return [...prev, { id: crypto.randomUUID(), role: "agent", agentName, agentColor: msg.color ? String(msg.color) : undefined, content: text, timestamp: Date.now(), streaming: false }];
      });
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
    } else if (msg.type === "ready") {
      const { paused: nextPaused } = applyReadyMessage(msg);
      setPaused(nextPaused);
    }
  }, [isVisible, setHasUnreadChat, setMessages, setAgents]);

  // Use query param for reconnect detection; backend matches /ws and ignores ?s=
  const wsUrl = activeSessionId ? `${WS_BASE}/ws?s=${activeSessionId}` : null;

  // Reset connection state when session changes
  useEffect(() => {
    setWsConnected(false);
  }, [activeSessionId]);

  // On WS open: send the start/resume message with all available agents
  const handleOpen = useCallback(() => {
    if (!activeSessionId || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      topic: "",
      agents: allAgentsRef.current.map((a) => a.name),
      resume_from: activeSessionId,
      auto: autoModeRef.current,
      rounds: roundsRef.current,
    }));
    setWsConnected(true);
  }, [activeSessionId, wsRef]);

  useWebSocket(wsUrl, wsRef, handleMessage, handleOpen);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); setTopic(""); return; }
    fetch(`${CHAT_URL}/sessions/${activeSessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) { setMessages([]); setTopic(""); return; }
        const raw = data as Record<string, unknown>[];
        // Extract topic from first system message
        const systemMsg = raw.find((m) => m.type === "system");
        setTopic(systemMsg ? String(systemMsg.text ?? "") : "");
        // Filter out system messages for the chat display
        setMessages(raw.filter((m) => m.type !== "system").map(toHistoryChatMessage));
      })
      .catch(() => { setMessages([]); setTopic(""); });
  }, [activeSessionId, setMessages]);

  function handleSend(payload: SendPayload) {
    if (!wsRef.current || !activeSessionId) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: "user", content: payload.text, timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    wsRef.current.send(JSON.stringify({
      type: "human",
      text: payload.text,
      images: payload.images?.length ? payload.images : undefined,
    }));
  }

  // P2-13: Queue a message for later delivery (when agent is streaming)
  function handleQueueMessage(text: string) {
    setMessageQueue((prev) => [...prev, text]);
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: "stop" }));
  }

  function handleNext() {
    wsRef.current?.send(JSON.stringify({ type: "next" }));
    setPaused(false);
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
    if (createSession.isPending) return; // debounce: prevent duplicate creation
    const s = await createSession.mutateAsync(workspaceId);
    setActiveSessionId(s.id);
    setMessages([]);
  }

  async function handleScenarioStart(config: { agents: string[]; systemPrompt?: string; topic?: string; workspaceId?: string }) {
    const s = await createSession.mutateAsync(config.workspaceId);
    setActiveSessionId(s.id);
    setMessages([]);
    // Brief delay to let WS connect, then send system setup
    setTimeout(() => {
      const { workspaceId: _wid, ...scenarioPayload } = config;
      wsRef.current?.send(JSON.stringify({ type: "scenario_start", ...scenarioPayload }));
    }, 300);
  }

  const showWelcome = !activeSessionId;
  const isConnected = wsConnected;
  const isStreaming = messages.some((m) => m.streaming || m.thinking);

  // P2-13: When streaming stops, drain the queue one message at a time
  const prevIsStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (prevIsStreamingRef.current && !isStreaming && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      handleSend({ text: next });
    }
    prevIsStreamingRef.current = isStreaming;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <SessionSidebar
        workspaces={workspaces}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => { setActiveSessionId(id); setMessages([]); setAgentRuns([]); setTokenUsage({}); setTopic(""); }}
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
            topic={topic}
          />
        )}

        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            {showWelcome ? (
              <WelcomeScreen
                agents={allAgents}
                scenarios={scenarios}
                workspaces={workspaces}
                onStartSession={handleScenarioStart}
                onSelectAgents={() => {}}
                autoMode={autoMode}
                onAutoModeChange={setAutoMode}
                rounds={rounds}
                onRoundsChange={setRounds}
              />
            ) : (
              <>
                {summaryData?.exists && activeSessionId && (
                  <SummaryCard
                    sessionId={activeSessionId}
                    summary={summaryData}
                    onRecompress={async (hint) => {
                      await recompress.mutateAsync({ sessionId: activeSessionId, hint });
                    }}
                    isRecompressing={recompress.isPending}
                  />
                )}
                <MessageList messages={messages} />
              </>
            )}

            {!showWelcome && (
              <ChatInputArea
                skills={skills}
                agents={allAgents}
                onSend={handleSend}
                disabled={!isConnected}
                supportsImage={allAgents.some((a) => a.name === agents[0]?.name && a.supportsImage)}
                isStreaming={isStreaming}
                onStop={handleStop}
                paused={paused}
                onNext={handleNext}
                autoMode={autoMode}
                onToggleMode={() => setAutoMode((v) => !v)}
                rounds={rounds}
                onQueueMessage={handleQueueMessage}
                queueLength={messageQueue.length}
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
