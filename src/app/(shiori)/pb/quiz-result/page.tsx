import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { PatientFrame } from "../PatientFrame";
import { PbQuizResult } from "./PbQuizResult";

/** クイズ結果（Porcelain Blue・2 段階の質問）。MED-001 の実設問に架空の回答（正解 1・誤答 1・わからない 1） */
export default async function PbQuizResultPage({ searchParams }: { searchParams: Promise<{ versionId?: string }> }) {
  await requirePageUser("staff");
  const { versionId } = await searchParams;
  if (!versionId) return <main className="p-6">versionId が必要です</main>;
  const c = await getVersionContent(versionId);
  const pattern = ["correct", "wrong", "unknown"] as const;
  const slideTitle = (seq: number | null) => c.slides.find((s) => s.seq === seq)?.title ?? c.title;
  const questions = c.questions.map((q, i) => {
    const kind = pattern[i % 3];
    const opts = q.options as string[];
    return {
      id: q.id,
      stem: q.stem,
      options: opts,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      relatedSlideSeq: q.relatedSlideSeq ?? null,
      slideTitle: slideTitle(q.relatedSlideSeq ?? null),
      selectedIndex: kind === "correct" ? q.correctIndex : kind === "wrong" ? (q.correctIndex + 1) % opts.length : null,
      isUnknown: kind === "unknown",
      isCorrect: kind === "correct",
    };
  });
  return (
    <PatientFrame tabs={false}>
      <PbQuizResult title={c.title} questions={questions} />
    </PatientFrame>
  );
}
