import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { listStudioMaterials } from "@/server/services/authoring";
import { requireStudioMembership } from "@/server/services/sources";

export const GET = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const m = await requireStudioMembership(p, new URL(req.url).searchParams.get("orgId"));
  return ok({ materials: await listStudioMaterials(p, m.orgId) });
});
