import { Application, Graphics } from "pixi.js";
import { TileMap, loadMapData } from "./TileMap";
import { PlayerSpriteView, computeNextPosition, type MoveInput } from "./PlayerSprite";
import { AgentSpriteView } from "./AgentSprite";
import { ProximitySystem } from "./ProximitySystem";
import { TILE_SIZE, PROXIMITY_RADIUS, DEFAULT_SPAWN } from "../types";
import type { AgentPosition, PlayerState } from "../types";

export interface SpaceEngineCallbacks {
  onPlayerMove: (x: number, y: number, direction: PlayerState["direction"]) => void;
  onProximityEnter: (agentName: string) => void;
  onProximityLeave: (agentName: string) => void;
  onProximityChange: (agents: string[]) => void;
}

export class SpaceEngine {
  private app: Application;
  private tileMap: TileMap | null = null;
  private playerView: PlayerSpriteView;
  private agentViews = new Map<string, AgentSpriteView>();
  private proximitySystem: ProximitySystem;
  private keys: MoveInput = { up: false, down: false, left: false, right: false };
  private playerPos: PlayerState;
  private moveInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: SpaceEngineCallbacks;
  private groundGraphics: Graphics | null = null;

  constructor(callbacks: SpaceEngineCallbacks) {
    this.app = new Application();
    this.callbacks = callbacks;
    this.playerPos = { x: DEFAULT_SPAWN.x, y: DEFAULT_SPAWN.y, direction: "down" };
    this.playerView = new PlayerSpriteView();
    this.proximitySystem = new ProximitySystem(PROXIMITY_RADIUS);

    this.proximitySystem.onEnter = (name) => callbacks.onProximityEnter(name);
    this.proximitySystem.onLeave = (name) => callbacks.onProximityLeave(name);
  }

  async init(container: HTMLElement): Promise<void> {
    const mapData = await loadMapData("/maps/default/map.json");
    this.tileMap = new TileMap(mapData);

    // Size canvas to map dimensions, capped by container
    const mapPxW = this.tileMap.pixelWidth;
    const mapPxH = this.tileMap.pixelHeight;
    const cw = container.clientWidth || mapPxW;
    const ch = container.clientHeight || mapPxH;
    const canvasW = Math.min(mapPxW, cw);
    const canvasH = Math.min(mapPxH, ch);

    await this.app.init({
      width: canvasW,
      height: canvasH,
      backgroundColor: 0x1a1a2e,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    container.appendChild(this.app.canvas);

    this.drawTiles();

    this.playerView.setTilePosition(this.playerPos.x, this.playerPos.y);
    this.app.stage.addChild(this.playerView);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.moveInterval = setInterval(() => this.tick(), 150);
  }

  private drawTiles() {
    if (!this.tileMap) return;
    this.groundGraphics = new Graphics();

    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        const isWall = !this.tileMap.isWalkable(x, y);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        this.groundGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
        this.groundGraphics.fill({ color: isWall ? 0x2d2d44 : 0x16213e });
        this.groundGraphics.rect(px, py, TILE_SIZE, TILE_SIZE);
        this.groundGraphics.stroke({ color: 0x1a1a2e, width: 1 });
      }
    }

    this.app.stage.addChildAt(this.groundGraphics, 0);
  }

  setAgents(agents: AgentPosition[]) {
    for (const [name, view] of this.agentViews) {
      if (!agents.find((a) => a.name === name)) {
        this.app.stage.removeChild(view);
        view.destroy();
        this.agentViews.delete(name);
      }
    }

    for (const agent of agents) {
      let view = this.agentViews.get(agent.name);
      if (!view) {
        view = new AgentSpriteView(agent);
        this.agentViews.set(agent.name, view);
        this.app.stage.addChild(view);
      }
      view.setTilePosition(agent.x, agent.y);
      view.updateStatus(agent.status, agent.currentTask);
    }
  }

  updateAgentStatus(agentName: string, status: AgentPosition["status"], task?: string) {
    const view = this.agentViews.get(agentName);
    if (view) view.updateStatus(status, task);
  }

  showAgentNotification(agentName: string, text: string) {
    const view = this.agentViews.get(agentName);
    if (view) view.showNotification(text);
  }

  highlightAgent(agentName: string, on: boolean) {
    const view = this.agentViews.get(agentName);
    if (view) view.setHighlight(on);
  }

  private tick() {
    if (!this.tileMap) return;

    const result = computeNextPosition(
      this.playerPos.x,
      this.playerPos.y,
      this.keys,
      this.tileMap,
    );

    if (!result) return;
    if (result.x === this.playerPos.x && result.y === this.playerPos.y && result.direction === this.playerPos.direction) return;

    this.playerPos = result;
    this.playerView.setTilePosition(result.x, result.y);
    this.callbacks.onPlayerMove(result.x, result.y, result.direction);

    const agentPositions = [...this.agentViews.values()].map((v) => v.agentData);
    const inRange = this.proximitySystem.update(this.playerPos, agentPositions);
    this.callbacks.onProximityChange(inRange);

    for (const [name, view] of this.agentViews) {
      view.setHighlight(inRange.includes(name));
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case "ArrowUp": case "w": case "W": this.keys.up = true; break;
      case "ArrowDown": case "s": case "S": this.keys.down = true; break;
      case "ArrowLeft": case "a": case "A": this.keys.left = true; break;
      case "ArrowRight": case "d": case "D": this.keys.right = true; break;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp": case "w": case "W": this.keys.up = false; break;
      case "ArrowDown": case "s": case "S": this.keys.down = false; break;
      case "ArrowLeft": case "a": case "A": this.keys.left = false; break;
      case "ArrowRight": case "d": case "D": this.keys.right = false; break;
    }
  };

  destroy() {
    if (this.moveInterval) clearInterval(this.moveInterval);
    this.moveInterval = null;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    try {
      this.app.destroy(true);
    } catch {
      // PixiJS v8 destroy can throw if init was incomplete
    }
  }
}
