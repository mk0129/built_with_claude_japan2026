import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getPatientSummary } from "@/server/services/consultation";

/** 医療者: 患者サマリ。有効な診察セッションがなければ 403 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok(await getPatientSummary(ctx));
});
