import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleIntent } from "./intent-router.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("handleIntent", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("creates issue via Cowork API", async () => {
    // Need to set defaultCompanyId — call resolveDefaultCompany with mock
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "comp-1" }] });
    const { resolveDefaultCompany } = await import("./intent-router.js");
    await resolveDefaultCompany();

    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ id: "42", title: "Fix login", number: 42 }),
    });
    const result = await handleIntent({
      intent: "create_issue",
      payload: { title: "Fix login", description: "broken", projectId: "proj-1" },
      sessionId: "s1",
    });
    expect(result.success).toBe(true);
    expect(result.data?.issueId).toBe("42");
  });

  it("returns error on Cowork API failure", async () => {
    // Ensure company is resolved
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "comp-1" }] });
    const { resolveDefaultCompany } = await import("./intent-router.js");
    await resolveDefaultCompany();

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server Error" });
    const result = await handleIntent({
      intent: "create_issue",
      payload: { title: "Test", description: "Test", projectId: "proj-1" },
      sessionId: "s1",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("returns error for unknown intent", async () => {
    const result = await handleIntent({
      intent: "unknown_thing" as any,
      payload: { title: "", description: "" },
      sessionId: "s1",
    });
    expect(result.success).toBe(false);
  });
});
