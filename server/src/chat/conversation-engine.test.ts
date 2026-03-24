import { describe, expect, it, vi } from "vitest";
import { ConversationEngine, type ChatAgent } from "./conversation-engine.js";

function makeAgents(...names: string[]): ChatAgent[] {
  return names.map((name) => ({ name }));
}

describe("ConversationEngine", () => {
  it("round_robin — agents cycle A→B→C→A→B→C", () => {
    const agents = makeAgents("A", "B", "C");
    const engine = new ConversationEngine(agents);

    const results: string[] = [];
    for (let i = 0; i < 6; i++) {
      results.push(engine.nextSpeaker().name);
    }
    expect(results).toEqual(["A", "B", "C", "A", "B", "C"]);
  });

  it("mention_jumps_queue — @C mid-round makes C speak immediately", () => {
    const agents = makeAgents("A", "B", "C");
    const engine = new ConversationEngine(agents);

    // A speaks first
    expect(engine.nextSpeaker().name).toBe("A");

    // Human mentions C mid-round (B was next)
    const target = engine.onMention("C");
    expect(target).not.toBeNull();
    expect(target!.name).toBe("C");
  });

  it("mention_next_cycle — cycle after mention starts with mentioned agent", () => {
    const agents = makeAgents("A", "B", "C", "D", "E", "F");
    const engine = new ConversationEngine(agents);

    // A speaks
    expect(engine.nextSpeaker().name).toBe("A");

    // Human mentions C — C is immediate speaker, rest of current round dropped
    const target = engine.onMention("C");
    expect(target!.name).toBe("C");

    // Next cycle should be C, A, B, D, E, F
    const nextCycle: string[] = [];
    for (let i = 0; i < 6; i++) {
      nextCycle.push(engine.nextSpeaker().name);
    }
    expect(nextCycle).toEqual(["C", "A", "B", "D", "E", "F"]);

    // Cycle after that returns to base order
    const baseCycle: string[] = [];
    for (let i = 0; i < 6; i++) {
      baseCycle.push(engine.nextSpeaker().name);
    }
    expect(baseCycle).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("on_human_resets — human resets to base order", () => {
    const agents = makeAgents("A", "B", "C");
    const engine = new ConversationEngine(agents);

    // Consume A and B
    engine.nextSpeaker();
    engine.nextSpeaker();

    // Human resets
    engine.onHuman();

    // Should restart from base order
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(engine.nextSpeaker().name);
    }
    expect(results).toEqual(["A", "B", "C"]);
  });

  it("add_agent — new agent joins and can speak", () => {
    const agents = makeAgents("A", "B");
    const engine = new ConversationEngine(agents);

    expect(engine.addAgent({ name: "C" })).toBe(true);
    // Duplicate should return false
    expect(engine.addAgent({ name: "C" })).toBe(false);

    // Should be able to get all three agents in a cycle
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(engine.nextSpeaker().name);
    }
    expect(results).toEqual(["A", "B", "C"]);
  });

  it("remove_agent — agent leaves, removed from all queues", () => {
    const agents = makeAgents("A", "B", "C");
    const engine = new ConversationEngine(agents);

    // Remove B
    expect(engine.removeAgent("B")).toBe(true);
    // Removing again should return false
    expect(engine.removeAgent("B")).toBe(false);

    // Cycle should be A, C
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(engine.nextSpeaker().name);
    }
    expect(results).toEqual(["A", "C", "A", "C"]);
  });

  it("silence_never_with_two — ≤2 agents never pass (even with silence=true)", () => {
    // Mock random to always return a value that would cause a pass
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      const agents = makeAgents("A", "B");
      const engine = new ConversationEngine(agents, { silence: true });

      const results: string[] = [];
      for (let i = 0; i < 4; i++) {
        results.push(engine.nextSpeaker().name);
      }
      // With ≤2 agents, no one should ever pass, even with silence on
      expect(results).toEqual(["A", "B", "A", "B"]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("silence_never_with_one — 1 agent never passes (even with silence=true)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    try {
      const agents = makeAgents("Solo");
      const engine = new ConversationEngine(agents, { silence: true });

      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        results.push(engine.nextSpeaker().name);
      }
      expect(results).toEqual(["Solo", "Solo", "Solo"]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("extract_mention_basic — @Name extraction", () => {
    expect(ConversationEngine.extractMention("Hello @Claude how are you")).toBe(
      "Claude",
    );
    expect(ConversationEngine.extractMention("No mention here")).toBeNull();
  });

  it("extract_mention_longest — CJK longest match (sorted by name length)", () => {
    const agents = makeAgents("小黑", "小黑貓");
    // Should match "小黑貓" (longest) even though "小黑" also matches
    expect(
      ConversationEngine.extractMention("@小黑貓的意見如何", agents),
    ).toBe("小黑貓");
  });

  it("extract_mention_case_insensitive — matches agent names case-insensitively", () => {
    const agents = makeAgents("Claude", "Gemini");
    expect(ConversationEngine.extractMention("ask @claude please", agents)).toBe(
      "Claude",
    );
  });

  it("everyone_passes_safety — if all pass, force first agent", () => {
    // Make random always return 0 so _should_pass always returns true for silence
    vi.spyOn(Math, "random").mockReturnValue(0.0);

    try {
      const agents = makeAgents("A", "B", "C");
      const engine = new ConversationEngine(agents, { silence: true });

      // With everyone passing, safety net should force first agent in base order
      const speaker = engine.nextSpeaker();
      expect(speaker.name).toBe("A");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("constructor throws with empty agents list", () => {
    expect(() => new ConversationEngine([])).toThrow("At least one agent required");
  });

  it("onMention returns null for unknown agent", () => {
    const agents = makeAgents("A", "B");
    const engine = new ConversationEngine(agents);
    expect(engine.onMention("Unknown")).toBeNull();
  });

  it("onMention is case-insensitive", () => {
    const agents = makeAgents("Claude", "Gemini");
    const engine = new ConversationEngine(agents);
    const target = engine.onMention("claude");
    expect(target).not.toBeNull();
    expect(target!.name).toBe("Claude");
  });

  it("remove_agent removes from next_order if set", () => {
    const agents = makeAgents("A", "B", "C");
    const engine = new ConversationEngine(agents);

    // Create a next_order via mention
    engine.onMention("C");

    // Remove B from all queues (including next_order)
    expect(engine.removeAgent("B")).toBe(true);

    // Next cycle should be C, A (no B)
    const results: string[] = [];
    for (let i = 0; i < 2; i++) {
      results.push(engine.nextSpeaker().name);
    }
    expect(results).toEqual(["C", "A"]);
  });
});
