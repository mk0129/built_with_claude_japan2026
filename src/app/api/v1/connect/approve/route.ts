import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { approveConnectRequest } from "@/server/services/connect";

const Body = z.object({ token: z.string().min(16).max(128) });

/** 患者: 申請を明示承認し、60 分の一時共有を開始する */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const { token } = await parseBody(req, Body);
  return ok(await approveConnectRequest(token, p.userId));
});
