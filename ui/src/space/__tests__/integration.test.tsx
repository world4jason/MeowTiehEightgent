import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpaceProvider, useSpace } from "../SpaceContext";
import { ProximitySystem } from "../engine/ProximitySystem";
import type { AgentPosition } from "../types";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SpaceProvider>{children}</SpaceProvider>
);

describe("Space ↔ Chat Integration", () => {
  it("proximity system updates context proximity agents", () => {
    const system = new ProximitySystem(3);
    const agents: AgentPosition[] = [
      { agentId: "claude", name: "Claude", emoji: "🤖", color: "#7C3AED", x: 5, y: 5, status: "idle" },
    ];

    const { result } = renderHook(() => useSpace(), { wrapper });

    const inRange = system.update({ x: 4, y: 5, direction: "right" }, agents);
    act(() => {
      result.current.setProximityAgents(inRange);
    });

    expect(result.current.proximityAgents).toEqual(["Claude"]);
  });

  it("session id persists across proximity changes", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });

    act(() => {
      result.current.setActiveSessionId("session-abc");
      result.current.setInteractingAgent("Claude");
    });

    expect(result.current.activeSessionId).toBe("session-abc");
    expect(result.current.interactingAgent).toBe("Claude");

    act(() => {
      result.current.setInteractingAgent(null);
    });

    expect(result.current.activeSessionId).toBe("session-abc");
    expect(result.current.interactingAgent).toBeNull();
  });

  it("agent positions can be set and read", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });

    const agents: AgentPosition[] = [
      { agentId: "claude", name: "Claude", emoji: "🤖", color: "#7C3AED", x: 5, y: 5, status: "idle" },
      { agentId: "gemini", name: "Gemini", emoji: "🦎", color: "#34A853", x: 10, y: 3, status: "chatting" },
    ];

    act(() => {
      result.current.setAgentPositions(agents);
    });

    expect(result.current.agentPositions).toHaveLength(2);
    expect(result.current.agentPositions[0].name).toBe("Claude");
    expect(result.current.agentPositions[1].status).toBe("chatting");
  });
});
