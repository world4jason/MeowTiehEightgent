import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SpaceProvider, useSpace } from "../SpaceContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SpaceProvider>{children}</SpaceProvider>
);

describe("SpaceContext", () => {
  it("provides default state", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    expect(result.current.localPlayer).toEqual({
      x: 10,
      y: 12,
      direction: "down",
    });
    expect(result.current.proximityAgents).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });

  it("updates player position", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.movePlayer(5, 3, "left");
    });
    expect(result.current.localPlayer).toEqual({ x: 5, y: 3, direction: "left" });
  });

  it("sets proximity agents", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.setProximityAgents(["Claude", "Gemini"]);
    });
    expect(result.current.proximityAgents).toEqual(["Claude", "Gemini"]);
  });

  it("sets active session id", () => {
    const { result } = renderHook(() => useSpace(), { wrapper });
    act(() => {
      result.current.setActiveSessionId("session-123");
    });
    expect(result.current.activeSessionId).toBe("session-123");
  });
});
