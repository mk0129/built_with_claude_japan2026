import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getPatientLibrary } from "@/server/services/library";
import { objectivesByVersion } from "@/server/services/learning-record";

/**
 * 患者: 教材一覧（処方された教材＋公開中の教材）と、学習状態・処方元。
 * Figma Concept D の「ホーム」「今回の情報処方」「教材を探す」「学習記録」で使う（Phase 2 Step 2）。
 */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const { items, latestSetId } = await getPatientLibrary(p.userId);
  const objectives = await objectivesByVersion(items.map((i) => i.versionId));
  return ok({ latestSetId, items: items.map((i) => ({ ...i, objective: objectives.get(i.versionId)?.[0] ?? null })) });
});
