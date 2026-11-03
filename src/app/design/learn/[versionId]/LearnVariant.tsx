"use client";
import { useState } from "react";
import Link from "next/link";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { FigureSet } from "@/components/patient/FigureSet";
import type { FigureView } from "@/server/services/figures";
import { CompactSpeakButton } from "./CompactSpeakButton";

export type Variant = "A" | "B" | "C";
type Slide = { seq: number; title: string; proposition: string | null; bodyMd: string; detailMd: string | null; voiceText: string; figures: FigureView[] };

/** 本文を「短い本文」（最初の 2 文）と「つづき」に分ける。文の切れ目は「。」 */
function splitBody(body: string, n = 2): { short: string; rest: string | null } {
  const parts = body.split(/(?<=。)/).filter(Boolean);
  if (parts.length <= n) return { short: body, rest: null };
  return { short: parts.slice(0, n).join(""), rest: parts.slice(n).join("") };
}

const VARIANT_LABEL: Record<Variant, string> = {
  A: "A: 図解 → 要点 → 本文",
  B: "B: 要点 → 図解 → 短い本文",
  C: "C: 要点 → 短い本文 → 図解 → 詳細",
};

/**
 * 3 案の共通方針（現行からの変更点）:
 * - 読み上げは見出し直下のコンパクトな行に置く（画面末尾の大きなボタンは廃止）
 * - 図の監修注記・出典は図の直下の 1 行にまとめ、「図について」で開く（毎回の長文注記をやめる）
 * - 複数図の「順番ではない」注記は本番 FigureSet の短文表示（常時表示）
 * 並び順だけが案ごとに異なる。
 */
export function LearnVariant({ variant, title, slides, initialSeq, questionCount }: { variant: Variant; title: string; slides: Slide[]; initialSeq: number; questionCount: number }) {
  const [seq, setSeq] = useState(initialSeq);
  const slide = slides[seq - 1];
  const total = slides.length;
  const voice = `${slide.title}。${slide.proposition ? slide.proposition + "。" : ""}${slide.voiceText}`;
  const { short, rest } = splitBody(slide.bodyMd);
  const detailText = [rest, slide.detailMd].filter(Boolean).join("\n");

  const heading = <h1 className="text-2xl font-bold leading-snug">{slide.title}</h1>;
  const proposition = slide.proposition ? <p className="text-xl font-bold leading-relaxed">{slide.proposition}</p> : null;
  const speak = <CompactSpeakButton text={voice} />;
  const figure = <FigureBlock figures={slide.figures} />;
  const fullBody = <p className="whitespace-pre-wrap leading-[1.8] text-[1.05rem]">{slide.bodyMd}</p>;
  const shortBody = <p className="whitespace-pre-wrap leading-[1.8] text-[1.05rem]">{short}</p>;
  const details = (text: string | null, label: string) =>
    text ? (
      <details className="group">
        <summary className="cursor-pointer min-h-12 flex items-center gap-2 font-bold text-accent">
          <span aria-hidden className="group-open:hidden">＋</span>
          <span aria-hidden className="hidden group-open:inline">－</span>
          {label}
        </summary>
        <p className="whitespace-pre-wrap leading-[1.8] text-ink-soft mt-1">{text}</p>
      </details>
    ) : null;

  let order: React.ReactNode;
  if (variant === "A") {
    order = (
      <>
        {heading}
        {speak}
        {figure}
        {proposition}
        {fullBody}
        {details(slide.detailMd, "くわしく読む")}
      </>
    );
  } else if (variant === "B") {
    order = (
      <>
        {heading}
        {proposition}
        {speak}
        {figure}
        {shortBody}
        {details(detailText || null, "つづきを読む")}
      </>
    );
  } else {
    order = (
      <>
        {heading}
        {proposition}
        {speak}
        {shortBody}
        {figure}
        {details(detailText || null, "くわしく読む")}
      </>
    );
  }

  return (
    <>
      <main className="space-y-4 pb-28" data-variant={variant}>
        <p className="text-xs rounded-lg bg-suna px-2 py-1 text-ink-soft">比較用プレビュー ・ {VARIANT_LABEL[variant]}</p>
        <header className="space-y-1">
          <div className="flex items-center justify-between">
            <Link href="/design" className="tap-link">
              ← 比較一覧
            </Link>
            <FontSizeToggle />
          </div>
          <p className="text-sm text-ink-soft">{title}</p>
          <div className="prog" aria-label={`${total} 画面中 ${seq} 画面目`}>
            {slides.map((s) => (
              <i key={s.seq} className={s.seq <= seq ? "on" : ""} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-soft">
              {seq} / {total}
            </p>
            <button className="btn btn-ghost min-h-11 px-3 text-sm" aria-expanded={false}>
              ☰ 目次
            </button>
          </div>
        </header>
        <article className="space-y-4" aria-live="polite">
          {order}
        </article>
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-bg border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="max-w-md mx-auto grid grid-cols-[1fr_1.5fr] gap-2.5 px-4 py-3">
          <button className="btn" disabled={seq <= 1} onClick={() => setSeq(seq - 1)}>
            前へ
          </button>
          {seq < total ? (
            <button className="btn btn-primary" onClick={() => setSeq(seq + 1)}>
              次へ ・ {seq + 1} / {total}
            </button>
          ) : (
            <button className="btn btn-primary">確認問題へ（{questionCount}問）</button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * 図解ブロック（比較案共通）。図の本体は本番と同じ FigureSet（承認済みのみ描画）。
 * 監修注記と出典は本番では図ごとに表示されるが、ここでは「図について」1 行にまとめる案を試す。
 */
function FigureBlock({ figures }: { figures: FigureView[] }) {
  const visible = figures.filter((f) => f.reviewStatus === "approved" && f.src);
  if (visible.length === 0) return null;
  const notes = Array.from(new Set(visible.map((f) => f.reviewScopeNote).filter(Boolean))) as string[];
  const sources = Array.from(new Set(visible.map((f) => f.sourceNote).filter(Boolean))) as string[];
  return (
    <div className="space-y-1 design-figure">
      <FigureSet figures={visible.map((f) => ({ ...f, reviewScopeNote: null, sourceNote: null }))} mode="patient" layout="tabs" />
      {(notes.length > 0 || sources.length > 0) && (
        <details className="text-xs text-ink-soft">
          <summary className="cursor-pointer min-h-11 flex items-center">図について（監修・出典）</summary>
          <div className="space-y-1 pl-1">
            {notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            {sources.map((s) => (
              <p key={s}>出典: {s}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
