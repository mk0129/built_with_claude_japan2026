"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { DOMAIN_LABEL, MUST_COVER_KIND_LABEL, MUST_COVER_STATUS_LABEL } from "@/lib/labels";
import { Icon } from "@/components/reset/Icons";

type Ref = { sourceId: string; section?: string; quote?: string };
type Slide = { title: string; proposition: string; body: string; detail: string; sourceRefs: Ref[] };
type Question = { stem: string; options: string[]; correctIndex: number; explanation: string; relatedSlide: number; sourceRefs: Ref[] };
export type MustCoverView = {
  id: string;
  text: string;
  kind: string;
  sourceRef: Ref;
  status: "required" | "other_material" | "needs_review";
  coverage: { slides: number[]; questions: number[] };
  autoMatched: boolean | null;
  confirmed: { byUserId: string; byName: string; at: string; note: string | null } | null;
};
export type PreCheckView = {
  refs: { total: number; found: number; missing: number };
  slidesWithoutRefs: number[];
  questionsWithoutRefs: number[];
  sectionMix: number;
  mustCover: { total: number; required: number; autoMatched: number; confirmed: number; needsReview: number; unconfirmed: number; safetyUnconfirmed: { id: string; text: string; kind: string }[] };
};
export type EditorData = {
  versionId: string;
  status: string;
  scope: string;
  canApprove: boolean;
  approvalBlock: string | null;
  reviewComment: string | null;
  warnings: string[];
  mustCover: MustCoverView[];
  preCheck: PreCheckView;
  draft: { title: string; summary: string; primaryDomain: string; learningObjectives: string[]; slides: Slide[]; questions: Question[] };
  sources: { id: string; title: string; text: string; warning: string | null }[];
  domains: string[];
};

const norm = (s: string) => s.replace(/\s+/g, "");

