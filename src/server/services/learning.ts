import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { learningProgress, materialVersions, materials, prescriptionItems, prescriptionSets, quizAnswers, quizAttempts, quizQuestions } from "@/server/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/server/authz/errors";
import { getVersionContent } from "./materials";
import { listApprovedFiguresForVersion } from "./figures";

/**
 * 患者がこの版を学習できるか（患者保有データへの唯一の入口）。2026-11-03 Phase E で方針変更:
 * - 処方された版（旧版を含む）は従来どおり学習できる → "prescribed"
 * - 処方されていなくても、現在公開中の版で、患者に見える教材（共通教材、または患者に処方したことのある病院の独自教材）は
 *   自主学習として学習できる → "self"
 * - 下書き・承認待ち・取り下げ・旧版（処方されていないもの）、他院の独自教材は学習できない（403 NOT_AVAILABLE）
 */
export async function assertPatientHasVersion(patientId: string, versionId: string, db: Db = getDb()): Promise<"prescribed" | "self"> {
  const [row] = await db
    .select({ id: prescriptionItems.id })
    .from(prescriptionItems)
    .innerJoin(prescriptionSets, eq(prescriptionSets.id, prescriptionItems.setId))
    .where(and(eq(prescriptionSets.patientId, patientId), eq(prescriptionItems.materialVersionId, versionId)))
    .limit(1);
  if (row) return "prescribed";
  const [v] = await db
    .select({ status: materialVersions.status, scope: materials.scope, ownerOrgId: materials.ownerOrgId, current: materials.currentPublishedVersionId })
    .from(materialVersions)
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(materialVersions.id, versionId))
    .limit(1);
  if (!v || v.status !== "published" || v.current !== versionId) throw forbidden("NOT_AVAILABLE");
  if (v.scope === "common") return "self";
  const orgIds = await patientOrgIds(patientId, db);
  if (v.ownerOrgId && orgIds.includes(v.ownerOrgId)) return "self";
  throw forbidden("NOT_AVAILABLE");
}

/** 患者に処方したことのある病院（その病院の独自教材を自主学習できる） */
export async function patientOrgIds(patientId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db.selectDistinct({ orgId: prescriptionSets.orgId }).from(prescriptionSets).where(eq(prescriptionSets.patientId, patientId));
  return rows.map((r) => r.orgId);
}

/** 学習画面用: スライド（正解なし設問一覧付き）と進捗 */
export async function getLearningView(patientId: string, versionId: string, db: Db = getDb()) {
  await assertPatientHasVersion(patientId, versionId, db);
  const c = await getVersionContent(versionId, db);
  const [p] = await db
    .select()
    .from(learningProgress)
    .where(and(eq(learningProgress.patientId, patientId), eq(learningProgress.materialVersionId, versionId)))
    .limit(1);
  // 図解は承認済み（approved）かつ画像ファイルがあるものだけ。未承認は URL も渡さない
  const figures = await listApprovedFiguresForVersion(versionId, db);
  return {
    versionId: c.versionId,
    materialId: c.materialId,
    title: c.title,
    summary: c.summary,
    primaryDomain: c.primaryDomain,
    learningObjectives: c.learningObjectives,
    isCurrentVersion: c.currentPublishedVersionId === c.versionId,
    retiredForSafety: c.retireReason === "safety",
    slides: c.slides.map((s) => ({
      seq: s.seq,
      title: s.title,
      proposition: s.proposition,
      bodyMd: s.bodyMd,
      detailMd: s.detailMd,
      voiceText: s.voiceText ?? s.bodyMd,
      figures: figures[s.seq] ?? [],
    })),
    questionCount: c.questions.length,
    progress: { phase: p?.phase ?? "not_started", lastSlideSeq: p?.lastSlideSeq ?? 0 },
  };
}

/** 画面移動ごとの自動保存（LEARN-02） */
export async function saveProgress(patientId: string, versionId: string, lastSlideSeq: number, phase: "reading" | "quiz" | "completed", db: Db = getDb()) {
  await assertPatientHasVersion(patientId, versionId, db);
  await db
    .insert(learningProgress)
    .values({ patientId, materialVersionId: versionId, lastSlideSeq, phase })
    .onConflictDoUpdate({
      target: [learningProgress.patientId, learningProgress.materialVersionId],
      set: { lastSlideSeq, phase, updatedAt: new Date() },
    });
}

