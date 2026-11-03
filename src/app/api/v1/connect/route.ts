import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { listMemberships, requireStaff } from "@/server/authz/principal";
import { forbidden } from "@/server/authz/errors";
import { createConnectRequest } from "@/server/services/connect";

const Body = z.object({ orgId: z.uuid().optional() });

/**
 * 医療者: 接続申請を発行し、患者に読み取ってもらう QR の URL を返す。
 * orgId 省略時は、診療（clinician）権限のある最初の所属先（Figma の画面に所属先の選択がないため）。
 */
export const POST = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const body = await parseBody(req, Body);
  const orgId = body.orgId ?? (await listMemberships(p.userId)).find((m) => m.roles.includes("clinician"))?.orgId;
  if (!orgId) throw forbidden("ROLE_REQUIRED");
  const r = await createConnectRequest({ clinicianId: p.userId, orgId });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return ok({ ...r, qrUrl: `${base}/home?view=share&connect=${encodeURIComponent(r.token)}` });
});
