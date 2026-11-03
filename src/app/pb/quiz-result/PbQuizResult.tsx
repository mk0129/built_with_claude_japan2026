"use client";
import { useState } from "react";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { SELECTION_LABEL } from "@/lib/labels";
import { IconCheck, IconQuestion, IconAlert } from "../Icons";

type Q = { id: string; stem: string; options: string[]; correctIndex: number; explanation: string; relatedSlideSeq: number | null; slideTitle: string; selectedIndex: number | null; isUnknown: boolean; isCorrect: boolean };
const LETTERS = ["ア", "イ", "ウ"];

/**
 * クイズ結果（Porcelain Blue）。Day 6 の構成（タイル → 次の診察に残す → もう一度確認 → 理解できた → 次にできること）を保ち、
 * 「次の診察に残す」を 2 段階にする:
 *   段階 1: 短い質問テーマ（関連画面のタイトル＋種別）をチップで選ぶ。文章は出さない
 *   段階 2: 選んだテーマごとに、短い定型文（1〜2 行）が編集欄に入る。4 択と自由記述はその下
 * 初期表示が文章で埋まらず、何を選ぶかが一目で分かる。送信は明示ボタンのみ（自動送信なし）。
 */
export function PbQuizResult({ title, questions }: { title: string; questions: Q[] }) {
  const missed = questions.filter((q) => !q.isCorrect);
  const correct = questions.filter((q) => q.isCorrect);
  const nWrong = missed.filter((q) => !q.isUnknown).length;
  const nUnknown = missed.filter((q) => q.isUnknown).length;
  const [picked, setPicked] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = (q: Q) => (q.isUnknown ? `『${q.slideTitle}』で、わからないところがありました。もう一度説明してほしいです。` : `『${q.slideTitle}』の「${q.options[q.correctIndex]}」がよくわかりませんでした。説明してほしいです。`);
  const toggle = (q: Q) => {
    setPicked((p) => (p.includes(q.id) ? p.filter((x) => x !== q.id) : [...p, q.id]));
    setTexts((t) => (t[q.id] ? t : { ...t, [q.id]: draft(q) }));
  };
  const total = picked.reduce((n, id) => n + (texts[id]?.length ?? 0), 0);

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <a href="#" className="tap-link text-accent">
            ← ホームへ
          </a>
          <FontSizeToggle />
        </div>
        <p className="text-sm text-ink-soft">{title} ・ 確認問題</p>
        <h1 className="text-[1.65rem] font-bold leading-snug">確認を終えました。おつかれさまでした。</h1>
        <ul className="grid grid-cols-3 gap-2 text-center" aria-label="今回の確認">
          <li className="rounded-2xl bg-wakakusa px-2 py-2.5">
            <p className="text-2xl font-bold leading-none text-ok">{correct.length}</p>
            <p className="text-[11px] mt-1.5 inline-flex items-center gap-0.5 whitespace-nowrap [&>svg]:w-3.5 [&>svg]:h-3.5"><IconCheck />理解できた</p>
          </li>
          <li className="rounded-2xl bg-sakura px-2 py-2.5">
            <p className="text-2xl font-bold leading-none text-danger">{nWrong}</p>
            <p className="text-[11px] mt-1.5 inline-flex items-center gap-0.5 whitespace-nowrap [&>svg]:w-3.5 [&>svg]:h-3.5"><IconAlert />もう一度</p>
          </li>
          <li className="rounded-2xl bg-suna px-2 py-2.5">
            <p className="text-2xl font-bold leading-none text-ink-soft">{nUnknown}</p>
            <p className="text-[11px] mt-1.5 inline-flex items-center gap-0.5 whitespace-nowrap [&>svg]:w-3.5 [&>svg]:h-3.5"><IconQuestion />わからない</p>
          </li>
        </ul>
      </header>

      {/* 次の診察に残す（2 段階） */}
      <section className="card space-y-3 border-2 border-accent" aria-labelledby="pb-ask">
        <p className="pb-eyebrow">次の診察で先生と確認</p>
        <h2 id="pb-ask" className="font-bold text-lg">次の診察に残す</h2>
        {saved ? (
          <p className="text-sm text-ink-soft">次の診察で先生が確認します。すぐの返信はありません。緊急のときは病院の連絡先へご連絡ください。</p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">聞きたいテーマを選ぶと、短い文が入ります。あとから直せます。</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="質問のテーマ">
              {missed.map((q) => {
                const on = picked.includes(q.id);
                return (
                  <button key={q.id} className={`btn min-h-11 px-3.5 text-sm ${on ? "btn-primary" : ""}`} aria-pressed={on} onClick={() => toggle(q)}>
                    {on ? "✓ " : ""}
                    {q.slideTitle}
                    <span className={`text-xs ${on ? "opacity-80" : "text-ink-soft"}`}>{q.isUnknown ? "わからない" : "もう一度"}</span>
                  </button>
                );
              })}
            </div>
            {picked.length > 0 && (
              <div className="space-y-2" aria-label="質問の文を直す">
                {picked.map((id) => (
                  <textarea key={id} className="input py-2 min-h-20 text-[0.98rem]" value={texts[id] ?? ""} onChange={(e) => setTexts({ ...texts, [id]: e.target.value })} maxLength={400} aria-label="質問の文" />
                ))}
                <p className="text-xs text-ink-muted text-right">{total} / 1000 文字</p>
              </div>
            )}
            <p className="text-sm text-ink-soft pt-1">読んでみて、いまの気持ちに近いもの</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SELECTION_LABEL).map(([k, label]) => (
                <button key={k} className={`btn text-sm px-2 min-h-[52px] ${selection === k ? "btn-soft" : ""}`} aria-pressed={selection === k} onClick={() => setSelection(k)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="btn btn-primary btn-block" disabled={!selection} onClick={() => setSaved(true)}>
              {picked.length > 0 ? `質問 ${picked.length} 件とあわせて次の診察に残す` : "次の診察に残す"}
            </button>
            <p className="text-xs text-ink-muted">すぐの返信はありません。緊急のときは病院の連絡先へ。</p>
          </>
        )}
      </section>

      {missed.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold text-lg">もう一度確認したいこと</h2>
          <ul className="space-y-4">
            {missed.map((q) => (
              <li key={q.id} className="space-y-2 pt-3 border-t border-line first:border-t-0 first:pt-0">
                <p className="font-bold leading-snug">{q.stem}</p>
                <dl className="text-sm space-y-1">
                  <div className="flex gap-2">
                    <dt className="shrink-0 w-[5.5em] text-ink-soft">{q.isUnknown ? "あなた" : "あなたの答え"}</dt>
                    <dd className={q.isUnknown ? "text-ink-soft" : "line-through text-ink-soft"}>{q.isUnknown ? "わからない" : `${LETTERS[q.selectedIndex!]} ${q.options[q.selectedIndex!]}`}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 w-[5.5em] text-ink-soft">正解</dt>
                    <dd className="font-bold">
                      {LETTERS[q.correctIndex]} {q.options[q.correctIndex]}
                    </dd>
                  </div>
                </dl>
                <p className="text-sm leading-relaxed text-ink-soft">{q.explanation}</p>
                <a href="#" className="btn btn-block text-sm">
                  {q.relatedSlideSeq ? `${q.relatedSlideSeq} 画面目を読み直す` : "説明を読み直す"}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-bold text-lg">今回理解できたこと</h2>
        <ul className="space-y-1.5">
          {correct.map((q) => (
            <li key={q.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden className="mt-0.5 inline-flex w-5 h-5 rounded-full bg-ok text-white items-center justify-center shrink-0">
                <IconCheck />
              </span>
              <span>{q.options[q.correctIndex]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-lg">次にできること</h2>
        <div className="grid gap-2">
          <a href="#" className="btn">
            もう一度挑戦する
          </a>
          <a href="#" className="btn btn-ghost">
            説明をはじめから読み直す
          </a>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer min-h-11 flex items-center text-ink-soft">点数を見る（先生と確認する材料です）</summary>
          <p className="text-ink-soft">点数: {Math.round((correct.length / questions.length) * 100)} 点。良し悪しを表すものではありません。</p>
        </details>
      </section>
    </main>
  );
}
