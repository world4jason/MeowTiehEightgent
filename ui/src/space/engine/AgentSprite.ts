import { Container, Graphics, Text } from "pixi.js";
import { TILE_SIZE } from "../types";
import type { AgentPosition } from "../types";

const STATUS_EMOJI: Record<string, string> = {
  idle: "😴",
  chatting: "💬",
  working: "🔨",
};

export class AgentSpriteView extends Container {
  private body: Graphics;
  private nameLabel: Text;
  private statusBubble: Text;
  private highlight: Graphics;
  private _agentData: AgentPosition;

  constructor(agent: AgentPosition) {
    super();
    this._agentData = agent;

    this.highlight = new Graphics();
    this.highlight.circle(0, 0, TILE_SIZE * 0.55);
    this.highlight.stroke({ color: 0xfbbf24, width: 2 });
    this.highlight.alpha = 0;
    this.addChild(this.highlight);

    const color = parseInt(agent.color.replace("#", ""), 16) || 0x6366f1;
    this.body = new Graphics();
    this.body.circle(0, 0, TILE_SIZE * 0.4);
    this.body.fill({ color });
    this.addChild(this.body);

    const emojiText = new Text({
      text: agent.emoji,
      style: { fontSize: 16 },
    });
    emojiText.anchor.set(0.5, 0.5);
    this.addChild(emojiText);

    this.nameLabel = new Text({
      text: agent.name,
      style: { fontSize: 10, fill: 0xcccccc },
    });
    this.nameLabel.anchor.set(0.5, 0);
    this.nameLabel.y = TILE_SIZE * 0.5;
    this.addChild(this.nameLabel);

    this.statusBubble = new Text({
      text: STATUS_EMOJI[agent.status] ?? "",
      style: { fontSize: 14 },
    });
    this.statusBubble.anchor.set(0.5, 1);
    this.statusBubble.y = -TILE_SIZE * 0.6;
    this.addChild(this.statusBubble);

    this.setTilePosition(agent.x, agent.y);
  }

  get agentData(): AgentPosition {
    return this._agentData;
  }

  setTilePosition(tileX: number, tileY: number) {
    this.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  }

  setHighlight(on: boolean) {
    this.highlight.alpha = on ? 1 : 0;
  }

  updateStatus(status: AgentPosition["status"], task?: string) {
    this._agentData = { ...this._agentData, status, currentTask: task };
    this.statusBubble.text = STATUS_EMOJI[status] ?? "";
  }

  showNotification(text: string) {
    const notif = new Text({
      text,
      style: { fontSize: 10, fill: 0xfbbf24 },
    });
    notif.anchor.set(0.5, 1);
    notif.y = -TILE_SIZE;
    this.addChild(notif);

    setTimeout(() => {
      this.removeChild(notif);
      notif.destroy();
    }, 3000);
  }
}