export type AttemptView = {
  attemptId: string;
  versionId: string;
  nQuestions: number;
  completedAt: Date | null;
  scorePct: number | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  questions: {
    questionId: string;
    seq: number;
    stem: string;
    options: [string, string, string];
    relatedSlideSeq: number | null;
    answer: null | { selectedIndex: number | null; isUnknown: boolean; isCorrect: boolean; correctIndex: number; explanation: string };
  }[];
};

async function buildAttemptView(attemptId: string, db: Db): Promise<AttemptView> {
  const [a] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).limit(1);
  if (!a) throw notFound("ATTEMPT_NOT_FOUND");
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.materialVersionId, a.materialVersionId)).orderBy(asc(quizQuestions.seq));
  const answers = await db.select().from(quizAnswers).where(eq(quizAnswers.attemptId, attemptId));
  const byQ = new Map(answers.map((x) => [x.questionId, x]));
  const ordered = a.questionIds.map((id) => qs.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
  return {
    attemptId: a.id,
    versionId: a.materialVersionId,
    nQuestions: a.nQuestions,
    completedAt: a.completedAt,
    scorePct: a.scorePct == null ? null : Number(a.scorePct),
    nCorrect: a.nCorrect,
    nWrong: a.nWrong,
    nUnknown: a.nUnknown,
    questions: ordered.map((q) => {
      const ans = byQ.get(q.id);
      return {
        questionId: q.id,
        seq: q.seq,
        stem: q.stem,
        options: q.options,
        relatedSlideSeq: q.relatedSlideSeq,
        // 回答済みの設問だけ正解・解説を開示する
        answer: ans ? { selectedIndex: ans.selectedIndex, isUnknown: ans.isUnknown, isCorrect: ans.isCorrect, correctIndex: q.correctIndex, explanation: q.explanation } : null,
      };
    }),
  };
}

/**
 * 進行中の挑戦があれば再開、なければ新規作成（問題構成を開始時に固定）。
 * `forceNew` は完了後の再挑戦用。進行中の挑戦があるときは再挑戦を作らない。
 */
export async function startOrResumeAttempt(patientId: string, versionId: string, forceNew = false, db: Db = getDb()): Promise<AttemptView> {
  await assertPatientHasVersion(patientId, versionId, db);
  const [inProgress] = await db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.patientId, patientId), eq(quizAttempts.materialVersionId, versionId), isNull(quizAttempts.completedAt)))
    .orderBy(desc(quizAttempts.startedAt))
    .limit(1);
  if (inProgress) return buildAttemptView(inProgress.id, db);
  if (!forceNew) {
    const [latestDone] = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.patientId, patientId), eq(quizAttempts.materialVersionId, versionId)))
      .orderBy(desc(quizAttempts.startedAt))
      .limit(1);
    if (latestDone) return buildAttemptView(latestDone.id, db);
  }
  const qs = await db.select({ id: quizQuestions.id }).from(quizQuestions).where(eq(quizQuestions.materialVersionId, versionId)).orderBy(asc(quizQuestions.seq));
  if (qs.length === 0) throw badRequest("NO_QUESTIONS");
  // 同時に 2 回呼ばれても進行中の挑戦は 1 件（部分一意インデックス）。衝突したら既存を返す
  const inserted = await db
    .insert(quizAttempts)
    .values({ patientId, materialVersionId: versionId, questionIds: qs.map((q) => q.id), nQuestions: qs.length })
    .onConflictDoNothing()
    .returning({ id: quizAttempts.id });
  let attemptId = inserted[0]?.id;
  if (!attemptId) {
    const [existing] = await db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.patientId, patientId), eq(quizAttempts.materialVersionId, versionId), isNull(quizAttempts.completedAt)))
      .limit(1);
    if (!existing) throw conflict("ATTEMPT_RACE");
    attemptId = existing.id;
  }
  await saveProgress(patientId, versionId, 0, "quiz", db).catch(() => {});
  return buildAttemptView(attemptId, db);
}

