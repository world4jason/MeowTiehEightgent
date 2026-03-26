import { useEffect, useRef } from "react";

/**
 * Singleton WebSocket hook.
 * wsRef is passed from ChatContext so the connection survives mode switches.
 * Does NOT close on unmount — intentional for background streaming.
 */
export function useWebSocket(
  url: string | null,
  wsRef: React.MutableRefObject<WebSocket | null>,
  onMessage?: (data: unknown) => void,
  onOpen?: () => void,
) {
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;

    // Already connected to same URL — skip
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      urlRef.current === url
    ) {
      return;
    }

    // URL changed — close existing
    if (wsRef.current && urlRef.current !== url) {
      wsRef.current.close();
      wsRef.current = null;
    }

    urlRef.current = url;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    if (onOpen) {
      ws.onopen = onOpen;
    }

    if (onMessage) {
      ws.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)); }
        catch { onMessage(e.data); }
      };
    }
    // Intentionally NO cleanup on unmount — WS must survive mode switches
  }, [url]);
}
