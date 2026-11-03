import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { previewConnectRequest } from "@/server/services/connect";

const Body = z.object({ token: z.string().min(16).max(128) });

/** 患者: 読み取った申請の申請者（医療者名・医療機関）と有効期限を確認する */
export const POST = route(async (req: Request) => {
  await requirePatient(req.headers);
  const { token } = await parseBody(req, Body);
  return ok(await previewConnectRequest(token));
});
