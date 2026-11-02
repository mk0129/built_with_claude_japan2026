import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { requestExtension } from "@/server/services/consultation";

/** 医療者: 延長要求（患者の再承認待ちになる） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok(await requestExtension(ctx));
});
