import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getRecommendations } from "@/server/services/recommendations";
import { audit } from "@/server/services/audit";

/**
 * 医療者: 情報処方のリコメンド（ルールベース → Claude が使えるときは候補の絞り込みと理由の言い換え）。
 * 有効な診察セッションがなければ 403。採用は医療者が判断する。
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const url = new URL(req.url);
  const result = await getRecommendations(ctx, { regenerate: url.searchParams.get("regenerate") === "1" });
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.recommendations.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" });
  return ok(result);
});
