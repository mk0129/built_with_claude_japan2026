"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { GeneratorBadge } from "../../GeneratorBadge";
import { JOB_MODE_LABEL, modelLabel } from "../../shared";

export type JobView = {
  id: string;
  mode: string;
  status: string;
  progress: string | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: string;
  model: string;
  generator: string;
  errorCode: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  outputVersionId: string | null;
  outlines: { title: string; targetReader: string; learningObjectives: string[]; slideTitles: string[]; rationale: string }[];
  notCovered: string[];
  warnings: string[];
};

const STATUS: Record<string, string> = { queued: "待機中", running: "作成中", succeeded: "完了", failed: "失敗" };
const isActive = (j: JobView | null | undefined) => !!j && (j.status === "queued" || j.status === "running");

/**
 * 原資料から Claude に下書きを作らせるパネル（UX-03）。
 * 情報階層: 1) 作り方を選ぶ（構成案 / テーマ指定） → 2) 最新の結果（進行中・構成案・下書き）を操作の直下に大きく表示 → 3) 過去の作成履歴は折りたたみ。
 * 新しいジョブが始まったとき・完了したときは結果領域へ自動でスクロールする。
 */
export function GeneratePanel({ sourceId, orgId, canGenerate, aiConfigured, jobs }: { sourceId: string; orgId: string; canGenerate: boolean; aiConfigured: boolean; jobs: JobView[] }) {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [objectives, setObjectives] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function post(path: string, json: unknown, mode?: string) {
    setBusy(true);
    setMsg(null);
    if (mode) setPendingMode(mode);
    try {
      await api(path, { json, headers: { "idempotency-key": crypto.randomUUID() } });
      router.refresh();
    } catch (e) {
      setMsg(errorText(e));
      setPendingMode(null);
    } finally {
      setBusy(false);
    }
  }
  const create = (body: { mode: string; [k: string]: unknown }) => post(`/api/v1/studio/jobs?orgId=${orgId}`, body, body.mode);

  // 最新のジョブ（サーバーは作成日時の降順で返す）
  const latest = jobs[0] ?? null;
  const latestOutline = jobs.find((j) => j.mode === "outline" && j.status === "succeeded" && j.outlines.length > 0) ?? null;
  const active = isActive(latest) ? latest : null;
  // 送信直後でサーバーの一覧にまだ出ていない間も「作成中」を表示する（一覧に新しいジョブが現れたら下の effect で解除）
  const showPending = pendingMode !== null && !active;

  // 新しいジョブの開始・完了で結果領域へスクロール（初回描画では動かさない）
  const key = `${latest?.id ?? ""}:${latest?.status ?? ""}`;
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevKey.current === null) {
      prevKey.current = key;
      return;
    }
    if (prevKey.current !== key) {
      prevKey.current = key;
      setPendingMode(null);
      if (latest) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [key, latest]);

  const historyJobs = jobs.filter((j) => j.id !== latest?.id);

  return (
    <section className="space-y-4">
      {!aiConfigured && <p className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-4 py-3">Claude API が未設定のため、AI 下書きは作成できません（ANTHROPIC_API_KEY）。</p>}
      <div>
        <h2 className="font-bold text-lg">Claude に下書きを作ってもらう</h2>
        <p className="text-sm text-ink-soft">原資料に書かれていない医学情報は追加しない指示で生成します。生成物は下書きで、医療者が確認・承認するまで患者さんには届きません。</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="card space-y-3 min-w-0 border-2 border-sakura-deep">
          <h3 className="font-bold text-lg">構成案を提案してもらう（おすすめ）</h3>
          <p className="text-sm text-ink-soft">原資料の章立てから 1〜3 案の教材構成を提案します。案を選ぶと 3〜5 画面と確認問題 2〜5 問の下書きを作ります。</p>
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy || !!active} onClick={() => create({ mode: "outline", sourceIds: [sourceId] })}>
            構成案を作る
          </button>
          <p className="text-xs text-ink-soft">通常 15〜20 秒ほど。結果はこの下に表示されます。</p>
        </div>
        <form
          className="card space-y-3 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            create({ mode: "freeform", sourceIds: [sourceId], theme, audience: audience || undefined, objectives: objectives.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3) });
          }}
        >
          <h3 className="font-bold text-lg">テーマと学習目標を指定して作る</h3>
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
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy || !!active || !theme.trim()}>
            この内容で下書きを作る
          </button>
        </form>
      </div>
      {msg && <p className="text-sm text-danger">{msg}</p>}

      {/* ---- 最新の結果（操作の直下） ---- */}
      <div ref={resultRef} className="scroll-mt-4 space-y-4" data-testid="generation-result" aria-live="polite">
        {(active || showPending) && <ProgressCard job={active} mode={active?.mode ?? pendingMode ?? "outline"} />}
        {latest && latest.status === "failed" && (
          <div className="card border-2 border-danger space-y-2" role="alert">
            <p className="font-bold text-danger">作成に失敗しました（{JOB_MODE_LABEL[latest.mode] ?? latest.mode}）</p>
            <p className="text-sm text-danger">
              {latest.errorMessage}
              {latest.errorCode ? `（${latest.errorCode}）` : ""}
            </p>
            <button className="btn min-h-11 text-sm" disabled={busy} onClick={() => post(`/api/v1/studio/jobs/${latest.id}/retry`, {}, latest.mode)}>
              再試行する
            </button>
          </div>
        )}
        {latest && latest.status === "succeeded" && latest.mode === "outline" && <OutlineResult job={latest} sourceId={sourceId} busy={busy || !!active} canGenerate={canGenerate} onPick={(i) => create({ mode: "generate", sourceIds: [sourceId], fromJobId: latest.id, outlineIndex: i })} />}
        {latest && latest.status === "succeeded" && latest.mode !== "outline" && (
          <DraftReady job={latest}>
            {latestOutline && (
              <details className="text-sm">
                <summary className="cursor-pointer min-h-11 flex items-center text-ink-soft">別の構成案から作る（前回の提案 {latestOutline.outlines.length} 案）</summary>
                <div className="mt-2">
                  <OutlineResult job={latestOutline} sourceId={sourceId} busy={busy || !!active} canGenerate={canGenerate} compact onPick={(i) => create({ mode: "generate", sourceIds: [sourceId], fromJobId: latestOutline.id, outlineIndex: i })} />
                </div>
              </details>
            )}
          </DraftReady>
        )}
      </div>

      {/* ---- 過去の作成履歴（折りたたみ） ---- */}
      {historyJobs.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer min-h-11 flex items-center font-bold">これまでの作成履歴（{historyJobs.length}）</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {historyJobs.map((j) => (
              <li key={j.id} className="py-2 space-y-1" aria-label={`履歴 ${JOB_MODE_LABEL[j.mode] ?? j.mode}`}>
                <p className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                  <span className="pill">{STATUS[j.status] ?? j.status}</span>
                  <GeneratorBadge generator={j.generator} />
                  <b>{JOB_MODE_LABEL[j.mode] ?? j.mode}</b>
                  <JobMeta job={j} />
                </p>
                {j.status === "failed" && <p className="text-xs text-danger">{j.errorMessage}</p>}
                {j.outlines.length > 0 && <p className="text-xs text-ink-soft">構成案: {j.outlines.map((o, i) => `案 ${i + 1} ${o.title}`).join(" ／ ")}</p>}
                {j.outputVersionId && (
                  <Link href={`/staff/studio/materials/${j.outputVersionId}`} className="tap-link underline">
                    この下書きを開く
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function JobMeta({ job: j }: { job: JobView }) {
  const model = modelLabel(j.generator, j.model);
  return (
    <span className="text-ink-muted">
      {j.createdAt}
      {model ? ` ・ ${model}` : ""}
      {j.attempt > 1 ? ` ・ ${j.attempt} 回目` : ""}
      {j.durationMs != null ? ` ・ ${(j.durationMs / 1000).toFixed(1)} 秒` : ""}
      {j.inputTokens != null && j.generator === "claude" ? ` ・ 入力 ${j.inputTokens.toLocaleString()} / 出力 ${(j.outputTokens ?? 0).toLocaleString()} トークン` : ""}
    </span>
  );
}

function ProgressCard({ job, mode }: { job: JobView | null; mode: string }) {
  const outline = mode === "outline";
  return (
    <div className="card border-2 border-accent space-y-2" role="status" aria-label="作成中">
      <p className="font-bold text-lg">{outline ? "Claude が構成案を考えています…" : "Claude が教材の下書きを作っています…"}</p>
      <p className="text-sm text-ink-soft">{job?.progress ?? "送信しました"} ・ 通常 {outline ? "15〜20 秒" : "20〜40 秒"}ほどかかります。この画面を開いたままお待ちください。</p>
      {job?.status === "queued" && job.errorMessage && <p className="text-xs text-[#8a5a0a]">前回の失敗: {job.errorMessage}（自動で再試行します）</p>}
      <div className="h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full w-1/3 bg-accent animate-pulse" />
      </div>
    </div>
  );
}

function OutlineResult({ job, busy, canGenerate, onPick, compact = false }: { job: JobView; sourceId: string; busy: boolean; canGenerate: boolean; onPick: (i: number) => void; compact?: boolean }) {
  const n = job.outlines.length;
  return (
    <section className={compact ? "space-y-3" : "card border-2 border-accent space-y-3"} aria-label="Claude の構成案">
      {!compact && (
        <header className="space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="pill bg-wakakusa text-ink font-bold">構成案ができました</span>
            <GeneratorBadge generator={job.generator} />
            <JobMeta job={job} />
          </p>
          <h3 className="font-bold text-xl">Claude の構成案（{n} 案）</h3>
          <p className="text-sm text-ink-soft">
            {n > 1 ? "原資料の章立てに沿って、重ならないように分けています。学習目標と画面構成を見比べて、" : "学習目標と画面構成を確認して、"}
            <b>次のステップ: 1 つ選んで「この案で下書きを作る」</b>を押してください。別の案は後から作れます。
          </p>
        </header>
      )}
      <ol className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {job.outlines.map((o, i) => (
          <li key={i} className="rounded-xl bg-surface border border-line p-3 space-y-2 text-sm flex flex-col">
            <p className="font-bold text-base leading-snug">
              <span className="pill mr-2">案 {i + 1}</span>
              {o.title}
            </p>
            <p className="text-ink-soft">対象: {o.targetReader}</p>
            <div>
              <p className="font-bold text-xs text-ink-soft">学習目標</p>
              <ul className="list-disc pl-5">
                {o.learningObjectives.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-bold text-xs text-ink-soft">画面構成（{o.slideTitles.length} 画面）</p>
              <ol className="list-decimal pl-5">
                {o.slideTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </div>
            <p className="text-xs text-ink-soft">
              <span className="font-bold">この案の特徴: </span>
              {o.rationale}
            </p>
            <button className="btn btn-primary min-h-11 w-full text-sm mt-auto" disabled={!canGenerate || busy} onClick={() => onPick(i)}>
              この案で下書きを作る
            </button>
          </li>
        ))}
      </ol>
      {job.notCovered.length > 0 && <p className="text-xs text-ink-soft">原資料に記載がなく扱わない内容: {job.notCovered.join("、")}</p>}
      {job.warnings.map((w) => (
        <p key={w} className="text-xs text-[#8a5a0a]">⚠ {w}</p>
      ))}
    </section>
  );
}

function DraftReady({ job, children }: { job: JobView; children?: React.ReactNode }) {
  return (
    <section className="card border-2 border-accent space-y-3" aria-label="下書きができました">
      <p className="flex flex-wrap items-center gap-2">
        <span className="pill bg-wakakusa text-ink font-bold">下書きができました</span>
        <GeneratorBadge generator={job.generator} />
        <span className="text-ink-soft text-sm">{JOB_MODE_LABEL[job.mode] ?? job.mode}</span>
        <JobMeta job={job} />
      </p>
      <p className="text-sm text-ink-soft">
        <b>次のステップ:</b> 下書きを開き、各画面と確認問題を原資料と見比べて、保存・承認依頼を行います。患者画面でのプレビューも編集画面からできます。
      </p>
      {job.outputVersionId && (
        <Link href={`/staff/studio/materials/${job.outputVersionId}`} className="btn btn-primary min-h-11 w-full sm:w-auto inline-flex items-center justify-center">
          下書きを確認・編集する →
        </Link>
      )}
      {job.notCovered.length > 0 && <p className="text-xs text-ink-soft">原資料に記載がなく扱わなかった内容: {job.notCovered.join("、")}</p>}
      {job.warnings.map((w) => (
        <p key={w} className="text-xs text-[#8a5a0a]">⚠ {w}</p>
      ))}
      {children}
    </section>
  );
}
