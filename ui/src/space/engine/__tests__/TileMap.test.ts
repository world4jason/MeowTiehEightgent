import { describe, it, expect } from "vitest";
import { TileMap, type TiledMapData } from "../TileMap";

const MOCK_MAP: TiledMapData = {
  width: 20,
  height: 15,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    {
      name: "ground",
      type: "tilelayer",
      width: 20,
      height: 15,
      data: Array(300).fill(1),
    },
    {
      name: "walls",
      type: "tilelayer",
      width: 20,
      height: 15,
      data: (() => {
        const d = Array(300).fill(0);
        for (let x = 0; x < 20; x++) d[x] = 2;
        for (let x = 0; x < 20; x++) d[14 * 20 + x] = 2;
        for (let y = 0; y < 15; y++) d[y * 20] = 2;
        for (let y = 0; y < 15; y++) d[y * 20 + 19] = 2;
        return d;
      })(),
    },
  ],
  tilesets: [],
};

describe("TileMap", () => {
  it("loads map dimensions", () => {
    const map = new TileMap(MOCK_MAP);
    expect(map.width).toBe(20);
    expect(map.height).toBe(15);
    expect(map.tileSize).toBe(32);
  });

  it("detects wall collision", () => {
    const map = new TileMap(MOCK_MAP);
    expect(map.isWalkable(0, 0)).toBe(false);
    expect(map.isWalkable(5, 5)).toBe(true);
    expect(map.isWalkable(19, 0)).toBe(false);
    expect(map.isWalkable(0, 14)).toBe(false);
  });

  it("treats out-of-bounds as not walkable", () => {
    const map = new TileMap(MOCK_MAP);
    expect(map.isWalkable(-1, 0)).toBe(false);
    expect(map.isWalkable(0, -1)).toBe(false);
    expect(map.isWalkable(20, 0)).toBe(false);
    expect(map.isWalkable(0, 15)).toBe(false);
  });
});
