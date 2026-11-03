import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { cancelConnectRequest } from "@/server/services/connect";

/** 医療者: 接続申請の取り消し */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  return ok(await cancelConnectRequest(id, p.userId));
});
