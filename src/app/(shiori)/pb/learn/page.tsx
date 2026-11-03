import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { listApprovedFiguresForVersion } from "@/server/services/figures";
import { PatientFrame } from "../PatientFrame";
import { PbLearn } from "./PbLearn";

/** 教材学習（Porcelain Blue）。MED-001 の実データ・承認済み図解のみ。fig=strip（既定）/ full */
export default async function PbLearnPage({ searchParams }: { searchParams: Promise<{ versionId?: string; fig?: string; slide?: string }> }) {
  await requirePageUser("staff");
  const sp = await searchParams;
  if (!sp.versionId) return <main className="p-6">versionId が必要です</main>;
  const c = await getVersionContent(sp.versionId);
  const figures = await listApprovedFiguresForVersion(sp.versionId);
  const slides = c.slides.map((s) => ({ seq: s.seq, title: s.title, proposition: s.proposition, bodyMd: s.bodyMd, detailMd: s.detailMd, voiceText: s.voiceText ?? s.bodyMd, figures: figures[s.seq] ?? [] }));
  return (
    <PatientFrame tabs={false}>
      <PbLearn title={c.title} slides={slides} initialSeq={Math.min(Math.max(Number(sp.slide ?? 1) || 1, 1), slides.length)} questionCount={c.questions.length} figMode={sp.fig === "full" ? "full" : "strip"} />
    </PatientFrame>
  );
}
