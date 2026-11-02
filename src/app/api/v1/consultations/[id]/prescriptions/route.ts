import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { getSetForSession, prescribe } from "@/server/services/prescription";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok({ set: await getSetForSession(ctx) });
});

/** 医療者: 処方の確定。同一診察は 1 宿題セットに統合 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const { materialIds } = await parseBody(req, z.object({ materialIds: z.array(z.uuid()).min(1).max(30) }));
  return ok({ set: await prescribe(ctx, materialIds) });
});
