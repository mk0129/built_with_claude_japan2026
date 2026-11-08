import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { setAnswerExplained } from "@/server/services/answerExplanations";

const Body = z.object({ attemptId: z.string().uuid(), questionId: z.string().uuid(), explained: z.boolean().optional() });

/** 医療者: 誤答・「わからない」に「説明した」の印を付ける／外す（有効セッション内のみ。採点には触れない） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const body = await parseBody(req, Body);
  return ok({ explained: await setAnswerExplained(ctx, body) });
});
