import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getAttempt } from "@/server/services/learning";

export const GET = route(async (req: Request, { params }: { params: Promise<{ attemptId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { attemptId } = await params;
  return ok(await getAttempt(p.userId, attemptId));
});
