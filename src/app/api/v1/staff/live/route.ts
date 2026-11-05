import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getLiveStateForStaff } from "@/server/services/qr";

/** 医療者: 同じアカウントの別の端末で読み取り要求した承認待ち・有効な診察セッションの ID（患者情報は含めない） */
export const GET = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  return ok(await getLiveStateForStaff(p.userId));
});
