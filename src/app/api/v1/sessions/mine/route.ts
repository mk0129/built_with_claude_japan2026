import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { listPatientSessions } from "@/server/services/consultation";

/** 患者: 自分の共有履歴 */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ sessions: await listPatientSessions(p.userId) });
});
