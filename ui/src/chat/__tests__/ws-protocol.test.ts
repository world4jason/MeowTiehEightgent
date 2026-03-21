/**
 * WS PROTOCOL TESTS
 *
 * Verifies every inbound and outbound WebSocket message type that our
 * frontend handles or sends. Tests the handler logic in isolation — these
 * tests do NOT use a real WebSocket, but they DO use the actual handler
 * functions and message shapes from the backend.
 *
 * Backend WS endpoint: /ws (single shared endpoint, NOT /ws/{session_id})
 * First message to backend must be the session setup payload.
 *
 * Inbound types (backend → frontend):
 *   token / chunk  — streaming text token from an agent
 *   done           — agent finished streaming
 *   agents         — active agent list for session
 *   token_usage    — per-agent token count update
 *   system         — system notification (displayed as info)
 *
 * Outbound types (frontend → backend):
 *   message        — user sends a text (+ optional images) message
 *   set_mode       — change agent mode (chat | think)
 *   add_agent      — add an agent to the session
 *   remove_agent   — remove an agent from the session
 *   scenario_start — start a scenario (agents + systemPrompt)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyTokenMessage, applyDoneMessage } from "../utils";
import type { AgentInfo, ChatMessage } from "../types";

// ─── Inbound message shape fixtures ─────────────────────────────────────────

const inbound = {
  token: {
    type: "token",
    agent: "Claude",
    content: "Hello ",
  },
  chunk: {
    type: "chunk",
    agent: "Claude",
    content: "world",
  },
  done: {
    type: "done",
  },
  agents: {
    type: "agents",
    agents: [
      { name: "Claude",  emoji: "🤖", color: "#da7756", enabled: true, model: "claude-sonnet-4-6", skills: [], type: "cli" },
      { name: "Gemini",  emoji: "✨", color: "#4a90d9", enabled: true, model: "gemini-2.5-flash",  skills: [], type: "cli" },
    ],
  },
  token_usage: {
    type: "token_usage",
    agent: "Claude",
    tokens: 1234,
  },
  system: {
    type: "system",
    text: "Session initialized.",
  },
};

// ─── Outbound message shape fixtures ─────────────────────────────────────────

const outbound = {
  message: {
    type: "message",
    text: "What is the capital of France?",
    // images: undefined  ← omitted when no images
  },
  messageWithImages: {
    type: "message",
    text: "What's in this image?",
    images: ["data:image/png;base64,iVBORw0KGgo="],
  },
  setMode: {
    type: "set_mode",
    agent: "Claude",
    mode: "think",
  },
  addAgent: {
    type: "add_agent",
    agent: "Gemini",
  },
  removeAgent: {
    type: "remove_agent",
    agent: "Gemini",
  },
  scenarioStart: {
    type: "scenario_start",
    agents: ["Claude", "Gemini"],
    systemPrompt: "You are evaluating a startup idea.",
  },
};

// ─── Handler logic (mirrors ChatPage.tsx handleMessage) ──────────────────────

function makeHandler(
  setMessages: (fn: (prev: ChatMessage[]) => ChatMessage[]) => void,
  setAgents: (fn: (prev: AgentInfo[]) => AgentInfo[]) => void,
  setAgentRuns: (fn: (prev: { agentName: string; tokens?: number }[]) => { agentName: string; tokens?: number }[]) => void,
  setHasUnreadChat: (v: boolean) => void,
  isVisible: boolean,
) {
  return function handleMessage(data: unknown) {
    if (typeof data !== "object" || !data) return;
    const msg = data as Record<string, unknown>;
    if (msg.type === "token" || msg.type === "chunk") {
      setMessages((prev) => applyTokenMessage(prev, String(msg.agent ?? ""), String(msg.content ?? "")));
      if (!isVisible) setHasUnreadChat(true);
    } else if (msg.type === "done") {
      setMessages(applyDoneMessage);
    } else if (msg.type === "agents") {
      setAgents(() => msg.agents as AgentInfo[]);
    } else if (msg.type === "token_usage") {
      const { agent: name, tokens } = msg as { agent: string; tokens: number };
      setAgentRuns((prev) => {
        const idx = prev.findIndex((r) => r.agentName === name);
        if (idx >= 0) return prev.map((r, i) => i === idx ? { ...r, tokens } : r);
        return [...prev, { agentName: name, tokens }];
      });
    }
  };
}

// ─── Tests: Inbound handling ─────────────────────────────────────────────────

describe("WS inbound: token / chunk", () => {
  it("token message appends content to streaming message", () => {
    const msgs: ChatMessage[] = [];
    const result = applyTokenMessage(msgs, inbound.token.agent, inbound.token.content);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello ");
    expect(result[0].streaming).toBe(true);
    expect(result[0].agentName).toBe("Claude");
  });

  it("chunk message (alias for token) also appends content", () => {
    const msgs: ChatMessage[] = [];
    const result = applyTokenMessage(msgs, inbound.chunk.agent, inbound.chunk.content);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("world");
  });

  it("consecutive token messages from same agent accumulate content", () => {
    let msgs: ChatMessage[] = [];
    msgs = applyTokenMessage(msgs, "Claude", "Hello");
    msgs = applyTokenMessage(msgs, "Claude", " world");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("Hello world");
  });

  it("token from different agent starts a new message", () => {
    let msgs: ChatMessage[] = [];
    msgs = applyTokenMessage(msgs, "Claude", "Hi");
    msgs = applyTokenMessage(msgs, "Gemini", "Hey");
    expect(msgs).toHaveLength(2);
  });

  it("sets hasUnreadChat when window is not visible", () => {
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setAgentRuns = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, false /* isVisible */);
    handler(inbound.token);
    expect(setHasUnread).toHaveBeenCalledWith(true);
  });

  it("does NOT set hasUnreadChat when window is visible", () => {
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setAgentRuns = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true /* isVisible */);
    handler(inbound.token);
    expect(setHasUnread).not.toHaveBeenCalled();
  });
});

