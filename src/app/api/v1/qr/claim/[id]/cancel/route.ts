import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { cancelClaimByStaff } from "@/server/services/qr";

/** 医療者: 自分の読み取り要求を、患者の承認前に取り消す */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  return ok(await cancelClaimByStaff(id, p.userId));
});
