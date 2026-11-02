import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { reviewFigure } from "@/server/services/figures";

/** 承認者のみ: 図解の監修状態を変更 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ assetId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { assetId } = await params;
  const body = await parseBody(req, z.object({ status: z.enum(["approved", "rejected", "pending_review"]), note: z.string().max(500).nullable().optional() }));
  return ok(await reviewFigure(p, assetId, body.status, body.note ?? null));
});
