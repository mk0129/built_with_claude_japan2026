"use client";
import { useSyncExternalStore } from "react";

const KEY = "shiori.staffOrgId";
const EVENT = "shiori:org-changed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** 医療者が選択中の組織ID（端末ローカルの利便性のみ。権限はサーバーで検証） */
export function useStoredOrgId(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function setStoredOrgId(orgId: string) {
  try {
    localStorage.setItem(KEY, orgId);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
