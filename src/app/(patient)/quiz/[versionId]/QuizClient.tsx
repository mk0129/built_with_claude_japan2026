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
type SlideRef = { seq: number; title: string };
type Answered = Attempt["questions"][number] & { answer: NonNullable<Attempt["questions"][number]["answer"]> };

const LETTERS = ["ア", "イ", "ウ"];
const FREE_TEXT_MAX = 1000;

/**
 * 誤答・「わからない」から、次の診察で聞く質問の候補文を作る（患者が編集してから保存する）。
 * 設問文をそのまま使わず、関連画面のタイトルと正解の内容から「患者の言葉」に近い文にする。
 */
export function questionCandidate(q: Answered, slides: SlideRef[], materialTitle: string): string {
  const where = slides.find((s) => s.seq === q.relatedSlideSeq)?.title ?? materialTitle;
  if (q.answer.isUnknown) return `『${where}』について、わからないところがありました。もう一度説明してほしいです。`;
  return `『${where}』のところで、「${q.options[q.answer.correctIndex]}」という点がよくわかりませんでした。次の診察で説明してほしいです。`;
}

export function QuizClient({ versionId, title, slides = [] }: { versionId: string; title: string; slides?: SlideRef[] }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);
  // 回答をタップした直後（保存中）の選択肢。失敗時はこの値で再送できる
  const [pending, setPending] = useState<number | null | undefined>(undefined);

  function applyAttempt(a: Attempt) {
    setAttempt(a);
    setResult(null);
    setPending(undefined);
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
    setPending(selectedIndex);
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
      setPending(undefined);
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
    const answered = attempt.questions.filter((x): x is Answered => x.answer !== null);
    const missed = answered.filter((x) => !x.answer.isCorrect);
    const correct = answered.filter((x) => x.answer.isCorrect);
    const nWrong = missed.filter((x) => !x.answer.isUnknown).length;
    const nUnknown = missed.filter((x) => x.answer.isUnknown).length;
    return (
      <main className="space-y-4">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <Link href="/home" className="tap-link">
              ← ホームへ
            </Link>
            <FontSizeToggle />
          </div>
          <p className="text-sm text-ink-soft">{title} ・ 確認問題</p>
          <h1 className="text-2xl font-bold leading-snug">確認を終えました。おつかれさまでした。</h1>
          <ul className="grid grid-cols-3 gap-2 text-center" aria-label="今回の確認">
            <li className="rounded-2xl bg-wakakusa px-2 py-2" data-testid="tile-correct">
              <p className="text-2xl font-bold leading-none">{correct.length}</p>
              <p className="text-xs mt-1">理解できた</p>
            </li>
            <li className="rounded-2xl bg-sakura px-2 py-2" data-testid="tile-wrong">
              <p className="text-2xl font-bold leading-none">{nWrong}</p>
              <p className="text-xs mt-1">もう一度確認</p>
            </li>
            <li className="rounded-2xl bg-suna px-2 py-2" data-testid="tile-unknown">
              <p className="text-2xl font-bold leading-none">{nUnknown}</p>
              <p className="text-xs mt-1">わからない</p>
            </li>
          </ul>
          <p className="text-sm text-ink-soft">全 {total} 問。わからなかったことは、次の診察で先生と確認できます。</p>
        </header>

        {/* 1. 次の診察に残す（最上段）。保存は患者の明示的な操作だけ。緊急の相談窓口ではない */}
        {!feedbackDone ? (
          <AskForm versionId={versionId} missed={missed} candidates={missed.map((x) => questionCandidate(x, slides, title))} onDone={() => setFeedbackDone(true)} />
        ) : (
          <section className="card space-y-2 text-center border-2 border-accent" role="status">
            <p className="font-bold">ありがとうございます。次の診察に残しました。</p>
            <p className="text-sm text-ink-soft">次の診察で先生が確認します。すぐの返信はありません。緊急のときは病院の連絡先へご連絡ください。</p>
            <button className="btn btn-primary btn-block" onClick={() => router.push("/home")}>
              ホームへ戻る
            </button>
          </section>
        )}

        {/* 2. もう一度確認したいこと */}
        {missed.length > 0 && (
          <section className="card space-y-3" aria-labelledby="review-title">
            <h2 id="review-title" className="font-bold text-lg">もう一度確認したいこと</h2>
            <ul className="space-y-4">
              {missed.map((x) => (
                <li key={x.questionId} className="space-y-2 pt-3 border-t border-line first:border-t-0 first:pt-0">
                  <p className="text-sm text-ink-soft flex items-center gap-2">
                    <span aria-hidden className={`inline-flex w-5 h-5 rounded-full text-white text-[11px] items-center justify-center ${x.answer.isUnknown ? "bg-[#a67a5e]" : "bg-danger"}`}>
                      {x.answer.isUnknown ? "?" : "！"}
                    </span>
                    {x.answer.isUnknown ? "「わからない」と答えました" : "ちがう答えを選びました"}
                  </p>
                  <p className="font-bold leading-snug">{x.stem}</p>
                  <dl className="text-sm space-y-1">
                    {!x.answer.isUnknown && x.answer.selectedIndex !== null && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 w-[6em] text-ink-soft">あなたの答え</dt>
                        <dd className="line-through text-ink-soft">
                          {LETTERS[x.answer.selectedIndex]} {x.options[x.answer.selectedIndex]}
                        </dd>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <dt className="shrink-0 w-[6em] text-ink-soft">正解</dt>
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
            <p className="text-sm text-ink-soft">今回は難しかったかもしれません。説明を読み直してから、もう一度試せます。</p>
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
            <button className="btn" onClick={() => load(true)}>
              もう一度挑戦する
            </button>
            <Link href={`/learn/${versionId}`} className="btn btn-ghost">
              説明をはじめから読み直す
            </Link>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer min-h-11 flex items-center text-ink-soft">点数を見る（先生と確認する材料です）</summary>
            <p className="text-ink-soft">
              点数: {fmtScore(attempt.scorePct)}（正解 {attempt.nCorrect} ・ まちがい {attempt.nWrong} ・ わからない {attempt.nUnknown}）。良し悪しを表すものではありません。
            </p>
          </details>
        </section>
      </main>
    );
  }

  const q = attempt.questions[idx];
  const answered = q.answer;
  const pendingActive = pending !== undefined;
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
            // 回答後: correct / wrong / dim。保存中: 押した選択肢を pending、他を dim
            const state = answered ? (i === answered.correctIndex ? "correct" : chosen ? "wrong" : "dim") : pendingActive ? (pending === i ? "pending" : "dim") : undefined;
            return (
              <button key={i} className="btn btn-option" data-state={state} disabled={!!answered || busy} aria-pressed={state === "pending" ? true : undefined} onClick={() => answer(i)}>
                <span className="font-bold mr-2 shrink-0">{LETTERS[i]}</span>
                <span>{opt}</span>
                {state === "correct" && <span className="ml-auto pill bg-wakakusa text-xs shrink-0">正解</span>}
                {state === "wrong" && <span className="ml-auto pill bg-sakura text-xs shrink-0">あなたの答え</span>}
                {state === "pending" && <span className="ml-auto pill text-xs shrink-0">選択中…</span>}
              </button>
            );
          })}
          <button
            className="btn btn-unknown"
            data-state={answered?.isUnknown ? "chosen" : pendingActive && pending === null ? "pending" : pendingActive ? "dim" : undefined}
            disabled={!!answered || busy}
            aria-pressed={pendingActive && pending === null ? true : undefined}
            onClick={() => answer(null)}
          >
            わからない
            {pendingActive && pending === null && <span className="ml-auto pill text-xs shrink-0">選択中…</span>}
          </button>
        </div>
        {busy && !answered && (
          <p className="text-sm text-ink-soft" role="status">
            記録しています…
          </p>
        )}
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
        {err && (
          <div className="space-y-2" role="alert">
            <p className="text-danger text-sm">{err}</p>
            {!answered && pending !== undefined && (
              <button className="btn min-h-11 text-sm" disabled={busy} onClick={() => answer(pending)}>
                もう一度記録する
              </button>
            )}
          </div>
        )}
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
      {result === null && !answered && !busy && <p className="text-center text-sm text-ink-muted">答えると解説が見られます。あとからもう一度挑戦することもできます。</p>}
    </main>
  );
}

/**
 * 「次の診察に残す」: 質問候補（誤答・わからない由来）を患者が選び・編集し、4 択とあわせて明示的に保存する。
 * 送信先は従来どおり POST /api/v1/feedback（selection + freeText）。候補の自動送信はしない。
 */
function AskForm({ versionId, missed, candidates, onDone }: { versionId: string; missed: Answered[]; candidates: string[]; onDone: () => void }) {
  const [selection, setSelection] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({}); // questionId → 編集後の文
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const togglePick = (id: string, template: string) =>
    setPicked((p) => {
      const next = { ...p };
      if (id in next) delete next[id];
      else next[id] = template;
      return next;
    });
  const pickedLines = missed.filter((x) => x.questionId in picked).map((x) => picked[x.questionId].trim()).filter(Boolean);
  const freeText = [...pickedLines, text.trim()].filter(Boolean).join("\n");
  const tooLong = freeText.length > FREE_TEXT_MAX;
  const nPicked = pickedLines.length;

  async function submit() {
    if (!selection || tooLong || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/v1/feedback", { json: { versionId, selection, freeText: freeText || null } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 border-2 border-accent" aria-labelledby="ask-title">
      <h2 id="ask-title" className="font-bold text-lg">次の診察に残す</h2>
      <p className="text-sm text-ink-soft">
        {missed.length > 0 ? "「もう一度確認」「わからない」だった内容を、次の診察で聞きたいことの候補にしました。残したいものを選び、言葉は自由に直せます。" : "読んでみて、いまの気持ちに近いものを選んでください。気になることがあれば書き添えられます。"}
      </p>
      {missed.length > 0 && (
        <ul className="space-y-2" aria-label="質問の候補">
          {missed.map((x, i) => {
            const on = x.questionId in picked;
            return (
              <li key={x.questionId} className="space-y-2">
                <button
                  type="button"
                  className={`w-full text-left rounded-2xl border px-3 py-2.5 flex items-start gap-2.5 min-h-[56px] ${on ? "border-accent bg-wakakusa" : "border-line bg-surface"}`}
                  aria-pressed={on}
                  data-testid="ask-candidate"
                  onClick={() => togglePick(x.questionId, candidates[i])}
                >
                  <span aria-hidden className={`mt-0.5 inline-flex w-6 h-6 rounded-full border-2 items-center justify-center text-sm shrink-0 ${on ? "bg-accent border-accent text-white" : "border-line"}`}>
                    {on ? "✓" : ""}
                  </span>
                  <span className="text-sm leading-snug">{candidates[i]}</span>
                </button>
                {on && (
                  <label className="block text-xs text-ink-soft">
                    言葉を直す（任意）
                    <textarea className="input py-2 min-h-20 mt-1 text-sm" value={picked[x.questionId]} onChange={(e) => setPicked((p) => ({ ...p, [x.questionId]: e.target.value }))} maxLength={FREE_TEXT_MAX} aria-label={`質問 ${i + 1} の文を直す`} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <p className="label">読んでみて、いまの気持ちに近いもの</p>
        <div className="ask-choices grid grid-cols-2 gap-2">
          {Object.entries(SELECTION_LABEL).map(([k, label]) => (
            <button key={k} type="button" className={`btn text-sm px-2 ${selection === k ? "btn-soft" : ""}`} aria-pressed={selection === k} onClick={() => setSelection(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="label" htmlFor="fb-text">
        質問や気になったこと（任意）
      </label>
      <textarea id="fb-text" className="input py-2 min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={FREE_TEXT_MAX} placeholder="例: 薬をいつまで続けるのか" />
      <p className={`text-xs ${tooLong ? "text-danger font-bold" : "text-ink-muted"}`} aria-live="polite">
        {freeText.length} / {FREE_TEXT_MAX} 文字{tooLong ? "。長すぎるため、短くしてから残してください。" : ""}
      </p>
      <button className="btn btn-primary btn-block" disabled={!selection || tooLong || busy} onClick={submit}>
        {nPicked > 0 ? `質問 ${nPicked} 件とあわせて次の診察に残す` : "次の診察に残す"}
      </button>
      {!selection && <p className="text-xs text-ink-muted text-center">いまの気持ちを 1 つ選ぶと残せます。</p>}
      <p className="text-xs text-ink-muted">ここはすぐに返信が来る窓口ではありません。次の診察で先生が確認します。緊急のときは病院の連絡先へご連絡ください。</p>
      {err && <p className="text-danger text-sm">{err}</p>}
    </section>
  );
}
