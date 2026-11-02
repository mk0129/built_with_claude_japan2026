import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { updateQuestionStatus } from "@/server/services/questions";

const Body = z.object({
  status: z.enum(["unread", "reviewed", "resolved"]),
  responseType: z.enum(["verbal_explanation", "additional_prescription", "referral", "other"]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** 医療者: 質問ステータスと対応種別の記録（有効セッション内のみ） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string; feedbackId: string }> }) => {
  const { id, feedbackId } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const body = await parseBody(req, Body);
  return ok(await updateQuestionStatus(ctx, feedbackId, body.status, body.responseType ?? null, body.note ?? null));
});
