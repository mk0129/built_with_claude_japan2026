import { route, ok } from "@/server/http";
import { listMemberships, requirePrincipal } from "@/server/authz/principal";

export const GET = route(async (req: Request) => {
  const p = await requirePrincipal(req.headers);
  const memberships = p.kind === "staff" ? await listMemberships(p.userId) : [];
  return ok({ user: p, memberships });
});
