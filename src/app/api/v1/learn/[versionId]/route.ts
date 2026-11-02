import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getLearningView } from "@/server/services/learning";

export const GET = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { versionId } = await params;
  return ok(await getLearningView(p.userId, versionId));
});
