import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getGrantForStaff } from "@/server/services/qr";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  return ok(await getGrantForStaff(id, p.userId));
});
