import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createSession,
  loadSession,
  saveMessage,
  listSessions,
} from "./session-store.js";
import type { ChatMessage } from "./types.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-store-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── createSession ───────────────────────────────────────────────────────────

describe("createSession", () => {
  it("generates a valid session ID in YYYY-MM-DD_HH-MM-SS_{6hex} format", async () => {
    const id = await createSession(tmpDir);
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[0-9a-f]{6}$/);
  });

  it("creates the session directory with an empty messages.json", async () => {
    const id = await createSession(tmpDir);
    const messagesPath = path.join(tmpDir, id, "messages.json");
    const content = await fs.readFile(messagesPath, "utf-8");
    expect(JSON.parse(content)).toEqual([]);
  });

  it("generates unique IDs on rapid successive calls", async () => {
    const ids = await Promise.all([
      createSession(tmpDir),
      createSession(tmpDir),
      createSession(tmpDir),
    ]);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
  });
});

// ── loadSession ─────────────────────────────────────────────────────────────

describe("loadSession", () => {
  it("reads messages from an existing session", async () => {
    const id = await createSession(tmpDir);
    const msg: ChatMessage = {
      type: "message",
      agent: "Claude",
      text: "Hello!",
      timestamp: "2026-03-24T10:00:00.000Z",
    };
    await fs.writeFile(
      path.join(tmpDir, id, "messages.json"),
      JSON.stringify([msg]),
    );

    const messages = await loadSession(tmpDir, id);
    expect(messages).toHaveLength(1);
    expect(messages[0].agent).toBe("Claude");
    expect(messages[0].text).toBe("Hello!");
  });

  it("returns an empty array for a missing session", async () => {
    const messages = await loadSession(tmpDir, "nonexistent-session");
    expect(messages).toEqual([]);
  });

  it("returns an empty array for a session with missing messages.json", async () => {
    await fs.mkdir(path.join(tmpDir, "empty-session"), { recursive: true });
    const messages = await loadSession(tmpDir, "empty-session");
    expect(messages).toEqual([]);
  });
});

// ── saveMessage ─────────────────────────────────────────────────────────────

describe("saveMessage", () => {
  it("appends a message to an existing session", async () => {
    const id = await createSession(tmpDir);

    const msg1: ChatMessage = {
      type: "system",
      agent: "system",
      text: "Topic: Test",
      timestamp: "2026-03-24T10:00:00.000Z",
    };
    const msg2: ChatMessage = {
      type: "message",
      agent: "Claude",
      text: "Hi!",
      timestamp: "2026-03-24T10:00:01.000Z",
    };

    await saveMessage(tmpDir, id, msg1);
    await saveMessage(tmpDir, id, msg2);

    const messages = await loadSession(tmpDir, id);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe("Topic: Test");
    expect(messages[1].text).toBe("Hi!");
  });

  it("creates the session directory if it does not exist", async () => {
    const fakeId = "2026-03-24_12-00-00_abc123";
    const msg: ChatMessage = {
      type: "message",
      agent: "Human",
      text: "Hello",
      timestamp: "2026-03-24T12:00:00.000Z",
    };

    await saveMessage(tmpDir, fakeId, msg);

    const messages = await loadSession(tmpDir, fakeId);
    expect(messages).toHaveLength(1);
    expect(messages[0].agent).toBe("Human");
  });

  it("preserves all optional fields", async () => {
    const id = await createSession(tmpDir);
    const msg: ChatMessage = {
      type: "message",
      agent: "Claude",
      text: "Thinking...",
      timestamp: "2026-03-24T10:00:00.000Z",
      color: "#a78bfa",
      mode: "think",
      duration_ms: 1500,
      usage: { input: 100, output: 50, cached: 20 },
      images: ["img1.png"],
      skill: "code-review",
    };

    await saveMessage(tmpDir, id, msg);
    const messages = await loadSession(tmpDir, id);
    expect(messages[0]).toEqual(msg);
  });
});

// ── listSessions ────────────────────────────────────────────────────────────

describe("listSessions", () => {
  async function createPopulatedSession(
    dir: string,
    id: string,
    msgs: ChatMessage[],
  ) {
    const sessionDir = path.join(dir, id);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, "messages.json"),
      JSON.stringify(msgs),
    );
  }

  it("returns sessions sorted by newest first", async () => {
    // Create sessions with staggered mtimes
    await createPopulatedSession(tmpDir, "2026-03-20_10-00-00_aaa111", [
      {
        type: "system",
        agent: "system",
        text: "Topic: Old",
        timestamp: "2026-03-20T10:00:00.000Z",
      },
    ]);
    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));
    await createPopulatedSession(tmpDir, "2026-03-24_10-00-00_bbb222", [
      {
        type: "system",
        agent: "system",
        text: "Topic: New",
        timestamp: "2026-03-24T10:00:00.000Z",
      },
    ]);

    const sessions = await listSessions(tmpDir);
    expect(sessions).toHaveLength(2);
    // Newest first
    expect(sessions[0].id).toBe("2026-03-24_10-00-00_bbb222");
    expect(sessions[1].id).toBe("2026-03-20_10-00-00_aaa111");
  });

  it("includes first_message from system message text", async () => {
    await createPopulatedSession(tmpDir, "2026-03-24_10-00-00_ccc333", [
      {
        type: "system",
        agent: "system",
        text: "Topic: My Great Discussion",
        timestamp: "2026-03-24T10:00:00.000Z",
      },
    ]);

    const sessions = await listSessions(tmpDir);
    expect(sessions[0].first_message).toBe("Topic: My Great Discussion");
  });

  it("supports pagination with limit and offset", async () => {
    // Create 5 sessions
    for (let i = 0; i < 5; i++) {
      const id = `2026-03-24_10-0${i}-00_aaa${i}${i}${i}`;
      await createPopulatedSession(tmpDir, id, [
        {
          type: "system",
          agent: "system",
          text: `Topic: Session ${i}`,
          timestamp: `2026-03-24T10:0${i}:00.000Z`,
        },
      ]);
      // Small delay for distinct mtimes
      await new Promise((r) => setTimeout(r, 20));
    }

    const page1 = await listSessions(tmpDir, { limit: 2 });
    expect(page1).toHaveLength(2);

    const page2 = await listSessions(tmpDir, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);

    // No overlap
    const ids1 = page1.map((s) => s.id);
    const ids2 = page2.map((s) => s.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("returns an empty array for an empty history directory", async () => {
    const sessions = await listSessions(tmpDir);
    expect(sessions).toEqual([]);
  });

  it("skips directories without messages.json", async () => {
    await fs.mkdir(path.join(tmpDir, "broken-session"), { recursive: true });
    await createPopulatedSession(tmpDir, "2026-03-24_10-00-00_ddd444", [
      {
        type: "system",
        agent: "system",
        text: "Topic: Valid",
        timestamp: "2026-03-24T10:00:00.000Z",
      },
    ]);

    const sessions = await listSessions(tmpDir);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("2026-03-24_10-00-00_ddd444");
  });
});
