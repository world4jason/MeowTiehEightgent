import { useCallback, useRef } from "react";
import { useSpace } from "../SpaceContext";
import { chatClient } from "../../chat/chatClient";
import type { AgentInfo } from "../../chat/types";

/**
 * Bridges proximity events to session management.
 * - Proximity enter → show preview
 * - User presses Enter/clicks → create or load session → open ChatPanel
 */
export function useProximity(allAgents: AgentInfo[]) {
  const {
    proximityAgents,
    setProximityAgents,
    activeSessionId,
    setActiveSessionId,
    interactingAgent,
    setInteractingAgent,
    agentPositions,
  } = useSpace();

  const closestAgent = proximityAgents.length > 0 ? proximityAgents[0] : null;
  const closestAgentPosition = agentPositions.find((a) => a.name === closestAgent) ?? null;

  const sessionCache = useRef<Map<string, string>>(new Map());

  const startInteraction = useCallback(async () => {
    if (!closestAgent) return;

    const cached = sessionCache.current.get(closestAgent);
    if (cached) {
      setActiveSessionId(cached);
      setInteractingAgent(closestAgent);
      return;
    }

    try {
      const result = await chatClient.post<{ id: string; name: string }>("/sessions", {});
      sessionCache.current.set(closestAgent, result.id);
      setActiveSessionId(result.id);
      setInteractingAgent(closestAgent);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  }, [closestAgent, setActiveSessionId, setInteractingAgent]);

  const endInteraction = useCallback(() => {
    setInteractingAgent(null);
  }, [setInteractingAgent]);

  const interactingAgents: AgentInfo[] = interactingAgent
    ? allAgents.filter((a) => proximityAgents.includes(a.name))
    : [];

  return {
    closestAgent: closestAgentPosition,
    isShowingPreview: closestAgent !== null && interactingAgent === null,
    isShowingChat: interactingAgent !== null && activeSessionId !== null,
    interactingAgents,
    startInteraction,
    endInteraction,
  };
}
