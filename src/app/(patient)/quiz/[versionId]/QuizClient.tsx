"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { SELECTION_LABEL, fmtScore } from "@/lib/labels";
import { FontSizeToggle } from "@/components/FontSizeToggle";

type Attempt = {
  attemptId: string;
  nQuestions: number;
  completedAt: string | null;
  scorePct: number | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  questions: {
    questionId: string;
    seq: number;
    stem: string;
    options: [string, string, string];
    relatedSlideSeq: number | null;
    answer: null | { selectedIndex: number | null; isUnknown: boolean; isCorrect: boolean; correctIndex: number; explanation: string };
  }[];
};
type AnswerResult = {
  isCorrect: boolean;
  isUnknown: boolean;
  correctIndex: number;
  explanation: string;
  relatedSlideSeq: number | null;
  completed: boolean;
  scorePct: number | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
};

const LETTERS = ["ア", "イ", "ウ"];

export function QuizClient({ versionId, title }: { versionId: string; title: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);

  function applyAttempt(a: Attempt) {
    setAttempt(a);
    setResult(null);
    const firstUnanswered = a.questions.findIndex((q) => q.answer === null);
    setIdx(firstUnanswered === -1 ? a.questions.length : firstUnanswered);
  }
  function load(forceNew = false) {
    return api<Attempt>(`/api/v1/learn/${versionId}/attempts`, { json: { forceNew } })
      .then(applyAttempt)
      .catch((e) => setErr(errorText(e)));
  }
  useEffect(() => {
    let active = true;
    api<Attempt>(`/api/v1/learn/${versionId}/attempts`, { json: { forceNew: false } })
      .then((a) => {
        if (active) applyAttempt(a);
      })
      .catch((e) => {
        if (active) setErr(errorText(e));
      });
    return () => {
      active = false;
    };
     
  }, [versionId]);

  async function answer(selectedIndex: number | null) {
    if (!attempt || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const q = attempt.questions[idx];
      const r = await api<AnswerResult>(`/api/v1/attempts/${attempt.attemptId}/answers`, { json: { questionId: q.questionId, selectedIndex } });
      setResult(r);
      setAttempt({
        ...attempt,
        completedAt: r.completed ? new Date().toISOString() : attempt.completedAt,
        scorePct: r.scorePct,
        nCorrect: r.nCorrect,
        nWrong: r.nWrong,
        nUnknown: r.nUnknown,
        questions: attempt.questions.map((x, i) =>
          i === idx ? { ...x, answer: { selectedIndex, isUnknown: r.isUnknown, isCorrect: r.isCorrect, correctIndex: r.correctIndex, explanation: r.explanation } } : x,
        ),
      });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!attempt) return <main className="card">{err ?? "読み込み中…"}</main>;

  const total = attempt.questions.length;

  // 最後の問題の解説を見てから「結果を見る」で結果画面へ（完了直後に飛ばさない）
  if (idx >= total && attempt.completedAt) {
    const answered = attempt.questions.filter((x) => x.answer);
    const missed = answered.filter((x) => !x.answer!.isCorrect);
    const correct = answered.filter((x) => x.answer!.isCorrect);
    return (
      <main className="space-y-4">
        <header className="space-y-1">
          <div className="flex items-center justify-between">
            <Link href="/home" className="tap-link">
              ← ホームへ
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
              {missed.filter((x) => !x.answer!.isUnknown).length}
            </span>
            <span className="pill font-bold text-ink">
              <span aria-hidden className="inline-flex w-4.5 h-4.5 rounded-full bg-[#a67a5e] text-white text-[11px] items-center justify-center mr-1.5">?</span>
              {missed.filter((x) => x.answer!.isUnknown).length}
            </span>
          </div>
        </header>

        <section className="card space-y-3 border-2 border-suna" aria-labelledby="review-title">
          <h2 id="review-title" className="font-bold text-lg">
            {missed.length > 0 ? "もう一度確認できるところ" : "すべて正解でした"}
          </h2>
          {missed.length === 0 ? (
            <p className="text-ink-soft">気になるところがあれば、いつでも説明を読み直せます。</p>
          ) : (
            <ul className="space-y-3">
              {missed.map((x) => (
                <li key={x.questionId} className="pt-3 border-t border-line first:border-t-0 first:pt-0 space-y-1">
                  <p className="text-sm text-ink-soft flex items-center gap-2">
                    <span aria-hidden className={`inline-flex w-5 h-5 rounded-full text-white text-[11px] items-center justify-center ${x.answer!.isUnknown ? "bg-[#a67a5e]" : "bg-danger"}`}>
                      {x.answer!.isUnknown ? "?" : "！"}
                    </span>
                    {x.answer!.isUnknown ? "「わからない」と答えました" : "ちがう答えを選びました"}
                  </p>
                  <p className="font-bold leading-snug">{x.stem}</p>
                  <p className="text-sm text-ink-soft">
                    正解: {LETTERS[x.answer!.correctIndex]} {x.options[x.answer!.correctIndex]}
                  </p>
                  <details className="text-sm text-ink-soft">
                    <summary className="cursor-pointer min-h-11 flex items-center">解説を読む</summary>
                    <p className="leading-relaxed">{x.answer!.explanation}</p>
                  </details>
                  <Link href={`/learn/${versionId}${x.relatedSlideSeq ? `?slide=${x.relatedSlideSeq}` : ""}`} className="tap-link text-accent font-bold">
                    {x.relatedSlideSeq ? `${x.relatedSlideSeq} 画面目を読み直す →` : "説明を読み直す →"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>


        <section className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-lg">次にできること</h2>
            <details className="text-sm">
              <summary className="pill cursor-pointer">
                正解 {attempt.nCorrect} / {total} 問
              </summary>
              <div className="mt-2 text-ink-soft space-y-1">
                <p>
                  点数: {fmtScore(attempt.scorePct)}（まちがい {attempt.nWrong} ・ わからない {attempt.nUnknown}）
                </p>
                <p className="text-xs">点数は次の診察で先生と確認する材料です。良し悪しを表すものではありません。</p>
              </div>
            </details>
          </div>
          <div className="grid gap-2">
            <button className="btn" onClick={() => load(true)}>
              もう一度挑戦する
            </button>
            <Link href={`/learn/${versionId}`} className="btn btn-ghost">
              説明をはじめから読み直す
            </Link>
          </div>
        </section>

        {!feedbackDone ? (
          <FeedbackForm versionId={versionId} onDone={() => setFeedbackDone(true)} />
        ) : (
          <section className="card space-y-2 text-center">
            <p className="font-bold">ありがとうございます。</p>
            <p className="text-sm text-ink-soft">次の診察で先生が確認します。すぐの返信はありません。緊急のときは病院の連絡先へご連絡ください。</p>
            <button className="btn btn-primary btn-block" onClick={() => router.push("/home")}>
              ホームへ戻る
            </button>
          </section>
        )}
      </main>
    );
  }

  const q = attempt.questions[idx];
  const answered = q.answer;
  return (
    <main className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <Link href={`/learn/${versionId}`} className="tap-link">
            ← 説明に戻る
          </Link>
          <FontSizeToggle />
        </div>
        <h1 className="text-lg font-bold leading-snug">{title}</h1>
        <p className="text-sm text-ink-soft">
          確認問題 {idx + 1} / {total}
        </p>
        <div className="flex gap-1" aria-hidden>
          {attempt.questions.map((x, i) => (
            <span key={x.questionId} className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
      </header>

      <section className="card space-y-4" aria-live="polite">
        <p className="text-lg font-bold leading-relaxed">{q.stem}</p>
        <div className="grid gap-2">
          {q.options.map((opt, i) => {
            const chosen = answered?.selectedIndex === i;
            const state = !answered ? undefined : i === answered.correctIndex ? "correct" : chosen ? "wrong" : "dim";
            return (
              <button key={i} className="btn btn-option" data-state={state} disabled={!!answered || busy} onClick={() => answer(i)}>
                <span className="font-bold mr-2 shrink-0">{LETTERS[i]}</span>
                <span>{opt}</span>
                {state === "correct" && <span className="ml-auto pill bg-wakakusa text-xs shrink-0">正解</span>}
                {state === "wrong" && <span className="ml-auto pill bg-sakura text-xs shrink-0">あなたの答え</span>}
              </button>
            );
          })}
          <button className="btn btn-unknown" data-state={answered?.isUnknown ? "chosen" : undefined} disabled={!!answered || busy} onClick={() => answer(null)}>
            わからない
          </button>
        </div>
        {answered && (
          <div className={`rounded-xl p-3 space-y-2 ${answered.isCorrect ? "bg-wakakusa" : "bg-suna"}`}>
            <p className="font-bold">
              {answered.isCorrect ? "正解です" : answered.isUnknown ? "「わからない」を記録しました。次の診察で先生と確認できます" : "こちらが正解です"}
            </p>
            {!answered.isCorrect && (
              <p className="text-sm">
                正解: {LETTERS[answered.correctIndex]} {q.options[answered.correctIndex]}
              </p>
            )}
            <p className="text-sm leading-relaxed">{answered.explanation}</p>
            {q.relatedSlideSeq && (
              <Link href={`/learn/${versionId}?slide=${q.relatedSlideSeq}`} className="text-sm underline">
                この説明を読み直す
              </Link>
            )}
          </div>
        )}
        {err && <p className="text-danger text-sm">{err}</p>}
      </section>

      {answered && (
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            setResult(null);
            setIdx(idx + 1);
            window.scrollTo({ top: 0 });
          }}
        >
          {idx + 1 < total ? "次の問題へ" : "結果を見る"}
        </button>
      )}
      {result === null && !answered && <p className="text-center text-sm text-ink-muted">答えると解説が見られます。あとからもう一度挑戦することもできます。</p>}
    </main>
  );
}

function FeedbackForm({ versionId, onDone }: { versionId: string; onDone: () => void }) {
  const [selection, setSelection] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    if (!selection) return;
    setBusy(true);
    try {
      await api("/api/v1/feedback", { json: { versionId, selection, freeText: text || null } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-y-3">
      <h2 className="font-bold text-lg">次の診察で聞きたいこと</h2>
      <p className="text-sm text-ink-soft">読んでみて、いまの気持ちに近いものを選んでください。質問があれば次の診察で先生が確認します。</p>
      <div className="grid gap-2">
        {Object.entries(SELECTION_LABEL).map(([k, label]) => (
          <button key={k} className={`btn justify-start ${selection === k ? "btn-soft" : ""}`} aria-pressed={selection === k} onClick={() => setSelection(k)}>
            {label}
          </button>
        ))}
      </div>
      <label className="label" htmlFor="fb-text">
        質問や気になったこと（任意）
      </label>
      <textarea id="fb-text" className="input py-2 min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="次の診察で先生が確認します" />
      <p className="text-xs text-ink-muted">ここはすぐに返信が来る窓口ではありません。緊急のときは病院の連絡先へ。</p>
      <button className="btn btn-primary btn-block" disabled={!selection || busy} onClick={submit}>
        送る
      </button>
      {err && <p className="text-danger text-sm">{err}</p>}
    </section>
  );
}
