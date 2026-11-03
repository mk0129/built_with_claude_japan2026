import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { buildIntervisit } from "@/server/services/intervisit";
import { ruleSummary, sourceIndex } from "@/server/services/intervisit-rules";
import { audit } from "@/server/services/audit";

/**
 * 医療者: 外来間の構造化データ（体調・学習・理解確認・質問）と、ルールベースの要約。
 * 有効な診察セッションがなければ 403。期間は from / to（YYYY-MM-DD、日本時間）。省略時は直近 14 日。
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const url = new URL(req.url);
  const iv = await buildIntervisit({ patientId: ctx.patientId, sessionId: ctx.sessionId, from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.intervisit.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" });
  return ok({ intervisit: iv, ruleSummary: ruleSummary(iv), sources: Object.fromEntries(sourceIndex(iv)) });
});
