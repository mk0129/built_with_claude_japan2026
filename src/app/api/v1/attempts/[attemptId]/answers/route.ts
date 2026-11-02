import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { answerQuestion } from "@/server/services/learning";

/** 患者: 1 問の回答確定（selectedIndex null = わからない） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ attemptId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { attemptId } = await params;
  const body = await parseBody(req, z.object({ questionId: z.uuid(), selectedIndex: z.number().int().min(0).max(2).nullable() }));
  return ok(await answerQuestion(p.userId, attemptId, body.questionId, body.selectedIndex));
});
