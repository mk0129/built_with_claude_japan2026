import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { deleteHealthRecord, updateHealthRecord } from "@/server/services/health";
import { HealthBody } from "../../schema";

type Ctx = { params: Promise<{ id: string }> };

/** 患者: 自分の記録の編集（他の患者の記録は 404） */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  return ok({ record: await updateHealthRecord(p.userId, id, await parseBody(req, HealthBody)) });
});

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const p = await requirePatient(req.headers);
  const { id } = await params;
  return ok(await deleteHealthRecord(p.userId, id));
});
