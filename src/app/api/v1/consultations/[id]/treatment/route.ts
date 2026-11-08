import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getTreatmentForClinician } from "@/server/services/treatment";

/** 医療者: 共有中の患者の治療の記録（読み取りだけ）。有効な診察セッションがなければ 403 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok(await getTreatmentForClinician(ctx));
});
