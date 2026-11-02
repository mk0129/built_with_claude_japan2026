import { z } from "zod";
import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { badRequest } from "@/server/authz/errors";
import { listSources, requireStudioMembership, uploadSource } from "@/server/services/sources";

export const GET = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const m = await requireStudioMembership(p, new URL(req.url).searchParams.get("orgId"));
  return ok({ orgId: m.orgId, sources: await listSources(p, m.orgId) });
});

const Perm = z.object({
  allowStore: z.boolean(),
  allowAi: z.boolean(),
  allowDerive: z.boolean(),
  allowPublish: z.boolean(),
  allowShare: z.boolean(),
  rightsHolder: z.string().max(200),
  evidenceNote: z.string().max(1000),
  restrictions: z.string().max(1000).nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

/** 原資料のアップロード（multipart/form-data: file, meta=JSON） */
export const POST = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest("MULTIPART_REQUIRED");
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("FILE_REQUIRED");
  const meta = z
    .object({ orgId: z.string().uuid().nullable().optional(), title: z.string().max(200), piiAttestedNone: z.boolean(), permissions: Perm })
    .safeParse(JSON.parse(String(form.get("meta") ?? "{}")));
  if (!meta.success) throw badRequest("VALIDATION_ERROR", z.prettifyError(meta.error));
  const body = Buffer.from(await file.arrayBuffer());
  return ok(await uploadSource(p, { ...meta.data, filename: file.name, mime: file.type, body }));
});
