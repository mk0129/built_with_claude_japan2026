import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { denyGrant } from "@/server/services/qr";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  await denyGrant(id, p.userId);
  return ok({ denied: true });
});
