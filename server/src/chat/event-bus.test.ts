import { describe, it, expect, vi, afterEach } from "vitest";
import { chatEventBus } from "./event-bus.js";

describe("chatEventBus", () => {
  afterEach(() => { chatEventBus.removeAllListeners(); });

  it("emits and receives agent:status events", () => {
    const handler = vi.fn();
    chatEventBus.on("agent:status", handler);
    chatEventBus.emit("agent:status", { agentId: "claude", status: "chatting", sessionId: "s1" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ agentId: "claude", status: "chatting" }));
  });

  it("emits and receives cowork:update events with sessionId", () => {
    const handler = vi.fn();
    chatEventBus.on("cowork:update", handler);
    chatEventBus.emit("cowork:update", { event: "issue_created", issueId: "42", title: "Fix login", sessionId: "s1" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ issueId: "42", sessionId: "s1" }));
  });

  it("emits session:control events", () => {
    const handler = vi.fn();
    chatEventBus.on("session:control", handler);
    chatEventBus.emit("session:control", { action: "pause", agentId: "claude" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ action: "pause" }));
  });

  it("is a singleton", async () => {
    const { chatEventBus: bus2 } = await import("./event-bus.js");
    expect(bus2).toBe(chatEventBus);
  });

  it("does not leak listeners after off()", () => {
    const handler = vi.fn();
    chatEventBus.on("agent:status", handler);
    chatEventBus.off("agent:status", handler);
    chatEventBus.emit("agent:status", { agentId: "x", status: "idle", sessionId: "s1" });
    expect(handler).not.toHaveBeenCalled();
  });
});
