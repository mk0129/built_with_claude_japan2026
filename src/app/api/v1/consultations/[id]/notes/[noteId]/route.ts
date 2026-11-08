import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { resolveVisitNoteForClinician } from "@/server/services/notes";

const Body = z.object({ resolved: z.boolean() });

/**
 * 医療者: 患者の「聞きたいこと」を診察で答えたとき、その場で「解決」にする（戻すこともできる）。
 * 有効な診察セッション（患者の承認・60 分・未終了）の間だけ、その患者の質問に対してだけ使える。原文は変更しない。
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) => {
  const { id, noteId } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const body = await parseBody(req, Body);
  return ok({ note: await resolveVisitNoteForClinician(ctx, noteId, body.resolved) });
});
