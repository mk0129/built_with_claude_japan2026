import { route, ok } from "@/server/http";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { createTemplateForClinician, listTemplates } from "@/server/services/materials";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  return ok({ templates: await listTemplates(ctx.orgId) });
});

/** 施設のセットを作る（有効な一時共有の中の医療者だけ。教材はこの施設から見える公開中のものに限る） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const ctx = await requireActiveConsultation(req.headers, id);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; description?: unknown; materialIds?: unknown };
  return ok(await createTemplateForClinician(ctx, body));
});
