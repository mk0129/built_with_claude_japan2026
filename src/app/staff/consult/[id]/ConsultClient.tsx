"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ApiError, api, errorText } from "@/lib/api";
import { usePoll } from "@/lib/use-poll";
import { useNow } from "@/lib/use-now";
import { DOMAIN_LABEL, PHASE_LABEL, RESPONSE_LABEL, SELECTION_LABEL, STATUS_LABEL, fmtDate, fmtScore } from "@/lib/labels";
import { PrescriptionPanel, type BasketItem } from "./PrescriptionPanel";
import { Icon } from "@/components/reset/Icons";
import { createPortal } from "react-dom";

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
type Incomplete = { materialId: string; title: string; phase: string; orgName: string; setCreatedAt: string; lastSlideSeq?: number };
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

  const remain = c ? fmtRemain(remainMs) : "--:--";
  return (
    <main className="space-y-4 pb-32 lg:pb-0">
      <div className="rsd-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="min-w-0">
          <div className="rsd-eyebrow">外来サポート</div>
          <h1 className="rsd-h1">診察で確認したいこと</h1>
          <div className="rsd-desc">
            {s ? `${s.patient.displayName} さん` : "読み込み中…"} ／ {c?.orgName} ・ {c?.clinicianName} ／ 学習内容の共有中
          </div>
        </div>
        <div className="rsd-row" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
          {c?.pendingExtension ? (
            <span className="rsd-tag self-center">延長の承認待ち</span>
          ) : (
            <button className="rsd-tallbtn" onClick={extend}>
              <Icon name="clock" size="sm" />
              延長を要求
            </button>
          )}
          <button className="rsd-tallbtn danger" onClick={end} aria-label="共有を終了">
            <Icon name="logout" size="sm" />
            共有を終了
          </button>
        </div>
      </div>
      <BarStatus warn={remainMs < 5 * 60_000}>
        <Icon name="checkcircle" size="sm" />
        <span className="long">患者の承認済み ・ </span>
        <span className="short">承認済み ・ </span>
        残り {remain}
      </BarStatus>
      {err && <p className="rsd-muted">{err}</p>}

      <div className="rsd-grid">
        <section className="space-y-4">
          {s ? <TodayCard sessionId={sessionId} s={s} onChanged={refresh} onPrescribe={prescribeRelated} /> : <section className="rsd-card rsd-muted">患者さんの記録を読み込んでいます…</section>}
          {s && s.previousConsultations.length > 0 && (
            <details className="rsd-card">
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

        <div className="space-y-4">
          <PrescriptionPanel sessionId={sessionId} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} currentSet={s?.currentSet ?? null} onPrescribed={refresh} basket={basket} setBasket={updateBasket} />
          <ProgressCard s={s} />
        </div>
      </div>
    </main>
  );
}

