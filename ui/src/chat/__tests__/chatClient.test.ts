import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We'll import after stubbing
import { chatClient } from "../chatClient";

describe("chatClient", () => {
  beforeEach(() => mockFetch.mockReset());

  it("GET prepends CHAT_URL base", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await chatClient.get("/agents");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/agents"),
      expect.any(Object)
    );
  });

  it("throws ChatApiError on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });
    await expect(chatClient.get("/missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("POST sends JSON body with Content-Type header", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await chatClient.post("/sessions", { name: "Test" });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Test" });
  });
});