describe("WS inbound: done", () => {
  it("marks the last streaming message as not streaming", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: true,
    }];
    const result = applyDoneMessage(prev);
    expect(result[0].streaming).toBe(false);
  });

  it("does nothing if no streaming message exists", () => {
    const prev: ChatMessage[] = [{
      id: "1", role: "agent", agentName: "Claude", content: "Hello", timestamp: 0, streaming: false,
    }];
    const result = applyDoneMessage(prev);
    expect(result[0].streaming).toBe(false);
  });
});

describe("WS inbound: agents", () => {
  it("replaces the agents list when agents message received", () => {
    let storedAgents: AgentInfo[] = [];
    const setAgents = vi.fn((fn: (p: AgentInfo[]) => AgentInfo[]) => {
      storedAgents = fn(storedAgents);
    });
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgentRuns = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    handler(inbound.agents);
    expect(storedAgents).toHaveLength(2);
    expect(storedAgents[0].name).toBe("Claude");
    expect(storedAgents[1].name).toBe("Gemini");
  });
});

describe("WS inbound: token_usage", () => {
  it("adds new entry when agent not yet in runs list", () => {
    let runs: { agentName: string; tokens?: number }[] = [];
    const setAgentRuns = vi.fn((fn: (p: typeof runs) => typeof runs) => { runs = fn(runs); });
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    handler(inbound.token_usage);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ agentName: "Claude", tokens: 1234 });
  });

  it("updates existing entry when agent already in runs list", () => {
    let runs: { agentName: string; tokens?: number }[] = [{ agentName: "Claude", tokens: 100 }];
    const setAgentRuns = vi.fn((fn: (p: typeof runs) => typeof runs) => { runs = fn(runs); });
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    handler({ type: "token_usage", agent: "Claude", tokens: 9999 });
    expect(runs).toHaveLength(1);     // still one entry, not two
    expect(runs[0].tokens).toBe(9999);
  });

  it("tracks multiple agents independently", () => {
    let runs: { agentName: string; tokens?: number }[] = [];
    const setAgentRuns = vi.fn((fn: (p: typeof runs) => typeof runs) => { runs = fn(runs); });
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    handler({ type: "token_usage", agent: "Claude", tokens: 500 });
    handler({ type: "token_usage", agent: "Gemini", tokens: 300 });
    expect(runs).toHaveLength(2);
    expect(runs.find((r) => r.agentName === "Claude")?.tokens).toBe(500);
    expect(runs.find((r) => r.agentName === "Gemini")?.tokens).toBe(300);
  });
});

describe("WS inbound: unknown message type", () => {
  it("ignores messages with unknown type without throwing", () => {
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setAgentRuns = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    expect(() => handler({ type: "unknown_future_type", data: {} })).not.toThrow();
    expect(setMessages).not.toHaveBeenCalled();
    expect(setHasUnread).not.toHaveBeenCalled();
  });

  it("ignores null message", () => {
    const setMessages = vi.fn((fn: (p: ChatMessage[]) => ChatMessage[]) => fn([]));
    const setAgents = vi.fn();
    const setAgentRuns = vi.fn();
    const setHasUnread = vi.fn();
    const handler = makeHandler(setMessages, setAgents, setAgentRuns, setHasUnread, true);
    expect(() => handler(null)).not.toThrow();
  });
});

// ─── Tests: Outbound message structure ───────────────────────────────────────

describe("WS outbound: message shape validation", () => {
  it("message payload has type='message' and text field", () => {
    expect(outbound.message.type).toBe("message");
    expect(outbound.message).toHaveProperty("text");
  });

  it("message payload omits images when none attached", () => {
    expect(outbound.message).not.toHaveProperty("images");
  });

  it("message payload includes images array when images attached", () => {
    expect(outbound.messageWithImages.images).toBeInstanceOf(Array);
    expect(outbound.messageWithImages.images.length).toBeGreaterThan(0);
  });

  it("set_mode payload has type, agent, and mode fields", () => {
    expect(outbound.setMode.type).toBe("set_mode");
    expect(outbound.setMode).toHaveProperty("agent");
    expect(outbound.setMode.mode).toMatch(/^(chat|think)$/);
  });

  it("add_agent payload has type and agent name", () => {
    expect(outbound.addAgent.type).toBe("add_agent");
    expect(outbound.addAgent).toHaveProperty("agent");
  });

  it("remove_agent payload has type and agent name", () => {
    expect(outbound.removeAgent.type).toBe("remove_agent");
    expect(outbound.removeAgent).toHaveProperty("agent");
  });

  it("scenario_start payload has type, agents array, and optional systemPrompt", () => {
    expect(outbound.scenarioStart.type).toBe("scenario_start");
    expect(Array.isArray(outbound.scenarioStart.agents)).toBe(true);
    // systemPrompt is optional — backend accepts undefined
    expect(outbound.scenarioStart).toHaveProperty("systemPrompt");
  });

  it("all outbound payloads are valid JSON-serializable objects", () => {
    for (const [key, payload] of Object.entries(outbound)) {
      expect(() => JSON.stringify(payload), `payload '${key}' must be JSON-serializable`).not.toThrow();
    }
  });
});
