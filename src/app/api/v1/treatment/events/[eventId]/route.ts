import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { deleteTreatmentEvent } from "@/server/services/treatment";

/** 患者: 自分の出来事を 1 件削除（他人のものは 404） */
export const DELETE = route(async (req: Request, { params }: { params: Promise<{ eventId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { eventId } = await params;
  return ok(await deleteTreatmentEvent(p.userId, eventId));
});
