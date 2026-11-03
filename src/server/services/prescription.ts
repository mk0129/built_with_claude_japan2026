import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import {
  homeworkSnapshots,
  learningProgress,
  materialSlides,
  materialVersions,
  materials,
  quizQuestions,
  notifications,
  organizationMembers,
  organizations,
  prescriptionItems,
  prescriptionSets,
} from "@/server/db/schema";
import type { ConsultationContext } from "@/server/authz/consultation";
import { badRequest } from "@/server/authz/errors";
import { audit } from "./audit";
import { resolvePrescribableVersions } from "./materials";
import { computeMaterialScores } from "./scoring";

/**
 * 情報処方の確定。
 * - 同一診察セッションの処方は 1 つの宿題セット（unique(consultation_session_id)）
 * - 同一セット内の同一教材は 1 件に統合（unique(set_id, material_id)）
 * - 再処方しても learning_progress / quiz_attempts は版単位なので進捗・スコアが引き継がれる（RX-07）
 */
export async function prescribe(ctx: ConsultationContext, materialIds: string[], db: Db = getDb(), note: string | null = null) {
  const unique = [...new Set(materialIds)];
  if (unique.length === 0) throw badRequest("NO_MATERIALS");
  const resolved = await resolvePrescribableVersions(ctx.orgId, unique, db);

  const setId = await db.transaction(async (tx) => {
    await tx
      .insert(prescriptionSets)
      .values({ consultationSessionId: ctx.sessionId, patientId: ctx.patientId, orgId: ctx.orgId })
      .onConflictDoNothing({ target: prescriptionSets.consultationSessionId });
    const [set] = await tx.select({ id: prescriptionSets.id }).from(prescriptionSets).where(eq(prescriptionSets.consultationSessionId, ctx.sessionId)).limit(1);
    await tx
      .insert(prescriptionItems)
      .values(resolved.map((r) => ({ setId: set.id, materialId: r.materialId, materialVersionId: r.versionId, prescribedByUserId: ctx.clinician.userId, note: note?.trim() || null })))
      .onConflictDoNothing({ target: [prescriptionItems.setId, prescriptionItems.materialId] });
    await tx
      .insert(notifications)
      .values({ patientId: ctx.patientId, kind: "prescription", prescriptionSetId: set.id, channel: "in_app", status: "sent", dedupeKey: `rx:${set.id}`, sentAt: new Date() })
      .onConflictDoNothing({ target: notifications.dedupeKey });
    await audit(
      { actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "prescription.confirm", resourceType: "prescription_set", resourceId: set.id, consultationSessionId: ctx.sessionId, outcome: "ok" },
      tx as unknown as Db,
    );
    return set.id;
  });
  return getSetForSession(ctx, db).then((s) => ({ ...s!, setId }));
}

export async function getSetForSession(ctx: ConsultationContext, db: Db = getDb()) {
  const [set] = await db.select().from(prescriptionSets).where(eq(prescriptionSets.consultationSessionId, ctx.sessionId)).limit(1);
  if (!set) return null;
  const items = await db
    .select({
      id: prescriptionItems.id,
      materialId: prescriptionItems.materialId,
      versionId: prescriptionItems.materialVersionId,
      title: materials.title,
      primaryDomain: materials.primaryDomain,
      prescribedAt: prescriptionItems.prescribedAt,
    })
    .from(prescriptionItems)
    .innerJoin(materials, eq(materials.id, prescriptionItems.materialId))
    .where(eq(prescriptionItems.setId, set.id))
    .orderBy(prescriptionItems.prescribedAt);
  return { setId: set.id, createdAt: set.createdAt, items };
}

export type HomeworkItem = {
  itemId: string;
  materialId: string;
  versionId: string;
  title: string;
  primaryDomain: string;
  summary: string | null;
  slideCount: number;
  questionCount: number;
  phase: "not_started" | "reading" | "quiz" | "completed";
  lastSlideSeq: number;
  scorePct: number | null;
  isOldVersion: boolean;
  oldVersionScorePct: number | null;
  /** 医療者から患者へのメッセージ（任意） */
  note: string | null;
};

export type HomeworkSet = {
  setId: string;
  orgName: string;
  clinicianName: string;
  createdAt: Date;
  snapshotTakenAt: Date | null;
  items: HomeworkItem[];
};

