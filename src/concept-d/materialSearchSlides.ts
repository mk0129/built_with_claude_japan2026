"use client";

/**
 * 教材検索のためのスライド取得（本番・審査用公開デモの両方で動く）。
 *
 * 教材一覧（/api/v1/library）にはスライドの本文がないため、検索画面を開いたときだけ
 * 学習画面と同じ /api/v1/learn/{versionId}（GET・副作用なし）で取得する。
 * - 閲覧可否はサーバー（assertPatientHasVersion）が判定する。403 などで取れない教材は、題名などだけで探す。
 * - 渡すのは患者の教材一覧（visibleLessons）の版だけ。ほかの版の ID は渡さない。
 * - 審査用公開デモでは、同じパスを judge-patient-api.ts が fixtures から返す（サーバーなし）。
 * - 取得結果はこのフックの中だけに持つ（別の患者でログインし直したときに残さない）。
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { SearchSlide } from "./materialSearch";

type LearnSlides = { versionId: string; slides: SearchSlide[] };

/** 同時に取得する数（教材は十数件の想定） */
const CONCURRENCY = 4;

export function useMaterialSearchSlides(versionIds: readonly string[], enabled: boolean) {
  const cache = useRef(new Map<string, readonly SearchSlide[] | null>());
  const [slidesByVersion, setSlidesByVersion] = useState<Record<string, readonly SearchSlide[]>>({});
  const [pending, setPending] = useState(0);
  const key = [...new Set(versionIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    const missing = key.split(",").filter((id) => !cache.current.has(id));
    if (!missing.length) return;
    let stop = false;
    const queue = [...missing];
    const worker = async () => {
      while (!stop && queue.length) {
        const id = queue.shift()!;
        let slides: readonly SearchSlide[] | null = null;
        try {
          const view = await api<LearnSlides>(`/api/v1/learn/${encodeURIComponent(id)}`);
          slides = view.slides;
        } catch {
          slides = null; // 取れない教材は題名などだけで探す（エラーは通知しない）
        }
        // 取り消し後の結果は記録しない（次の実行で取り直し、表示と記録をそろえる）
        if (stop) continue;
        cache.current.set(id, slides);
        setPending((n) => Math.max(0, n - 1));
        if (slides) {
          const got = slides;
          setSlidesByVersion((prev) => ({ ...prev, [id]: got }));
        }
      }
    };
    void Promise.resolve().then(() => {
      if (stop) return;
      setPending(missing.length);
      return Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
    });
    return () => {
      stop = true;
    };
  }, [enabled, key]);

  return { slidesByVersion, loading: enabled && pending > 0 };
}
