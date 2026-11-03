import { requirePageUser } from "@/server/auth/session";
import { getVersionContent } from "@/server/services/materials";
import { QuizResultVariant, type ResultVariant } from "./QuizResultVariant";

/**
 * クイズ結果画面の比較（現行 / 改善案）。医療者のみ。
 * 実際の MED-001 の設問を使い、回答は架空（1 問正解・1 問誤答・1 問「わからない」）。採点・履歴・スナップショットのロジックには触れない。
 */
export default async function DesignQuizResultPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ variant?: string; screen?: string }> }) {
  await requirePageUser("staff");
  const { versionId } = await params;
  const sp = await searchParams;
  const variant = (sp.variant === "proposed" ? "proposed" : "current") as ResultVariant;
  const screen = sp.screen === "question" ? "question" : "result";
  const c = await getVersionContent(versionId);
  const pattern: ("correct" | "wrong" | "unknown")[] = ["correct", "wrong", "unknown"];
  const questions = c.questions.map((q, i) => {
    const kind = pattern[i % pattern.length];
    const opts = q.options as string[];
    const wrongIdx = (q.correctIndex + 1) % opts.length;
    return {
      questionId: q.id,
      seq: q.seq,
      stem: q.stem,
      options: opts,
      relatedSlideSeq: q.relatedSlideSeq ?? null,
      answer: { selectedIndex: kind === "correct" ? q.correctIndex : kind === "wrong" ? wrongIdx : null, isUnknown: kind === "unknown", isCorrect: kind === "correct", correctIndex: q.correctIndex, explanation: q.explanation },
    };
  });
  return <QuizResultVariant variant={variant} screen={screen} title={c.title} versionId={versionId} questions={questions} />;
}
