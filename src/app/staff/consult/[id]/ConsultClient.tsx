"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { ApiError, api, errorText } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { useNow } from "@/lib/use-now";
import { DOMAIN_LABEL, PHASE_LABEL, RESPONSE_LABEL, SELECTION_LABEL, STATUS_LABEL, fmtDate, fmtScore } from "@/lib/labels";
import { PrescriptionPanel, type BasketItem } from "./PrescriptionPanel";

type Consultation = { id: string; orgName: string; clinicianName: string; expiresAt: string; active: boolean; endedBy: string | null; pendingExtension: { id: string } | null };
type Question = {
  feedbackId: string;
  materialId: string;
  materialTitle: string;
  selection: string;
  freeText: string | null;
  createdAt: string;
  status: "unread" | "reviewed" | "resolved";
  actions: { status: string; responseType: string | null; note: string | null; orgName: string; createdAt: string }[];
};
type Missed = {
  materialId: string;
  title: string;
  completedAt: string;
  isOldVersion: boolean;
  nWrong: number;
  nUnknown: number;
  questions: { seq: number; stem: string; isUnknown: boolean; selectedIndex: number | null; options: string[]; correctIndex: number }[];
};
type Incomplete = { materialId: string; title: string; phase: string; orgName: string; setCreatedAt: string };
type Summary = {
  patient: { id: string; displayName: string };
  previousConsultations: { id: string; orgName: string; startedAt: string }[];
  unreadQuestions: Question[];
  questions: Question[];
  missed: Missed[];
  incompleteMaterials: Incomplete[];
  scores: {
    overall: { score: number | null; evaluated: number; total: number };
    byDomain: { domain: string; score: number | null; evaluated: number; total: number }[];
    materials: { materialId: string; title: string; scorePct: number | null; isOldVersion: boolean; oldVersionScorePct: number | null; nCorrect: number; nWrong: number; nUnknown: number; attemptId: string | null }[];
  };
  homework: { setId: string; orgName: string; createdAt: string; score: number | null; completedCount: number; assignedCount: number; snapshot: null | { capturedAt: string; score: number | null; completedCount: number; assignedCount: number } }[];
  snapshotForThisSession: null | { capturedAt: string; capturedInThisSession: boolean; score: number | null; completedCount: number; assignedCount: number; setId: string; items: { title: string; phase: string; scorePct: number | null; nWrong: number; nUnknown: number }[] };
  currentSet: { setId: string; items: { materialId: string; title: string }[] } | null;
};

const LETTERS = ["ア", "イ", "ウ"];

