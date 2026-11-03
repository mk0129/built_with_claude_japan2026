import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getSymptomSettings, listHealthRecords } from "@/server/services/health";
import { audit } from "@/server/services/audit";

/**
 * 医療者: 共有中の患者の体調記録（Step 4 の在宅経過表・外来間要約で使う取得 API）。有効な診察セッションがなければ 403。
 * 記録をそのまま返し、CTCAE Grade の判定や診断・治療変更の提案はしない。
 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const records = await listHealthRecords(ctx.patientId, { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  const settings = await getSymptomSettings(ctx.patientId);
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.health.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" });
  return ok({ records, symptoms: settings });
});
