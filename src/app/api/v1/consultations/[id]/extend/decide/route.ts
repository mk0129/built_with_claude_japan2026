import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { decideExtension } from "@/server/services/consultation";

/** 患者: 延長の承認 / 拒否 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  const { approve } = await parseBody(req, z.object({ approve: z.boolean() }));
  return ok(await decideExtension(id, p.userId, approve));
});
