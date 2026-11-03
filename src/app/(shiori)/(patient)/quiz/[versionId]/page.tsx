import { requirePageUser } from "@/server/auth/session";
import { getLearningView } from "@/server/services/learning";
import { QuizClient } from "./QuizClient";

export default async function QuizPage({ params }: { params: Promise<{ versionId: string }> }) {
  const u = await requirePageUser("patient");
  const { versionId } = await params;
  const view = await getLearningView(u.id, versionId);
  // 質問候補の文章に関連画面のタイトルを使う（設問文をそのまま質問にしない）
  return <QuizClient versionId={versionId} title={view.title} slides={view.slides.map((s) => ({ seq: s.seq, title: s.title }))} />;
}
