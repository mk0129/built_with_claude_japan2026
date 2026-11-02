import { route, ok } from "@/server/http";
import { requirePrincipal } from "@/server/authz/principal";
import { endConsultation } from "@/server/services/consultation";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requirePrincipal(req.headers);
  const { id } = await params;
  return ok(await endConsultation(id, p.userId));
});
