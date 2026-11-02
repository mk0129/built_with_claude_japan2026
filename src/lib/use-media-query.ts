"use client";
import { useSyncExternalStore } from "react";

/** CSS メディアクエリの一致状態。SSR では `serverDefault` を返す */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