/** 患者ホーム用: 宿題セット（新しい順）と各教材の進捗・スコア */
export async function listHomeworkForPatient(patientId: string, db: Db = getDb()): Promise<HomeworkSet[]> {
  const sets = await db
    .select({
      setId: prescriptionSets.id,
      orgId: prescriptionSets.orgId,
      orgName: organizations.name,
      createdAt: prescriptionSets.createdAt,
      sessionId: prescriptionSets.consultationSessionId,
    })
    .from(prescriptionSets)
    .innerJoin(organizations, eq(organizations.id, prescriptionSets.orgId))
    .where(eq(prescriptionSets.patientId, patientId))
    .orderBy(desc(prescriptionSets.createdAt));
  if (sets.length === 0) return [];
  const setIds = sets.map((s) => s.setId);
  const items = await db
    .select({
      itemId: prescriptionItems.id,
      setId: prescriptionItems.setId,
      materialId: prescriptionItems.materialId,
      versionId: prescriptionItems.materialVersionId,
      title: materials.title,
      primaryDomain: materials.primaryDomain,
      summary: materialVersions.summary,
      slideCount: sql<number>`(select count(*) from ${materialSlides} where ${materialSlides.materialVersionId} = ${materialVersions.id})`,
      questionCount: sql<number>`(select count(*) from ${quizQuestions} where ${quizQuestions.materialVersionId} = ${materialVersions.id})`,
      prescribedBy: prescriptionItems.prescribedByUserId,
      prescribedAt: prescriptionItems.prescribedAt,
      note: prescriptionItems.note,
    })
    .from(prescriptionItems)
    .innerJoin(materials, eq(materials.id, prescriptionItems.materialId))
    .innerJoin(materialVersions, eq(materialVersions.id, prescriptionItems.materialVersionId))
    .where(inArray(prescriptionItems.setId, setIds))
    .orderBy(prescriptionItems.prescribedAt);
  const versionIds = [...new Set(items.map((i) => i.versionId))];
  const progress = versionIds.length
    ? await db.select().from(learningProgress).where(and(eq(learningProgress.patientId, patientId), inArray(learningProgress.materialVersionId, versionIds)))
    : [];
  const progressByVersion = new Map(progress.map((p) => [p.materialVersionId, p]));
  const scores = await computeMaterialScores(patientId, [...new Set(items.map((i) => i.materialId))], db);
  const scoreByMaterial = new Map(scores.map((s) => [s.materialId, s]));
  const snaps = await db.select({ setId: homeworkSnapshots.prescriptionSetId, capturedAt: homeworkSnapshots.capturedAt }).from(homeworkSnapshots).where(inArray(homeworkSnapshots.prescriptionSetId, setIds));
  const snapBySet = new Map(snaps.map((s) => [s.setId, s.capturedAt]));
  const clinicianNames = new Map<string, string>();
  for (const s of sets) {
    const first = items.find((i) => i.setId === s.setId);
    if (!first) continue;
    const [m] = await db
      .select({ displayName: organizationMembers.displayName })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.orgId, s.orgId), eq(organizationMembers.userId, first.prescribedBy)))
      .limit(1);
    clinicianNames.set(s.setId, m?.displayName ?? "医療者");
  }

  return sets.map((s) => ({
    setId: s.setId,
    orgName: s.orgName,
    clinicianName: clinicianNames.get(s.setId) ?? "医療者",
    createdAt: s.createdAt,
    snapshotTakenAt: snapBySet.get(s.setId) ?? null,
    items: items
      .filter((i) => i.setId === s.setId)
      .map((i) => {
        const p = progressByVersion.get(i.versionId);
        const sc = scoreByMaterial.get(i.materialId);
        return {
          itemId: i.itemId,
          materialId: i.materialId,
          versionId: i.versionId,
          title: i.title,
          primaryDomain: i.primaryDomain,
          summary: i.summary,
          slideCount: Number(i.slideCount),
          questionCount: Number(i.questionCount),
          phase: sc?.attemptId && sc.attemptVersionId === i.versionId ? "completed" : (p?.phase ?? "not_started"),
          lastSlideSeq: p?.lastSlideSeq ?? 0,
          scorePct: sc?.scorePct ?? null,
          isOldVersion: sc?.isOldVersion ?? false,
          oldVersionScorePct: sc?.oldVersionScorePct ?? null,
          note: i.note,
        };
      }),
  }));
}
