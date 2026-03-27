import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHealthCheck } from "../../hooks/useHealthCheck";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useHealthCheck", () => {
  it("returns online=true when fetch succeeds", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(true);
  });

  it("returns online=false when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(false);
  });

  it("returns online=false when response is not ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);
    const { result } = renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.online).toBe(false);
  });

  it("polls again after 30 seconds", async () => {
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);
    renderHook(() => useHealthCheck("http://localhost:8000/health"));
    await act(async () => { await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
