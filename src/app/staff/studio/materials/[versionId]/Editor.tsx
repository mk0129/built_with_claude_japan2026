"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";

type Ref = { sourceId: string; section?: string; quote?: string };
type Slide = { title: string; proposition: string; body: string; detail: string; sourceRefs: Ref[] };
type Question = { stem: string; options: string[]; correctIndex: number; explanation: string; relatedSlide: number; sourceRefs: Ref[] };
export type EditorData = {
  versionId: string;
  status: string;
  scope: string;
  canApprove: boolean;
  approvalBlock: string | null;
  reviewComment: string | null;
  warnings: string[];
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
        {data.reviewComment && <p className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-3 py-2">差し戻しコメント: {data.reviewComment}</p>}
        {data.warnings.length > 0 && (
          <div className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-3 py-2" role="status">
            {data.warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        )}
        <section className="card space-y-2">
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
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold">
            学習目標（1 行に 1 つ）
            <textarea className="input mt-1" rows={2} value={d.learningObjectives.join("\n")} disabled={!editable} onChange={(e) => set({ ...d, learningObjectives: e.target.value.split("\n").slice(0, 5) })} />
          </label>
        </section>

        {d.slides.map((s, i) => (
          <section key={i} className="card space-y-2" aria-label={`画面 ${i + 1}`}>
            <div className="flex justify-between items-center">
              <h2 className="font-bold">画面 {i + 1} / {d.slides.length}</h2>
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
          <section key={i} className="card space-y-2" aria-label={`確認問題 ${i + 1}`}>
            <div className="flex justify-between items-center">
              <h2 className="font-bold">確認問題 {i + 1} / {d.questions.length}（3 択＋「わからない」は自動で付きます）</h2>
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

        <section className="card space-y-3 sticky bottom-2 shadow-lg" aria-label="操作">
          {msg && <p className={`text-sm ${msg.ok ? "text-accent font-bold" : "text-danger"}`} role="status">{msg.text}</p>}
          {editable && (
            <div className="grid sm:grid-cols-2 gap-2">
              <button className="btn min-h-11" disabled={busy || !dirty} onClick={save}>
                {dirty ? "下書きを保存" : "保存済み"}
              </button>
              <button className="btn btn-primary min-h-11" disabled={busy || dirty} onClick={() => act(`${base}/submit`, {}, "承認依頼を出しました")} title={dirty ? "先に保存してください" : ""}>
                承認を依頼する
              </button>
            </div>
          )}
          {data.status === "in_review" && (
            <>
              {data.approvalBlock ? (
                <p className="text-sm rounded-xl bg-suna text-[#8a5a0a] px-3 py-2">承認できません: {data.approvalBlock}</p>
              ) : (
                <p className="text-sm text-ink-soft">承認すると{data.scope === "common" ? "共通" : "病院独自"}ライブラリに公開され、処方できるようになります。</p>
              )}
              {data.canApprove && (
                <>
                  <input className="input min-h-11" placeholder="差し戻しコメント" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-label="差し戻しコメント" />
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button className="btn min-h-11" disabled={busy} onClick={() => act(`${base}/return`, { comment }, "差し戻しました")}>
                      差し戻す
                    </button>
                    <button className="btn btn-primary min-h-11" disabled={busy || !!data.approvalBlock} onClick={() => act(`${base}/approve`, {}, "承認し、ライブラリに公開しました")}>
                      承認して公開する
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {data.status === "published" && (
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-sm font-bold text-accent">公開中です。診察画面の処方候補に表示されます。</p>
              <Link href={`/staff/materials/${data.versionId}/preview`} className="btn min-h-11 text-sm inline-flex items-center">
                患者画面でプレビュー
              </Link>
              {data.canApprove && (
                <button className="btn btn-ghost min-h-11 text-sm" disabled={busy} onClick={() => act(`${base}/retire`, {}, "公開を停止しました")}>
                  公開を停止
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="card space-y-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] overflow-auto min-w-0" aria-label="原資料">
        <h2 className="font-bold text-lg">原資料と比較</h2>
        {data.sources.map((s) => (
          <div key={s.id} className="space-y-1">
            <p className="font-bold text-sm">{s.title}</p>
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
      <mark ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="bg-suna font-bold">
        {quote}
      </mark>
      {text.slice(idx + quote.length)}
    </pre>
  );
}
