import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { listMemberships } from "@/server/authz/principal";
import { listSources } from "@/server/services/sources";
import { listJobs, nudgeJob } from "@/server/services/ai-generation";
import { listStudioMaterials } from "@/server/services/authoring";
import { claudeConfigured, claudeMode } from "@/server/services/claude";
import { UploadForm } from "./UploadForm";
import { JobWatcher } from "./JobWatcher";
import { GeneratorBadge } from "./GeneratorBadge";
import { JOB_MODE_LABEL, STATUS_LABEL, fmt, staffPrincipal } from "./shared";
import { Stepper } from "./Stepper";
import { RegisterCollapsible } from "./RegisterCollapsible";

/** 教材スタジオ: 原資料の登録・許諾、AI 下書きジョブ、教材の承認状況 */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const u = await requirePageUser("staff");
  const p = staffPrincipal(u);
  const ms = (await listMemberships(u.id)).filter((m) => m.roles.includes("material_editor") || m.roles.includes("material_approver"));
  if (ms.length === 0)
    return (
      <main className="card">
        <p>教材の編集・承認の権限がありません。</p>
        <Link href="/staff" className="tap-link underline">
          ← 医療者ホーム
        </Link>
      </main>
    );
  const want = (await searchParams).org;
  const m = ms.find((x) => x.orgId === want) ?? ms[0];
  const [sources, jobs, mats] = await Promise.all([listSources(p, m.orgId), listJobs(p, m.orgId), listStudioMaterials(p, m.orgId)]);
  await Promise.all(jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => nudgeJob(j)));
  const active = jobs.some((j) => j.status === "queued" || j.status === "running");
  const aiReady = claudeConfigured();
  const mode = claudeMode();
  // 対応が必要な案件（上段に優先表示）
  const inReview = mats.filter((x) => x.status === "in_review");
  const drafts = mats.filter((x) => x.status === "draft");
  const runningJobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const needsAction = inReview.length + drafts.length + runningJobs.length + failedJobs.length;
  const isApprover = m.roles.includes("material_approver");

  return (
    <main className="space-y-6">
      <JobWatcher active={active} />
      <header className="space-y-1">
        <Link href="/staff" className="tap-link">
          ← 医療者ホーム
        </Link>
        <h1 className="text-2xl font-bold">教材スタジオ</h1>
        <p className="text-ink-soft">
          {m.orgName} ・ {m.orgKind === "operator" ? "共通教材（作成者と別の承認者が必要）" : "病院独自教材（承認権限があれば自己承認可）"} ・ あなたの権限: {m.roles.filter((r) => r.startsWith("material")).map((r) => (r === "material_approver" ? "承認者" : "編集者")).join("・")}
        </p>
        {ms.length > 1 && (
          <p className="text-sm">
            所属の切り替え:{" "}
            {ms.map((x) => (
              <Link key={x.orgId} href={`?org=${x.orgId}`} className={`tap-link mr-3 ${x.orgId === m.orgId ? "font-bold text-accent" : "underline"}`}>
                {x.orgName}
              </Link>
            ))}
          </p>
        )}
      </header>

      {!aiReady && (
        <div className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-4 py-3" role="status">
          Claude API が未設定です（ANTHROPIC_API_KEY）。原資料の登録はできますが、AI 下書きは作成できません。
        </div>
      )}
      {mode === "fake" && (
        <div className="rounded-xl border-2 border-dashed border-danger text-danger text-sm font-bold px-4 py-3" role="status">
          開発用の擬似生成モードです。作成される下書きは Claude による生成ではありません（API キー未設定・CLAUDE_FAKE=1）。
        </div>
      )}

      <section className="space-y-2" aria-label="制作の進み方">
        <Stepper current={0} done={[]} />
        <p className="text-xs text-ink-soft">原資料を選ぶ → Claude の構成案 → 必須事項を確認 → 教材・クイズを生成 → 患者画面で確認 → 原資料と照合し編集・承認</p>
      </section>

      <section className="space-y-3" aria-label="対応が必要" data-testid="needs-action">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-lg">
            対応が必要 <span className="pill">{needsAction}</span>
          </h2>
          <a href="#register" className="btn btn-primary min-h-11 text-sm inline-flex items-center">
            ＋ 原資料を登録して作り始める
          </a>
        </div>
        {needsAction === 0 ? (
          <p className="card text-sm text-ink-muted">いま対応が必要な教材・ジョブはありません。原資料を登録するか、原資料の画面から下書きを作ります。</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3 items-start">
            <div className="card space-y-2 min-w-0">
              <h3 className="font-bold">
                承認待ち <span className={`pill ${inReview.length ? "bg-sakura text-ink" : ""}`}>{inReview.length}</span>
              </h3>
              {inReview.length === 0 && <p className="text-xs text-ink-muted">なし</p>}
              <ul className="divide-y divide-line text-sm">
                {inReview.map((x) => (
                  <li key={x.versionId} className="py-2 space-y-1">
                    <Link href={`/staff/studio/materials/${x.versionId}`} className="tap-link underline font-bold">
                      {x.title}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      作成 {x.createdBy} ・ 版 {x.versionNo} ・ {x.aiJobId ? "Claude 下書き" : "手動作成"}
                    </p>
                    <Link href={`/staff/studio/materials/${x.versionId}`} className="btn min-h-9 text-xs inline-flex items-center">
                      {isApprover ? "原資料と照合して承認" : "内容を確認"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card space-y-2 min-w-0">
              <h3 className="font-bold">
                下書き（編集中） <span className="pill">{drafts.length}</span>
              </h3>
              {drafts.length === 0 && <p className="text-xs text-ink-muted">なし</p>}
              <ul className="divide-y divide-line text-sm">
                {drafts.map((x) => (
                  <li key={x.versionId} className="py-2 space-y-1">
                    <Link href={`/staff/studio/materials/${x.versionId}`} className="tap-link underline font-bold">
                      {x.title}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      作成 {x.createdBy} ・ 版 {x.versionNo}
                    </p>
                    <Link href={`/staff/studio/materials/${x.versionId}`} className="btn min-h-9 text-xs inline-flex items-center">
                      編集を続ける
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card space-y-2 min-w-0">
              <h3 className="font-bold">
                作成中・失敗したジョブ <span className={`pill ${failedJobs.length ? "bg-sakura text-ink" : ""}`}>{runningJobs.length + failedJobs.length}</span>
              </h3>
              {runningJobs.length + failedJobs.length === 0 && <p className="text-xs text-ink-muted">なし</p>}
              <ul className="divide-y divide-line text-sm">
                {[...runningJobs, ...failedJobs].map((j) => (
                  <li key={j.id} className="py-2 space-y-1">
                    <p className="flex flex-wrap gap-x-2 items-center">
                      <span className="pill">{STATUS_LABEL[j.status] ?? j.status}</span>
                      <b>{JOB_MODE_LABEL[j.mode] ?? j.mode}</b>
                    </p>
                    <p className="text-xs text-ink-soft">{j.status === "failed" ? j.errorMessage : j.progress}</p>
                    {(j.status === "queued" || j.status === "running") && (
                      <div className="h-1.5 rounded-full bg-line overflow-hidden">
                        <div className="h-full w-1/3 bg-accent animate-pulse" />
                      </div>
                    )}
                    {j.sourceDocumentIds[0] && (
                      <Link href={`/staff/studio/sources/${j.sourceDocumentIds[0]}`} className="btn min-h-9 text-xs inline-flex items-center">
                        原資料の画面へ
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-4 items-start">
        <RegisterCollapsible initialOpen={sources.length === 0}>
          <UploadForm orgId={m.orgId} />
        </RegisterCollapsible>
        <div className="card space-y-3 min-w-0">
          <h2 className="font-bold text-lg">原資料（{sources.length}）</h2>
          {sources.length === 0 && <p className="text-sm text-ink-muted">まだ登録がありません。</p>}
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.id} className="py-2">
                <Link href={`/staff/studio/sources/${s.id}`} className="tap-link underline font-bold">
                  {s.title}
                </Link>
                <p className="text-xs text-ink-soft">
                  {Math.ceil(s.sizeBytes / 1024)} KB ・ {fmt(s.createdAt)} ・{" "}
                  {s.aiCheck.ok ? <span className="text-accent font-bold">AI 処理可</span> : <span className="text-danger font-bold">AI 処理不可</span>}
                  {s.extractionWarning ? " ・ 抽出に注意あり" : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <details className="card space-y-3">
        <summary className="cursor-pointer min-h-11 flex items-center font-bold text-lg">AI 作成ジョブの履歴（{jobs.length}）</summary>
        {jobs.length === 0 && <p className="text-sm text-ink-muted">まだありません。原資料の画面から作成します。</p>}
        <ul className="divide-y divide-line text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="pill">{STATUS_LABEL[j.status] ?? j.status}</span>
              <GeneratorBadge generator={j.generator} />
              <span className="font-bold">{JOB_MODE_LABEL[j.mode] ?? j.mode}</span>
              <span className="text-ink-soft">{j.progress}</span>
              <span className="text-ink-muted">{fmt(j.createdAt)}</span>
              {j.sourceDocumentIds[0] && (
                <Link href={`/staff/studio/sources/${j.sourceDocumentIds[0]}`} className="tap-link underline">
                  原資料へ
                </Link>
              )}
              {j.outputVersionId && (
                <Link href={`/staff/studio/materials/${j.outputVersionId}`} className="tap-link underline">
                  下書きを開く
                </Link>
              )}
            </li>
          ))}
        </ul>
      </details>

      <section className="card space-y-3">
        <h2 className="font-bold text-lg">公開中・すべての教材（{mats.length}）</h2>
        <ul className="divide-y divide-line text-sm">
          {mats.map((x) => (
            <li key={x.versionId} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="pill">{STATUS_LABEL[x.status] ?? x.status}</span>
              <Link href={`/staff/studio/materials/${x.versionId}`} className="tap-link underline font-bold">
                {x.title}
              </Link>
              <span className="text-ink-soft">
                版 {x.versionNo} ・ 作成 {x.createdBy} ・ {x.aiJobId ? "AI 下書き由来" : "手動作成"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
