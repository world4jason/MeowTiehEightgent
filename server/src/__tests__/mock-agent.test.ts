import { describe, it, expect } from "vitest";
import { MockAgent } from "../chat/mock-agent.js";

describe("MockAgent", () => {
  it("returns default response when no tag specified", async () => {
    const agent = new MockAgent();
    const chunks: string[] = [];
    for await (const chunk of agent.stream("Hello")) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toContain("This is a mock response");
  });

  it("returns tagged response for suggest-issue", async () => {
    const agent = new MockAgent();
    const chunks: string[] = [];
    for await (const chunk of agent.stream("Create an issue", "suggest-issue")) {
      chunks.push(chunk);
    }
    const full = chunks.join("");
    expect(full).toContain("[SUGGEST_ISSUE]");
  });

  it("streams chunks with delay", async () => {
    const agent = new MockAgent();
    const chunks: string[] = [];
    for await (const chunk of agent.stream("Hello")) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });
});
