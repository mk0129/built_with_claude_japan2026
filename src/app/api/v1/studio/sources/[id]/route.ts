import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getSourceDetail, updatePermissions } from "@/server/services/sources";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  const d = await getSourceDetail(p, id);
  return ok({ source: { ...d.source, storageKey: undefined }, permission: d.permission, aiCheck: d.aiCheck });
});

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  const body = await parseBody(
    req,
    z.object({
      allowStore: z.boolean(),
      allowAi: z.boolean(),
      allowDerive: z.boolean(),
      allowPublish: z.boolean(),
      allowShare: z.boolean(),
      rightsHolder: z.string().max(200),
      evidenceNote: z.string().max(1000),
      restrictions: z.string().max(1000).nullable().optional(),
      expiresAt: z.string().nullable().optional(),
      piiAttestedNone: z.boolean().optional(),
    }),
  );
  await updatePermissions(p, id, body);
  return ok({ updated: true });
});
