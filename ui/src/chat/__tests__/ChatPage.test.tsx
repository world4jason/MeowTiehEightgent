import { describe, it, expect } from "vitest";
import { ChatMessage } from "../types";
import { applyTokenMessage, applyDoneMessage, applyTokenUpdate } from "../utils";

describe("ChatPage message logic", () => {
  it("starts a new streaming message when no prior agent message exists", () => {
    const result = applyTokenMessage([], "Claude", "Hello");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello");
    expect(result[0].streaming).toBe(true);
  });

  it("appends to the last message if same agent is still streaming", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: true,
    }];
    const result = applyTokenMessage(prev, "Claude", " world");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello world");
  });

  it("starts a new message if agent changes mid-stream", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hi", timestamp: 0, streaming: true,
    }];
    const result = applyTokenMessage(prev, "Gemini", "Hello");
    expect(result).toHaveLength(2);
  });

  it("marks the last message as done when type=done received", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: true,
    }];
    const result = applyDoneMessage(prev);
    expect(result[0].streaming).toBe(false);
  });

  it("does nothing on done if no streaming message", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: false,
    }];
    const result = applyDoneMessage(prev);
    expect(result).toEqual(prev);
  });
});

describe("applyTokenUpdate", () => {
  it("sets cumulative tokens for a new agent", () => {
    const result = applyTokenUpdate({}, "Claude", { input: 100, output: 50 });
    expect(result).toEqual({ Claude: { input: 100, output: 50 } });
  });

  it("replaces cumulative tokens for an existing agent", () => {
    const prev = { Claude: { input: 100, output: 50 } };
    const result = applyTokenUpdate(prev, "Claude", { input: 200, output: 80 });
    expect(result).toEqual({ Claude: { input: 200, output: 80 } });
  });

  it("does not mutate the previous state", () => {
    const prev = { Claude: { input: 100, output: 50 } };
    applyTokenUpdate(prev, "Claude", { input: 200, output: 80 });
    expect(prev).toEqual({ Claude: { input: 100, output: 50 } });
  });

  it("handles multiple agents independently", () => {
    const prev = { Claude: { input: 100, output: 50 } };
    const result = applyTokenUpdate(prev, "Gemini", { input: 200, output: 80 });
    expect(result).toEqual({ Claude: { input: 100, output: 50 }, Gemini: { input: 200, output: 80 } });
  });
});
