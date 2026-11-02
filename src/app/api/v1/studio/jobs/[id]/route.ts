import { route, ok } from "@/server/http";
import { requireStaff } from "@/server/authz/principal";
import { getJob, nudgeJob } from "@/server/services/ai-generation";

export const maxDuration = 300;

/** ジョブの状態（ポーリング用）。取り残されたジョブはここで実行を予約し直す */
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await requireStaff(req.headers);
  const { id } = await params;
  const j = await getJob(p, id);
  await nudgeJob(j);
  return ok({
    job: {
      id: j.id,
      mode: j.mode,
      status: j.status,
      progress: j.progress,
      attempt: j.attempt,
      maxAttempts: j.maxAttempts,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      generator: j.generator,
      model: j.model,
      outputPayload: j.outputPayload,
      outputVersionId: j.outputVersionId,
      inputPayload: j.inputPayload,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      durationMs: j.durationMs,
      inputTokenCount: j.inputTokenCount,
      outputTokenCount: j.outputTokenCount,
      cacheReadTokenCount: j.cacheReadTokenCount,
      requestId: j.requestId,
      fallbackUsed: j.fallbackUsed,
    },
  });
});
