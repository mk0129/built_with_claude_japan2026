import { requirePageUser } from "@/server/auth/session";
import { getLearningView } from "@/server/services/learning";
import { LearnClient } from "./LearnClient";

export default async function LearnPage({ params, searchParams }: { params: Promise<{ versionId: string }>; searchParams: Promise<{ slide?: string }> }) {
  const u = await requirePageUser("patient");
  const { versionId } = await params;
  const { slide } = await searchParams;
  const view = await getLearningView(u.id, versionId);
  const initial = slide ? Number(slide) : view.progress.lastSlideSeq || 1;
  return <LearnClient view={view} initialSeq={Math.min(Math.max(initial, 1), view.slides.length)} />;
}
