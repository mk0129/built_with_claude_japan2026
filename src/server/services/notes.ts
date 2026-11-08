import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { materialVersions, materials, quizAttempts, quizAnswers, visitNotes } from "@/server/db/schema";
import { badRequest, notFound } from "@/server/authz/errors";
import { assertPatientHasVersion } from "./learning";
import type { ConsultationContext } from "@/server/authz/consultation";
import { audit } from "./audit";

/**
 * 診察ノート（Phase 2 Step 3）: 次の診察で聞きたいこと。患者本人だけが作成・編集・削除する。
 * - 自由な質問は教材に紐づけない（material_id = null）。
 * - 理解確認から作った質問候補は、患者が確認して保存したときに source = quiz として、教材・版・設問を保持する。
 *   設問は患者自身が回答したもの、版は患者が学習できるものに限る。
 * - 医療者は有効な一時共有の間だけ読む（診察サマリーで学習後の質問と統合）。記録しても医療者へ通知しない。
 */
export const NOTE_MAX = 500;

export type VisitNoteView = {
  id: string;
  body: string;
  source: "free" | "quiz";
  materialId: string | null;
  materialTitle: string | null;
  primaryDomain: string | null;
  /** 患者が「聞けた・解決した」と印を付けた日時。null は未解決（ストック型: 質問は消さず残す） */
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const cleanBody = (body: string) => {
  const b = body.trim();
  if (!b) throw badRequest("EMPTY_NOTE", "質問を入力してください");
  if (b.length > NOTE_MAX) throw badRequest("NOTE_TOO_LONG", `質問は ${NOTE_MAX} 文字までです`);
  return b;
};

export async function listVisitNotes(patientId: string, db: Db = getDb()): Promise<VisitNoteView[]> {
  return db
    .select({
      id: visitNotes.id,
      body: visitNotes.body,
      source: visitNotes.source,
      materialId: visitNotes.materialId,
      materialTitle: materials.title,
      primaryDomain: materials.primaryDomain,
      resolvedAt: visitNotes.resolvedAt,
      createdAt: visitNotes.createdAt,
      updatedAt: visitNotes.updatedAt,
    })
    .from(visitNotes)
    .leftJoin(materials, eq(materials.id, visitNotes.materialId))
    .where(eq(visitNotes.patientId, patientId))
    .orderBy(visitNotes.createdAt);
}

export async function createVisitNote(
  patientId: string,
  input: { body: string; versionId?: string | null; questionId?: string | null },
  db: Db = getDb(),
): Promise<VisitNoteView> {
  const body = cleanBody(input.body);
  let materialId: string | null = null;
  let versionId: string | null = null;
  let questionId: string | null = null;
  if (input.versionId) {
    await assertPatientHasVersion(patientId, input.versionId, db);
    const [v] = await db.select({ materialId: materialVersions.materialId }).from(materialVersions).where(eq(materialVersions.id, input.versionId)).limit(1);
    if (!v) throw notFound("VERSION_NOT_FOUND");
    materialId = v.materialId;
    versionId = input.versionId;
    if (input.questionId) {
      // 患者自身が回答した設問だけを紐づける
      const [a] = await db
        .select({ id: quizAnswers.id })
        .from(quizAnswers)
        .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
        .where(and(eq(quizAttempts.patientId, patientId), eq(quizAttempts.materialVersionId, input.versionId), eq(quizAnswers.questionId, input.questionId)))
        .limit(1);
      if (!a) throw badRequest("QUESTION_NOT_ANSWERED");
      questionId = input.questionId;
    }
  } else if (input.questionId) throw badRequest("VERSION_REQUIRED");
  const [row] = await db
    .insert(visitNotes)
    .values({ patientId, body, source: versionId ? "quiz" : "free", materialId, materialVersionId: versionId, quizQuestionId: questionId })
    .returning({ id: visitNotes.id });
  await audit({ actorUserId: patientId, action: "note.create", resourceType: "visit_note", resourceId: row.id, outcome: "ok" }, db);
  return (await listVisitNotes(patientId, db)).find((n) => n.id === row.id)!;
}

export async function updateVisitNote(patientId: string, noteId: string, patch: { body?: string; resolved?: boolean }, db: Db = getDb()) {
  const set: Partial<typeof visitNotes.$inferInsert> = {};
  if (patch.body !== undefined) {
    set.body = cleanBody(patch.body);
    set.updatedAt = new Date();
  }
  // 「聞けた・解決した」の印（本文の更新日時は変えない。原文はそのまま）
  if (patch.resolved !== undefined) set.resolvedAt = patch.resolved ? new Date() : null;
  if (Object.keys(set).length === 0) throw badRequest("EMPTY_PATCH");
  const updated = await db
    .update(visitNotes)
    .set(set)
    .where(and(eq(visitNotes.id, noteId), eq(visitNotes.patientId, patientId)))
    .returning({ id: visitNotes.id });
  if (updated.length !== 1) throw notFound("NOTE_NOT_FOUND");
  await audit({ actorUserId: patientId, action: "note.update", resourceType: "visit_note", resourceId: noteId, outcome: "ok" }, db);
  return (await listVisitNotes(patientId, db)).find((n) => n.id === noteId)!;
}

export async function deleteVisitNote(patientId: string, noteId: string, db: Db = getDb()) {
  const deleted = await db.delete(visitNotes).where(and(eq(visitNotes.id, noteId), eq(visitNotes.patientId, patientId))).returning({ id: visitNotes.id });
  if (deleted.length !== 1) throw notFound("NOTE_NOT_FOUND");
  await audit({ actorUserId: patientId, action: "note.delete", resourceType: "visit_note", resourceId: noteId, outcome: "ok" }, db);
  return { deleted: true };
}

/** 医療者のサマリー用（新しい順） */
export async function listVisitNotesForClinician(patientId: string, db: Db = getDb()) {
  return (await listVisitNotes(patientId, db)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * 医療者が診察で答えた質問を「解決」にする（または戻す）。有効な診察セッションの患者の質問だけ。原文・更新日時は変えない。
 * 監査には医療者・施設・セッションを残す（患者本人の「聞けた」と区別できる）。
 */
export async function resolveVisitNoteForClinician(ctx: ConsultationContext, noteId: string, resolved: boolean, db: Db = getDb()) {
  const updated = await db
    .update(visitNotes)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(and(eq(visitNotes.id, noteId), eq(visitNotes.patientId, ctx.patientId)))
    .returning({ id: visitNotes.id });
  if (updated.length !== 1) throw notFound("NOTE_NOT_FOUND");
  await audit(
    { actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: resolved ? "note.resolve" : "note.reopen", resourceType: "visit_note", resourceId: noteId, consultationSessionId: ctx.sessionId, outcome: "ok" },
    db,
  );
  return (await listVisitNotes(ctx.patientId, db)).find((n) => n.id === noteId)!;
}
