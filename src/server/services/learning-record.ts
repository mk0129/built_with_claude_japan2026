import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { materialVersions, materials, quizAnswers, quizAttempts, quizQuestions } from "@/server/db/schema";

/**
 * 理解確認の回答記録（Phase 2 Step 2）。患者画面と医療者画面が同じ記録を参照する。
 * 教材ごとに最新の挑戦（完了・途中を問わない）の回答を、設問・選んだ選択肢・正答・解説・回答日時つきで返す。
 * 「わからない」（selectedIndex = null）と誤答は区別する。点数ではなく回答そのものを根拠として示すためのもの。
 */
export type AnswerRecord = {
  attemptId: string;
  attemptCompleted: boolean;
  materialId: string;
  versionId: string;
  materialTitle: string;
  primaryDomain: string;
  questionId: string;
  seq: number;
  stem: string;
  isUnknown: boolean;
  isCorrect: boolean;
  selectedText: string | null;
  correctText: string;
  explanation: string;
  relatedSlideSeq: number | null;
  answeredAt: Date;
};

export async function listLatestAnswers(patientId: string, db: Db = getDb()): Promise<AnswerRecord[]> {
  const attempts = await db
    .select({
      id: quizAttempts.id,
      versionId: quizAttempts.materialVersionId,
      completedAt: quizAttempts.completedAt,
      materialId: materialVersions.materialId,
      materialTitle: materials.title,
      primaryDomain: materials.primaryDomain,
    })
    .from(quizAttempts)
    .innerJoin(materialVersions, eq(materialVersions.id, quizAttempts.materialVersionId))
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(quizAttempts.patientId, patientId))
    .orderBy(desc(quizAttempts.startedAt));
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(a.materialId)) latest.set(a.materialId, a);
  const ids = [...latest.values()].map((a) => a.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      attemptId: quizAnswers.attemptId,
      questionId: quizQuestions.id,
      seq: quizQuestions.seq,
      stem: quizQuestions.stem,
      options: quizQuestions.options,
      correctIndex: quizQuestions.correctIndex,
      explanation: quizQuestions.explanation,
      relatedSlideSeq: quizQuestions.relatedSlideSeq,
      selectedIndex: quizAnswers.selectedIndex,
      isUnknown: quizAnswers.isUnknown,
      isCorrect: quizAnswers.isCorrect,
      answeredAt: quizAnswers.answeredAt,
    })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId))
    .where(inArray(quizAnswers.attemptId, ids))
    .orderBy(asc(quizAnswers.answeredAt));
  const byId = new Map([...latest.values()].map((a) => [a.id, a]));
  return rows.map((r) => {
    const a = byId.get(r.attemptId)!;
    return {
      attemptId: r.attemptId,
      attemptCompleted: !!a.completedAt,
      materialId: a.materialId,
      versionId: a.versionId,
      materialTitle: a.materialTitle,
      primaryDomain: a.primaryDomain,
      questionId: r.questionId,
      seq: r.seq,
      stem: r.stem,
      isUnknown: r.isUnknown,
      isCorrect: r.isCorrect,
      selectedText: r.selectedIndex == null ? null : (r.options[r.selectedIndex] ?? null),
      correctText: r.options[r.correctIndex],
      explanation: r.explanation,
      relatedSlideSeq: r.relatedSlideSeq,
      answeredAt: r.answeredAt,
    };
  });
}

/** 患者・医療者の画面で使う、教材の学習目標（版ごと） */
export async function objectivesByVersion(versionIds: string[], db: Db = getDb()): Promise<Map<string, string[]>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db
    .select({ id: materialVersions.id, objectives: materialVersions.learningObjectives })
    .from(materialVersions)
    .where(and(inArray(materialVersions.id, versionIds)));
  return new Map(rows.map((r) => [r.id, r.objectives]));
}
