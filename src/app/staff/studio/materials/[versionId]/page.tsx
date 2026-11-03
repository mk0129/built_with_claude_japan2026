import Link from "next/link";
import { requirePageUser } from "@/server/auth/session";
import { getDraftForEditor } from "@/server/services/authoring";
import { DOMAIN_TAGS } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiGenerationJobs } from "@/server/db/schema";
import { GeneratorBadge } from "../../GeneratorBadge";
import { Icon } from "@/components/reset/Icons";
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
      <header className="rsd-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="min-w-0">
          <div className="rsd-eyebrow">医療者がつくる患者教育</div>
          <h1 className="rsd-h1">{d.material.title}</h1>
          <div className="rsd-row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span className={`rsd-tag ${d.version.status === "published" ? "sage" : d.version.status === "in_review" ? "coral" : ""}`}>{STATUS_LABEL[d.version.status] ?? d.version.status}</span>
            <span className="rsd-tag">{d.material.scope === "common" ? "共通教材" : "病院独自教材"}</span>
            <span className="rsd-tag">版 {d.version.versionNo}</span>
            {job && <GeneratorBadge generator={job.generator} />}
            <span className="rsd-muted">
              作成 {d.creatorName} ・ {fmt(d.version.createdAt)}
              {job && modelLabel(job.generator, job.model) ? ` ・ ${modelLabel(job.generator, job.model)}` : ""}
              {d.version.approvedAt ? ` ・ 承認 ${fmt(d.version.approvedAt)}` : ""}
            </span>
          </div>
          {d.version.changeNote && <p className="rsd-muted" style={{ marginTop: 4 }}>{d.version.changeNote}</p>}
        </div>
        <div className="rsd-row" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
          <Link href={`/staff/materials/${versionId}/preview`} className="rsd-tallbtn">
            <Icon name="play" size="sm" />
            患者画面で確認
          </Link>
        </div>
      </header>
      <Stepper current={d.version.status === "published" ? 7 : d.version.status === "in_review" ? 6 : 4} done={d.version.status === "published" ? [1, 2, 3, 4, 5, 6] : d.version.status === "in_review" ? [1, 2, 3, 4, 5] : [1, 2, 3]} />
      <p className="rsd-muted">{d.version.status === "published" ? "患者さんに届いている表示です。" : "承認前でも「患者画面で確認」から患者と同じ画面を確認できます。患者さんには公開されません。"}</p>
      <Editor data={data} />
    </main>
  );
}
