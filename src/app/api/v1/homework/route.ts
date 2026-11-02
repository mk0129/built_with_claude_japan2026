import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { listHomeworkForPatient } from "@/server/services/prescription";

/** 患者: 届いた宿題セット */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ sets: await listHomeworkForPatient(p.userId) });
});
