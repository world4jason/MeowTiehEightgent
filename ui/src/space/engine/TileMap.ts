export interface TiledLayer {
  name: string;
  type: "tilelayer" | "objectgroup";
  width: number;
  height: number;
  data?: number[];
}

export interface TiledMapData {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: unknown[];
}

export class TileMap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private wallData: number[];

  constructor(data: TiledMapData) {
    this.width = data.width;
    this.height = data.height;
    this.tileSize = data.tilewidth;

    const wallLayer = data.layers.find((l) => l.name === "walls" && l.type === "tilelayer");
    this.wallData = wallLayer?.data ?? Array(this.width * this.height).fill(0);
  }

  isWalkable(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) {
      return false;
    }
    return this.wallData[tileY * this.width + tileX] === 0;
  }

  get pixelWidth(): number {
    return this.width * this.tileSize;
  }

  get pixelHeight(): number {
    return this.height * this.tileSize;
  }
}

export async function loadMapData(mapPath: string): Promise<TiledMapData> {
  const res = await fetch(mapPath);
  if (!res.ok) throw new Error(`Failed to load map: ${res.status}`);
  return res.json();
}
