import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { returnToDraft } from "@/server/services/authoring";

export const POST = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  const { comment } = await parseBody(req, z.object({ comment: z.string().max(1000) }));
  await returnToDraft(p, versionId, comment);
  return ok({ done: true });
});
