import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getDraftForEditor } from "@/server/services/authoring";
import { DOMAIN_TAGS } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiGenerationJobs } from "@/server/db/schema";
import { GeneratorBadge } from "../../GeneratorBadge";
import { Editor, type EditorData } from "./Editor";
import { Stepper } from "../../Stepper";
import { STATUS_LABEL, fmt, modelLabel, staffPrincipal } from "../../shared";

/** 教材の編集・承認画面（原資料と並べて確認） */
export default async function MaterialEditorPage({ params }: { params: Promise<{ versionId: string }> }) {
  const u = await requirePageUser("staff");
  const { versionId } = await params;
  const d = await getDraftForEditor(staffPrincipal(u), versionId);
  const [job] = d.version.aiGenerationJobId
    ? await getDb().select({ generator: aiGenerationJobs.generator, model: aiGenerationJobs.model }).from(aiGenerationJobs).where(eq(aiGenerationJobs.id, d.version.aiGenerationJobId)).limit(1)
    : [];
  const data: EditorData = {
    versionId,
    status: d.version.status,
    scope: d.material.scope,
    canApprove: d.role.canApprove,
    approvalBlock: d.approvalBlock,
    reviewComment: d.version.reviewComment,
    warnings: d.check.warnings,
    mustCover: d.version.mustCover,
    preCheck: d.preCheck,
    draft: {
      title: d.material.title,
      summary: d.version.summary ?? "",
      primaryDomain: d.material.primaryDomain,
      learningObjectives: d.version.learningObjectives,
      slides: d.slides.map((s) => ({ title: s.title, proposition: s.proposition ?? "", body: s.bodyMd, detail: s.detailMd ?? "", sourceRefs: s.sourceRefs })),
      questions: d.questions.map((q) => ({ stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlide: q.relatedSlideSeq ?? 1, sourceRefs: q.sourceRefs })),
    },
    sources: d.sources.map((s) => ({ id: s.id, title: s.title, text: s.extractedText ?? "", warning: s.extractionWarning })),
    domains: [...DOMAIN_TAGS],
  };
  return (
    <main className="space-y-4">
      <header className="space-y-1">
        <Link href="/staff/studio" className="tap-link">
          ← 教材スタジオ
        </Link>
        <Stepper current={d.version.status === "published" ? 7 : 6} done={[1, 2, 3, 4, 5]} />
        <h1 className="text-2xl font-bold">{d.material.title}</h1>
        <p className="text-sm text-ink-soft">
          <span className="pill mr-2">{STATUS_LABEL[d.version.status] ?? d.version.status}</span>
          {d.material.scope === "common" ? "共通教材" : "病院独自教材"} ・ 版 {d.version.versionNo} ・ 作成 {d.creatorName} ・ {fmt(d.version.createdAt)}
          {job ? (
            <>
              {" ・ "}
              <GeneratorBadge generator={job.generator} /> {modelLabel(job.generator, job.model)}
            </>
          ) : (
            ""
          )}
          {d.version.approvedAt ? ` ・ 承認 ${fmt(d.version.approvedAt)}` : ""}
        </p>
        {d.version.changeNote && <p className="text-xs text-ink-muted">{d.version.changeNote}</p>}
        <div className="flex flex-wrap gap-2 items-center pt-1">
          <Link href={`/staff/materials/${versionId}/preview`} className="btn min-h-11 text-sm inline-flex items-center">
            患者画面でプレビュー
          </Link>
          <span className="text-xs text-ink-soft">{d.version.status === "published" ? "患者さんに届いている表示です。" : "承認前でも確認できます。患者さんには公開されません。"}</span>
        </div>
      </header>
      <Editor data={data} />
    </main>
  );
}
