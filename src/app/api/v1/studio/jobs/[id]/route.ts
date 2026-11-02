import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getJob } from "@/server/services/ai-generation";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  const j = await getJob(p, id);
  return ok({ job: { id: j.id, mode: j.mode, status: j.status, progress: j.progress, attempt: j.attempt, errorMessage: j.errorMessage, model: j.model, outputPayload: j.outputPayload, outputVersionId: j.outputVersionId, inputPayload: j.inputPayload, createdAt: j.createdAt, finishedAt: j.finishedAt, inputTokenCount: j.inputTokenCount, outputTokenCount: j.outputTokenCount } });
});