/** 前回の学びから（参照 .dcard / .infoline）: 患者からの質問 → もう一度説明したいこと（誤答・わからない） → 学習途中の教材。各行に主アクション */
function TodayCard({ sessionId, s, onChanged, onPrescribe }: { sessionId: string; s: Summary; onChanged: () => void; onPrescribe: (id: string) => void }) {
  const unread = s.questions.filter((q) => q.status === "unread").length;
  const missedCount = s.missed.reduce((a, m) => a + m.nWrong + m.nUnknown, 0);
  const openQuestions = s.questions.filter((q) => q.status !== "resolved");
  const resolved = s.questions.filter((q) => q.status === "resolved");
  const total = openQuestions.length + (s.missed.length ? 1 : 0) + (s.incompleteMaterials.length ? 1 : 0);
  const nothing = total === 0;

  return (
    <section className="rsd-card" aria-labelledby="today-title">
      <div className="rsd-row" style={{ justifyContent: "space-between" }}>
        <h2 id="today-title" style={{ marginBottom: 0 }}>
          前回の学びから
        </h2>
        <span className={`rsd-tag ${unread > 0 ? "coral" : ""}`}>確認事項 {total}件</span>
      </div>
      <p className="rsd-muted" style={{ margin: "4px 0 0" }}>
        未確認の質問 {unread} ・ 誤答・わからない {missedCount} ・ 未完了 {s.incompleteMaterials.length}
      </p>
      {nothing && <p className="rsd-muted" style={{ marginTop: 12 }}>確認が必要な項目はありません。必要に応じて「次の情報処方」から教材を追加できます。</p>}

      {openQuestions.map((q) => (
        <QuestionRow key={q.feedbackId} sessionId={sessionId} q={q} onChanged={onChanged} onPrescribe={onPrescribe} />
      ))}

      {s.missed.length > 0 && (
        <div className="rsd-infoline">
          <div className="rsd-mark">
            <Icon name="book" />
          </div>
          <div className="min-w-0 flex-1">
            <h3>もう一度説明したいこと</h3>
            <ul className="rsd-lines">
              {s.missed.map((m) => (
                <li key={m.materialId} className="rsd-line">
                  <div className="min-w-0 flex-1">
                    <p className="important font-bold truncate">
                      {m.title}
                      {m.isOldVersion && <span className="rsd-tag ml-1">旧版</span>}
                    </p>
                    <p className="rsd-muted">
                      まちがい {m.nWrong} ・ わからない {m.nUnknown} ・ {fmtDate(m.completedAt)}
                    </p>
                  </div>
                  <button className="btn btn-soft" onClick={() => onPrescribe(m.materialId)}>
                    再処方を候補へ
                  </button>
                </li>
              ))}
            </ul>
            <details className="rsd-sub">
              <summary>誤答・わからないの内容を見る（{s.missed.reduce((a, m) => a + m.questions.length, 0)} 問）</summary>
              {s.missed.map((m) => (
                <div key={m.materialId} className="mt-2">
                  <p className="font-bold">{m.title}</p>
                  <ul className="mt-1 space-y-1">
                    {m.questions.map((q) => (
                      <li key={q.seq} className="flex gap-2 items-start">
                        <span className={`rsd-tag shrink-0 ${q.isUnknown ? "" : "coral"}`}>{q.isUnknown ? "わからない" : "誤答"}</span>
                        <p>
                          {q.stem}
                          {!q.isUnknown && q.selectedIndex !== null && (
                            <span className="block rsd-muted">
                              患者「{q.options[q.selectedIndex]}」／正解「<b className="text-[color:var(--ink)]">{q.options[q.correctIndex]}</b>」
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          </div>
        </div>
      )}

      {s.incompleteMaterials.length > 0 && (
        <div className="rsd-infoline">
          <div className="rsd-mark">
            <Icon name="clock" />
          </div>
          <div className="min-w-0 flex-1">
            <h3>学習途中の教材</h3>
            <ul className="rsd-lines">
              {s.incompleteMaterials.map((i) => (
                <li key={i.materialId} className="rsd-line">
                  <div className="min-w-0 flex-1">
                    <p className="important font-bold truncate">{i.title}</p>
                    <p className="rsd-muted">
                      {PHASE_LABEL[i.phase] ?? i.phase}
                      {i.lastSlideSeq ? ` ・ ${i.lastSlideSeq} 画面まで` : ""} ・ {fmtDate(i.setCreatedAt)} {i.orgName}
                    </p>
                  </div>
                  <button className="btn btn-ghost" onClick={() => onPrescribe(i.materialId)}>
                    再処方を候補へ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rsd-row" style={{ justifyContent: "space-between", marginTop: 15 }}>
        <div className="rsd-muted">内容を確認し、説明または再処方につなげます</div>
        {resolved.length > 0 && (
          <details>
            <summary className="rsd-muted cursor-pointer">対応済みの質問（{resolved.length}）</summary>
            <ul className="space-y-2 mt-2">
              {resolved.map((q) => (
                <QuestionRow key={q.feedbackId} sessionId={sessionId} q={q} onChanged={onChanged} onPrescribe={onPrescribe} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * 質問 1 件（B 案）: 一覧では見出し・状態・本文 2 行だけを見せ、「対応する」で全文・対応履歴・記録フォーム・関連教材を展開する。
 * 質問の原文は変更・削除しない。確認済み／対応済みは展開した中で明示的に選ぶ（誤タップ防止）
 */
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
  const panelId = `q-${q.feedbackId}`;
  const text = q.freeText ?? `「${SELECTION_LABEL[q.selection]}」（本文なし）`;
  const history = q.actions.filter((a) => a.status === "resolved");
  return (
    <div className="rsd-infoline" data-question-row data-status={q.status}>
      <div className={`rsd-mark ${q.status === "unread" ? "coral" : ""}`}>
        <Icon name="message" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rsd-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <h3 className="min-w-0">患者からの質問</h3>
          <span className={`rsd-tag shrink-0 ${q.status === "unread" ? "coral" : q.status === "resolved" ? "sage" : ""}`} data-question-status>
            {STATUS_LABEL[q.status]}
          </span>
        </div>
        <p className="rsd-muted rsd-clamp1">
          {fmtDate(q.createdAt)} ・ {q.materialTitle}
        </p>
        {!open && <p className="important rsd-clamp2" data-question-text>{text}</p>}
        {open && (
          <div className="rsd-qpanel" id={panelId}>
            <p className="important" data-question-text>{text}</p>
            <p className="rsd-muted">
              患者の選択: 「{SELECTION_LABEL[q.selection]}」 ・ 教材: {q.materialTitle} ・ 状態: {STATUS_LABEL[q.status]}
            </p>
            {history.length > 0 && (
              <div className="rsd-muted">
                <p className="font-bold">対応履歴</p>
                {history.map((a, i) => (
                  <p key={i}>
                    {fmtDate(a.createdAt)} {a.orgName}: {a.responseType ? RESPONSE_LABEL[a.responseType] : ""}
                    {a.note ? `（${a.note}）` : ""}
                  </p>
                ))}
              </div>
            )}
            {q.status !== "resolved" && isQuestion && (
              <div className="grid gap-2" aria-label="この質問の状態を記録する">
                {q.status === "unread" && (
                  <button className="btn" disabled={busy} onClick={() => setStatus("reviewed")}>
                    確認済みにする（まだ対応はしていない）
                  </button>
                )}
                <label className="rsd-muted" htmlFor={`rt-${q.feedbackId}`}>
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
              </div>
            )}
            <div className="rsd-row" style={{ flexWrap: "wrap" }}>
              {q.status !== "resolved" && isQuestion && (
                <button className="btn btn-primary" disabled={busy} onClick={() => setStatus("resolved")}>
                  対応済みとして記録する
                </button>
              )}
              <button className="btn btn-soft" onClick={() => onPrescribe(q.materialId)}>
                関連教材を候補へ
              </button>
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} aria-expanded={true} aria-controls={panelId}>
                閉じる
              </button>
            </div>
            {q.status !== "resolved" && <p className="rsd-muted">「対応済み」は患者さんの疑問が解消したことを意味しません。記録は履歴として残り、後から追記できます。</p>}
          </div>
        )}
      </div>
      {!open && (
        <button className="rsd-expand" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={panelId} aria-label={`対応する: ${text.slice(0, 20)}`}>
          {q.status === "resolved" ? "履歴" : "対応する"} <Icon name="next" size="sm" />
        </button>
      )}
    </div>
  );
}

/** 学習の進み具合（参照 .dcard）。点数は折りたたみの中（情報は隠さず、主役にしない） */
function ProgressCard({ s }: { s: Summary | null }) {
  if (!s) return null;
  const snap = s.snapshotForThisSession;
  const latestSet = s.homework[0];
  const completed = latestSet?.completedCount ?? 0;
  const assigned = latestSet?.assignedCount ?? 0;
  return (
    <section className="rsd-card space-y-3">
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>学習の進み具合</h2>
      <div className="rsd-desc">{assigned > 0 ? `${assigned}教材のうち${completed}教材を完了（${latestSet ? fmtDate(latestSet.createdAt) : ""} 処方）` : "処方された教材はまだありません"}</div>
      <div className="rsd-progress" aria-label="完了率">
        <div style={{ width: assigned > 0 ? `${(completed / assigned) * 100}%` : "0%" }} />
      </div>
      <div className="rsd-muted">点数ではなく、確認すべき内容を優先表示</div>
      <details>
      <summary className="rsd-muted cursor-pointer">理解確認スコア（参考）</summary>
      <div className="space-y-3 mt-2">
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
      </div>
      </details>
    </section>
  );
}

/** 上部バー右側の差し込み口（DeskBar の #rsd-bar-slot）に承認状態を出す。参照 .deskbar .status */
function BarStatus({ warn, children }: { warn: boolean; children: React.ReactNode }) {
  const slot = useSyncExternalStore(
    () => () => {},
    () => document.getElementById("rsd-bar-slot"),
    () => null,
  );
  const el = (
    <span className={`rsd-status ${warn ? "warn" : ""}`} aria-live="polite">
      {children}
    </span>
  );
  return slot ? createPortal(el, slot) : <div>{el}</div>;
}
