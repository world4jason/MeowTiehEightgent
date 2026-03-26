export interface PlayerState {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

export interface AgentPosition {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  status: "idle" | "chatting" | "working";
  currentTask?: string;
}

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  spawnPoint: { x: number; y: number };
}

export const DEFAULT_SPAWN = { x: 10, y: 12 } as const;
export const PROXIMITY_RADIUS = 3; // tiles
export const TILE_SIZE = 32; // px
