import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { startOrResumeAttempt } from "@/server/services/learning";

/** 患者: クイズ挑戦の開始 / 再開 / 再挑戦 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { versionId } = await params;
  const { forceNew } = await parseBody(req, z.object({ forceNew: z.boolean().default(false) }));
  return ok(await startOrResumeAttempt(p.userId, versionId, forceNew));
});
