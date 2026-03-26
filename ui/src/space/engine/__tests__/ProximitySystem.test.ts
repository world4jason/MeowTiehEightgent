import { describe, it, expect, vi } from "vitest";
import { ProximitySystem } from "../ProximitySystem";
import type { AgentPosition, PlayerState } from "../../types";

function makeAgent(name: string, x: number, y: number): AgentPosition {
  return { agentId: name, name, emoji: "🤖", color: "#000", x, y, status: "idle" };
}

describe("ProximitySystem", () => {
  it("detects agents within radius", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 5, 5), makeAgent("Gemini", 20, 20)];
    const player: PlayerState = { x: 4, y: 5, direction: "right" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual(["Claude"]);
  });

  it("returns empty when no agents nearby", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 20, 20)];
    const player: PlayerState = { x: 0, y: 0, direction: "down" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual([]);
  });

  it("detects multiple agents in range", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 5, 5), makeAgent("Gemini", 6, 5)];
    const player: PlayerState = { x: 5, y: 4, direction: "down" };

    const nearby = system.getAgentsInRange(player, agents);
    expect(nearby).toEqual(["Claude", "Gemini"]);
  });

  it("fires enter/leave callbacks", () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const system = new ProximitySystem(3);
    system.onEnter = onEnter;
    system.onLeave = onLeave;

    const agents = [makeAgent("Claude", 5, 5)];

    // Move into range
    system.update({ x: 4, y: 5, direction: "right" }, agents);
    expect(onEnter).toHaveBeenCalledWith("Claude");
    expect(onLeave).not.toHaveBeenCalled();

    // Stay in range — no re-fire
    onEnter.mockClear();
    system.update({ x: 5, y: 5, direction: "right" }, agents);
    expect(onEnter).not.toHaveBeenCalled();

    // Move out of range
    system.update({ x: 20, y: 20, direction: "right" }, agents);
    expect(onLeave).toHaveBeenCalledWith("Claude");
  });

  it("uses Euclidean distance", () => {
    const system = new ProximitySystem(3);
    const agents = [makeAgent("Claude", 0, 0)];
    // Distance = sqrt(2*2 + 2*2) = 2.83 → within 3
    expect(system.getAgentsInRange({ x: 2, y: 2, direction: "down" }, agents)).toEqual(["Claude"]);
    // Distance = sqrt(3*3 + 3*3) = 4.24 → outside 3
    expect(system.getAgentsInRange({ x: 3, y: 3, direction: "down" }, agents)).toEqual([]);
  });
});
