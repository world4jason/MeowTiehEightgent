/**
 * build-prompt.test.ts — Tests for buildPrompt()
 *
 * Uses temp directories to simulate agent folders, workspaces, and skills.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildPrompt, type BuildPromptOptions } from "./build-prompt.js";

let tmpDir: string;
let agentDir: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "build-prompt-test-"));
  projectRoot = tmpDir;
  agentDir = path.join(tmpDir, "agents", "claude");
  await fs.mkdir(agentDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeOptions(overrides?: Partial<BuildPromptOptions>): BuildPromptOptions {
  return {
    agent: {
      name: "Claude",
      workspace: agentDir,
    },
    historyText: "[Human]: Hello\n[Claude]: Hi there",
    projectRoot,
    ...overrides,
  };
}

// ── 1. Chat mode prefix ──────────────────────────────────────────────────────

describe("chat mode prefix", () => {
  it("includes concise response instruction when mode is chat", async () => {
    const result = await buildPrompt(makeOptions({ mode: "chat" }));
    expect(result).toMatch(/^Keep your response concise/);
  });

  it("defaults to chat mode when mode is not specified", async () => {
    const result = await buildPrompt(makeOptions());
    expect(result).toMatch(/^Keep your response concise/);
  });
});

// ── 2. Think mode — no prefix ────────────────────────────────────────────────

describe("think mode — no prefix", () => {
  it("does not include concise instruction when mode is think", async () => {
    const result = await buildPrompt(makeOptions({ mode: "think" }));
    expect(result).not.toMatch(/Keep your response concise/);
  });
});

// ── 3. Scenario context injection ────────────────────────────────────────────

describe("scenario context injection", () => {
  it("injects scenario system prompt as Session Context", async () => {
    const result = await buildPrompt(
      makeOptions({ scenarioSystemPrompt: "You are in a code review session." }),
    );
    expect(result).toContain("## Session Context");
    expect(result).toContain("You are in a code review session.");
  });

  it("scenario takes priority over workspace guide", async () => {
    // Set up a workspace with system_prompt
    const wsDir = path.join(tmpDir, "workspaces", "ws1");
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(
      path.join(wsDir, "config.json"),
      JSON.stringify({ system_prompt: "Workspace prompt" }),
    );

    const result = await buildPrompt(
      makeOptions({
        workspaceId: "ws1",
        scenarioSystemPrompt: "Scenario wins",
      }),
    );
    expect(result).toContain("## Session Context");
    expect(result).toContain("Scenario wins");
    expect(result).not.toContain("Workspace Guide");
  });
});

// ── 4. Workspace guide injection ─────────────────────────────────────────────

describe("workspace guide injection", () => {
  it("loads system_prompt from workspace config", async () => {
    const wsDir = path.join(tmpDir, "workspaces", "ws1");
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(
      path.join(wsDir, "config.json"),
      JSON.stringify({ system_prompt: "You are a helpful assistant." }),
    );

    const result = await buildPrompt(makeOptions({ workspaceId: "ws1" }));
    expect(result).toContain("## Workspace Guide");
    expect(result).toContain("You are a helpful assistant.");
  });

  it("loads workspace files under 50KB", async () => {
    const wsDir = path.join(tmpDir, "workspaces", "ws1");
    const filesDir = path.join(wsDir, "files");
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(path.join(wsDir, "config.json"), JSON.stringify({}));
    await fs.writeFile(path.join(filesDir, "notes.txt"), "Important notes here");

    const result = await buildPrompt(makeOptions({ workspaceId: "ws1" }));
    expect(result).toContain("### notes.txt");
    expect(result).toContain("Important notes here");
  });

  it("marks files as too large when cumulative size exceeds 50KB", async () => {
    const wsDir = path.join(tmpDir, "workspaces", "ws1");
    const filesDir = path.join(wsDir, "files");
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(path.join(wsDir, "config.json"), JSON.stringify({}));
    // Create a file that's just under 50KB
    await fs.writeFile(path.join(filesDir, "a-small.txt"), "x".repeat(49_000));
    // Create another file that would push it over
    await fs.writeFile(path.join(filesDir, "b-large.txt"), "y".repeat(5_000));

    const result = await buildPrompt(makeOptions({ workspaceId: "ws1" }));
    expect(result).toContain("### a-small.txt");
    expect(result).toContain("### b-large.txt (too large");
  });

  it("does not inject workspace when workspaceId is null", async () => {
    const result = await buildPrompt(makeOptions({ workspaceId: null }));
    expect(result).not.toContain("## Workspace Guide");
  });

  it("handles missing workspace config gracefully", async () => {
    const result = await buildPrompt(makeOptions({ workspaceId: "nonexistent" }));
    expect(result).not.toContain("## Workspace Guide");
  });
});

// ── 5. Agent markdown loading ────────────────────────────────────────────────

describe("agent markdown loading", () => {
  it("loads AGENT.md, IDENTITY.md, SOUL.md from agent workspace", async () => {
    await fs.writeFile(path.join(agentDir, "AGENT.md"), "I am Claude agent.");
    await fs.writeFile(path.join(agentDir, "IDENTITY.md"), "I am a helpful AI.");
    await fs.writeFile(path.join(agentDir, "SOUL.md"), "I value honesty.");

    const result = await buildPrompt(makeOptions());
    expect(result).toContain("I am Claude agent.");
    expect(result).toContain("I am a helpful AI.");
    expect(result).toContain("I value honesty.");
  });

  it("preserves order: AGENT.md before IDENTITY.md before SOUL.md", async () => {
    await fs.writeFile(path.join(agentDir, "AGENT.md"), "MARKER_AGENT");
    await fs.writeFile(path.join(agentDir, "IDENTITY.md"), "MARKER_IDENTITY");
    await fs.writeFile(path.join(agentDir, "SOUL.md"), "MARKER_SOUL");

    const result = await buildPrompt(makeOptions());
    const agentIdx = result.indexOf("MARKER_AGENT");
    const identityIdx = result.indexOf("MARKER_IDENTITY");
    const soulIdx = result.indexOf("MARKER_SOUL");
    expect(agentIdx).toBeLessThan(identityIdx);
    expect(identityIdx).toBeLessThan(soulIdx);
  });

  it("loads USER.md from project root", async () => {
    await fs.writeFile(path.join(projectRoot, "USER.md"), "User preferences here.");

    const result = await buildPrompt(makeOptions());
    expect(result).toContain("User preferences here.");
  });

  it("handles missing markdown files gracefully", async () => {
    // No AGENT.md, IDENTITY.md, SOUL.md, or USER.md — should not throw
    const result = await buildPrompt(makeOptions());
    expect(result).toContain("===== DISCUSSION =====");
  });
});

// ── 6. Participants header ───────────────────────────────────────────────────

describe("participants header", () => {
  it("lists other agents and marks current agent as (you)", async () => {
    const result = await buildPrompt(
      makeOptions({
        allAgents: [{ name: "Claude" }, { name: "Gemini" }, { name: "Ollama" }],
      }),
    );
    expect(result).toContain("Participants in this room: Claude (you), Gemini, Ollama, Human");
    expect(result).toContain("Your previous responses above are marked [Claude]:");
  });

  it("shows 'none' when agent is the only participant", async () => {
    const result = await buildPrompt(
      makeOptions({
        allAgents: [{ name: "Claude" }],
      }),
    );
    expect(result).toContain("Participants in this room: Claude (you), none, Human");
  });

  it("omits participants header when allAgents is not provided", async () => {
    const result = await buildPrompt(makeOptions());
    expect(result).not.toContain("Participants in this room:");
  });
});

// ── 7. Continuation hint ─────────────────────────────────────────────────────

describe("continuation hint", () => {
  it("includes continuation hint when pending_continuation is true", async () => {
    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          pending_continuation: true,
        },
      }),
    );
    expect(result).toContain("[系統提示]");
    expect(result).toContain("[TRUNCATED]");
  });

  it("does not include continuation hint when pending_continuation is false", async () => {
    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          pending_continuation: false,
        },
      }),
    );
    expect(result).not.toContain("[系統提示]");
  });
});

// ── 8. Skills injection ──────────────────────────────────────────────────────

describe("skills injection", () => {
  it("loads matching skills from skills directory", async () => {
    const skillDir = path.join(tmpDir, "skills", "code-review");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: Code Review\n---\nReview code carefully.",
    );

    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          skills: ["code-review"],
        },
      }),
    );
    expect(result).toContain("## Skill: Code Review");
    expect(result).toContain("Review code carefully.");
  });

  it("handles SKILL.md without frontmatter", async () => {
    const skillDir = path.join(tmpDir, "skills", "simple");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "Just a plain skill body.");

    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          skills: ["simple"],
        },
      }),
    );
    // Falls back to directory name as skill name
    expect(result).toContain("## Skill: simple");
    expect(result).toContain("Just a plain skill body.");
  });

  it("ignores skills not in agent's skill list", async () => {
    const skillDir = path.join(tmpDir, "skills", "unused-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: Unused\n---\nShould not appear.",
    );

    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          skills: ["other-skill"],
        },
      }),
    );
    expect(result).not.toContain("Unused");
    expect(result).not.toContain("Should not appear.");
  });

  it("handles missing skills directory gracefully", async () => {
    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          skills: ["nonexistent"],
        },
      }),
    );
    // Should not throw — just no skills injected
    expect(result).toContain("===== DISCUSSION =====");
  });

  it("supports SKILLS.md as alternative filename", async () => {
    const skillDir = path.join(tmpDir, "skills", "alt-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILLS.md"),
      "---\nname: Alt Skill\n---\nAlternative filename.",
    );

    const result = await buildPrompt(
      makeOptions({
        agent: {
          name: "Claude",
          workspace: agentDir,
          skills: ["alt-skill"],
        },
      }),
    );
    expect(result).toContain("## Skill: Alt Skill");
    expect(result).toContain("Alternative filename.");
  });
});

// ── 9. Blank mode ────────────────────────────────────────────────────────────

describe("blank mode", () => {
  it("does not inject workspace context in blank mode", async () => {
    const wsDir = path.join(tmpDir, "workspaces", "ws1");
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(
      path.join(wsDir, "config.json"),
      JSON.stringify({ system_prompt: "Should not appear" }),
    );

    const result = await buildPrompt(
      makeOptions({ workspaceId: "ws1", blankMode: true }),
    );
    expect(result).not.toContain("## Workspace Guide");
    expect(result).not.toContain("Should not appear");
  });

  it("still loads agent markdown files in blank mode", async () => {
    await fs.writeFile(path.join(agentDir, "AGENT.md"), "Agent persona.");

    const result = await buildPrompt(makeOptions({ blankMode: true }));
    expect(result).toContain("Agent persona.");
  });
});

// ── 10. Missing files handled gracefully ─────────────────────────────────────

describe("missing files handled gracefully", () => {
  it("works with completely empty agent workspace", async () => {
    const emptyAgent = path.join(tmpDir, "agents", "empty");
    await fs.mkdir(emptyAgent, { recursive: true });

    const result = await buildPrompt(
      makeOptions({
        agent: { name: "Empty", workspace: emptyAgent },
      }),
    );
    expect(result).toContain("===== DISCUSSION =====");
    expect(result).toContain("Your turn.");
  });

  it("works when agent workspace directory does not exist", async () => {
    const result = await buildPrompt(
      makeOptions({
        agent: { name: "Ghost", workspace: path.join(tmpDir, "nonexistent") },
      }),
    );
    expect(result).toContain("===== DISCUSSION =====");
  });

  it("handles today's memory file when present", async () => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const memDir = path.join(agentDir, "memory");
    await fs.mkdir(memDir, { recursive: true });
    await fs.writeFile(path.join(memDir, `${today}.md`), "Remember this.");

    const result = await buildPrompt(makeOptions());
    expect(result).toContain(`## Your memory (${today})`);
    expect(result).toContain("Remember this.");
  });

  it("handles missing memory file gracefully", async () => {
    // No memory directory — should not throw
    const result = await buildPrompt(makeOptions());
    expect(result).not.toContain("## Your memory");
  });
});

// ── 11. Room goal + SUGGEST_ISSUE injection ───────────────────────────────────

describe("room goal + suggest_issue injection", () => {
  it("injects goal into prompt when session config has goal", async () => {
    const sessionId = "test-goal-session";
    const configDir = path.join(tmpDir, "history", sessionId);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "session_config.json"),
      JSON.stringify({ goal: "討論 API 設計" }),
    );
    const result = await buildPrompt(makeOptions({ sessionId }));
    expect(result).toContain("討論 API 設計");
  });

  it("includes SUGGEST_ISSUE instruction in prompt", async () => {
    const result = await buildPrompt(makeOptions());
    expect(result).toContain("SUGGEST_ISSUE");
  });
});

// ── Final prompt structure ───────────────────────────────────────────────────

describe("final prompt structure", () => {
  it("contains DISCUSSION separator and closing instruction", async () => {
    const result = await buildPrompt(makeOptions());
    expect(result).toContain("===== DISCUSSION =====");
    expect(result).toContain("Your turn. Respond as your persona dictates.");
  });

  it("includes history text in the output", async () => {
    const result = await buildPrompt(
      makeOptions({ historyText: "[Human]: What is 2+2?" }),
    );
    expect(result).toContain("[Human]: What is 2+2?");
  });

  it("separates context parts with ---", async () => {
    await fs.writeFile(path.join(agentDir, "AGENT.md"), "PART_ONE");
    await fs.writeFile(path.join(agentDir, "IDENTITY.md"), "PART_TWO");

    const result = await buildPrompt(makeOptions());
    expect(result).toContain("---");
    // Both parts should appear with --- separator between them
    const contextSection = result.split("===== DISCUSSION =====")[0];
    expect(contextSection).toContain("PART_ONE");
    expect(contextSection).toContain("PART_TWO");
    expect(contextSection).toContain("---");
  });
});
