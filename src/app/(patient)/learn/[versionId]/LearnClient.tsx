"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { DOMAIN_LABEL } from "@/lib/labels";
import { SpeakButton } from "@/components/SpeakButton";
import { Illustration } from "@/components/Illustration";
import { FontSizeToggle } from "@/components/FontSizeToggle";

type View = {
  versionId: string;
  title: string;
  summary: string | null;
  primaryDomain: string;
  learningObjectives: string[];
  isCurrentVersion: boolean;
  slides: { seq: number; title: string; bodyMd: string; imageRef: string | null; voiceText: string }[];
  questionCount: number;
  progress: { phase: string; lastSlideSeq: number };
};

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

  return (
    <main className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <Link href="/home" className="tap-link">
            ← ホームへ
          </Link>
          <FontSizeToggle />
        </div>
        <h1 className="text-xl font-bold leading-snug">{view.title}</h1>
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="pill">{DOMAIN_LABEL[view.primaryDomain] ?? view.primaryDomain}</span>
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
                <button className={`text-left w-full min-h-11 py-1 ${s.seq === seq ? "font-bold text-accent" : ""}`} onClick={() => { go(s.seq); setShowToc(false); }}>
                  {s.seq}. {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex gap-1" aria-label={`${total} 画面中 ${seq} 画面目`}>
        {view.slides.map((s) => (
          <span key={s.seq} className={`h-1.5 flex-1 rounded-full ${s.seq <= seq ? "bg-accent" : "bg-line"}`} />
        ))}
      </div>

      <article className="card space-y-4" aria-live="polite">
        <Illustration name={slide.imageRef} />
        <h2 className="text-lg font-bold">{slide.title}</h2>
        <p className="whitespace-pre-wrap leading-relaxed">{slide.bodyMd}</p>
        <SpeakButton text={`${slide.title}。${slide.voiceText}`} />
      </article>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn" disabled={seq <= 1} onClick={() => go(seq - 1)}>
          前へ
        </button>
        {seq < total ? (
          <button className="btn btn-primary" onClick={() => go(seq + 1)}>
            次へ
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
      <p className="text-center text-sm text-ink-muted">
        {seq} / {total}
      </p>
    </main>
  );
}
