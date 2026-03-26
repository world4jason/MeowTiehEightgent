import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { PlayerState, AgentPosition } from "./types";
import { DEFAULT_SPAWN } from "./types";

interface SpaceContextValue {
  localPlayer: PlayerState;
  movePlayer: (x: number, y: number, direction: PlayerState["direction"]) => void;
  agentPositions: AgentPosition[];
  setAgentPositions: (agents: AgentPosition[]) => void;
  proximityAgents: string[];
  setProximityAgents: (agents: string[]) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  interactingAgent: string | null;
  setInteractingAgent: (name: string | null) => void;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [localPlayer, setLocalPlayer] = useState<PlayerState>({
    x: DEFAULT_SPAWN.x,
    y: DEFAULT_SPAWN.y,
    direction: "down",
  });
  const [agentPositions, setAgentPositions] = useState<AgentPosition[]>([]);
  const [proximityAgents, setProximityAgents] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [interactingAgent, setInteractingAgent] = useState<string | null>(null);

  const movePlayer = useCallback(
    (x: number, y: number, direction: PlayerState["direction"]) => {
      setLocalPlayer({ x, y, direction });
    },
    [],
  );

  return (
    <SpaceContext.Provider
      value={{
        localPlayer,
        movePlayer,
        agentPositions,
        setAgentPositions,
        proximityAgents,
        setProximityAgents,
        activeSessionId,
        setActiveSessionId,
        interactingAgent,
        setInteractingAgent,
      }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export function useSpace(): SpaceContextValue {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
  return ctx;
}
