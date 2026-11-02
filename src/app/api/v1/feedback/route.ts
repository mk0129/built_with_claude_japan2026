import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { listFeedbackForPatient, submitFeedback } from "@/server/services/questions";

export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ feedback: await listFeedbackForPatient(p.userId) });
});

/** 患者: 学習後のふりかえり（選択式 + 任意の自由記述） */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = await parseBody(
    req,
    z.object({
      versionId: z.uuid(),
      selection: z.enum(["mostly_understood", "explain_again", "have_question", "stop_for_today"]),
      freeText: z.string().max(1000).nullable().optional(),
    }),
  );
  return ok(await submitFeedback(p.userId, body.versionId, body.selection, body.freeText ?? null));
});
