"use client";
import { useState } from "react";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { SpeakButton } from "@/components/SpeakButton";
import type { FigureView } from "@/server/services/figures";

type Slide = { seq: number; title: string; proposition: string | null; bodyMd: string; detailMd: string | null; voiceText: string; figures: FigureView[] };

function splitFirst(body: string) {
  const parts = body.split(/(?<=。)/).filter(Boolean);
  return { first: parts[0] ?? body, rest: parts.slice(1).join("") || null };
}

/**
 * 教材学習（Porcelain Blue）。Day 6 の並び（見出し → 要点 → 読み上げ → 本文 1 文 → 図 → くわしく）は維持し、
 * 390 の初期表示に図解が入らない問題に対して「図解ストリップ」を要点の直下に置く:
 *   3 枚の図の小さなプレビュー（正方形・ラベル付き）が 1 行に並び、タップで下の図解領域が切り替わる。
 * 初期表示で「図があること」「3 つの別々の情報であること」が伝わり、本文 1 文も画面内に残る。
 * fig=full では Day 6 と同じ通常サイズの図（比較用）。
 */
export function PbLearn({ title, slides, initialSeq, questionCount, figMode }: { title: string; slides: Slide[]; initialSeq: number; questionCount: number; figMode: "strip" | "full" }) {
  const [seq, setSeq] = useState(initialSeq);
  const [active, setActive] = useState(0);
  const slide = slides[seq - 1];
  const total = slides.length;
  const figs = slide.figures.filter((f) => f.reviewStatus === "approved" && f.src);
  const cur = figs[Math.min(active, Math.max(0, figs.length - 1))];
  const { first, rest } = splitFirst(slide.bodyMd);
  const detail = [rest, slide.detailMd].filter(Boolean).join("\n");
  const voice = `${slide.title}。${slide.proposition ? slide.proposition + "。" : ""}${slide.voiceText}`;

  return (
    <>
      <main className="space-y-4 pb-24">
        <header className="space-y-1.5">
          <div className="flex items-center justify-between">
            <a href="#" className="tap-link text-accent">
              ← ホームへ
            </a>
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
            <button className="btn btn-ghost min-h-11 px-2 text-sm">☰ 目次</button>
          </div>
        </header>

        <article className="space-y-3.5">
          <h1 className="text-[1.65rem] font-bold leading-snug">{slide.title}</h1>
          {slide.proposition && <p className="text-xl font-bold leading-relaxed text-ink">{slide.proposition}</p>}
          <SpeakButton text={voice} compact />
          {figMode === "strip" && figs.length > 0 && (
            <div className="space-y-1" aria-label="この画面の図解">
              <div className="pb-figstrip" role="tablist" aria-label="図解を選ぶ">
                {figs.map((f, i) => (
                  <button key={f.placementId} role="tab" aria-selected={i === active} onClick={() => setActive(i)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.src!} alt="" />
                    <span>{f.tabLabel ?? f.labels[0]?.text ?? "図"}</span>
                  </button>
                ))}
              </div>
              {figs.length > 1 && <p className="text-xs text-ink-soft">{figs.length} つの図は別々の情報です。病気が進む順番ではありません。タップで下の図が切り替わります。</p>}
            </div>
          )}
          <p className="whitespace-pre-wrap leading-[1.8] text-[1.05rem]">{first}</p>

          {cur && (
            <figure className="card space-y-2.5" aria-label={cur.altText}>
              {figMode === "full" && figs.length > 1 && (
                <>
                  <p className="text-sm text-ink-soft font-bold">{figs.length} つの図は別々の情報です。病気が進む順番ではありません。</p>
                  <div role="tablist" className="flex flex-wrap gap-1.5">
                    {figs.map((f, i) => (
                      <button key={f.placementId} role="tab" aria-selected={i === active} className={`btn min-h-11 px-4 text-sm ${i === active ? "btn-primary" : ""}`} onClick={() => setActive(i)}>
                        {f.tabLabel ?? f.labels[0]?.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="relative w-full overflow-hidden rounded-2xl bg-sora" style={{ aspectRatio: cur.width && cur.height ? `${cur.width} / ${cur.height}` : "1 / 1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cur.src!} alt={cur.altText} className="absolute inset-0 w-full h-full object-contain" />
                {cur.labels.map((l) => (
                  <span key={l.id}>
                    <i className="fig-anchor" style={{ left: `${l.anchor.x}%`, top: `${l.anchor.y}%` }} aria-hidden />
                    <span className="fig-label" style={{ left: `${l.anchor.x + (l.offset?.x ?? 0)}%`, top: `${l.anchor.y + (l.offset?.y ?? 18)}%` }}>
                      {l.text}
                    </span>
                  </span>
                ))}
              </div>
              {cur.caption && <figcaption className="text-sm text-ink-soft leading-relaxed">{cur.caption}</figcaption>}
              <details className="text-xs text-ink-soft">
                <summary className="cursor-pointer min-h-11 flex items-center">図について（監修・出典）</summary>
                <p>{cur.reviewScopeNote ?? "模式図"}{cur.sourceNote ? ` ・ 出典: ${cur.sourceNote}` : ""}</p>
              </details>
            </figure>
          )}

          {detail && (
            <details className="group">
              <summary className="cursor-pointer min-h-12 flex items-center gap-2 font-bold text-accent">
                <span aria-hidden className="group-open:hidden">＋</span>
                <span aria-hidden className="hidden group-open:inline">－</span>
                くわしく読む
              </summary>
              <p className="whitespace-pre-wrap leading-[1.8] text-ink-soft mt-1">{detail}</p>
            </details>
          )}
        </article>
      </main>
      <div className="fixed inset-x-0 bottom-0 bg-bg/95 backdrop-blur border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
