import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "../../hooks/useWebSocket";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = WebSocket.CONNECTING;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }
  send = vi.fn();
  close = vi.fn(() => { this.readyState = WebSocket.CLOSED; this.onclose?.(); });
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe("useWebSocket", () => {
  it("creates a WebSocket connection on mount", () => {
    const wsRef = { current: null as WebSocket | null };
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test", wsRef));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("does NOT create a second WS if one is already open", () => {
    const wsRef = { current: null as WebSocket | null };
    const { rerender } = renderHook(
      ({ sessionId }) => useWebSocket(`ws://localhost:8000/ws/${sessionId}`, wsRef),
      { initialProps: { sessionId: "abc" } }
    );
    MockWebSocket.instances[0].readyState = WebSocket.OPEN;
    wsRef.current = MockWebSocket.instances[0] as unknown as WebSocket;
    rerender({ sessionId: "abc" });
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("closes and recreates WS when URL changes", () => {
    const wsRef = { current: null as WebSocket | null };
    const { rerender } = renderHook(
      ({ sessionId }) => useWebSocket(`ws://localhost:8000/ws/${sessionId}`, wsRef),
      { initialProps: { sessionId: "abc" } }
    );
    MockWebSocket.instances[0].readyState = WebSocket.OPEN;
    wsRef.current = MockWebSocket.instances[0] as unknown as WebSocket;
    rerender({ sessionId: "xyz" });
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("stores WS instance in wsRef", async () => {
    const wsRef = { current: null as WebSocket | null };
    renderHook(() => useWebSocket("ws://localhost:8000/ws/test", wsRef));
    await act(async () => {});
    expect(wsRef.current).toBeTruthy();
  });
});
