import { Container, Graphics, Text } from "pixi.js";
import type { TileMap } from "./TileMap";
import { TILE_SIZE } from "../types";

export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface MoveResult {
  x: number;
  y: number;
  direction: "up" | "down" | "left" | "right";
}

/**
 * Pure function: compute next tile position given input + collision map.
 * Returns null if no movement keys are pressed.
 */
export function computeNextPosition(
  currentX: number,
  currentY: number,
  input: MoveInput,
  map: TileMap,
): MoveResult | null {
  let dx = 0;
  let dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  if (dx === 0 && dy === 0) return null;

  let direction: MoveResult["direction"] = "down";
  if (dx > 0) direction = "right";
  else if (dx < 0) direction = "left";
  else if (dy < 0) direction = "up";
  else if (dy > 0) direction = "down";

  const newX = currentX + dx;
  const newY = currentY + dy;

  if (!map.isWalkable(newX, newY)) {
    if (dx !== 0 && map.isWalkable(currentX + dx, currentY)) {
      return { x: currentX + dx, y: currentY, direction };
    }
    if (dy !== 0 && map.isWalkable(currentX, currentY + dy)) {
      return { x: currentX, y: currentY + dy, direction };
    }
    return { x: currentX, y: currentY, direction };
  }

  return { x: newX, y: newY, direction };
}

/**
 * PixiJS visual representation of the player.
 */
export class PlayerSpriteView extends Container {
  private body: Graphics;
  private label: Text;

  constructor(nickname: string = "You") {
    super();
    this.body = new Graphics();
    this.body.circle(0, 0, TILE_SIZE * 0.4);
    this.body.fill({ color: 0x3b82f6 });
    this.addChild(this.body);

    this.label = new Text({
      text: `👤 ${nickname}`,
      style: { fontSize: 10, fill: 0xffffff },
    });
    this.label.anchor.set(0.5, 1);
    this.label.y = -TILE_SIZE * 0.5;
    this.addChild(this.label);
  }

  setTilePosition(tileX: number, tileY: number) {
    this.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  }
}
