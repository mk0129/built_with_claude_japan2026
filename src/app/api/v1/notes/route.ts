import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { createVisitNote, listVisitNotes, NOTE_MAX } from "@/server/services/notes";

/** 患者: 診察ノート（次の診察で聞きたいこと） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ notes: await listVisitNotes(p.userId) });
});

/** 患者: 質問を保存。理解確認から作った候補は versionId / questionId を付ける（自由な質問には付けない） */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = await parseBody(req, z.object({ body: z.string().max(NOTE_MAX * 2), versionId: z.uuid().nullable().optional(), questionId: z.uuid().nullable().optional() }));
  return ok({ note: await createVisitNote(p.userId, body) });
});
