import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { submitForReview } from "@/server/services/authoring";

export const POST = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  return ok((await submitForReview(p, versionId)) ?? { done: true });
});
