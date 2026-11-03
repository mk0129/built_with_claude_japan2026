import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { listMemberships, requireStaff } from "@/server/authz/principal";
import { badRequest, forbidden } from "@/server/authz/errors";
import { createConnectRequest } from "@/server/services/connect";

const Body = z.object({ orgId: z.uuid().optional() });

/**
 * 医療者: 接続申請を発行し、患者に読み取ってもらう QR の URL を返す。
 * 申請を出す医療機関は医療者が選ぶ（orgId）。診療（clinician）権限のある所属先が 1 つだけなら省略できる。
 * 選ばれた医療機関に実際の診療権限があることは createConnectRequest がサーバー側で検証する。
 */
export const POST = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const body = await parseBody(req, Body);
  let orgId = body.orgId;
  if (!orgId) {
    const clinicianOrgs = (await listMemberships(p.userId)).filter((m) => m.roles.includes("clinician"));
    if (clinicianOrgs.length === 0) throw forbidden("ROLE_REQUIRED");
    if (clinicianOrgs.length > 1) throw badRequest("ORG_REQUIRED", "申請を出す医療機関を選んでください");
    orgId = clinicianOrgs[0].orgId;
  }
  const r = await createConnectRequest({ clinicianId: p.userId, orgId });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return ok({ ...r, qrUrl: `${base}/home?view=share&connect=${encodeURIComponent(r.token)}` });
});
