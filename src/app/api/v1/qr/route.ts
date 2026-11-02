import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { createGrant, getLatestGrantForPatient } from "@/server/services/qr";

/** 患者: QR 発行 */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const g = await createGrant(p.userId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ok({ ...g, qrUrl: `${base}/c?t=${g.token}` });
});

/** 患者: 最新のグラント状態 */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ grant: await getLatestGrantForPatient(p.userId) });
});
