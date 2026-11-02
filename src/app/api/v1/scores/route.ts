import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { computeHomeworkScore, computeScoreSummary } from "@/server/services/scoring";
import { listHomeworkForPatient } from "@/server/services/prescription";

/** 患者: 全体 / 宿題 / 領域別スコア（P-07） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const summary = await computeScoreSummary(p.userId);
  const sets = await listHomeworkForPatient(p.userId);
  const homework = [];
  for (const s of sets) {
    const hs = await computeHomeworkScore(s.setId, p.userId);
    homework.push({ setId: s.setId, orgName: s.orgName, createdAt: s.createdAt, score: hs.score, completedCount: hs.completedCount, assignedCount: hs.assignedCount });
  }
  return ok({ ...summary, homework });
});
