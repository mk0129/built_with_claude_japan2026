import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getDraftForEditor, updateDraft } from "@/server/services/authoring";
import { DOMAIN_TAGS } from "@/server/db/schema";

export const GET = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  return ok(await getDraftForEditor(p, versionId));
});

const Ref = z.object({ sourceId: z.string(), section: z.string().optional(), quote: z.string().optional() });
const Body = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(400),
  primaryDomain: z.enum(DOMAIN_TAGS),
  learningObjectives: z.array(z.string().max(200)).max(5),
  slides: z.array(z.object({ title: z.string().min(1).max(80), proposition: z.string().max(200), body: z.string().min(1).max(2000), detail: z.string().max(2000), sourceRefs: z.array(Ref) })),
  questions: z.array(
    z.object({
      stem: z.string().min(1).max(300),
      options: z.tuple([z.string().max(150), z.string().max(150), z.string().max(150)]),
      correctIndex: z.number().int().min(0).max(2),
      explanation: z.string().min(1).max(1000),
      relatedSlide: z.number().int().min(1).max(5),
      sourceRefs: z.array(Ref),
    }),
  ),
});

export const PUT = route(async (req: Request, { params }: { params: Promise<{ versionId: string }> }) => {
  const p = await requireStaff(req.headers);
  const { versionId } = await params;
  await updateDraft(p, versionId, await parseBody(req, Body));
  return ok({ saved: true });
});
