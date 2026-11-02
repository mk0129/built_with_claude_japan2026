import { requirePageUser } from "@/server/auth/session";
import { getLearningView } from "@/server/services/learning";
import { QuizClient } from "./QuizClient";

export default async function QuizPage({ params }: { params: Promise<{ versionId: string }> }) {
  const u = await requirePageUser("patient");
  const { versionId } = await params;
  const view = await getLearningView(u.id, versionId);
  return <QuizClient versionId={versionId} title={view.title} />;
}
