import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requirePatient } from "@/server/authz/principal";
import { saveProgress } from "@/server/services/learning";

export const POST = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requirePatient(req.headers);
  const { versionId } = await params;
  const body = await parseBody(req, z.object({ lastSlideSeq: z.number().int().min(0).max(50), phase: z.enum(["reading", "quiz", "completed"]).default("reading") }));
  await saveProgress(p.userId, versionId, body.lastSlideSeq, body.phase);
  return ok({ saved: true });
});
