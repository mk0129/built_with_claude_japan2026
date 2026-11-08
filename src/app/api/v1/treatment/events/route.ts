import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { addTreatmentEvent } from "@/server/services/treatment";

/** 患者: 外来の日の出来事（点滴をした・外来のみ など）を 1 件追加 */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return ok(await addTreatmentEvent(p.userId, body));
});
