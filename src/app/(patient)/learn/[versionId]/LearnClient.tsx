"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SpeakButton } from "@/components/SpeakButton";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { FigureSet } from "@/components/patient/FigureSet";
import type { FigureView } from "@/server/services/figures";

type Slide = { seq: number; title: string; proposition: string | null; bodyMd: string; detailMd: string | null; voiceText: string; figures: FigureView[] };
type View = {
  versionId: string;
  title: string;
  summary: string | null;
  primaryDomain: string;
  learningObjectives: string[];
  isCurrentVersion: boolean;
  slides: Slide[];
  questionCount: number;
  progress: { phase: string; lastSlideSeq: number };
};

/** 本文を「最初の 1 文」と「残り」に分ける（文の切れ目は「。」） */
function splitFirstSentence(body: string): { first: string; rest: string | null } {
  const parts = body.split(/(?<=。)/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return { first: body.trim(), rest: null };
  return { first: parts[0], rest: parts.slice(1).join("") };
}

/**
 * 教材（C2・2026-11-03 折衷案）:
 * 見出し → 要点（結論） → 読み上げ → 本文の最初の 1 文（補足） → 医学図解（承認済みのみ） → くわしく読む（残りの本文 + 補足） → 固定の前へ/次へ
 * 要点と読み上げが最初の表示に入り、図解は本文 1 文の下に続く。
 */
export function LearnClient({ view, initialSeq }: { view: View; initialSeq: number }) {
  const router = useRouter();
  const [seq, setSeq] = useState(initialSeq);
  const [showToc, setShowToc] = useState(false);
  const slide = view.slides[seq - 1];
  const total = view.slides.length;
  const saved = useRef<number | null>(null);

  // 画面移動ごとに自動保存（LEARN-02）
  useEffect(() => {
    if (saved.current === seq) return;
    saved.current = seq;
    void api(`/api/v1/learn/${view.versionId}/progress`, { json: { lastSlideSeq: seq, phase: "reading" } }).catch(() => {});
  }, [seq, view.versionId]);

  function go(n: number) {
    setSeq(Math.min(Math.max(n, 1), total));
    window.scrollTo({ top: 0 });
  }

  const voice = `${slide.title}。${slide.proposition ? slide.proposition + "。" : ""}${slide.voiceText}`;
  const { first, rest } = splitFirstSentence(slide.bodyMd);
  const more = [rest, slide.detailMd].filter(Boolean).join("\n");

  return (
    <>
      <main className="space-y-4 pb-28">
        <header className="space-y-1">
          <div className="flex items-center justify-between">
            <Link href="/home" className="tap-link">
              ← ホームへ
            </Link>
            <FontSizeToggle />
          </div>
          <p className="text-sm text-ink-soft">{view.title}</p>
          <div className="prog" aria-label={`${total} 画面中 ${seq} 画面目`}>
            {view.slides.map((s) => (
              <i key={s.seq} className={s.seq <= seq ? "on" : ""} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-soft">
              {seq} / {total}
            </p>
            <button className="btn btn-ghost min-h-11 px-3 text-sm" onClick={() => setShowToc((v) => !v)} aria-expanded={showToc}>
              ☰ 目次
            </button>
          </div>
          {!view.isCurrentVersion && <p className="text-sm text-ink-soft">この教材には新しい版があります。内容は処方時の版です。</p>}
        </header>

        {showToc && (
          <nav className="card" aria-label="目次">
            <ol className="space-y-1">
              {view.slides.map((s) => (
                <li key={s.seq}>
                  <button
                    className={`text-left w-full min-h-11 py-1 ${s.seq === seq ? "font-bold text-accent" : ""}`}
                    onClick={() => {
                      go(s.seq);
                      setShowToc(false);
                    }}
                  >
                    {s.seq}. {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <article className="space-y-4" aria-live="polite">
          <h1 className="text-2xl font-bold leading-snug">{slide.title}</h1>
          {slide.proposition && <p className="text-xl font-bold leading-relaxed">{slide.proposition}</p>}
          <SpeakButton text={voice} compact />

          <p className="whitespace-pre-wrap leading-[1.8] text-[1.05rem]" data-learn-body>
            {first}
          </p>

          {/* 承認済みの図解だけが描画される。無い場合はこの領域は空になり、くわしくが続く */}
          <FigureSet figures={slide.figures} mode="patient" layout="tabs" />

          {more && (
            <details className="group">
              <summary className="cursor-pointer min-h-12 flex items-center gap-2 font-bold text-accent">
                <span aria-hidden className="group-open:hidden">＋</span>
                <span aria-hidden className="hidden group-open:inline">－</span>
                くわしく読む
              </summary>
              <p className="whitespace-pre-wrap leading-[1.8] mt-1">{more}</p>
            </details>
          )}
        </article>
      </main>

      <div className="fixed inset-x-0 bottom-0 bg-bg border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="max-w-md mx-auto grid grid-cols-[1fr_1.5fr] gap-2.5 px-4 py-3">
          <button className="btn" disabled={seq <= 1} onClick={() => go(seq - 1)}>
            前へ
          </button>
          {seq < total ? (
            <button className="btn btn-primary" onClick={() => go(seq + 1)}>
              次へ ・ {seq + 1} / {total}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={async () => {
                await api(`/api/v1/learn/${view.versionId}/progress`, { json: { lastSlideSeq: seq, phase: "quiz" } }).catch(() => {});
                router.push(`/quiz/${view.versionId}`);
              }}
            >
              確認問題へ（{view.questionCount}問）
            </button>
          )}
        </div>
      </div>
    </>
  );
}
