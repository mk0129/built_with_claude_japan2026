import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getConnectRequestForClinician } from "@/server/services/connect";

/** 医療者: 自分の接続申請の状態（承認後はセッション ID）。患者情報は含めない */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  return ok(await getConnectRequestForClinician(id, p.userId));
});
