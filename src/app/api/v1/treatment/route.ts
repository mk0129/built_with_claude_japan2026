import { route, ok } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getTreatment, setTreatmentProfile } from "@/server/services/treatment";

/** 患者: 治療の記録（がん種・現在の治療・外来の日ごとの出来事）。本人のものだけ */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok(await getTreatment(p.userId));
});

/** 患者: がん種・現在の治療の登録・変更 */
export const PUT = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return ok(await setTreatmentProfile(p.userId, body));
});
