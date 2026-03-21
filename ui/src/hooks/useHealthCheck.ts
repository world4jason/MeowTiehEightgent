import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

export function useHealthCheck(url: string) {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!cancelled) setOnline(res.ok);
      } catch {
        clearTimeout(timer);
        if (!cancelled) setOnline(false);
      }
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [url]);

  return { online };
}
