import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { answerExplanations, quizAnswers, quizAttempts } from "@/server/db/schema";
import type { ConsultationContext } from "@/server/authz/consultation";
import { badRequest } from "@/server/authz/errors";
import { audit } from "./audit";

/**
 * 「理解を確認したいこと」（誤答・「わからない」）に医療者が付ける「説明した」の印。
 * 有効な診察セッションの中でだけ付け外しでき、採点・学習の記録には触れない（正答率はそのまま）。
 * 設問は患者の回答（attemptId + questionId）で指定し、その患者の回答でなければ受け付けない。
 */
const UUID = /^[0-9a-f-]{36}$/i;

export async function listAnswerExplanations(patientId: string, db: Db = getDb()) {
  const rows = await db
    .select({ attemptId: answerExplanations.attemptId, questionId: answerExplanations.questionId, explainedAt: answerExplanations.explainedAt })
    .from(answerExplanations)
    .where(eq(answerExplanations.patientId, patientId));
  return rows.map((r) => ({ attemptId: r.attemptId, questionId: r.questionId, explainedAt: r.explainedAt.toISOString() }));
}

export async function setAnswerExplained(ctx: ConsultationContext, input: { attemptId?: unknown; questionId?: unknown; explained?: unknown }, db: Db = getDb()) {
  const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
  const questionId = typeof input.questionId === "string" ? input.questionId : "";
  if (!UUID.test(attemptId) || !UUID.test(questionId)) throw badRequest("CHECK_INVALID", "設問の指定が正しくありません");
  const explained = input.explained !== false;
  // この患者の回答であることを確かめる（他の患者の回答に印は付けられない）
  const [row] = await db
    .select({ id: quizAnswers.id })
    .from(quizAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
    .where(and(eq(quizAnswers.attemptId, attemptId), eq(quizAnswers.questionId, questionId), eq(quizAttempts.patientId, ctx.patientId)))
    .limit(1);
  if (!row) throw badRequest("CHECK_NOT_FOUND", "対象の設問が見つかりません");
  await db
    .delete(answerExplanations)
    .where(and(eq(answerExplanations.patientId, ctx.patientId), eq(answerExplanations.attemptId, attemptId), eq(answerExplanations.questionId, questionId)));
  if (explained) await db.insert(answerExplanations).values({ patientId: ctx.patientId, attemptId, questionId, sessionId: ctx.sessionId, clinicianId: ctx.clinician.userId });
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: explained ? "check.explained" : "check.unexplained", resourceType: "quiz_answer", resourceId: `${attemptId}:${questionId}`, outcome: "ok" }, db);
  return listAnswerExplanations(ctx.patientId, db);
}
