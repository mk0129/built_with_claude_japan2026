"use client";

/**
 * 患者ホーム: 次回の診察日（患者が登録した日付だけ。未登録なら null）と、残り日数の計算（Asia/Tokyo の暦日）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";

export type PatientVisit = ReturnType<typeof usePatientVisit>;

/** Asia/Tokyo の今日（YYYY-MM-DD） */
export const tokyoToday = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** 次回の診察日までの日数（今日 = 0、過ぎた日は負） */
export function daysUntil(date: string, now = new Date()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${tokyoToday(now)}T00:00:00Z`)) / 864e5);
}

/** 「11月19日（水）」 */
export function visitDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${"日月火水木金土"[d.getUTCDay()]}）`;
}

export function usePatientVisit(notify: (message: string) => void) {
  const [visit, setVisit] = useState<{ date: string } | null | undefined>(undefined);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  useEffect(() => {
    api<{ visit: { date: string } | null }>("/api/v1/next-visit")
      .then((r) => setVisit(r.visit))
      .catch((e) => {
        setVisit(null);
        notifyRef.current(errorText(e));
      });
  }, []);
  /** 保存（null で削除）。保存できたときだけ表示を変える */
  const save = useCallback(async (date: string | null) => {
    try {
      const r = await api<{ visit: { date: string } | null }>("/api/v1/next-visit", { method: "PUT", json: { date } });
      setVisit(r.visit);
      return true;
    } catch (e) {
      notifyRef.current(errorText(e));
      return false;
    }
  }, []);
  return { loaded: visit !== undefined, date: visit?.date ?? null, save };
}