export function Editor({ data }: { data: EditorData }) {
  const router = useRouter();
  const [d, setD] = useState(data.draft);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const editable = data.status === "draft";
  const srcText = useMemo(() => Object.fromEntries(data.sources.map((s) => [s.id, norm(s.text)])), [data.sources]);
  const [focusQuote, setFocusQuote] = useState<string | null>(null);
  const [ackSafety, setAckSafety] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const safetyUnconfirmed = data.preCheck.mustCover.safetyUnconfirmed;
  const canChangeMustCover = data.status === "draft" || data.status === "in_review";

  const set = (next: typeof d) => {
    setD(next);
    setDirty(true);
  };
  const setSlide = (i: number, patch: Partial<Slide>) => set({ ...d, slides: d.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setQ = (i: number, patch: Partial<Question>) => set({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });

  async function act(path: string, json: unknown, okText: string, method?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api(path, { json, method });
      setMsg({ ok: true, text: okText });
      setDirty(false);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  const base = `/api/v1/studio/materials/${data.versionId}`;
  const save = () => act(base, d, "保存しました", "PUT");

  function RefList({ refs }: { refs: Ref[] }) {
    if (!refs.length) return <p className="text-xs text-danger">出典の指定がありません</p>;
    return (
      <ul className="text-xs space-y-1">
        {refs.map((r, i) => {
          const found = r.quote ? (srcText[r.sourceId] ?? "").includes(norm(r.quote)) : null;
          return (
            <li key={i} className="flex gap-1 items-start">
              <span className={found === false ? "text-danger font-bold" : "text-accent font-bold"}>{found === false ? "× 原資料に見つかりません" : "✓ 出典"}</span>
              <button type="button" className="text-left underline text-ink-soft" onClick={() => setFocusQuote(r.quote ?? null)}>
                {r.section ? `§${r.section} ` : ""}「{r.quote ?? "（引用なし）"}」
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {data.reviewComment && <p className="rsd-status warn" style={{ display: "flex" }}>差し戻しコメント: {data.reviewComment}</p>}
        {data.warnings.length > 0 && (
          <div className="rsd-status warn" style={{ display: "grid", gap: 2 }} role="status">
            {data.warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        )}
        <PreCheckPanel data={data} canChange={canChangeMustCover} busy={busy} onBusy={setBusy} onMsg={setMsg} onDone={() => router.refresh()} />
        <p className="rsd-muted">
          全画面と確認問題を原資料と見比べたうえで、末尾で{editable ? "保存・承認依頼" : data.canApprove && data.status === "in_review" ? "承認または差し戻し" : "操作"}を行います。{" "}
          <a href="#actions" className="rsd-link">
            操作へ移動
          </a>
        </p>
        <section className="rsd-card space-y-2" aria-label="教材の基本情報">
          <h2>基本情報</h2>
          <label className="block text-sm font-bold">
            タイトル
            <input className="input min-h-11 mt-1" value={d.title} disabled={!editable} onChange={(e) => set({ ...d, title: e.target.value })} maxLength={120} />
          </label>
          <label className="block text-sm font-bold">
            概要
            <textarea className="input mt-1" rows={2} value={d.summary} disabled={!editable} onChange={(e) => set({ ...d, summary: e.target.value })} maxLength={400} />
          </label>
          <label className="block text-sm font-bold">
            領域
            <select className="input min-h-11 mt-1" value={d.primaryDomain} disabled={!editable} onChange={(e) => set({ ...d, primaryDomain: e.target.value })}>
              {data.domains.map((x) => (
                <option key={x} value={x}>
                  {DOMAIN_LABEL[x] ?? x}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            学習目標（1 行に 1 つ）
            <textarea className="input mt-1" rows={2} value={d.learningObjectives.join("\n")} disabled={!editable} onChange={(e) => set({ ...d, learningObjectives: e.target.value.split("\n").slice(0, 5) })} />
          </label>
        </section>

        {d.slides.map((s, i) => (
          <section key={i} className="rsd-card space-y-2" aria-label={`画面 ${i + 1}`}>
            <div className="flex justify-between items-center">
              <h2>
                <span className="rsd-eyebrow" style={{ display: "block", marginBottom: 2 }}>患者画面</span>
                画面 {i + 1} / {d.slides.length}
              </h2>
              {editable && d.slides.length > 3 && (
                <button type="button" className="btn btn-ghost min-h-11 text-sm" onClick={() => set({ ...d, slides: d.slides.filter((_, j) => j !== i) })}>
                  この画面を削除
                </button>
              )}
            </div>
            <input className="input min-h-11 font-bold" aria-label={`画面 ${i + 1} の見出し`} value={s.title} disabled={!editable} onChange={(e) => setSlide(i, { title: e.target.value })} maxLength={80} />
            <input className="input min-h-11" aria-label={`画面 ${i + 1} の要点`} placeholder="要点（1 文）" value={s.proposition} disabled={!editable} onChange={(e) => setSlide(i, { proposition: e.target.value })} maxLength={200} />
            <textarea className="input leading-relaxed" aria-label={`画面 ${i + 1} の本文`} rows={4} value={s.body} disabled={!editable} onChange={(e) => setSlide(i, { body: e.target.value })} maxLength={2000} />
            <textarea className="input text-sm" aria-label={`画面 ${i + 1} のくわしく`} rows={2} placeholder="くわしく読む（任意）" value={s.detail} disabled={!editable} onChange={(e) => setSlide(i, { detail: e.target.value })} maxLength={2000} />
            <RefList refs={s.sourceRefs} />
          </section>
        ))}

        {d.questions.map((q, i) => (
          <section key={i} className="rsd-card space-y-2" aria-label={`確認問題 ${i + 1}`}>
            <div className="flex justify-between items-center">
              <h2>
                <span className="rsd-eyebrow" style={{ display: "block", marginBottom: 2 }}>理解度の確認</span>
                確認問題 {i + 1} / {d.questions.length} <span className="rsd-muted font-normal">（3 択＋「わからない」は自動で付きます）</span>
              </h2>
              {editable && d.questions.length > 2 && (
                <button type="button" className="btn btn-ghost min-h-11 text-sm" onClick={() => set({ ...d, questions: d.questions.filter((_, j) => j !== i) })}>
                  削除
                </button>
              )}
            </div>
            <textarea className="input" aria-label={`問題 ${i + 1} の問題文`} rows={2} value={q.stem} disabled={!editable} onChange={(e) => setQ(i, { stem: e.target.value })} maxLength={300} />
            {q.options.map((o, k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" className="w-5 h-5" name={`correct-${i}`} checked={q.correctIndex === k} disabled={!editable} onChange={() => setQ(i, { correctIndex: k })} aria-label={`選択肢 ${k + 1} を正答にする`} />
                <input className="input min-h-11" aria-label={`問題 ${i + 1} 選択肢 ${k + 1}`} value={o} disabled={!editable} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} maxLength={150} />
              </label>
            ))}
            <label className="block text-sm font-bold">
              監修用の解説（患者さんには結果画面で表示）
              <textarea className="input mt-1 text-sm" rows={2} value={q.explanation} disabled={!editable} onChange={(e) => setQ(i, { explanation: e.target.value })} maxLength={1000} />
            </label>
            <label className="text-sm">
              関連する画面:{" "}
              <select className="input min-h-11 w-24 inline-block" value={q.relatedSlide} disabled={!editable} onChange={(e) => setQ(i, { relatedSlide: Number(e.target.value) })}>
                {d.slides.map((_, k) => (
                  <option key={k} value={k + 1}>
                    {k + 1}
                  </option>
                ))}
              </select>
            </label>
            <RefList refs={q.sourceRefs} />
          </section>
        ))}

        <section id="actions" className="rsd-card space-y-3 scroll-mt-4" aria-label="操作">
          <h2>{data.status === "draft" ? "保存と承認依頼" : data.status === "in_review" ? "承認・差し戻し" : data.status === "published" ? "公開中の教材" : "操作"}</h2>
          {msg && <p className={`text-sm ${msg.ok ? "font-bold" : "text-danger"}`} style={msg.ok ? { color: "var(--sage)" } : undefined} role="status">{msg.text}</p>}
          {data.status !== "published" && (
            <ApprovalChecklist data={data} />
          )}
          {data.status !== "published" && (
            <p className="rsd-muted">
              <Link href={`/staff/materials/${data.versionId}/preview`} className="rsd-link">
                患者画面でプレビュー
              </Link>
              　承認前でも、患者さんに見える形で確認できます（患者さんには公開されません）。
            </p>
          )}
          {editable && (
            <div className="rsd-row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn" disabled={busy || !dirty} onClick={save}>
                {dirty ? "下書きを保存" : "保存済み"}
              </button>
              <button className="btn btn-primary" style={{ minHeight: 47 }} disabled={busy || dirty} onClick={() => act(`${base}/submit`, {}, "承認依頼を出しました")} title={dirty ? "先に保存してください" : ""}>
                承認を依頼する <Icon name="arrow" size="sm" />
              </button>
            </div>
          )}
          {data.status === "in_review" && (
            <>
              {data.approvalBlock ? (
                <p className="rsd-status warn" style={{ display: "flex" }}>承認できません: {data.approvalBlock}</p>
              ) : (
                <p className="rsd-muted">承認すると{data.scope === "common" ? "共通" : "病院独自"}ライブラリに公開され、処方できるようになります。</p>
              )}
              {!data.canApprove && <p className="rsd-muted">承認権限のある医療者が確認します。承認までお待ちください。</p>}
              {data.canApprove && (
                <>
                  {safetyUnconfirmed.length > 0 && (
                    <div className="rsd-card space-y-2" style={{ borderColor: "var(--danger)", padding: 14 }} role="alert" aria-label="安全上の重要事項が未確認">
                      <p className="font-bold text-danger">安全上の重要事項が未確認です（{safetyUnconfirmed.length} 件）。承認の前に、上部の「承認前の点検」で内容を確認してください。</p>
                      <ul className="list-disc pl-5">
                        {safetyUnconfirmed.map((i) => (
                          <li key={i.id}>
                            {MUST_COVER_KIND_LABEL[i.kind] ?? i.kind}: {i.text}
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="w-5 h-5 mt-0.5" checked={ackSafety} onChange={(e) => setAckSafety(e.target.checked)} />
                        <span>未確認の重要事項があることを理解したうえで承認する（理由を記録します）</span>
                      </label>
                      {ackSafety && <input className="input" placeholder="理由（例: 別教材で扱うことを確認済み）" value={ackNote} onChange={(e) => setAckNote(e.target.value)} maxLength={500} aria-label="未確認のまま承認する理由" />}
                    </div>
                  )}
                  <input className="input" placeholder="差し戻しコメント" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-label="差し戻しコメント" />
                  <div className="rsd-row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button className="btn" disabled={busy} onClick={() => act(`${base}/return`, { comment }, "差し戻しました")}>
                      差し戻す
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ minHeight: 47 }}
                      disabled={busy || !!data.approvalBlock || (safetyUnconfirmed.length > 0 && !ackSafety)}
                      onClick={() => act(`${base}/approve`, safetyUnconfirmed.length > 0 ? { acknowledgeSafety: true, note: ackNote } : {}, "承認し、ライブラリに公開しました")}
                    >
                      <Icon name="check" size="sm" /> 承認して公開する
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {data.status === "published" && (
            <div className="rsd-row" style={{ flexWrap: "wrap" }}>
              <p className="font-bold" style={{ color: "var(--sage)" }}>公開中です。診察画面の処方候補に表示されます。</p>
              <Link href={`/staff/materials/${data.versionId}/preview`} className="btn">
                患者画面でプレビュー
              </Link>
              {data.canApprove && (
                <button className="btn btn-ghost" disabled={busy} onClick={() => act(`${base}/retire`, {}, "公開を停止しました")}>
                  公開を停止
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="rsd-card space-y-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] overflow-auto min-w-0" aria-label="原資料">
        <h2>原資料と比較</h2>
        <p className="rsd-muted">出典の「✓ 出典」を押すと該当箇所へ移動します。</p>
        {data.sources.map((s) => (
          <div key={s.id} className="space-y-1">
            <p className="rsd-source-pill" style={{ display: "inline-flex" }}>
              <Icon name="file" size="sm" /> {s.title}
            </p>
            {s.warning && <p className="text-xs text-[#8a5a0a] whitespace-pre-wrap">⚠ {s.warning}</p>}
            <SourceText text={s.text} quote={focusQuote} />
          </div>
        ))}
      </aside>
    </div>
  );
}

function SourceText({ text, quote }: { text: string; quote: string | null }) {
  const idx = quote ? text.indexOf(quote) : -1;
  if (!quote || idx < 0) return <pre className="whitespace-pre-wrap text-sm leading-relaxed">{text}</pre>;
  return (
    <pre className="whitespace-pre-wrap text-sm leading-relaxed">
      {text.slice(0, idx)}
      <mark ref={(el) => el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="bg-suna font-bold">
        {quote}
      </mark>
      {text.slice(idx + quote.length)}
    </pre>
  );
}

/**
 * 承認前の点検（UX-07 / GEN-05）。機械チェックは候補の抽出であり、網羅と医学的妥当性の最終判断は医療者が行う。
 * - 引用の一致 / 出典なし / 主題の混在（GEN-02）
 * - 必須事項: 分類（この教材で必須 / 別教材で扱う / 医療者の確認が必要）、Claude が申告した対応画面、機械照合、医療者の確認
 * - 安全上の重要事項（緊急連絡・受診・禁止）が未確認なら強い警告。「別教材で扱う」は対象範囲外として区別する
 */
function PreCheckPanel({ data, canChange, busy, onBusy, onMsg, onDone }: { data: EditorData; canChange: boolean; busy: boolean; onBusy: (b: boolean) => void; onMsg: (m: { ok: boolean; text: string } | null) => void; onDone: () => void }) {
  const pc = data.preCheck;
  const mc = pc.mustCover;
  const [items, setItems] = useState(data.mustCover);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function update(updates: { id: string; text?: string; status?: string; confirmed?: boolean; note?: string | null }[]) {
    onBusy(true);
    onMsg(null);
    try {
      const r = await api<{ mustCover: MustCoverView[] }>(`/api/v1/studio/materials/${data.versionId}/must-cover`, { json: { updates }, method: "PUT" });
      setItems(r.mustCover);
      onDone();
    } catch (e) {
      onMsg({ ok: false, text: errorText(e) });
    } finally {
      onBusy(false);
    }
  }
  const safety = new Set(["emergency", "visit", "prohibition"]);
  const safetyUnconfirmed = items.filter((i) => i.status !== "other_material" && safety.has(i.kind) && !i.confirmed);
  const otherMaterial = items.filter((i) => i.status === "other_material");
  const unconfirmedCount = items.filter((i) => i.status !== "other_material" && !i.confirmed).length;
  return (
    <section className="rsd-card space-y-3" aria-label="承認前の点検" data-testid="precheck">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 style={{ marginBottom: 0 }}>承認前の点検</h2>
        <p className="rsd-muted">機械チェックは参考情報です。網羅と医学的妥当性の最終確認は医療者が行います。</p>
      </div>
      <dl className="rsd-stats">
        <div className={`rsd-stat ${pc.refs.missing > 0 ? "warn" : ""}`}>
          <dt>引用が原資料に一致</dt>
          <dd className="num">
            {pc.refs.found} / {pc.refs.total}
          </dd>
          {pc.refs.missing > 0 && <dd className="text-danger">見つからない引用 {pc.refs.missing}</dd>}
        </div>
        <div className={`rsd-stat ${pc.slidesWithoutRefs.length + pc.questionsWithoutRefs.length > 0 ? "warn" : ""}`}>
          <dt>出典のない画面・設問</dt>
          <dd className="num">{pc.slidesWithoutRefs.length + pc.questionsWithoutRefs.length}</dd>
          {(pc.slidesWithoutRefs.length > 0 || pc.questionsWithoutRefs.length > 0) && (
            <dd>
              {pc.slidesWithoutRefs.length > 0 ? `画面 ${pc.slidesWithoutRefs.join(", ")}` : ""}
              {pc.questionsWithoutRefs.length > 0 ? ` 問 ${pc.questionsWithoutRefs.join(", ")}` : ""}
            </dd>
          )}
        </div>
        <div className={`rsd-stat ${pc.sectionMix > 0 ? "warn" : ""}`}>
          <dt>主題の混在（1 画面 1 主題）</dt>
          <dd className="num">{pc.sectionMix}</dd>
          <dd>出典の見出しが複数の画面</dd>
        </div>
        <div className={`rsd-stat ${safetyUnconfirmed.length > 0 ? "danger" : unconfirmedCount > 0 ? "warn" : ""}`}>
          <dt>必須事項の確認</dt>
          <dd className="num">
            {items.filter((i) => i.status !== "other_material" && i.confirmed).length} / {items.filter((i) => i.status !== "other_material").length}
          </dd>
          <dd>機械照合 {mc.autoMatched} / {mc.required}（参考）</dd>
        </div>
      </dl>
      {safetyUnconfirmed.length > 0 && (
        <div className="rsd-card" style={{ borderColor: "var(--danger)", padding: 14 }} role="alert">
          <p className="font-bold text-danger">安全上の重要事項が未確認です（{safetyUnconfirmed.length} 件）。本文を原資料と照合し、下の一覧で「確認済み」にしてください。</p>
        </div>
      )}
      {items.length === 0 ? (
        <p className="rsd-muted">必須事項は設定されていません（手動作成、または必須事項なしで生成）。</p>
      ) : (
        <div className="space-y-2">
          <div className="rsd-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h3 className="font-bold" style={{ fontSize: 15 }}>必須事項と本文の対応（{items.length} 件{otherMaterial.length > 0 ? ` ・ 別教材で扱う ${otherMaterial.length} 件` : ""}）</h3>
            <div className="rsd-row" style={{ gap: 6 }}>
              <span className="rsd-tag sage">確認済み {items.filter((i) => i.status !== "other_material" && i.confirmed).length}</span>
              <span className={`rsd-tag ${unconfirmedCount > 0 ? "coral" : ""}`}>未確認 {unconfirmedCount}</span>
              {otherMaterial.length > 0 && <span className="rsd-tag">別教材 {otherMaterial.length}</span>}
            </div>
          </div>
          <ul className="divide-y divide-line">
            {items.map((i, idx) => {
              const isSafety = safety.has(i.kind);
              const covered = i.coverage.slides.length > 0 || i.coverage.questions.length > 0;
              return (
                <li key={i.id} className={`py-2 space-y-1.5 text-sm ${i.status === "other_material" ? "opacity-70" : ""}`} aria-label={`必須事項 ${idx + 1}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rsd-tag ${isSafety ? "coral" : ""}`}>{MUST_COVER_KIND_LABEL[i.kind] ?? i.kind}</span>
                    {i.status !== "other_material" && <span className={`rsd-tag ${i.confirmed ? "sage" : ""}`}>{i.confirmed ? "確認済み" : "未確認"}</span>}
                    {canChange ? (
                      <select className="input min-h-9 w-auto text-xs py-0" value={i.status} disabled={busy} onChange={(e) => update([{ id: i.id, status: e.target.value }])} aria-label={`必須事項 ${idx + 1} の分類`}>
                        {Object.entries(MUST_COVER_STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rsd-tag">{MUST_COVER_STATUS_LABEL[i.status]}</span>
                    )}
                  </div>
                  <p className="font-bold leading-snug">{i.text}</p>
                  {i.sourceRef.quote && <p className="text-xs text-ink-soft">原資料: 「{i.sourceRef.quote}」</p>}
                  {i.status !== "other_material" && (
                    <p className="text-xs flex flex-wrap gap-x-3">
                      <span>
                        Claude の申告: {covered ? `${i.coverage.slides.length ? `画面 ${i.coverage.slides.join(", ")}` : ""}${i.coverage.questions.length ? ` 問 ${i.coverage.questions.join(", ")}` : ""}` : "対応なし"}
                      </span>
                      <span className={i.autoMatched ? "text-accent" : i.autoMatched === false ? "text-danger" : "text-ink-muted"}>機械照合: {i.autoMatched ? "引用あり（参考）" : i.autoMatched === false ? "引用なし" : "—"}</span>
                    </p>
                  )}
                  {i.status === "other_material" ? (
                    <p className="text-xs text-ink-soft">別教材で扱う（この教材の対象範囲外）</p>
                  ) : i.confirmed ? (
                    <p className="text-xs" style={{ color: "var(--sage)" }}>
                      ✓ 医療者が確認済み: {i.confirmed.byName} ・ {new Date(i.confirmed.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      {i.confirmed.note ? ` ・ ${i.confirmed.note}` : ""}
                      {canChange && (
                        <button type="button" className="underline ml-2" disabled={busy} onClick={() => update([{ id: i.id, confirmed: false }])}>
                          取り消す
                        </button>
                      )}
                    </p>
                  ) : (
                    canChange && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <input className="input min-h-9 text-xs flex-1 min-w-[10rem]" placeholder="確認メモ（任意。例: 画面 4 の本文で扱っている）" value={notes[i.id] ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} maxLength={500} aria-label={`必須事項 ${idx + 1} の確認メモ`} />
                        <button type="button" className={`btn min-h-9 text-xs ${isSafety ? "btn-primary" : ""}`} disabled={busy} onClick={() => update([{ id: i.id, confirmed: true, note: notes[i.id] || null }])}>
                          本文と照合して確認済みにする
                        </button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 承認の条件を一覧で示す（表示のみ。実際の可否はサーバーの approvalBlock と安全上の未確認で決まる） */
function ApprovalChecklist({ data }: { data: EditorData }) {
  const pc = data.preCheck;
  const mc = pc.mustCover;
  const rows: { ok: boolean; warn?: boolean; text: string }[] = [
    { ok: pc.refs.missing === 0, text: pc.refs.missing === 0 ? `引用 ${pc.refs.found} / ${pc.refs.total} 件が原資料に一致` : `原資料に見つからない引用が ${pc.refs.missing} 件` },
    { ok: pc.slidesWithoutRefs.length + pc.questionsWithoutRefs.length === 0, text: pc.slidesWithoutRefs.length + pc.questionsWithoutRefs.length === 0 ? "すべての画面・設問に出典がある" : `出典のない画面・設問 ${pc.slidesWithoutRefs.length + pc.questionsWithoutRefs.length} 件` },
    { ok: mc.unconfirmed === 0, warn: mc.safetyUnconfirmed.length > 0, text: mc.total === 0 ? "必須事項の設定なし" : mc.unconfirmed === 0 ? `必須事項 ${mc.confirmed} / ${mc.total - (mc.total - mc.required - mc.needsReview)} 件を医療者が確認済み` : `必須事項の未確認 ${mc.unconfirmed} 件${mc.safetyUnconfirmed.length > 0 ? `（うち安全上の重要事項 ${mc.safetyUnconfirmed.length} 件）` : ""}` },
    { ok: !data.approvalBlock, text: data.approvalBlock ? `承認条件: ${data.approvalBlock}` : "医学的な最終確認は承認者が行います" },
  ];
  return (
    <ul className="rsd-checklist" aria-label="承認の条件">
      {rows.map((r, i) => (
        <li key={i} className={r.ok ? "ok" : r.warn ? "danger" : "warn"}>
          <Icon name={r.ok ? "checkcircle" : "help"} size="sm" /> {r.text}
        </li>
      ))}
    </ul>
  );
}