function fmtRemain(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function ConsultClient({ sessionId }: { sessionId: string }) {
  const now = useNow();
  const [err, setErr] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [tick, setTick] = useState(0);

  const consult = usePoll<Consultation>(() => api(`/api/v1/consultations/${sessionId}`), 10_000, [sessionId]);
  const active = consult.data?.active ?? true;
  const summary = usePoll<Summary>(active ? () => api(`/api/v1/consultations/${sessionId}/patient`) : null, 15_000, [sessionId, active, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const updateBasket = useCallback((updater: (b: BasketItem[]) => BasketItem[]) => setBasket(updater), []);

  const denied = summary.error instanceof ApiError && (summary.error.status === 403 || summary.error.status === 401);
  const ended = consult.data ? !consult.data.active : denied;

  if (ended) {
    return (
      <main className="max-w-xl mx-auto card space-y-3">
        <h1 className="text-xl font-bold">診察セッションは終了しました</h1>
        <p className="text-ink-soft">
          {consult.data?.endedBy === "patient" ? "患者さんが共有を終了しました。" : consult.data?.endedBy === "clinician" ? "終了操作が行われました。" : "60 分が経過したか、共有が停止されました。"}
          患者さんの情報はこれ以上表示されません。
        </p>
        <Link href="/staff/scan" className="btn btn-primary btn-block">
          新しい QR を読み取る
        </Link>
      </main>
    );
  }

  const c = consult.data;
  const s = summary.data;
  const remainMs = c ? new Date(c.expiresAt).getTime() - now : 0;

  async function end() {
    try {
      await api(`/api/v1/consultations/${sessionId}/end`, { json: {} });
      consult.setData(c ? { ...c, active: false, endedBy: "clinician" } : null);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  async function extend() {
    try {
      await api(`/api/v1/consultations/${sessionId}/extend`, { json: {} });
      setErr("延長を要求しました。患者さんの画面で承認されると残り時間が更新されます。");
    } catch (e) {
      setErr(errorText(e));
    }
  }
  /** 「関連教材を処方」「再処方」のワンクリック追加（RX-04） */
  function prescribeRelated(materialId: string) {
    setPanelOpen(true);
    const title =
      s?.scores.materials.find((m) => m.materialId === materialId)?.title ??
      s?.incompleteMaterials.find((m) => m.materialId === materialId)?.title ??
      s?.questions.find((q) => q.materialId === materialId)?.materialTitle ??
      "教材";
    setBasket((b) => (b.some((x) => x.materialId === materialId) ? b : [...b, { materialId, title }]));
  }

  return (
    <main className="space-y-4 pb-32 lg:pb-0">
      <header className="card flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm text-ink-soft">
            {c?.orgName} ・ {c?.clinicianName}
          </p>
          <h1 className="text-xl font-bold">{s ? `${s.patient.displayName} さん` : "読み込み中…"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill text-base ${remainMs < 5 * 60_000 ? "bg-sakura" : "bg-wakakusa"}`} aria-live="polite">
            残り {c ? fmtRemain(remainMs) : "--:--"}
          </span>
          {c?.pendingExtension ? (
            <span className="pill">延長の承認待ち</span>
          ) : (
            <button className="btn text-sm min-h-11" onClick={extend}>
              延長を要求
            </button>
          )}
          <button className="btn btn-danger text-sm min-h-11" onClick={end}>
            終了
          </button>
        </div>
      </header>
      {err && <p className="text-sm text-ink-soft">{err}</p>}

      <div className="grid lg:grid-cols-[1fr_minmax(320px,400px)] gap-4 items-start">
        <section className="space-y-4">
          {s ? <TodayCard sessionId={sessionId} s={s} onChanged={refresh} onPrescribe={prescribeRelated} /> : <section className="card text-ink-soft">患者さんの記録を読み込んでいます…</section>}
          <ScoresCard s={s} />
          {s && s.previousConsultations.length > 0 && (
            <details className="card">
              <summary className="font-bold cursor-pointer">これまでの診察セッション（{s.previousConsultations.length}）</summary>
              <ul className="text-sm space-y-1 mt-2">
                {s.previousConsultations.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.orgName}</span>
                    <span className="text-ink-muted">{new Date(p.startedAt).toLocaleString("ja-JP")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <PrescriptionPanel sessionId={sessionId} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} currentSet={s?.currentSet ?? null} onPrescribed={refresh} basket={basket} setBasket={updateBasket} />
      </div>
    </main>
  );
}

/** 今日の確認事項: 未確認の質問 → 誤答・わからない → 未完了教材 を 1 枚に。各行に主アクション 1 つ */
function TodayCard({ sessionId, s, onChanged, onPrescribe }: { sessionId: string; s: Summary; onChanged: () => void; onPrescribe: (id: string) => void }) {
  const unread = s.questions.filter((q) => q.status === "unread").length;
  const missedCount = s.missed.reduce((a, m) => a + m.nWrong + m.nUnknown, 0);
  const openQuestions = s.questions.filter((q) => q.status !== "resolved");
  const resolved = s.questions.filter((q) => q.status === "resolved");
  const nothing = openQuestions.length === 0 && s.missed.length === 0 && s.incompleteMaterials.length === 0;

  return (
    <section className="card space-y-4" aria-labelledby="today-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-title" className="text-lg font-bold">
          今日の確認事項
        </h2>
        <div className="flex flex-wrap gap-1">
          <span className={`pill ${unread ? "bg-sakura" : ""}`}>未確認の質問 {unread}</span>
          <span className={`pill ${missedCount ? "bg-suna" : ""}`}>誤答・わからない {missedCount}</span>
          <span className={`pill ${s.incompleteMaterials.length ? "bg-sora" : ""}`}>未完了 {s.incompleteMaterials.length}</span>
        </div>
      </div>
      {nothing && <p className="text-ink-soft">確認が必要な項目はありません。必要に応じて「情報処方」から教材を追加できます。</p>}

      {openQuestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink-soft">患者さんからの質問・ふりかえり</h3>
          <ul className="space-y-2">
            {openQuestions.map((q) => (
              <QuestionRow key={q.feedbackId} sessionId={sessionId} q={q} onChanged={onChanged} onPrescribe={onPrescribe} />
            ))}
          </ul>
        </div>
      )}

      {s.missed.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink-soft">誤答・わからない（最新の確認問題）</h3>
          <ul className="space-y-2">
            {s.missed.map((m) => (
              <li key={m.materialId} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold leading-snug">
                      {m.title}
                      {m.isOldVersion && <span className="pill ml-1">旧版</span>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      まちがい {m.nWrong} ・ わからない {m.nUnknown} ・ {fmtDate(m.completedAt)}
                    </p>
                  </div>
                  <button className="btn btn-soft text-sm min-h-11 shrink-0 whitespace-nowrap" onClick={() => onPrescribe(m.materialId)}>
                    再処方
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {m.questions.map((q) => (
                    <li key={q.seq} className="flex gap-2 items-start">
                      <span className={`pill shrink-0 ${q.isUnknown ? "" : "bg-sakura"}`}>{q.isUnknown ? "わからない" : "誤答"}</span>
                      <span>
                        {q.stem}
                        {!q.isUnknown && q.selectedIndex !== null && (
                          <span className="block text-xs text-ink-muted">
                            患者の答え: {LETTERS[q.selectedIndex]} {q.options[q.selectedIndex]} ／ 正解: {LETTERS[q.correctIndex]} {q.options[q.correctIndex]}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.incompleteMaterials.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-ink-soft">未完了の教材</h3>
          <ul className="space-y-1">
            {s.incompleteMaterials.map((i) => (
              <li key={i.materialId} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <span className="min-w-0">
                  <span className="font-bold">{i.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {PHASE_LABEL[i.phase]} ・ {fmtDate(i.setCreatedAt)} {i.orgName}
                  </span>
                </span>
                <button className="btn btn-ghost text-sm min-h-11 shrink-0 whitespace-nowrap" onClick={() => onPrescribe(i.materialId)}>
                  再処方
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolved.length > 0 && (
        <details>
          <summary className="text-sm text-ink-soft cursor-pointer">対応済みの質問（{resolved.length}）</summary>
          <ul className="space-y-2 mt-2">
            {resolved.map((q) => (
              <QuestionRow key={q.feedbackId} sessionId={sessionId} q={q} onChanged={onChanged} onPrescribe={onPrescribe} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** 質問 1 件。主アクションは「対応を記録」。確認済み／対応済みは展開した中で明示的に選ぶ（誤タップ防止） */
function QuestionRow({ sessionId, q, onChanged, onPrescribe }: { sessionId: string; q: Question; onChanged: () => void; onPrescribe: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [responseType, setResponseType] = useState("verbal_explanation");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function setStatus(status: "reviewed" | "resolved") {
    setBusy(true);
    try {
      await api(`/api/v1/consultations/${sessionId}/questions/${q.feedbackId}`, {
        json: { status, responseType: status === "resolved" ? responseType : null, note: status === "resolved" ? note : null },
      });
      setOpen(false);
      setNote("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  const isQuestion = !!q.freeText || q.selection === "have_question" || q.selection === "explain_again";
  return (
    <li className={`rounded-xl border p-3 space-y-2 ${q.status === "unread" ? "border-sakura-deep bg-sakura/30" : "border-line"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-soft">
          {fmtDate(q.createdAt)} ・ {q.materialTitle}
        </span>
        <span className={`pill ${q.status === "resolved" ? "bg-wakakusa" : q.status === "reviewed" ? "bg-sora" : "bg-sakura"}`}>{STATUS_LABEL[q.status]}</span>
      </div>
      <p className="text-sm">{SELECTION_LABEL[q.selection]}</p>
      {q.freeText && <p className={`bg-surface rounded-lg p-2 ${open ? "" : "line-clamp-3"}`}>{q.freeText}</p>}
      {q.actions
        .filter((a) => a.status === "resolved")
        .map((a, i) => (
          <p key={i} className="text-xs text-ink-soft">
            {fmtDate(a.createdAt)} {a.orgName}: {a.responseType ? RESPONSE_LABEL[a.responseType] : ""}
            {a.note ? `（${a.note}）` : ""}
          </p>
        ))}
      <div className="flex flex-wrap gap-2">
        {q.status !== "resolved" && isQuestion && (
          <button className="btn btn-soft text-sm min-h-11 whitespace-nowrap" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "閉じる" : "対応を記録"}
          </button>
        )}
        <button className="btn btn-ghost text-sm min-h-11 whitespace-nowrap" onClick={() => onPrescribe(q.materialId)}>
          関連教材を処方
        </button>
      </div>
      {open && (
        <div className="grid gap-2 bg-surface rounded-lg p-3 border border-line">
          <p className="text-sm font-bold">この質問の状態を記録する</p>
          {q.status === "unread" && (
            <button className="btn text-sm min-h-11" disabled={busy} onClick={() => setStatus("reviewed")}>
              確認済みにする（まだ対応はしていない）
            </button>
          )}
          <div className="grid gap-2 rounded-lg bg-bg p-2">
            <label className="label" htmlFor={`rt-${q.feedbackId}`}>
              対応の方法
            </label>
            <select id={`rt-${q.feedbackId}`} className="input" value={responseType} onChange={(e) => setResponseType(e.target.value)}>
              {Object.entries(RESPONSE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input" placeholder="一言メモ（任意）" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="一言メモ" />
            <button className="btn btn-primary min-h-11" disabled={busy} onClick={() => setStatus("resolved")}>
              対応済みとして記録する
            </button>
            <p className="text-xs text-ink-muted">「対応済み」は患者さんの疑問が解消したことを意味しません。記録は履歴として残り、後から追記できます。</p>
          </div>
        </div>
      )}
    </li>
  );
}

/** スコアはコンパクトに。詳細は展開式（情報は隠さず、折りたたむだけ） */
function ScoresCard({ s }: { s: Summary | null }) {
  if (!s) return null;
  const snap = s.snapshotForThisSession;
  const latestSet = s.homework[0];
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">理解確認スコア</h2>
        <p className="text-xs text-ink-muted">点数は表示時のみ四捨五入</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-suna p-3">
          <p className="text-xs text-ink-soft">全体</p>
          <p className="text-2xl font-bold">{fmtScore(s.scores.overall.score)}</p>
          <p className="text-xs text-ink-muted">
            評価済み {s.scores.overall.evaluated}/{s.scores.overall.total}
          </p>
        </div>
        <div className="rounded-xl bg-sora p-3">
          <p className="text-xs text-ink-soft">前回の宿題（{snap ? `${fmtDate(snap.capturedAt)} 確定` : "診察開始時に確定"}）</p>
          {snap ? (
            <>
              <p className="text-2xl font-bold">{fmtScore(snap.score)}</p>
              <p className="text-xs text-ink-muted">
                完了 {snap.completedCount}/{snap.assignedCount}
                {!snap.capturedInThisSession && " ・ 以前の診察で確定"}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">当院の前回宿題はありません</p>
          )}
        </div>
        <div className="rounded-xl bg-wakakusa p-3">
          <p className="text-xs text-ink-soft">直近の宿題の進み具合</p>
          {latestSet ? (
            <>
              <p className="text-2xl font-bold">
                {latestSet.completedCount}/{latestSet.assignedCount}
              </p>
              <p className="text-xs text-ink-muted">{fmtDate(latestSet.createdAt)} 処方</p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">処方なし</p>
          )}
        </div>
      </div>
      <details>
        <summary className="text-sm cursor-pointer text-ink-soft">領域別</summary>
        <ul className="text-sm mt-1 space-y-1">
          {s.scores.byDomain.map((d) => (
            <li key={d.domain} className="flex justify-between">
              <span>
                {DOMAIN_LABEL[d.domain] ?? d.domain}{" "}
                <span className="text-ink-muted">
                  {d.evaluated}/{d.total}
                </span>
              </span>
              <span className="font-bold">{fmtScore(d.score)}</span>
            </li>
          ))}
          {s.scores.byDomain.length === 0 && <li className="text-ink-muted">未評価</li>}
        </ul>
      </details>
      {snap && snap.items.length > 0 && (
        <details>
          <summary className="text-sm cursor-pointer text-ink-soft">前回宿題の内訳（スナップショット・{fmtDate(snap.capturedAt)} 確定）</summary>
          <ul className="text-sm mt-1 space-y-1">
            {snap.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span>
                  {i.title} <span className="text-ink-muted">({PHASE_LABEL[i.phase] ?? i.phase})</span>
                </span>
                <span className="shrink-0">{fmtScore(i.scorePct)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {s.scores.materials.length > 0 && (
        <details>
          <summary className="text-sm cursor-pointer text-ink-soft">教材ごとの最新スコア</summary>
          <ul className="text-sm mt-1 space-y-1">
            {s.scores.materials.map((m) => (
              <li key={m.materialId} className="flex justify-between gap-2">
                <span>
                  {m.title}
                  {m.isOldVersion && <span className="pill ml-1">旧版の結果</span>}
                </span>
                <span className="shrink-0">
                  {fmtScore(m.scorePct ?? m.oldVersionScorePct)}
                  {m.attemptId ? ` (${m.nCorrect}/${m.nWrong}/${m.nUnknown})` : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">括弧は 正解/誤答/わからない</p>
        </details>
      )}
      {s.homework.length > 0 && (
        <details>
          <summary className="text-sm cursor-pointer text-ink-soft">宿題セットごと</summary>
          <ul className="text-sm mt-1 space-y-1">
            {s.homework.map((h) => (
              <li key={h.setId} className="flex justify-between gap-2">
                <span>
                  {fmtDate(h.createdAt)} {h.orgName}{" "}
                  <span className="text-ink-muted">
                    完了 {h.completedCount}/{h.assignedCount}
                  </span>
                </span>
                <span className="shrink-0">
                  {fmtScore(h.score)}
                  {h.snapshot ? ` ／ 確定時 ${fmtScore(h.snapshot.score)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
