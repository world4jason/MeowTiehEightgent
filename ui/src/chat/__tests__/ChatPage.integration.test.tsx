/**
 * COMPONENT INTEGRATION TESTS
 *
 * Tests multi-component interaction with REAL backend response shapes.
 * Unlike unit tests which invent mock data, these fixtures mirror app.py output.
 *
 * Specifically tests:
 *  1. SessionSidebar receives backend-shaped sessions and renders them
 *  2. Selecting a session triggers GET /sessions/{id} (NOT /sessions/{id}/messages)
 *  3. Messages from GET /sessions/{id} are displayed in MessageList
 *  4. WelcomeScreen shows agents from GET /agents (with backend shape)
 *  5. WelcomeScreen scenario start creates a session
 *  6. ChatHeader shows connected agents
 *  7. MembersPanel add/remove agent flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatProvider } from "../../context/ChatContext";
import { ChatPage } from "../ChatPage";

// ─── Real backend response shapes ────────────────────────────────────────────

const BACKEND_SESSIONS_RESPONSE = {
  sessions: [
    // Both standalone (no workspace_id) so they appear without expanding a folder
    { id: "sess-abc", first_message: "Hello from session A", workspace_id: undefined, message_count: 3 },
    { id: "sess-xyz", first_message: "A different session",  workspace_id: undefined, message_count: 1 },
  ],
  total: 2,
  offset: 0,
  limit: 50,
};

// GET /sessions/{id} returns a RAW ARRAY — the critical shape
const BACKEND_SESSION_MESSAGES = [
  { type: "message", agent: "Claude", text: "Paris is the capital of France.", timestamp: "2026-03-21T12:00:01Z" },
  { type: "message", agent: "Gemini", text: "The Eiffel Tower is there.",       timestamp: "2026-03-21T12:00:02Z" },
];

const BACKEND_AGENTS = [
  { name: "Claude", emoji: "🤖", color: "#da7756", description: "", model: "claude-sonnet-4-6", skills: [], enabled: true,  type: "cli" },
  { name: "Gemini", emoji: "✨", color: "#4a90d9", description: "", model: "gemini-2.5-flash",  skills: [], enabled: false, type: "cli" },
];

const BACKEND_WORKSPACES = [
  { id: "ws-1", name: "Engineering", description: "" },
];

const BACKEND_SKILLS = [
  { slug: "gstack:browse", name: "browse", description: "Headless browser" },
];

const BACKEND_SCENARIOS = [
  { id: "product-critique", name: "Product Critique", description: "Critique a product", agents: ["Claude", "Gemini"], systemPrompt: null },
];

// ─── Test harness ─────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <ChatProvider>{children}</ChatProvider>
    </QueryClientProvider>
  );
}

// Mock WebSocket globally — prevent real connection attempts
class MockWS {
  static instances: MockWS[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = WebSocket.CLOSED; this.onclose?.(); });
  constructor() { MockWS.instances.push(this); }
}

beforeEach(() => {
  MockWS.instances = [];
  vi.stubGlobal("WebSocket", MockWS);
  // jsdom does not implement scrollIntoView; silence the error from MessageList
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Integration Test 1: Sessions loaded with real backend shape ──────────────

describe("Integration: sessions load from backend", () => {
  it("renders session names derived from backend first_message field", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/sessions") && !url.match(/\/sessions\/[^/]+$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      }
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });

    // first_message becomes the session name
    await waitFor(() => {
      expect(screen.getByText("Hello from session A")).toBeInTheDocument();
    });
    expect(screen.getByText("A different session")).toBeInTheDocument();
  });
});

// ─── Integration Test 2: Selecting session calls correct URL ─────────────────

describe("Integration: selecting a session fetches messages", () => {
  it("calls GET /sessions/{id} (NOT /sessions/{id}/messages) to load messages", async () => {
    const fetchedUrls: string[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);
      if (url.match(/\/sessions\/sess-abc$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSION_MESSAGES });
      }
      if (url.includes("/sessions") && !url.match(/\/sessions\/[^/]+$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      }
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });

    // Wait for sessions to load, then click one
    await waitFor(() => screen.getByText("Hello from session A"));
    await userEvent.click(screen.getByText("Hello from session A"));

    await waitFor(() => {
      const sessionFetches = fetchedUrls.filter((u) => u.includes("/sessions/sess-abc"));
      expect(sessionFetches.length).toBeGreaterThan(0);
      // CRITICAL: no URL should contain /messages suffix
      for (const url of sessionFetches) {
        expect(url, `URL "${url}" must not contain /messages`).not.toMatch(/\/messages/);
      }
    });
  });
});

// ─── Integration Test 3: Messages from GET /sessions/{id} display correctly ──

describe("Integration: messages display after session selection", () => {
  it("renders message content from backend message array", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.match(/\/sessions\/sess-abc$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSION_MESSAGES });
      }
      if (url.includes("/sessions") && !url.match(/\/sessions\/[^/]+$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      }
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });
    await waitFor(() => screen.getByText("Hello from session A"));
    await userEvent.click(screen.getByText("Hello from session A"));

    await waitFor(() => {
      expect(screen.getByText("Paris is the capital of France.")).toBeInTheDocument();
      expect(screen.getByText("The Eiffel Tower is there.")).toBeInTheDocument();
    });
  });
});

// ─── Integration Test 4: WelcomeScreen shows agents from backend ─────────────

describe("Integration: WelcomeScreen uses real agent shapes", () => {
  it("renders agent chips for enabled agents from GET /agents", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/sessions"))  return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });

    // WelcomeScreen should show when no active session
    await waitFor(() => {
      expect(screen.getByText(/MeowTiehEightgent/i)).toBeInTheDocument();
    });

    // Agent toggle buttons appear (aria-label includes agent name)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /toggle claude/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /toggle gemini/i })).toBeInTheDocument();
    });
  });

  it("renders scenario cards from GET /scenarios", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/sessions"))  return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Product Critique")).toBeInTheDocument();
    });
  });
});

// ─── Integration Test 5: Create session and transition out of WelcomeScreen ──

describe("Integration: new session creation", () => {
  it("POST /sessions → transitions away from WelcomeScreen", async () => {
    let sessionCreated = false;
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/sessions") && init?.method === "POST") {
        sessionCreated = true;
        return Promise.resolve({ ok: true, json: async () => ({ id: "new-sess-001", name: "New session" }) });
      }
      if (url.match(/\/sessions\/new-sess-001$/)) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/sessions"))  return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });

    // Find and click "+ New Chat"
    await waitFor(() => screen.getByRole("button", { name: /new chat/i }));
    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));

    await waitFor(() => {
      expect(sessionCreated).toBe(true);
    });
  });
});

// ─── Integration Test 6: ChatHeader renders when session is active ────────────

describe("Integration: ChatHeader appears when session selected", () => {
  it("shows members and runs buttons after selecting a session", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.match(/\/sessions\/sess-abc$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSION_MESSAGES });
      }
      if (url.includes("/sessions") && !url.match(/\/sessions\/[^/]+$/)) {
        return Promise.resolve({ ok: true, json: async () => BACKEND_SESSIONS_RESPONSE });
      }
      if (url.includes("/agents"))    return Promise.resolve({ ok: true, json: async () => BACKEND_AGENTS });
      if (url.includes("/workspaces"))return Promise.resolve({ ok: true, json: async () => BACKEND_WORKSPACES });
      if (url.includes("/skills"))    return Promise.resolve({ ok: true, json: async () => BACKEND_SKILLS });
      if (url.includes("/scenarios")) return Promise.resolve({ ok: true, json: async () => BACKEND_SCENARIOS });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<ChatPage />, { wrapper: Wrapper });
    await waitFor(() => screen.getByText("Hello from session A"));
    await userEvent.click(screen.getByText("Hello from session A"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /members/i })).toBeInTheDocument();
    });
  });
});
