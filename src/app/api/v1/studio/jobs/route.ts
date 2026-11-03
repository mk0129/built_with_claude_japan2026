import { z } from "zod";
import { route, ok, parseBody } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { MustCoverInput, createJob, listJobs } from "@/server/services/ai-generation";
import { requireStudioMembership } from "@/server/services/sources";

export const GET = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const m = await requireStudioMembership(p, new URL(req.url).searchParams.get("orgId"));
  return ok({ jobs: await listJobs(p, m.orgId) });
});

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("outline"), sourceIds: z.array(z.uuid()).min(1).max(5) }),
  z.object({ mode: z.literal("generate"), sourceIds: z.array(z.uuid()).min(1).max(5), fromJobId: z.uuid(), outlineIndex: z.number().int().min(0).max(5), mustCover: z.array(MustCoverInput).max(20).optional() }),
  z.object({ mode: z.literal("freeform"), sourceIds: z.array(z.uuid()).min(1).max(5), theme: z.string().min(1).max(200), audience: z.string().max(200).optional(), objectives: z.array(z.string().max(200)).max(3), mustCover: z.array(MustCoverInput).max(20).optional() }),
]);

/** 生成ジョブの登録（B: outline → generate、C: freeform）。送信前に許諾をサーバーで確認 */
export const maxDuration = 300;

export const POST = route(async (req: Request) => {
  const p = await requireStaff(req.headers);
  const url = new URL(req.url);
  const body = await parseBody(req, Body);
  return ok(await createJob(p, url.searchParams.get("orgId"), body, req.headers.get("idempotency-key") ?? undefined));
});
