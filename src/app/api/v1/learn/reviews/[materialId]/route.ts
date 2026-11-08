import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { unackReview } from "@/server/services/reviewAcks";

/** 患者: 「理解した」を取り消して一覧に戻す */
export const DELETE = route(async (req: Request, { params }: { params: Promise<{ materialId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { materialId } = await params;
  return ok({ acks: await unackReview(p.userId, materialId) });
});
