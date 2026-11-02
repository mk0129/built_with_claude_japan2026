import { and, desc, eq, lt, notExists, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { homeworkSnapshots, learningProgress, prescriptionSets, type SnapshotItem } from "@/server/db/schema";
import { computeHomeworkScore } from "./scoring";

export type ConsultationStartedEvent = {
  sessionId: string;
  patientId: string;
  orgId: string;
  startedAt: Date;
};

/**
 * 診察セッション開始時のフック（SNAP-01〜04, D18, D29）。
 * - 対象: **処方元病院（event.orgId）** の、この診察より前に作られた直近の未確定宿題セット
 * - 他院の診察開始では他院の宿題を確定しない
 * - 1 診察 1 回、1 セット 1 回（DB 一意制約 + onConflictDoNothing で冪等）
 * - 承認トランザクションの中で呼ばれる
 */
export async function onConsultationStarted(event: ConsultationStartedEvent, db: Db): Promise<{ snapshotId: string | null }> {
  const [set] = await db
    .select({ id: prescriptionSets.id })
    .from(prescriptionSets)
    .where(
      and(
        eq(prescriptionSets.patientId, event.patientId),
        eq(prescriptionSets.orgId, event.orgId),
        lt(prescriptionSets.createdAt, event.startedAt),
        notExists(db.select({ one: sql`1` }).from(homeworkSnapshots).where(eq(homeworkSnapshots.prescriptionSetId, prescriptionSets.id))),
      ),
    )
    .orderBy(desc(prescriptionSets.createdAt))
    .limit(1);
  if (!set) return { snapshotId: null };

  const hw = await computeHomeworkScore(set.id, event.patientId, db);
  const progress = await db.select().from(learningProgress).where(eq(learningProgress.patientId, event.patientId));
  const items: SnapshotItem[] = hw.materials.map((m) => {
    const p = progress.find((x) => x.materialVersionId === (m.attemptVersionId ?? m.currentVersionId));
    return {
      materialId: m.materialId,
      materialVersionId: m.attemptVersionId ?? m.currentVersionId ?? "",
      title: m.title,
      phase: m.attemptId ? "completed" : (p?.phase ?? "not_started"),
      scorePct: m.scorePct,
      latestCompletedAttemptId: m.attemptId,
      nCorrect: m.nCorrect,
      nWrong: m.nWrong,
      nUnknown: m.nUnknown,
    };
  });
  const inserted = await db
    .insert(homeworkSnapshots)
    .values({
      prescriptionSetId: set.id,
      consultationSessionId: event.sessionId,
      capturedAt: event.startedAt,
      homeworkScore: hw.score === null ? null : String(hw.score),
      completedCount: hw.completedCount,
      assignedCount: hw.assignedCount,
      itemDetails: items,
    })
    .onConflictDoNothing()
    .returning({ id: homeworkSnapshots.id });
  return { snapshotId: inserted[0]?.id ?? null };
}
