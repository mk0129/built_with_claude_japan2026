"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";

export type JobView = {
  id: string;
  mode: string;
  status: string;
  progress: string | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: string;
  model: string;
  outputVersionId: string | null;
  outlines: { title: string; targetReader: string; learningObjectives: string[]; slideTitles: string[]; rationale: string }[];
  notCovered: string[];
  warnings: string[];
};

const STATUS: Record<string, string> = { queued: "待機中", running: "作成中", succeeded: "完了", failed: "失敗" };
const MODE: Record<string, string> = { outline: "構成案（B）", generate: "教材生成（B）", freeform: "自由入力で生成（C）" };

export function GeneratePanel({ sourceId, orgId, canGenerate, aiConfigured, jobs }: { sourceId: string; orgId: string; canGenerate: boolean; aiConfigured: boolean; jobs: JobView[] }) {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [objectives, setObjectives] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(path: string, json: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      await api(path, { json, headers: { "idempotency-key": crypto.randomUUID() } });
      router.refresh();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const create = (body: unknown) => post(`/api/v1/studio/jobs?orgId=${orgId}`, body);

  return (
    <section className="space-y-4">
      {!aiConfigured && <p className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-4 py-3">Claude API が未設定のため、AI 下書きは作成できません（ANTHROPIC_API_KEY）。</p>}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="card space-y-3">
          <h2 className="font-bold text-lg">B. Claude に構成を提案してもらう</h2>
          <p className="text-sm text-ink-soft">原資料から 1〜3 案の教材構成を提案します。案を選ぶと 3〜5 画面と確認問題 2〜5 問の下書きを作成します。</p>
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy} onClick={() => create({ mode: "outline", sourceIds: [sourceId] })}>
            構成案を作る
          </button>
        </div>
        <form
          className="card space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create({ mode: "freeform", sourceIds: [sourceId], theme, audience: audience || undefined, objectives: objectives.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3) });
          }}
        >
          <h2 className="font-bold text-lg">C. テーマと学習目標を指定する</h2>
          <label className="block text-sm font-bold">
            テーマ
            <input className="input min-h-11 mt-1" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={200} required placeholder="例: ホルモン療法を自己判断でやめないために" />
          </label>
          <label className="block text-sm font-bold">
            対象（任意）
            <input className="input min-h-11 mt-1" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="例: 術後ホルモン療法を始める方" />
          </label>
          <label className="block text-sm font-bold">
            学習目標（1 行に 1 つ、3 つまで）
            <textarea className="input mt-1" rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </label>
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy || !theme.trim()}>
            この内容で下書きを作る
          </button>
        </form>
      </div>
      <p className="text-xs text-ink-soft">原資料に書かれていない医学情報は追加しない指示で生成します。生成物は下書きで、医療者が確認・承認するまで患者さんには届きません。</p>
      {msg && <p className="text-sm text-danger">{msg}</p>}

      <div className="card space-y-3">
        <h2 className="font-bold text-lg">この原資料の作成履歴</h2>
        {jobs.length === 0 && <p className="text-sm text-ink-muted">まだありません。</p>}
        {jobs.map((j) => (
          <article key={j.id} className="rounded-xl border border-line p-3 space-y-2" aria-label={`ジョブ ${MODE[j.mode]}`}>
            <p className="text-sm flex flex-wrap gap-x-3 items-center">
              <span className="pill">{STATUS[j.status] ?? j.status}</span>
              <b>{MODE[j.mode] ?? j.mode}</b>
              <span className="text-ink-soft">{j.progress}</span>
              <span className="text-ink-muted">
                {j.createdAt} ・ {j.model}
                {j.attempt > 1 ? ` ・ ${j.attempt} 回目` : ""}
              </span>
            </p>
            {(j.status === "queued" || j.status === "running") && <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full w-1/3 bg-accent animate-pulse" /></div>}
            {j.status === "failed" && (
              <div className="space-y-2">
                <p className="text-sm text-danger">{j.errorMessage}</p>
                <button className="btn min-h-11 text-sm" disabled={busy} onClick={() => post(`/api/v1/studio/jobs/${j.id}/retry`, {})}>
                  再試行する
                </button>
              </div>
            )}
            {j.outlines.length > 0 && (
              <ol className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {j.outlines.map((o, i) => (
                  <li key={i} className="rounded-xl bg-surface border border-line p-3 space-y-1 text-sm">
                    <p className="font-bold">
                      案 {i + 1}: {o.title}
                    </p>
                    <p className="text-ink-soft">対象: {o.targetReader}</p>
                    <ol className="list-decimal pl-5">
                      {o.slideTitles.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                    <p className="text-xs text-ink-soft">{o.rationale}</p>
                    <button className="btn btn-primary min-h-11 w-full text-sm" disabled={!canGenerate || busy} onClick={() => create({ mode: "generate", sourceIds: [sourceId], fromJobId: j.id, outlineIndex: i })}>
                      この案で下書きを作る
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {j.notCovered.length > 0 && <p className="text-xs text-ink-soft">原資料に記載がなく扱わなかった内容: {j.notCovered.join("、")}</p>}
            {j.warnings.map((w) => (
              <p key={w} className="text-xs text-[#8a5a0a]">⚠ {w}</p>
            ))}
            {j.outputVersionId && (
              <Link href={`/staff/studio/materials/${j.outputVersionId}`} className="btn min-h-11 text-sm inline-flex items-center">
                下書きを確認・編集する →
              </Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
