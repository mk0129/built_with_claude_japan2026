import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { retryJob } from "@/server/services/ai-generation";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  return ok(await retryJob(p, id));
});
