"use client";
import { useSyncExternalStore } from "react";

let nowValue = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      nowValue = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** 1秒ごとに更新される現在時刻（残り時間表示用）。SSR では 0 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => nowValue, () => 0);
}
