import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { materialVersions, materials, organizations, patientFeedback, prescriptionItems, prescriptionSets, questionActions } from "@/server/db/schema";
import type { ConsultationContext } from "@/server/authz/consultation";
import { notFound } from "@/server/authz/errors";
import { assertPatientHasVersion } from "./learning";
import { audit } from "./audit";

export type FeedbackSelection = "mostly_understood" | "explain_again" | "have_question" | "stop_for_today";
export type QuestionStatus = "unread" | "reviewed" | "resolved";
export type ResponseType = "verbal_explanation" | "additional_prescription" | "referral" | "other";

export const RESPONSE_TYPE_LABEL: Record<ResponseType, string> = {
  verbal_explanation: "口頭で説明",
  additional_prescription: "追加の情報処方",
  referral: "他職種・窓口を案内",
  other: "その他",
};

/** 学習後フィードバック（QNA-01/02）。自由記述や「質問がある」「もう一度説明」は医療者の確認対象になる */
export async function submitFeedback(
  patientId: string,
  versionId: string,
  selection: FeedbackSelection,
  freeText: string | null,
  db: Db = getDb(),
) {
  await assertPatientHasVersion(patientId, versionId, db);
  const [item] = await db
    .select({ setId: prescriptionItems.setId })
    .from(prescriptionItems)
    .innerJoin(prescriptionSets, eq(prescriptionSets.id, prescriptionItems.setId))
    .where(and(eq(prescriptionSets.patientId, patientId), eq(prescriptionItems.materialVersionId, versionId)))
    .orderBy(desc(prescriptionItems.prescribedAt))
    .limit(1);
  const [row] = await db
    .insert(patientFeedback)
    .values({ patientId, materialVersionId: versionId, prescriptionSetId: item?.setId ?? null, selection, freeText: freeText?.trim() || null })
    .returning({ id: patientFeedback.id });
  return { feedbackId: row.id, needsReview: isQuestion(selection, freeText) };
}

export function isQuestion(selection: FeedbackSelection, freeText: string | null) {
  return !!freeText?.trim() || selection === "have_question" || selection === "explain_again";
}

export type QuestionView = {
  feedbackId: string;
  materialId: string;
  versionId: string;
  materialTitle: string;
  primaryDomain: string;
  selection: FeedbackSelection;
  freeText: string | null;
  createdAt: Date;
  status: QuestionStatus;
  actions: { status: QuestionStatus; responseType: ResponseType | null; note: string | null; orgName: string; createdAt: Date }[];
};

async function loadQuestions(patientId: string, db: Db, onlyQuestions: boolean): Promise<QuestionView[]> {
  const rows = await db
    .select({
      feedbackId: patientFeedback.id,
      versionId: patientFeedback.materialVersionId,
      materialId: materialVersions.materialId,
      materialTitle: materials.title,
      primaryDomain: materials.primaryDomain,
      selection: patientFeedback.selection,
      freeText: patientFeedback.freeText,
      createdAt: patientFeedback.createdAt,
    })
    .from(patientFeedback)
    .innerJoin(materialVersions, eq(materialVersions.id, patientFeedback.materialVersionId))
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(patientFeedback.patientId, patientId))
    .orderBy(desc(patientFeedback.createdAt));
  const filtered = onlyQuestions ? rows.filter((r) => isQuestion(r.selection, r.freeText)) : rows;
  if (filtered.length === 0) return [];
  const actions = await db
    .select({
      feedbackId: questionActions.feedbackId,
      status: questionActions.status,
      responseType: questionActions.responseType,
      note: questionActions.note,
      orgName: organizations.name,
      createdAt: questionActions.createdAt,
    })
    .from(questionActions)
    .innerJoin(organizations, eq(organizations.id, questionActions.orgId))
    .where(inArray(questionActions.feedbackId, filtered.map((r) => r.feedbackId)))
    .orderBy(desc(questionActions.createdAt));
  return filtered.map((r) => {
    const acts = actions.filter((a) => a.feedbackId === r.feedbackId);
    return {
      ...r,
      status: (acts[0]?.status ?? "unread") as QuestionStatus,
      actions: acts.map((a) => ({ status: a.status, responseType: a.responseType as ResponseType | null, note: a.note, orgName: a.orgName, createdAt: a.createdAt })),
    };
  });
}

/** 患者: 自分のふりかえり・質問と対応履歴（T16: 患者履歴に残る） */
export async function listFeedbackForPatient(patientId: string, db: Db = getDb()) {
  return loadQuestions(patientId, db, false);
}

/** 医療者: 有効セッション内でのみ、患者の質問（未確認 → 確認済み → 対応済みの順） */
export async function listQuestionsForClinician(ctx: ConsultationContext, db: Db = getDb()) {
  const qs = await loadQuestions(ctx.patientId, db, true);
  const order: Record<QuestionStatus, number> = { unread: 0, reviewed: 1, resolved: 2 };
  return qs.sort((a, b) => order[a.status] - order[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
}

/** 医療者: ステータス変更と対応種別の記録（QNA-03/04）。追記専用 */
export async function updateQuestionStatus(
  ctx: ConsultationContext,
  feedbackId: string,
  status: QuestionStatus,
  responseType: ResponseType | null,
  note: string | null,
  db: Db = getDb(),
) {
  const [fb] = await db.select({ patientId: patientFeedback.patientId }).from(patientFeedback).where(eq(patientFeedback.id, feedbackId)).limit(1);
  if (!fb || fb.patientId !== ctx.patientId) throw notFound("FEEDBACK_NOT_FOUND");
  await db.insert(questionActions).values({
    feedbackId,
    status,
    responseType: status === "resolved" ? responseType : null,
    note: note?.trim() || null,
    clinicianId: ctx.clinician.userId,
    orgId: ctx.orgId,
    consultationSessionId: ctx.sessionId,
  });
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: `question.${status}`, resourceType: "patient_feedback", resourceId: feedbackId, consultationSessionId: ctx.sessionId, outcome: "ok" }, db);
  return { feedbackId, status };
}
