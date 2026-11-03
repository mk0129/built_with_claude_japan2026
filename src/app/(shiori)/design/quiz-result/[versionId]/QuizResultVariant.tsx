"use client";
import { useState } from "react";
import Link from "next/link";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { SELECTION_LABEL, fmtScore } from "@/lib/labels";

export type ResultVariant = "current" | "proposed";
type Q = {
  questionId: string;
  seq: number;
  stem: string;
  options: string[];
  relatedSlideSeq: number | null;
  answer: { selectedIndex: number | null; isUnknown: boolean; isCorrect: boolean; correctIndex: number; explanation: string };
};
const LETTERS = ["ア", "イ", "ウ"];

export function QuizResultVariant({ variant, screen, title, versionId, questions }: { variant: ResultVariant; screen: "result" | "question"; title: string; versionId: string; questions: Q[] }) {
  if (screen === "question") return <QuestionScreen variant={variant} title={title} q={questions[1]} total={questions.length} />;
  return variant === "current" ? <CurrentResult title={title} versionId={versionId} questions={questions} /> : <ProposedResult title={title} versionId={versionId} questions={questions} />;
}

/* ---------------- 現行（QuizClient の結果画面を再現。比較用） ---------------- */
function CurrentResult({ title, versionId, questions }: { title: string; versionId: string; questions: Q[] }) {
  const missed = questions.filter((x) => !x.answer.isCorrect);
  const correct = questions.filter((x) => x.answer.isCorrect);
  const total = questions.length;
  const nWrong = missed.filter((x) => !x.answer.isUnknown).length;
  const nUnknown = missed.filter((x) => x.answer.isUnknown).length;
  const scorePct = (correct.length / total) * 100;
  return (
    <main className="space-y-4" data-variant="current">
      <p className="text-xs rounded-lg bg-suna px-2 py-1 text-ink-soft">比較用プレビュー ・ 現行の結果画面（回答は架空）</p>
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <Link href="/design" className="tap-link">
            ← 比較一覧
          </Link>
          <FontSizeToggle />
        </div>
        <p className="text-sm text-ink-soft">{title} ・ 確認問題</p>
        <h1 className="text-2xl font-bold leading-snug">
          確認を終えました。
          <br />
          おつかれさまでした。
        </h1>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="pill font-bold text-ink">
            <span aria-hidden className="inline-flex w-4.5 h-4.5 rounded-full bg-ok text-white text-[11px] items-center justify-center mr-1.5">✓</span>確認できた {correct.length}
          </span>
          <span className="pill font-bold text-ink">
            <span aria-hidden className="inline-flex w-4.5 h-4.5 rounded-full bg-danger text-white text-[11px] items-center justify-center mr-1.5">！</span>
            {nWrong}
          </span>
          <span className="pill font-bold text-ink">
            <span aria-hidden className="inline-flex w-4.5 h-4.5 rounded-full bg-[#a67a5e] text-white text-[11px] items-center justify-center mr-1.5">?</span>
            {nUnknown}
          </span>
        </div>
      </header>
      <section className="card space-y-3 border-2 border-suna">
        <h2 className="font-bold text-lg">もう一度確認できるところ</h2>
        <ul className="space-y-3">
          {missed.map((x) => (
            <li key={x.questionId} className="pt-3 border-t border-line first:border-t-0 first:pt-0 space-y-1">
              <p className="text-sm text-ink-soft flex items-center gap-2">
                <span aria-hidden className={`inline-flex w-5 h-5 rounded-full text-white text-[11px] items-center justify-center ${x.answer.isUnknown ? "bg-[#a67a5e]" : "bg-danger"}`}>
                  {x.answer.isUnknown ? "?" : "！"}
                </span>
                {x.answer.isUnknown ? "「わからない」と答えました" : "ちがう答えを選びました"}
              </p>
              <p className="font-bold leading-snug">{x.stem}</p>
              <p className="text-sm text-ink-soft">
                正解: {LETTERS[x.answer.correctIndex]} {x.options[x.answer.correctIndex]}
              </p>
              <details className="text-sm text-ink-soft">
                <summary className="cursor-pointer min-h-11 flex items-center">解説を読む</summary>
                <p className="leading-relaxed">{x.answer.explanation}</p>
              </details>
              <span className="tap-link text-accent font-bold">{x.relatedSlideSeq ? `${x.relatedSlideSeq} 画面目を読み直す →` : "説明を読み直す →"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-lg">次にできること</h2>
          <details className="text-sm">
            <summary className="pill cursor-pointer">
              正解 {correct.length} / {total} 問
            </summary>
            <div className="mt-2 text-ink-soft space-y-1">
              <p>
                点数: {fmtScore(scorePct)}（まちがい {nWrong} ・ わからない {nUnknown}）
              </p>
              <p className="text-xs">点数は次の診察で先生と確認する材料です。良し悪しを表すものではありません。</p>
            </div>
          </details>
        </div>
        <div className="grid gap-2">
          <button className="btn">もう一度挑戦する</button>
          <Link href={`/learn/${versionId}`} className="btn btn-ghost">
            説明をはじめから読み直す
          </Link>
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold text-lg">次の診察で聞きたいこと</h2>
        <p className="text-sm text-ink-soft">読んでみて、いまの気持ちに近いものを選んでください。質問があれば次の診察で先生が確認します。</p>
        <div className="grid gap-2">
          {Object.entries(SELECTION_LABEL).map(([k, label]) => (
            <button key={k} className="btn justify-start">
              {label}
            </button>
          ))}
        </div>
        <label className="label">質問や気になったこと（任意）</label>
        <textarea className="input py-2 min-h-24" placeholder="次の診察で先生が確認します" readOnly />
        <p className="text-xs text-ink-muted">ここはすぐに返信が来る窓口ではありません。緊急のときは病院の連絡先へ。</p>
        <button className="btn btn-primary btn-block" disabled>
          送る
        </button>
      </section>
    </main>
  );
}

/* ---------------- 改善案 ---------------- */
/**
 * 方針:
 * 1. 見出し直下に「今回の確認」を 1 行で: 理解できた N ・ もう一度 N ・ わからない N（大きな点数は出さない。点数は折りたたみ）
 * 2. 最上段に「次の診察で聞く」カード: 誤答・わからないの問いが候補として自動で並び、タップで質問に入れる。4 択は 2 列、自由記述は選択後に展開
 * 3. 「もう一度確認したいこと」: あなたの答え／正解を並べて表示、読み直すボタンは大きく
 * 4. 「今回理解できたこと」: ✓ 付きの短い一覧で肯定的に締める
 * 5. 「次にできること」: 再挑戦・読み直しは残す
 */
function ProposedResult({ title, versionId, questions }: { title: string; versionId: string; questions: Q[] }) {
  const missed = questions.filter((x) => !x.answer.isCorrect);
  const correct = questions.filter((x) => x.answer.isCorrect);
  const total = questions.length;
  const nWrong = missed.filter((x) => !x.answer.isUnknown).length;
  const nUnknown = missed.filter((x) => x.answer.isUnknown).length;
  const [asked, setAsked] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const toggleAsk = (id: string) => setAsked((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const scorePct = (correct.length / total) * 100;

  return (
    <main className="space-y-4" data-variant="proposed">
      <p className="text-xs rounded-lg bg-suna px-2 py-1 text-ink-soft">比較用プレビュー ・ 改善案（回答は架空）</p>
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <Link href="/design" className="tap-link">
            ← 比較一覧
          </Link>
          <FontSizeToggle />
        </div>
        <p className="text-sm text-ink-soft">{title} ・ 確認問題</p>
        <h1 className="text-2xl font-bold leading-snug">確認を終えました。おつかれさまでした。</h1>
        <ul className="grid grid-cols-3 gap-2 text-center" aria-label="今回の確認">
          <li className="rounded-2xl bg-wakakusa px-2 py-2">
            <p className="text-2xl font-bold leading-none">{correct.length}</p>
            <p className="text-xs mt-1">理解できた</p>
          </li>
          <li className="rounded-2xl bg-sakura px-2 py-2">
            <p className="text-2xl font-bold leading-none">{nWrong}</p>
            <p className="text-xs mt-1">もう一度</p>
          </li>
          <li className="rounded-2xl bg-suna px-2 py-2">
            <p className="text-2xl font-bold leading-none">{nUnknown}</p>
            <p className="text-xs mt-1">わからない</p>
          </li>
        </ul>
        <p className="text-sm text-ink-soft">全 {total} 問。わからなかったことは、次の診察で先生と確認できます。</p>
      </header>

      {/* 1. 次の診察で聞く（最上段） */}
      <section className="card space-y-3 border-2 border-accent" aria-labelledby="ask-title">
        <h2 id="ask-title" className="font-bold text-lg">次の診察で先生に聞く</h2>
        {missed.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm text-ink-soft">今回「もう一度」「わからない」だった内容を、質問として先生に送れます。</p>
            {missed.map((x) => {
              const on = asked.includes(x.questionId);
              return (
                <button key={x.questionId} className={`w-full text-left rounded-2xl border px-3 py-2.5 flex items-start gap-2.5 min-h-[56px] ${on ? "border-accent bg-wakakusa" : "border-line bg-surface"}`} aria-pressed={on} onClick={() => toggleAsk(x.questionId)}>
                  <span aria-hidden className={`mt-0.5 inline-flex w-6 h-6 rounded-full border-2 items-center justify-center text-sm shrink-0 ${on ? "bg-accent border-accent text-white" : "border-line"}`}>
                    {on ? "✓" : ""}
                  </span>
                  <span className="text-sm leading-snug">{x.stem}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SELECTION_LABEL).map(([k, label]) => (
            <button key={k} className={`btn text-sm px-2 ${selection === k ? "btn-soft" : ""}`} aria-pressed={selection === k} onClick={() => setSelection(k)}>
              {label}
            </button>
          ))}
        </div>
        {(selection || asked.length > 0) && (
          <div className="space-y-2">
            <label className="label" htmlFor="ask-text">
              ほかに聞きたいこと（任意）
            </label>
            <textarea id="ask-text" className="input py-2 min-h-20" placeholder="例: 薬をいつまで続けるのか" readOnly />
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={!selection && asked.length === 0}>
          {asked.length > 0 ? `質問 ${asked.length} 件を先生に送る` : "先生に送る"}
        </button>
        <p className="text-xs text-ink-muted">すぐの返信はありません。緊急のときは病院の連絡先へ。</p>
      </section>

      {/* 2. もう一度確認したいこと */}
      {missed.length > 0 && (
        <section className="card space-y-3" aria-labelledby="review-title">
          <h2 id="review-title" className="font-bold text-lg">もう一度確認したいこと</h2>
          <ul className="space-y-4">
            {missed.map((x) => (
              <li key={x.questionId} className="space-y-2 pt-3 border-t border-line first:border-t-0 first:pt-0">
                <p className="font-bold leading-snug">{x.stem}</p>
                <dl className="text-sm space-y-1">
                  <div className="flex gap-2">
                    <dt className="shrink-0 w-[5.5em] text-ink-soft">{x.answer.isUnknown ? "あなた" : "あなたの答え"}</dt>
                    <dd className={x.answer.isUnknown ? "text-ink-soft" : "line-through text-ink-soft"}>{x.answer.isUnknown ? "わからない" : `${LETTERS[x.answer.selectedIndex!]} ${x.options[x.answer.selectedIndex!]}`}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 w-[5.5em] text-ink-soft">正解</dt>
                    <dd className="font-bold">
                      {LETTERS[x.answer.correctIndex]} {x.options[x.answer.correctIndex]}
                    </dd>
                  </div>
                </dl>
                <p className="text-sm leading-relaxed text-ink-soft">{x.answer.explanation}</p>
                <Link href={`/learn/${versionId}${x.relatedSlideSeq ? `?slide=${x.relatedSlideSeq}` : ""}`} className="btn btn-block text-sm">
                  {x.relatedSlideSeq ? `${x.relatedSlideSeq} 画面目を読み直す` : "説明を読み直す"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 3. 今回理解できたこと */}
      <section className="card space-y-2" aria-labelledby="ok-title">
        <h2 id="ok-title" className="font-bold text-lg">今回理解できたこと</h2>
        {correct.length === 0 ? (
          <p className="text-sm text-ink-soft">今回は難しかったかもしれません。読み直してからもう一度試せます。</p>
        ) : (
          <ul className="space-y-1.5">
            {correct.map((x) => (
              <li key={x.questionId} className="flex items-start gap-2 text-sm">
                <span aria-hidden className="mt-0.5 inline-flex w-5 h-5 rounded-full bg-ok text-white text-[11px] items-center justify-center shrink-0">✓</span>
                <span>{x.options[x.answer.correctIndex]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. 次にできること */}
      <section className="card space-y-3">
        <h2 className="font-bold text-lg">次にできること</h2>
        <div className="grid gap-2">
          <button className="btn">もう一度挑戦する</button>
          <Link href={`/learn/${versionId}`} className="btn btn-ghost">
            説明をはじめから読み直す
          </Link>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer min-h-11 flex items-center text-ink-soft">点数を見る（先生と確認する材料です）</summary>
          <p className="text-ink-soft">点数: {fmtScore(scorePct)}。良し悪しを表すものではありません。</p>
        </details>
      </section>
    </main>
  );
}

/* ---------------- 出題画面の「押した直後」の状態比較 ---------------- */
function QuestionScreen({ variant, title, q, total }: { variant: ResultVariant; title: string; q: Q; total: number }) {
  const pendingIdx = 1; // 「イ」を押した直後（保存中）を再現
  return (
    <main className="space-y-4" data-variant={variant}>
      <p className="text-xs rounded-lg bg-suna px-2 py-1 text-ink-soft">比較用プレビュー ・ 回答をタップした直後（保存中）の見え方 ・ {variant === "current" ? "現行" : "改善案"}</p>
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <Link href="/design" className="tap-link">
            ← 比較一覧
          </Link>
          <FontSizeToggle />
        </div>
        <h1 className="text-lg font-bold leading-snug">{title}</h1>
        <p className="text-sm text-ink-soft">確認問題 2 / {total}</p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= 1 ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      </header>
      <section className="card space-y-4">
        <p className="text-lg font-bold leading-relaxed">{q.stem}</p>
        <div className="grid gap-2">
          {q.options.map((opt, i) => {
            if (variant === "current") {
              // 現行: busy 中は全ボタン disabled → opacity は .btn-option:disabled で 1 のまま、押した選択肢に変化なし
              return (
                <button key={i} className="btn btn-option" disabled>
                  <span className="font-bold mr-2 shrink-0">{LETTERS[i]}</span>
                  <span>{opt}</span>
                </button>
              );
            }
            const pending = i === pendingIdx;
            return (
              <button key={i} className="btn btn-option" disabled data-state={pending ? "pending" : "dim"} style={pending ? { background: "var(--sora)", borderColor: "var(--ink)", borderWidth: 2, fontWeight: 700 } : undefined} aria-pressed={pending}>
                <span className="font-bold mr-2 shrink-0">{LETTERS[i]}</span>
                <span>{opt}</span>
                {pending && <span className="ml-auto pill text-xs shrink-0">選択中…</span>}
              </button>
            );
          })}
          <button className="btn btn-unknown" disabled data-state={variant === "proposed" ? "dim" : undefined}>
            わからない
          </button>
        </div>
        {variant === "proposed" && (
          <p className="text-sm text-ink-soft" role="status">
            記録しています…
          </p>
        )}
      </section>
      {variant === "current" && <p className="text-center text-sm text-ink-muted">答えると解説が見られます。あとからもう一度挑戦することもできます。</p>}
    </main>
  );
}
