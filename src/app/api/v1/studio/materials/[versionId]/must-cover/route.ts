import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { updateMustCover } from "@/server/services/authoring";
import { MUST_COVER_STATUSES } from "@/server/db/schema";

const Body = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(300).optional(),
        status: z.enum(MUST_COVER_STATUSES).optional(),
        confirmed: z.boolean().optional(),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** GEN-05: 必須事項の分類（この教材で必須 / 別教材で扱う / 医療者による確認が必要）と医療者の確認を記録する */
export const PUT = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  const body = await parseBody(req, Body);
  return ok({ mustCover: await updateMustCover(p, versionId, body.updates) });
});
