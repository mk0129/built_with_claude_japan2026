import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { listVisibleMaterials } from "@/server/services/materials";

/** 医療者: 処方候補の教材（共通 + 自組織）。キーワード・領域で絞り込み */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const url = new URL(req.url);
  const items = await listVisibleMaterials({ orgId: ctx.orgId, q: url.searchParams.get("q") ?? undefined, domain: url.searchParams.get("domain") ?? undefined });
  return ok({ items });
});
