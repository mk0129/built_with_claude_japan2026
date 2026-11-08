import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { ackReview, listReviewAcks } from "@/server/services/reviewAcks";

/** 患者: 「理解した」と記録した教材の一覧（本人のものだけ） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ acks: await listReviewAcks(p.userId) });
});

/** 患者: ある教材の「もう一度確認したいこと」を「理解した」として一覧から外す */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = (await req.json().catch(() => ({}))) as { materialId?: unknown; completedAt?: unknown };
  return ok({ acks: await ackReview(p.userId, body) });
});
