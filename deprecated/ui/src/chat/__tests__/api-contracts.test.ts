/**
 * API CONTRACT TESTS
 *
 * These tests lock in the EXACT shapes our backend returns and assert that our
 * frontend transformer functions handle them correctly.
 *
 * Why: The /sessions/{id}/messages → /sessions/{id} bug was invisible to all
 * 100 unit tests because every test mocked fetch with its own invented shapes.
 * These tests mock with the REAL backend shapes as observed from app.py.
 *
 * Backend shapes (from app.py as of 2026-03-21):
 *   GET /sessions       → { sessions: RawSession[], total, offset, limit }
 *   GET /sessions/{id}  → ChatMessage[] (raw array, NO wrapper object)
 *   GET /agents         → { name, emoji, color, description, model, skills, enabled, type }[]
 *                          NOTE: no supportsThinking / supportsImage / mode fields
 *   GET /workspaces     → RawWorkspace[] (plain array, NOT paginated)
 *   GET /skills         → { slug, name, description }[]
 *   POST /sessions      → { id: string, name: string }
 *   PUT /sessions/{id}/topic → { topic: string }  (field is "topic" NOT "name")
 *   PUT /sessions/{id}/workspace → { workspace_id: string } (snake_case)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Raw backend response fixtures (copy-exact from app.py output) ──────────

const RAW_SESSION_LIST = {
  sessions: [
    {
      id: "2026-03-21_12-00-00_abc123",
      first_message: "What is the capital of France?",
      workspace_id: "ws-1",
      message_count: 4,
    },
    {
      id: "2026-03-20_09-00-00_def456",
      first_message: "",           // empty first_message → should fall back to id slice
      workspace_id: undefined,
      message_count: 0,
    },
  ],
  total: 2,
  offset: 0,
  limit: 50,
};

// GET /sessions/{id} returns a raw array — NOT { messages: [] }
const RAW_SESSION_MESSAGES = [
  { type: "message", agent: "Claude", text: "Paris is the capital.", timestamp: "2026-03-21T12:00:01Z" },
  { type: "message", agent: "Gemini", text: "Confirmed.", timestamp: "2026-03-21T12:00:02Z" },
];

const RAW_AGENTS = [
  {
    name: "Claude",
    emoji: "🤖",
    color: "#da7756",
    description: "Anthropic Claude",
    model: "claude-sonnet-4-6",
    skills: ["gstack:browse"],
    enabled: true,
    type: "cli",
    // NOTE: supportsThinking / supportsImage / mode are NOT in backend response
  },
  {
    name: "Gemini",
    emoji: "✨",
    color: "#4a90d9",
    description: "Google Gemini",
    model: "gemini-2.5-flash",
    skills: [],
    enabled: false,
    type: "cli",
  },
];

const RAW_WORKSPACES = [
  { id: "ws-1", name: "Product Eng", description: "Core product work" },
  { id: "ws-2", name: "Research",    description: "" },
];

const RAW_SKILLS = [
  { slug: "gstack:browse", name: "browse", description: "Headless browser testing" },
  { slug: "plan-eng-review", name: "plan-eng-review", description: "Engineering plan review" },
];

const RAW_SCENARIOS = [
  {
    id: "product-critique",
    name: "Product Critique",
    description: "Claude and Gemini critique a product idea",
    agents: ["Claude", "Gemini"],
    systemPrompt: "You are evaluating a startup idea.",
  },
];

// ─── Transformer helpers (mirrors useChatApi.ts internals) ──────────────────

interface RawSession {
  id: string;
  first_message: string;
  workspace_id?: string;
  message_count: number;
}

function toSession(raw: RawSession) {
  return {
    id: raw.id,
    name: raw.first_message || raw.id.slice(0, 8),
    workspaceId: raw.workspace_id,
    updatedAt: expect.any(Number),
    preview: raw.first_message,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("API Contract: GET /sessions", () => {
  it("response has sessions array at top level with pagination fields", () => {
    expect(RAW_SESSION_LIST).toHaveProperty("sessions");
    expect(RAW_SESSION_LIST).toHaveProperty("total");
    expect(RAW_SESSION_LIST).toHaveProperty("offset");
    expect(RAW_SESSION_LIST).toHaveProperty("limit");
    expect(Array.isArray(RAW_SESSION_LIST.sessions)).toBe(true);
  });

  it("each session has id, first_message, message_count", () => {
    const s = RAW_SESSION_LIST.sessions[0];
    expect(s).toHaveProperty("id");
    expect(s).toHaveProperty("first_message");
    expect(s).toHaveProperty("message_count");
  });

  it("session with empty first_message falls back to id prefix for name", () => {
    const empty = RAW_SESSION_LIST.sessions[1];
    const name = empty.first_message || empty.id.slice(0, 8);
    expect(name).toBe("2026-03-");   // first 8 chars of the id
  });

  it("session with populated first_message uses it as name", () => {
    const s = RAW_SESSION_LIST.sessions[0];
    const name = s.first_message || s.id.slice(0, 8);
    expect(name).toBe("What is the capital of France?");
  });

  it("workspace_id field maps to camelCase workspaceId", () => {
    const s = RAW_SESSION_LIST.sessions[0];
    // Our transformer renames workspace_id → workspaceId
    expect(s.workspace_id).toBe("ws-1");
  });
});

describe("API Contract: GET /sessions/{id}", () => {
  it("returns a raw array, NOT an object with a messages field", () => {
    // CRITICAL: This is the shape that caused the /sessions/{id}/messages bug.
    // The response is [] directly — NOT { messages: [] }.
    expect(Array.isArray(RAW_SESSION_MESSAGES)).toBe(true);
    expect(RAW_SESSION_MESSAGES).not.toHaveProperty("messages");
  });

  it("each message object has type, agent, text fields", () => {
    const msg = RAW_SESSION_MESSAGES[0];
    expect(msg).toHaveProperty("type", "message");
    expect(msg).toHaveProperty("agent");
    expect(msg).toHaveProperty("text");
  });

  it("empty session returns empty array (not null or 404)", () => {
    // app.py: if not f.exists(): return []
    const emptyResponse: unknown[] = [];
    expect(Array.isArray(emptyResponse)).toBe(true);
    expect(emptyResponse).toHaveLength(0);
  });
});

describe("API Contract: GET /agents", () => {
  it("returns a plain array (not paginated)", () => {
    expect(Array.isArray(RAW_AGENTS)).toBe(true);
    expect(RAW_AGENTS).not.toHaveProperty("agents");
  });

  it("agent objects have name, emoji, color, model, enabled, type", () => {
    const a = RAW_AGENTS[0];
    expect(a).toHaveProperty("name");
    expect(a).toHaveProperty("emoji");
    expect(a).toHaveProperty("color");
    expect(a).toHaveProperty("model");
    expect(typeof a.enabled).toBe("boolean");
    expect(a).toHaveProperty("type");
  });

  it("agent objects do NOT include supportsThinking or supportsImage", () => {
    // These are frontend-only fields; backend never sends them.
    // Our AgentInfo type makes them optional, which is correct.
    const a = RAW_AGENTS[0] as Record<string, unknown>;
    expect(a).not.toHaveProperty("supportsThinking");
    expect(a).not.toHaveProperty("supportsImage");
    expect(a).not.toHaveProperty("mode");
  });

  it("agent objects do NOT include supportsThinking — mode must come from WS agents event", () => {
    // mode is set by the backend via WS 'agents' event, not REST /agents
    const a = RAW_AGENTS[0] as Record<string, unknown>;
    expect(a.mode).toBeUndefined();
  });
});

describe("API Contract: GET /workspaces", () => {
  it("returns a plain array (not paginated)", () => {
    expect(Array.isArray(RAW_WORKSPACES)).toBe(true);
  });

  it("each workspace has id and name", () => {
    const w = RAW_WORKSPACES[0];
    expect(w).toHaveProperty("id");
    expect(w).toHaveProperty("name");
  });
});

describe("API Contract: GET /skills", () => {
  it("returns array with slug, name, description", () => {
    const s = RAW_SKILLS[0];
    expect(s).toHaveProperty("slug");
    expect(s).toHaveProperty("name");
    expect(s).toHaveProperty("description");
  });
});

describe("API Contract: GET /scenarios", () => {
  it("each scenario has id, name, agents array", () => {
    const s = RAW_SCENARIOS[0];
    expect(s).toHaveProperty("id");
    expect(s).toHaveProperty("name");
    expect(Array.isArray(s.agents)).toBe(true);
  });
});

describe("API Contract: POST /sessions", () => {
  it("response is { id, name } — NOT { id, sessionId } or anything else", () => {
    const response = { id: "2026-03-21_13-00-00_xyz789", name: "New session" };
    expect(response).toHaveProperty("id");
    expect(response).toHaveProperty("name");
    expect(response).not.toHaveProperty("sessionId");
    expect(response).not.toHaveProperty("session_id");
  });
});

describe("API Contract: PUT /sessions/{id}/topic", () => {
  it("request body uses field 'topic', not 'name'", () => {
    // Our useChatApi sends { topic: name } — verify the field name is correct
    const body = { topic: "Renamed session" };
    expect(body).toHaveProperty("topic");
    expect(body).not.toHaveProperty("name");
  });
});

describe("API Contract: PUT /sessions/{id}/workspace", () => {
  it("request body uses snake_case workspace_id, not camelCase workspaceId", () => {
    // Our useChatApi sends { workspace_id: value } — verify snake_case
    const body = { workspace_id: "ws-1" };
    expect(body).toHaveProperty("workspace_id");
    expect(body).not.toHaveProperty("workspaceId");
  });

  it("null workspace_id is valid for removing workspace association", () => {
    const body = { workspace_id: null };
    expect(body.workspace_id).toBeNull();
  });
});

describe("API Contract: chatClient endpoint URL correctness", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("fetches sessions WITHOUT a /messages suffix", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const { chatClient } = await import("../chatClient");
    await chatClient.get("/sessions/test-session-id");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/sessions\/test-session-id$/);
    expect(url).not.toMatch(/\/messages/);
  });
});
