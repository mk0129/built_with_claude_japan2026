"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { SELECTION_LABEL, fmtScore } from "@/lib/labels";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { Icon } from "@/components/reset/Icons";

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

/**
 * 確認問題（Experience Reset 01）。1 問 1 画面、3 択＋「わからない」、選択と回答確定は別操作。
 * 回答後はその場に穏やかな説明。結果画面は点数を主役にせず、確認できた数と「次の診察につながる」質問を先に。
 * 採点・回答履歴・スナップショット・質問の保存（POST /api/v1/feedback）は従来のロジックのまま。
 */
export function QuizClient({ versionId, title, slides = [] }: { versionId: string; title: string; slides?: SlideRef[] }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 選択（未確定）: number = 選択肢、null = わからない、undefined = 未選択
  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  // 回答確定後の保存中（失敗時はこの値で再送できる）
  const [pending, setPending] = useState<number | null | undefined>(undefined);

  function applyAttempt(a: Attempt) {
    setAttempt(a);
    setSelected(undefined);
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

  /** 回答を確定して保存する（選択だけでは送らない） */
  async function confirm(selectedIndex: number | null) {
    if (!attempt || busy) return;
    setBusy(true);
    setErr(null);
    setPending(selectedIndex);
    try {
      const q = attempt.questions[idx];
      const r = await api<AnswerResult>(`/api/v1/attempts/${attempt.attemptId}/answers`, { json: { questionId: q.questionId, selectedIndex } });
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
      setSelected(undefined);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!attempt)
    return (
      <>
        <QuizHeader title="理解度の確認" backHref={`/learn/${versionId}`} />
        <main className="rs-content">
          <p className="rs-muted">{err ?? "読み込み中…"}</p>
        </main>
      </>
    );

  const total = attempt.questions.length;

  // ---- 結果画面（最後の問題の解説を見てから「学びの結果を見る」で表示） ----
  if (idx >= total && attempt.completedAt) {
    return <ResultScreen attempt={attempt} versionId={versionId} title={title} slides={slides} onRetry={() => load(true)} onFinish={() => router.push("/home")} />;
  }

  const q = attempt.questions[idx];
  const answered = q.answer;
  const pendingActive = pending !== undefined;
  const choiceState = (i: number | null): string | undefined => {
    if (answered) {
      if (i === null) return answered.isUnknown ? "wrong" : "dim";
      return i === answered.correctIndex ? "correct" : answered.selectedIndex === i ? "wrong" : "dim";
    }
    if (pendingActive) return pending === i ? "pending" : "dim";
    if (selected !== undefined) return selected === i ? "selected" : undefined;
    return undefined;
  };
  const feedbackTitle = !answered ? "" : answered.isCorrect ? "確認できました。" : answered.isUnknown ? "「わからない」を記録しました。次の診察で先生と確認できます。" : "一緒に振り返りましょう。";

  return (
    <>
      <QuizHeader title="理解度の確認" backHref={`/learn/${versionId}`} />
      <main className="rs-content" style={{ paddingTop: 22 }}>
        <div className="rs-quiz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1} aria-label={`${total} 問中 ${idx + 1} 問目`}>
          <div style={{ width: `${((idx + 1) / total) * 100}%` }} />
        </div>
        <div className="rs-qnum">
          <span>QUESTION {String(idx + 1).padStart(2, "0")}</span>
          <span className="count">
            {idx + 1} / {total}
          </span>
        </div>
        <h1 className="rs-qtitle">{q.stem}</h1>

        <div role="radiogroup" aria-label="回答の選択肢">
          {q.options.map((opt, i) => {
            const state = choiceState(i);
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={state === "selected" || state === "pending" || (answered ? answered.selectedIndex === i : false)}
                className="rs-choice"
                data-state={state}
                disabled={!!answered || busy}
                onClick={() => setSelected(i)}
              >
                <span className="circle" aria-hidden>
                  {state === "correct" && <Icon name="check" size="sm" />}
                </span>
                <span className="sr-only">{LETTERS[i]} </span>
                <span>{opt}</span>
                {state === "correct" && <span className="tag">正解</span>}
                {state === "wrong" && answered && !answered.isUnknown && <span className="tag">あなたの答え</span>}
                {state === "pending" && <span className="tag">記録中…</span>}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={choiceState(null) === "selected" || choiceState(null) === "pending" || (answered?.isUnknown ?? false)}
            className="rs-choice unknown"
            data-state={choiceState(null)}
            disabled={!!answered || busy}
            onClick={() => setSelected(null)}
          >
            <span className="circle" aria-hidden />
            <span>わからない</span>
            {choiceState(null) === "pending" && <span className="tag">記録中…</span>}
          </button>
        </div>

        {answered && (
          <div className={`rs-feedback ${answered.isCorrect ? "" : "review"}`} role="status">
            <b>{feedbackTitle}</b>
            <br />
            {!answered.isCorrect && !answered.isUnknown && (
              <>
                正解は「{q.options[answered.correctIndex]}」です。
                <br />
              </>
            )}
            {answered.explanation}
            {q.relatedSlideSeq && (
              <>
                {" "}
                <Link href={`/learn/${versionId}?slide=${q.relatedSlideSeq}`}>この説明を読み直す</Link>
              </>
            )}
          </div>
        )}
        {err && (
          <div className="rs-feedback review" role="alert">
            {err}
            {!answered && pending !== undefined && (
              <>
                {" "}
                <button type="button" className="rs-link" disabled={busy} onClick={() => confirm(pending)}>
                  もう一度記録する
                </button>
              </>
            )}
          </div>
        )}
      </main>

      <div className="rs-cta">
        <div>
          {answered ? (
            <button
              className="rs-btn primary wide"
              onClick={() => {
                setIdx(idx + 1);
                setSelected(undefined);
                window.scrollTo({ top: 0 });
              }}
            >
              {idx + 1 < total ? "次の問題へ" : "学びの結果を見る"} <Icon name="arrow" size="sm" />
            </button>
          ) : (
            <button className="rs-btn primary wide" disabled={selected === undefined || busy} onClick={() => confirm(selected as number | null)}>
              {busy ? "記録しています…" : "回答を確認する"} <Icon name="arrow" size="sm" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function QuizHeader({ title, backHref }: { title: string; backHref: string }) {
  return (
    <header className="rs-header">
      <Link href={backHref} className="rs-icon-btn -ml-2" aria-label="戻る">
        <Icon name="back" />
      </Link>
      <span className="rs-heading-small flex-1 text-center px-1">{title}</span>
      <div className="-mr-2">
        <FontSizeToggle variant="icon" />
      </div>
    </header>
  );
}

/**
 * 学びの結果。点数は主役にしない（折りたたみ）。
 * 「次の診察につながる」: 気になるテーマ（誤答・わからないの関連画面）を選ぶと候補文が入り、患者が編集して明示的に保存する。
 */
function ResultScreen({ attempt, versionId, title, slides, onRetry, onFinish }: { attempt: Attempt; versionId: string; title: string; slides: SlideRef[]; onRetry: () => void; onFinish: () => void }) {
  const answered = attempt.questions.filter((x): x is Answered => x.answer !== null);
  const missed = answered.filter((x) => !x.answer.isCorrect);
  const correct = answered.filter((x) => x.answer.isCorrect);
  const nWrong = missed.filter((x) => !x.answer.isUnknown).length;
  const nUnknown = missed.filter((x) => x.answer.isUnknown).length;
  const themeOf = (q: Answered) => slides.find((s) => s.seq === q.relatedSlideSeq)?.title ?? title;

  const [theme, setTheme] = useState<string | null>(null); // questionId or "free"
  const [text, setText] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function chooseTheme(key: string) {
    setTheme(key);
    const q = missed.find((x) => x.questionId === key);
    setText(q ? questionCandidate(q, slides, title) : "");
  }
  const tooLong = text.length > FREE_TEXT_MAX;
  async function save() {
    if (!theme || busy || tooLong) return;
    setBusy(true);
    setErr(null);
    try {
      // selection は従来の 4 択。気持ちを選んでいなければ、質問文があれば「質問がある」、無ければ「もう一度説明してほしい」
      const selection = mood ?? (text.trim() ? "have_question" : "explain_again");
      await api("/api/v1/feedback", { json: { versionId, selection, freeText: text.trim() || null } });
      setSaved(true);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <QuizHeader title="学びの結果" backHref="/home" />
      <main className="rs-content" style={{ paddingTop: 12 }}>
        <div className="rs-result-heading">
          <div className="rs-result-icon" aria-hidden>
            <Icon name="check" size="xl" />
          </div>
          <h1>ここまで学べました</h1>
          <p>
            理解できたところも、
            <br />
            もう一度確認したいところも大切です。
          </p>
        </div>
        <ul className="rs-counts" aria-label="今回の確認">
          <li className="rs-count" data-testid="tile-correct">
            <div className="num" style={{ color: "#4b7b6b" }}>
              {correct.length}
            </div>
            <div className="lab">確認できた</div>
          </li>
          <li className="rs-count" data-testid="tile-wrong">
            <div className="num" style={{ color: "#b58467" }}>
              {nWrong}
            </div>
            <div className="lab">もう一度確認</div>
          </li>
          <li className="rs-count" data-testid="tile-unknown">
            <div className="num" style={{ color: "#6d8295" }}>
              {nUnknown}
            </div>
            <div className="lab">わからない</div>
          </li>
        </ul>

        <section className="rs-qbox" aria-labelledby="ask-title">
          <div className="rs-eyebrow">次の診察につながる</div>
          <h2 id="ask-title">先生に聞いておきたいことはありますか？</h2>
          {saved ? (
            <>
              <p className="rs-saved">✓ 次の診察に残しました</p>
              <p>次の診察で先生が確認します。すぐの返信はありません。緊急のときは病院の連絡先へご連絡ください。</p>
            </>
          ) : (
            <>
              <p>気になるテーマを選ぶと、質問を自分の言葉で残せます。</p>
              <div className="rs-chiprow" role="group" aria-label="質問のテーマ">
                {missed.map((x) => (
                  <button key={x.questionId} type="button" className="rs-chip" aria-pressed={theme === x.questionId} data-testid="ask-theme" onClick={() => chooseTheme(x.questionId)}>
                    {themeOf(x)}
                  </button>
                ))}
                <button type="button" className="rs-chip" aria-pressed={theme === "free"} data-testid="ask-theme-free" onClick={() => chooseTheme("free")}>
                  自分で書く
                </button>
              </div>
              {theme !== null && (
                <>
                  <textarea className="rs-qinput" value={text} onChange={(e) => setText(e.target.value)} placeholder="次の診察で聞きたいこと" maxLength={FREE_TEXT_MAX + 50} aria-label="次の診察で聞きたいこと" />
                  <p className="rs-muted text-right" style={{ margin: "4px 0 0" }}>
                    {text.length} / {FREE_TEXT_MAX} 文字{tooLong ? "（長すぎます）" : ""}
                  </p>
                  <div className="rs-mood" role="group" aria-label="いまの気持ち（任意）">
                    {Object.entries(SELECTION_LABEL).map(([k, label]) => (
                      <button key={k} type="button" className="rs-chip" aria-pressed={mood === k} onClick={() => setMood((m) => (m === k ? null : k))}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="rs-btn primary wide" style={{ marginTop: 10 }} disabled={busy || tooLong} onClick={save}>
                    <Icon name="check" size="sm" /> 次の診察に残す
                  </button>
                  {err && (
                    <p className="rs-feedback review" role="alert">
                      {err}
                    </p>
                  )}
                </>
              )}
              <p className="rs-muted" style={{ margin: "10px 0 0" }}>
                保存は「次の診察に残す」を押したときだけ行われます。すぐの返信はありません。緊急のときは病院の連絡先へ。
              </p>
            </>
          )}
        </section>

        {missed.length > 0 && (
          <>
            <div className="rs-section-label" style={{ marginTop: 5 }}>
              <span>もう一度確認したいこと</span>
            </div>
            {missed.map((x) => (
              <Link key={x.questionId} href={`/learn/${versionId}${x.relatedSlideSeq ? `?slide=${x.relatedSlideSeq}` : ""}`} className="rs-to-review" data-testid="to-review">
                <div className="book-icon">
                  <Icon name="book" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{themeOf(x)}</h3>
                  <p>
                    {x.answer.isUnknown ? "「わからない」と答えました" : "ちがう答えを選びました"} ・ 正解は「{x.options[x.answer.correctIndex]}」
                  </p>
                </div>
                <Icon name="next" className="text-[color:var(--blue)]" />
              </Link>
            ))}
          </>
        )}

        <div className="rs-section-label">
          <span>次にできること</span>
        </div>
        <div className="rs-small-card">
          <button type="button" className="rs-item-row w-full text-left" onClick={onRetry}>
            <div className="rs-mini-icon">
              <Icon name="list" />
            </div>
            <div className="rs-item-info">
              <div className="rs-item-title">もう一度挑戦する</div>
              <div className="rs-item-sub">新しい記録として確認問題をやり直します</div>
            </div>
          </button>
          <Link href={`/learn/${versionId}`} className="rs-item-row">
            <div className="rs-mini-icon">
              <Icon name="book" />
            </div>
            <div className="rs-item-info">
              <div className="rs-item-title">説明をはじめから読み直す</div>
              <div className="rs-item-sub">図解をもう一度見ながら確認できます</div>
            </div>
            <Icon name="next" size="sm" className="text-[#84959e]" />
          </Link>
        </div>
        <details className="rs-details" style={{ marginTop: 12 }}>
          <summary>
            <Icon name="help" size="sm" />
            点数を見る（先生と確認する材料です）
          </summary>
          <p className="rs-body">
            点数: {fmtScore(attempt.scorePct)}（正解 {attempt.nCorrect} ・ まちがい {attempt.nWrong} ・ わからない {attempt.nUnknown}）。良し悪しを表すものではありません。
          </p>
        </details>
      </main>

      <div className="rs-cta">
        <div>
          <button className="rs-btn primary wide" onClick={onFinish}>
            今日の学びを終える <Icon name="arrow" size="sm" />
          </button>
        </div>
      </div>
    </>
  );
}
