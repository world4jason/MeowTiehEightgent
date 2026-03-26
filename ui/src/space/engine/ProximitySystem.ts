import type { AgentPosition, PlayerState } from "../types";

export class ProximitySystem {
  private previouslyInRange = new Set<string>();
  public onEnter?: (agentName: string) => void;
  public onLeave?: (agentName: string) => void;

  constructor(private radius: number) {}

  getAgentsInRange(player: PlayerState, agents: AgentPosition[]): string[] {
    return agents
      .filter((a) => {
        const dx = player.x - a.x;
        const dy = player.y - a.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius;
      })
      .map((a) => a.name);
  }

  update(player: PlayerState, agents: AgentPosition[]): string[] {
    const currentlyInRange = new Set(this.getAgentsInRange(player, agents));

    for (const name of currentlyInRange) {
      if (!this.previouslyInRange.has(name)) {
        this.onEnter?.(name);
      }
    }

    for (const name of this.previouslyInRange) {
      if (!currentlyInRange.has(name)) {
        this.onLeave?.(name);
      }
    }

    this.previouslyInRange = currentlyInRange;
    return [...currentlyInRange];
  }
}
