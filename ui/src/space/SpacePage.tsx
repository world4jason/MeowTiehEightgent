import { Component, useEffect, useRef, useCallback, type ReactNode } from "react";
import { SpaceEngine } from "./engine/SpaceEngine";
import { SpaceProvider, useSpace } from "./SpaceContext";
import { AgentPreview } from "./components/AgentPreview";
import { SpaceChatPanel } from "./components/SpaceChatPanel";
import { useProximity } from "./hooks/useProximity";
import { useSpaceWs } from "./hooks/useSpaceWs";
import { useAgentsList } from "../chat/hooks/useChatApi";
import type { AgentPosition } from "./types";

class SpaceErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-muted-foreground">
          <p className="text-lg font-medium">Space mode 載入失敗</p>
          <p className="text-sm">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            重試
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SpaceContent({ isVisible }: { isVisible: boolean }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SpaceEngine | null>(null);
  const { movePlayer, setProximityAgents, setAgentPositions } = useSpace();

  const { data: agents = [] } = useAgentsList();
  const enabledAgents = agents.filter((a) => a.enabled);

  const { handleAgentStatus, handleCoworkUpdate } = useSpaceWs(
    engineRef as React.MutableRefObject<SpaceEngine | null>,
  );

  const {
    closestAgent,
    isShowingPreview,
    isShowingChat,
    interactingAgents,
    startInteraction,
    endInteraction,
  } = useProximity(enabledAgents);

  const handleCoworkUpdateBridge = useCallback(
    (event: string, data: Record<string, unknown>) => {
      const issueId = String(data.issueId ?? data.issue_id ?? "");
      const title = String(data.title ?? "");
      const agentName = data.agentName ? String(data.agentName) : undefined;
      handleCoworkUpdate(event, issueId, title, agentName);
    },
    [handleCoworkUpdate],
  );

  // Initialize engine only when visible + not yet initialized
  useEffect(() => {
    if (!isVisible || !canvasRef.current || engineRef.current) return;
    let cancelled = false;

    const engine = new SpaceEngine({
      onPlayerMove: (x, y, dir) => movePlayer(x, y, dir),
      onProximityEnter: () => {},
      onProximityLeave: () => {},
      onProximityChange: (names) => setProximityAgents(names),
    });

    engine.init(canvasRef.current).then(() => {
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      // Sync agents after engine is ready
      const positions: AgentPosition[] = enabledAgents.map((agent, i) => {
        const col = (i % 4) * 4 + 3;
        const row = Math.floor(i / 4) * 3 + 3;
        return {
          agentId: agent.name,
          name: agent.name,
          emoji: agent.emoji,
          color: agent.color,
          x: col,
          y: row,
          status: "idle" as const,
        };
      });
      setAgentPositions(positions);
      engine.setAgents(positions);
    }).catch((err) => {
      console.error("SpaceEngine init failed:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [isVisible, movePlayer, setProximityAgents, enabledAgents, setAgentPositions]);

  // Cleanup engine on unmount only
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  // Sync agents when they change (and engine already exists)
  useEffect(() => {
    if (!engineRef.current || enabledAgents.length === 0) return;

    const positions: AgentPosition[] = enabledAgents.map((agent, i) => {
      const col = (i % 4) * 4 + 3;
      const row = Math.floor(i / 4) * 3 + 3;
      return {
        agentId: agent.name,
        name: agent.name,
        emoji: agent.emoji,
        color: agent.color,
        x: col,
        y: row,
        status: "idle" as const,
      };
    });

    setAgentPositions(positions);
    engineRef.current.setAgents(positions);
  }, [enabledAgents, setAgentPositions]);

  // Handle Enter key for interaction, Escape to close (only when visible)
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && isShowingPreview && !isShowingChat) {
        e.preventDefault();
        startInteraction();
      }
      if (e.key === "Escape" && isShowingChat) {
        e.preventDefault();
        endInteraction();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isVisible, isShowingPreview, isShowingChat, startInteraction, endInteraction]);

  const { activeSessionId } = useSpace();

  return (
    <div className="flex h-full w-full">
      <div className="relative flex-1">
        <div ref={canvasRef} className="h-full w-full" />

        {isVisible && isShowingPreview && closestAgent && (
          <AgentPreview agent={closestAgent} onInteract={startInteraction} />
        )}
      </div>

      {isVisible && isShowingChat && activeSessionId && (
        <SpaceChatPanel
          sessionId={activeSessionId}
          agents={interactingAgents}
          onClose={endInteraction}
          onAgentStatus={handleAgentStatus}
          onCoworkUpdate={handleCoworkUpdateBridge}
        />
      )}
    </div>
  );
}

export function SpacePage({ isVisible = true }: { isVisible?: boolean }) {
  return (
    <SpaceErrorBoundary>
      <SpaceProvider>
        <SpaceContent isVisible={isVisible} />
      </SpaceProvider>
    </SpaceErrorBoundary>
  );
}
