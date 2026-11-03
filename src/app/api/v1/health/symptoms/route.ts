import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { getSymptomSettings, saveSymptomSettings } from "@/server/services/health";

/** 患者: 日々の入力に表示する症状（並び順・非表示・独自の症状名） */
export const GET = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  return ok({ settings: await getSymptomSettings(p.userId) });
});

export const PUT = route(async (req: Request) => {
  const p = await requirePatient(req.headers);
  const body = await parseBody(req, z.object({ active: z.array(z.string().min(1).max(80)).max(60), customNames: z.record(z.string(), z.string().max(40)).default({}) }));
  return ok({ settings: await saveSymptomSettings(p.userId, body) });
});
