import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { createHealthRecord, listHealthRecords } from "@/server/services/health";
import { HealthBody } from "../schema";

/** 患者: 自分の体調記録（新しい順。from / to で期間を指定できる） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return ok({ records: await listHealthRecords(p.userId, { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }) });
});

/** 患者: 新しい体調記録（同じ日でも別の記録。前回の値は引き継がない） */
export const POST = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = await parseBody(req, HealthBody);
  return ok({ record: await createHealthRecord(p.userId, body) });
});
