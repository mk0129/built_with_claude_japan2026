import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { deleteVisitNote, updateVisitNote, NOTE_MAX } from "@/server/services/notes";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  const patch = await parseBody(req, z.object({ body: z.string().max(NOTE_MAX * 2).optional(), resolved: z.boolean().optional() }));
  return ok({ note: await updateVisitNote(p.userId, id, patch) });
});

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  return ok(await deleteVisitNote(p.userId, id));
});
