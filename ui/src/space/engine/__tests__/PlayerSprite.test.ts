import { describe, it, expect } from "vitest";
import { computeNextPosition, type MoveInput } from "../PlayerSprite";
import { TileMap, type TiledMapData } from "../TileMap";

const MOCK_MAP: TiledMapData = {
  width: 10,
  height: 10,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { name: "ground", type: "tilelayer", width: 10, height: 10, data: Array(100).fill(1) },
    {
      name: "walls",
      type: "tilelayer",
      width: 10,
      height: 10,
      data: (() => {
        const d = Array(100).fill(0);
        for (let x = 0; x < 10; x++) { d[x] = 2; d[90 + x] = 2; }
        for (let y = 0; y < 10; y++) { d[y * 10] = 2; d[y * 10 + 9] = 2; }
        return d;
      })(),
    },
  ],
  tilesets: [],
};

describe("computeNextPosition", () => {
  const map = new TileMap(MOCK_MAP);

  it("moves right when pressing right", () => {
    const input: MoveInput = { up: false, down: false, left: false, right: true };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toEqual({ x: 6, y: 5, direction: "right" });
  });

  it("moves diagonally", () => {
    const input: MoveInput = { up: true, down: false, left: false, right: true };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toEqual({ x: 6, y: 4, direction: "right" });
  });

  it("blocks movement into walls", () => {
    const input: MoveInput = { up: false, down: false, left: true, right: false };
    const result = computeNextPosition(1, 5, input, map);
    expect(result).toEqual({ x: 1, y: 5, direction: "left" });
  });

  it("returns null direction when no keys pressed", () => {
    const input: MoveInput = { up: false, down: false, left: false, right: false };
    const result = computeNextPosition(5, 5, input, map);
    expect(result).toBeNull();
  });
});
