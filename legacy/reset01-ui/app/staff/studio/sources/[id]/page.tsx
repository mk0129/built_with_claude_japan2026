import { and, arrayContains, desc, eq } from "drizzle-orm";
import { requirePageUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { aiGenerationJobs } from "@/server/db/schema";
import { getSourceDetail } from "@/server/services/sources";
import { claudeConfigured } from "@/server/services/claude";
import { nudgeJob, type OutlineOutput } from "@/server/services/ai-generation";
import { JobWatcher } from "../../JobWatcher";
import { GeneratePanel, type JobView } from "./GeneratePanel";
import { fmt, staffPrincipal } from "../../shared";
import { Icon } from "@/components/reset/Icons";

const PERM_LABEL = [
  ["allowStore", "非公開保存"],
  ["allowAi", "AI 処理"],
  ["allowDerive", "改変・要約"],
  ["allowPublish", "Web 公開"],
  ["allowShare", "他施設共有"],
] as const;

/** 原資料の詳細: 許諾・抽出結果の確認と、AI 下書きの作成（B: 構成案から選ぶ / C: テーマを自由入力） */
export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePageUser("staff");
  const { id } = await params;
  const d = await getSourceDetail(staffPrincipal(u), id);
  const s = d.source;
  const meta = (s.extractionMeta ?? {}) as { pages?: number; lowTextPages?: number[]; imageCount?: number; charCount?: number };
  const jobs = await getDb()
    .select()
    .from(aiGenerationJobs)
    .where(and(eq(aiGenerationJobs.orgId, d.membership.orgId), arrayContains(aiGenerationJobs.sourceDocumentIds, [id])))
    .orderBy(desc(aiGenerationJobs.createdAt))
    .limit(20);
  // 取り残されたジョブ（関数の打ち切り等）があれば、ここで実行を予約し直す
  await Promise.all(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => nudgeJob(j)));
  const views: JobView[] = jobs.map((j) => ({
    id: j.id,
    mode: j.mode,
    status: j.status,
    progress: j.progress,
    errorMessage: j.errorMessage,
    attempt: j.attempt,
    createdAt: fmt(j.createdAt),
    model: j.model,
    generator: j.generator,
    errorCode: j.errorCode,
    durationMs: j.durationMs,
    inputTokens: j.inputTokenCount,
    outputTokens: j.outputTokenCount,
    outputVersionId: j.outputVersionId,
    outlines: j.mode === "outline" && j.status === "succeeded" ? ((j.outputPayload as OutlineOutput).outlines ?? []) : [],
    mustCoverCandidates: j.mode === "outline" && j.status === "succeeded" ? ((j.outputPayload as OutlineOutput).mustCoverCandidates ?? []) : [],
    notCovered: ((j.outputPayload as { notCoveredBySource?: string[] } | null)?.notCoveredBySource ?? []) as string[],
    warnings: ((j.outputPayload as { validationWarnings?: string[] } | null)?.validationWarnings ?? []) as string[],
  }));
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <main className="space-y-4">
      <JobWatcher active={active} />
      <div className="rsd-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="min-w-0">
          <div className="rsd-eyebrow">医療者がつくる患者教育</div>
          <h1 className="rsd-h1">伝えたいことを、学べるかたちに。</h1>
          <div className="rsd-desc">Claude の提案をもとに、まず教材の構成を選びます。</div>
        </div>
        <a href="#source-detail" className="rsd-source-pill">
          <Icon name="file" size="sm" /> 原資料：{s.title} <Icon name="next" size="sm" />
        </a>
      </div>


      <GeneratePanel sourceId={id} orgId={d.membership.orgId} canGenerate={d.aiCheck.ok && claudeConfigured()} aiConfigured={claudeConfigured()} jobs={views} />
      <details id="source-detail" className="rsd-card scroll-mt-4" open={!d.aiCheck.ok}>
        <summary className="cursor-pointer font-bold min-h-11 flex flex-wrap items-center gap-2">
          原資料の許諾と抽出テキスト
          <span className="rsd-muted font-normal">
            {Math.ceil(s.sizeBytes / 1024)} KB ・ {d.membership.orgName} ・ 登録 {fmt(s.createdAt)}
          </span>
          {d.aiCheck.ok ? <span className="rsd-tag sage">Claude に送信できます</span> : <span className="rsd-tag coral">AI 処理はできません</span>}
        </summary>
        <section className="grid lg:grid-cols-2 gap-4 items-start mt-3">
          <div className="space-y-3 min-w-0">
            <h2 className="font-bold" style={{ fontSize: 16 }}>許諾の記録</h2>
            {d.permission ? (
              <>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {PERM_LABEL.map(([k, label]) => (
                    <li key={k} className={`rsd-tag ${d.permission![k] ? "sage" : "opacity-50 line-through"}`}>
                      {d.permission![k] ? "✓" : "×"} {label}
                    </li>
                  ))}
                </ul>
                <dl className="text-sm grid grid-cols-[7em_1fr] gap-y-1">
                  <dt className="text-ink-soft">許諾元</dt>
                  <dd>{d.permission.rightsHolder}</dd>
                  <dt className="text-ink-soft">根拠</dt>
                  <dd className="whitespace-pre-wrap">{d.permission.evidenceNote}</dd>
                  <dt className="text-ink-soft">確認日時</dt>
                  <dd>{fmt(d.permission.checkedAt)}</dd>
                  <dt className="text-ink-soft">個人情報</dt>
                  <dd>{s.piiAttestedNone ? "含まないことを確認済み" : "未確認"}</dd>
                </dl>
              </>
            ) : (
              <p className="text-danger text-sm">許諾が登録されていません。</p>
            )}
            <div className={`rounded-xl px-3 py-2 text-sm ${d.aiCheck.ok ? "border border-line" : "bg-suna text-[#8a5a0a]"}`} role="status">
              {d.aiCheck.ok ? (
                <b>Claude に送信できます（サーバー側で送信直前にも再確認します）。</b>
              ) : (
                <>
                  <b>AI 処理はできません。</b>
                  <ul className="list-disc pl-5">
                    {d.aiCheck.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <h2 className="font-bold" style={{ fontSize: 16 }}>抽出したテキスト</h2>
            <p className="rsd-muted">
              {meta.charCount ?? 0} 文字{meta.pages ? ` ・ ${meta.pages} ページ` : ""}
              {meta.imageCount ? ` ・ 画像 ${meta.imageCount} 点（文字化されません）` : ""} ・ OCR は行いません
            </p>
            {s.extractionWarning && (
              <div className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-3 py-2 whitespace-pre-wrap">⚠ {s.extractionWarning}</div>
            )}
            <pre className="whitespace-pre-wrap text-sm leading-relaxed max-h-96 overflow-auto rounded-xl border border-line p-3 bg-surface">{s.extractedText}</pre>
          </div>
        </section>
      </details>
    </main>
  );
}
