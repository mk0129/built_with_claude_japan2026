import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { approveAndPublish } from "@/server/services/authoring";

/** 承認して公開。安全上の重要事項が未確認のときは acknowledgeSafety と理由が必要（GEN-05） */
export const POST = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  const body = await parseBody(req, z.object({ acknowledgeSafety: z.boolean().optional(), note: z.string().max(500).nullable().optional() }).default({}));
  return ok((await approveAndPublish(p, versionId, body)) ?? { done: true });
});
