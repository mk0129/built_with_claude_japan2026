"use client";
import { useEffect, useRef, useState } from "react";

/** 単純ポーリング。QR承認待ち・セッション状態の監視用（P1 で SSE 化） */
export function usePoll<T>(fetcher: (() => Promise<T>) | null, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fetcherRef = useRef<typeof fetcher>(null);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  const enabled = fetcher !== null;
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = async () => {
      const f = fetcherRef.current;
      if (!f) return;
      try {
        const d = await f();
        if (!stop) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(e);
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, ...deps]);
  return { data, error, setData };
}
