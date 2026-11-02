import { route, ok } from "@/server/http";
import { requirePrincipal } from "@/server/authz/principal";
import { getConsultationForParty } from "@/server/services/consultation";

/** 当事者（患者本人・担当医療者）向けのセッション状態 */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requirePrincipal(req.headers);
  const { id } = await params;
  return ok(await getConsultationForParty(id, p.userId));
});
