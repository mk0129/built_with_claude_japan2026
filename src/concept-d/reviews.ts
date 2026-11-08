"use client";

/**
 * 学習記録「もう一度確認したいこと」の既読（「理解した」）。教材ごとに、理解したと記録した時点の理解確認の完了日時を持つ。
 * 一覧は、教材の最新の完了日時と一致する間だけ外す（あらためて理解確認を受けてまた間違えたら戻る）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";

export type ReviewAck = { materialId: string; attemptCompletedAt: string | null; ackedAt: string };
export type PatientReviewAcks = ReturnType<typeof usePatientReviewAcks>;

export function usePatientReviewAcks(notify: (message: string) => void) {
  const [acks, setAcks] = useState<ReviewAck[] | undefined>(undefined);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  useEffect(() => {
    api<{ acks: ReviewAck[] }>("/api/v1/learn/reviews")
      .then((r) => setAcks(r.acks))
      .catch((e) => {
        setAcks([]);
        notifyRef.current(errorText(e));
      });
  }, []);
  const call = useCallback(async (path: string, init?: { method?: string; json?: unknown }) => {
    try {
      setAcks((await api<{ acks: ReviewAck[] }>(path, init)).acks);
      return true;
    } catch (e) {
      notifyRef.current(errorText(e));
      return false;
    }
  }, []);
  const ack = useCallback((materialId: string, completedAt: string | null) => call("/api/v1/learn/reviews", { json: { materialId, completedAt } }), [call]);
  const unack = useCallback((materialId: string) => call(`/api/v1/learn/reviews/${materialId}`, { method: "DELETE" }), [call]);
  /** その教材の最新の完了日時に対して「理解した」が記録されているか */
  const isAcked = useCallback(
    (materialId: string, completedAt: string | null) => {
      const a = acks?.find((x) => x.materialId === materialId);
      if (!a) return false;
      const t = (v: string | null) => (v ? new Date(v).getTime() : null);
      return t(a.attemptCompletedAt) === t(completedAt);
    },
    [acks],
  );
  return { loaded: acks !== undefined, acks: acks ?? [], ack, unack, isAcked };
}
