import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { deleteTemplateForClinician } from "@/server/services/materials";

/** 自施設のセットを削除（有効な一時共有の中の医療者だけ。共通・他施設のセットは 404） */
export const DELETE = route(async (req: Request, { params }: { params: Promise<{ id: string; templateId: string }> }) => {
  const { id, templateId } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok(await deleteTemplateForClinician(ctx, templateId));
});