export async function getAttempt(patientId: string, attemptId: string, db: Db = getDb()): Promise<AttemptView> {
  const [a] = await db.select({ patientId: quizAttempts.patientId }).from(quizAttempts).where(eq(quizAttempts.id, attemptId)).limit(1);
  if (!a || a.patientId !== patientId) throw notFound("ATTEMPT_NOT_FOUND");
  return buildAttemptView(attemptId, db);
}

/**
 * 1 問ごとの回答確定（LEARN-04/05, D09）。
 * - 同一挑戦内の回答変更不可（unique(attempt_id, question_id)）
 * - 「わからない」= selectedIndex null → 0 点、誤答と別集計
 * - 全問回答時のみ completed_at と score_pct を確定
 */
export async function answerQuestion(
  patientId: string,
  attemptId: string,
  questionId: string,
  selectedIndex: number | null,
  db: Db = getDb(),
) {
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId)).for("update").limit(1);
    if (!a || a.patientId !== patientId) throw notFound("ATTEMPT_NOT_FOUND");
    if (a.completedAt) throw conflict("ATTEMPT_COMPLETED");
    if (!a.questionIds.includes(questionId)) throw badRequest("QUESTION_NOT_IN_ATTEMPT");
    const [q] = await tx.select().from(quizQuestions).where(eq(quizQuestions.id, questionId)).limit(1);
    if (!q) throw notFound("QUESTION_NOT_FOUND");
    if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex > 2)) throw badRequest("INVALID_OPTION");

    const isUnknown = selectedIndex === null;
    const isCorrect = !isUnknown && selectedIndex === q.correctIndex;
    const inserted = await tx
      .insert(quizAnswers)
      .values({ attemptId, questionId, selectedIndex, isUnknown, isCorrect })
      .onConflictDoNothing({ target: [quizAnswers.attemptId, quizAnswers.questionId] })
      .returning({ id: quizAnswers.id });
    if (inserted.length === 0) throw conflict("ANSWER_ALREADY_SUBMITTED");

    const nCorrect = a.nCorrect + (isCorrect ? 1 : 0);
    const nUnknown = a.nUnknown + (isUnknown ? 1 : 0);
    const nWrong = a.nWrong + (!isUnknown && !isCorrect ? 1 : 0);
    const answered = nCorrect + nUnknown + nWrong;
    const completed = answered >= a.nQuestions;
    const scorePct = completed ? (100 * nCorrect) / a.nQuestions : null;
    await tx
      .update(quizAttempts)
      .set({ nCorrect, nUnknown, nWrong, completedAt: completed ? new Date() : null, scorePct: completed ? String(scorePct) : null })
      .where(eq(quizAttempts.id, attemptId));
    if (completed) {
      await tx
        .insert(learningProgress)
        .values({ patientId, materialVersionId: a.materialVersionId, lastSlideSeq: 0, phase: "completed" })
        .onConflictDoUpdate({ target: [learningProgress.patientId, learningProgress.materialVersionId], set: { phase: "completed", updatedAt: new Date() } });
    }
    return {
      isCorrect,
      isUnknown,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      relatedSlideSeq: q.relatedSlideSeq,
      answeredCount: answered,
      nQuestions: a.nQuestions,
      completed,
      scorePct,
      nCorrect,
      nWrong,
      nUnknown,
    };
  });
}

/** 医療者ダッシュボード用: 最新完了挑戦の誤答・わからない設問 */
export async function listMissedQuestions(attemptId: string, db: Db = getDb()) {
  const rows = await db
    .select({
      questionId: quizQuestions.id,
      seq: quizQuestions.seq,
      stem: quizQuestions.stem,
      isUnknown: quizAnswers.isUnknown,
      selectedIndex: quizAnswers.selectedIndex,
      options: quizQuestions.options,
      correctIndex: quizQuestions.correctIndex,
    })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId))
    .where(and(eq(quizAnswers.attemptId, attemptId), eq(quizAnswers.isCorrect, false)))
    .orderBy(asc(quizQuestions.seq));
  return rows;
}
