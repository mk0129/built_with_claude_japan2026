"use client";

/**
 * 画面の状態を URL の検索パラメータに持たせ、再読み込みやブラウザの戻る／進むで同じ画面に戻れるようにする。
 * Figma のコードの useState を同じ形（[値, 設定関数]）のまま置き換える。初期値はサーバーから受け取った検索パラメータ（水和の不一致を防ぐ）。
 * 1 回の操作で複数の値が変わるとき（教材を選んで画面を移る など）は、履歴を 1 件にまとめる。
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UrlInit = Record<string, string | string[] | undefined>;
export const UrlInitContext = createContext<UrlInit>({});

let pushedInThisTick = false;

export function useUrlState<T extends string | number>(key: string, fallback: T, allowed?: readonly T[]): [T, (next: T) => void] {
  const init = useContext(UrlInitContext);
  const parse = useCallback(
    (raw: string | string[] | null | undefined): T => {
      const v = Array.isArray(raw) ? raw[0] : raw;
      if (v == null || v === "") return fallback;
      const parsed = (typeof fallback === "number" ? Number(v) : v) as T;
      if (typeof parsed === "number" && !Number.isFinite(parsed)) return fallback;
      return allowed && !allowed.includes(parsed) ? fallback : parsed;
    },
    [fallback, allowed],
  );
  const [value, setValue] = useState<T>(() => parse(init[key]));

  useEffect(() => {
    const onPop = () => setValue(parse(new URLSearchParams(window.location.search).get(key)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, parse]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, String(next));
      if (url.href === window.location.href) return;
      if (pushedInThisTick) window.history.replaceState(window.history.state, "", url);
      else {
        window.history.pushState(window.history.state, "", url);
        pushedInThisTick = true;
        queueMicrotask(() => (pushedInThisTick = false));
      }
    },
    [key, fallback],
  );
  return [value, set];
}
