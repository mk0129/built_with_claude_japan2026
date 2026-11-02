import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { claimGrant } from "@/server/services/qr";

const Body = z.object({
  orgId: z.uuid(),
  token: z.string().min(16).max(128).optional(),
  code: z.string().regex(/^\d{6}$/).optional(),
});

/** 医療者: QR トークン or 6桁コードで読み取り要求 */
export const POST = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const body = await parseBody(req, Body);
  return ok(await claimGrant({ ...body, staffUserId: p.userId }));
});
