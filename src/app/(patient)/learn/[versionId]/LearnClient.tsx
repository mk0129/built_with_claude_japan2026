"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SpeakButton } from "@/components/SpeakButton";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { Icon } from "@/components/reset/Icons";
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

/** 本文を「短い説明（1 文目）」と「くわしい説明（残り）」に分ける */
function splitFirstSentence(body: string): { first: string; rest: string | null } {
  const parts = body.split(/(?<=。)/).filter((s) => s.trim());
  if (parts.length <= 1) return { first: body, rest: null };
  return { first: parts[0], rest: parts.slice(1).join("") };
}

/**
 * 教材（Experience Reset 01）: 進捗 → 「n / N 今日の学び」→ 見出し → 要点（左罫の箱）→ 説明を聞く → 短い説明 →
 * 図解（3 タブ・大きな 1 枚・caption）→ 注記 → くわしい説明・監修情報 → 固定の「戻る／次のページへ」。
 * 進捗の自動保存・音声・確認問題への遷移は従来どおり。図解は承認済みのものだけが渡される。
 */
export function LearnClient({ view, initialSeq }: { view: View; initialSeq: number }) {
  const router = useRouter();
  const [seq, setSeq] = useState(initialSeq);
  const [showToc, setShowToc] = useState(false);
  const [figIdx, setFigIdx] = useState(0);
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
    setFigIdx(0);
    window.scrollTo({ top: 0 });
  }

  const voice = `${slide.title}。${slide.proposition ? slide.proposition + "。" : ""}${slide.voiceText}`;
  const { first, rest } = splitFirstSentence(slide.bodyMd);
  const detail = [rest, slide.detailMd].filter(Boolean).join("\n");
  const figures = slide.figures.filter((f) => f.reviewStatus === "approved" && f.src);
  const fig = figures[Math.min(figIdx, Math.max(0, figures.length - 1))] ?? null;
  const supervision = figures.map((f) => [f.reviewScopeNote, f.sourceNote ? `出典: ${f.sourceNote}` : null, f.longDescription].filter(Boolean).join(" ")).filter(Boolean);

  return (
    <>
      <header className="rs-header">
        <Link href="/home" className="rs-icon-btn -ml-2" aria-label="ホームへ戻る">
          <Icon name="back" />
        </Link>
        <span className="rs-heading-small flex-1 text-center px-1">{view.title}</span>
        <div className="flex items-center -mr-2">
          <button className="rs-icon-btn" onClick={() => setShowToc((v) => !v)} aria-expanded={showToc} aria-label="目次" title="目次">
            <Icon name="list" />
          </button>
          <FontSizeToggle variant="icon" />
        </div>
      </header>
      <main className="rs-content" style={{ paddingTop: 18 }}>
        <div className="rs-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={seq} aria-label={`${total} 画面中 ${seq} 画面目`}>
          <div style={{ width: `${(seq / total) * 100}%` }} />
        </div>
        <div className="rs-eyebrow">
          {seq} / {total}　今日の学び
        </div>
        {showToc && (
          <nav className="rs-small-card mt-2" aria-label="目次">
            <ol>
              {view.slides.map((s) => (
                <li key={s.seq}>
                  <button
                    className={`rs-item-row w-full text-left ${s.seq === seq ? "font-bold text-[color:var(--blue)]" : ""}`}
                    onClick={() => {
                      go(s.seq);
                      setShowToc(false);
                    }}
                  >
                    <span className="rs-item-title">
                      {s.seq}. {s.title}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {!view.isCurrentVersion && <p className="rs-muted mt-2">この教材には新しい版があります。内容は処方時の版です。</p>}

        <article aria-live="polite">
          <h1 className="rs-h1">{slide.title}</h1>
          {slide.proposition && <div className="rs-prop">{slide.proposition}</div>}
          <SpeakButton text={voice} variant="reset" />
          <p className="rs-short" data-learn-body>
            {first}
          </p>

          {fig && (
            <figure className="rs-figure" aria-label={fig.altText}>
              {figures.length > 1 && (
                <div className="rs-segments" role="tablist" aria-label="図解を選ぶ">
                  {figures.map((f, i) => (
                    <button key={f.placementId} role="tab" aria-selected={i === figIdx} className="rs-segment" onClick={() => setFigIdx(i)}>
                      {f.shortLabel ?? f.tabLabel ?? `図 ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
              <div className="rs-figmain">
                <div className="frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fig.src!} alt={fig.altText} />
                  {/* 図の上には番号の点だけを置き、名称は図の下の凡例に移す（ラベル同士の重なりで図を隠さない） */}
                  {fig.labels.map((l, i) => (
                    <span key={l.id} className="rs-figpin" style={{ left: `${l.anchor.x}%`, top: `${l.anchor.y}%` }} aria-hidden>
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
              {fig.labels.length > 0 && (
                <ol className="rs-figlegend" aria-label="図の番号の意味">
                  {fig.labels.map((l, i) => (
                    <li key={l.id}>
                      <span className="rs-figpin inline">{i + 1}</span>
                      {l.text}
                    </li>
                  ))}
                </ol>
              )}
              <figcaption className="rs-figcaption">{fig.caption ?? fig.altText}</figcaption>
            </figure>
          )}
          {figures.length > 1 && (
            <p className="rs-fignote" data-figure-note>
              <Icon name="help" size="sm" />
              <span>{figures.length}つの図は別々の情報です。病気がこの順番に進むという意味ではありません。</span>
            </p>
          )}

          {(detail || supervision.length > 0) && (
            <details className="rs-small-card rs-details" data-figure-about style={{ marginTop: figures.length > 1 ? 0 : 9 }}>
              <summary>
                <Icon name="book" size="sm" />
                くわしい説明・監修情報を確認する
              </summary>
              {detail && <p className="rs-body">{detail}</p>}
              {supervision.length > 0 && (
                <div className="rs-muted mt-2 space-y-1">
                  <p className="font-bold">図について（監修・出典）</p>
                  {supervision.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              )}
            </details>
          )}
        </article>
      </main>

      <div className="rs-cta">
        <div>
          {seq > 1 ? (
            <button className="rs-btn outline" onClick={() => go(seq - 1)}>
              戻る
            </button>
          ) : (
            <Link href="/home" className="rs-btn outline">
              戻る
            </Link>
          )}
          {seq < total ? (
            <button className="rs-btn primary flex-1" onClick={() => go(seq + 1)}>
              次のページへ <Icon name="arrow" size="sm" />
            </button>
          ) : (
            <button
              className="rs-btn primary flex-1"
              onClick={async () => {
                await api(`/api/v1/learn/${view.versionId}/progress`, { json: { lastSlideSeq: seq, phase: "quiz" } }).catch(() => {});
                router.push(`/quiz/${view.versionId}`);
              }}
            >
              確認問題へ（{view.questionCount}問） <Icon name="arrow" size="sm" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
