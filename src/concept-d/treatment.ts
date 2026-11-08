"use client";

/**
 * 患者ホーム: 治療の記録（がん種・現在の治療・外来の日ごとの出来事）。患者が登録したものだけを表示し、推定しない。
 * 「今日」はサーバー（Asia/Tokyo の暦日。審査用デモでは架空症例の日付）から受け取る。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import { EMPTY_PROFILE, type TreatmentEvent, type TreatmentProfile } from "@/lib/treatment";

export type TreatmentData = { profile: TreatmentProfile; events: TreatmentEvent[]; today: string };
export type PatientTreatment = ReturnType<typeof usePatientTreatment>;

export function usePatientTreatment(notify: (message: string) => void) {
  const [data, setData] = useState<TreatmentData | null | undefined>(undefined);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  useEffect(() => {
    api<TreatmentData>("/api/v1/treatment")
      .then(setData)
      .catch((e) => {
        setData(null);
        notifyRef.current(errorText(e));
      });
  }, []);
  const call = useCallback(async (path: string, init?: { method?: string; json?: unknown }) => {
    try {
      setData(await api<TreatmentData>(path, init));
      return true;
    } catch (e) {
      notifyRef.current(errorText(e));
      return false;
    }
  }, []);
  const saveProfile = useCallback((profile: Partial<TreatmentProfile>) => call("/api/v1/treatment", { method: "PUT", json: profile }), [call]);
  const addEvent = useCallback(
    (event: { date: string; kind: TreatmentEvent["kind"]; label?: string | null; courseNo?: number | null }) => call("/api/v1/treatment/events", { json: event }),
    [call],
  );
  const deleteEvent = useCallback((id: string) => call(`/api/v1/treatment/events/${id}`, { method: "DELETE" }), [call]);
  return {
    loaded: data !== undefined,
    profile: data?.profile ?? EMPTY_PROFILE,
    events: data?.events ?? [],
    today: data?.today ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
    saveProfile,
    addEvent,
    deleteEvent,
  };
}
