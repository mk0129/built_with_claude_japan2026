import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getNextVisit, setNextVisit } from "@/server/services/nextVisit";

/** 患者: 次回の診察日（自分で登録した日付。未登録は null） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ visit: await getNextVisit(p.userId) });
});

/** 患者: 次回の診察日の登録・変更（date = null で削除） */
export const PUT = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const { date } = await parseBody(req, z.object({ date: z.string().max(10).nullable() }));
  return ok({ visit: await setNextVisit(p.userId, date) });
});
