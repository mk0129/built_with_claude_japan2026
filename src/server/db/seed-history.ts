import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import {
  consultationSessions,
  learningProgress,
  materialVersions,
  materials,
  patientFeedback,
  prescriptionItems,
  prescriptionSets,
  qrGrants,
  quizAnswers,
  quizAttempts,
  quizQuestions,
} from "./schema";

/**
 * デモ用の自然な診察履歴（患者A のみ）。
 * 14 日前にさくら総合病院で初回診察 → 3 教材を処方 → 自宅で 2 教材を学習
 * （1 つは誤答と「わからない」あり）→ 質問を 1 件送信。1 教材は未着手。
 * 次回の診察（QR 承認）でスナップショットが確定し、ダッシュボードに
 * 未確認の質問・誤答・未完了教材が揃って表示される。
 * 患者B は履歴なし（E2E と手動検証の初期状態用）。
 */
export async function seedDemoHistory(
  db: Db,
  ids: { patientId: string; clinicianId: string; orgId: string; materialIdByTitle: Map<string, string> },
) {
  const [existing] = await db
    .select({ id: consultationSessions.id })
    .from(consultationSessions)
    .where(and(eq(consultationSessions.patientId, ids.patientId), eq(consultationSessions.orgId, ids.orgId)))
    .limit(1);
  if (existing) return { skipped: true };

  const day = 24 * 60 * 60 * 1000;
  const visitAt = new Date(Date.now() - 14 * day);
  visitAt.setHours(10, 15, 0, 0);
  const at = (daysAfter: number, hour: number, minute = 0) => {
    const d = new Date(visitAt.getTime() + daysAfter * day);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // 初回診察（承認済み・終了済み）
  const [grant] = await db
    .insert(qrGrants)
    .values({
      patientId: ids.patientId,
      tokenHash: `demo-history-${ids.patientId}`,
      code: "000000",
      createdAt: visitAt,
      expiresAt: new Date(visitAt.getTime() + 5 * 60 * 1000),
      claimedByUserId: ids.clinicianId,
      claimedOrgId: ids.orgId,
      claimedAt: new Date(visitAt.getTime() + 60 * 1000),
      decision: "approved",
      decidedAt: new Date(visitAt.getTime() + 90 * 1000),
    })
    .returning({ id: qrGrants.id });
  const [session] = await db
    .insert(consultationSessions)
    .values({
      patientId: ids.patientId,
      clinicianId: ids.clinicianId,
      orgId: ids.orgId,
      qrGrantId: grant.id,
      startedAt: new Date(visitAt.getTime() + 90 * 1000),
      expiresAt: new Date(visitAt.getTime() + 61.5 * 60 * 1000),
      endedAt: new Date(visitAt.getTime() + 25 * 60 * 1000),
      endedBy: "clinician",
    })
    .returning({ id: consultationSessions.id });
  await db.update(qrGrants).set({ consultationSessionId: session.id }).where(eq(qrGrants.id, grant.id));

  // 処方（3 教材）
  const titles = ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先"];
  const [set] = await db
    .insert(prescriptionSets)
    .values({ consultationSessionId: session.id, patientId: ids.patientId, orgId: ids.orgId, createdAt: new Date(visitAt.getTime() + 12 * 60 * 1000) })
    .returning({ id: prescriptionSets.id });
  const versionByTitle = new Map<string, string>();
  for (const title of titles) {
    const materialId = ids.materialIdByTitle.get(title)!;
    const [m] = await db.select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
    versionByTitle.set(title, m.v!);
    await db.insert(prescriptionItems).values({
      setId: set.id,
      materialId,
      materialVersionId: m.v!,
      prescribedByUserId: ids.clinicianId,
      prescribedAt: new Date(visitAt.getTime() + 12 * 60 * 1000),
    });
  }

  // 学習 1: 病期（3 日後に完了。正解・誤答・わからない）
  await completeAttempt(db, ids.patientId, versionByTitle.get(titles[0])!, ["c", "w", "u"], at(3, 20, 10));
  // 学習 2: サブタイプ（5 日後に完了。全問正解）
  await completeAttempt(db, ids.patientId, versionByTitle.get(titles[1])!, ["c", "c"], at(5, 21, 0));
  // 学習 3: こころのケア（未着手のまま）

  // ふりかえり・質問
  await db.insert(patientFeedback).values([
    { patientId: ids.patientId, materialVersionId: versionByTitle.get(titles[1])!, prescriptionSetId: set.id, selection: "mostly_understood", freeText: null, createdAt: at(5, 21, 5) },
    {
      patientId: ids.patientId,
      materialVersionId: versionByTitle.get(titles[0])!,
      prescriptionSetId: set.id,
      selection: "have_question",
      freeText: "ステージが同じでも治療が違うことがあると読みました。私の場合はどういう理由で今の治療になったのか、次に教えてください。",
      createdAt: at(3, 20, 20),
    },
  ]);
  return { skipped: false, sessionId: session.id, setId: set.id };
}

async function completeAttempt(db: Db, patientId: string, versionId: string, pattern: string[], completedAt: Date) {
  const qs = await db.select().from(quizQuestions).where(eq(quizQuestions.materialVersionId, versionId)).orderBy(asc(quizQuestions.seq));
  let nCorrect = 0,
    nWrong = 0,
    nUnknown = 0;
  const startedAt = new Date(completedAt.getTime() - 6 * 60 * 1000);
  const [attempt] = await db
    .insert(quizAttempts)
    .values({ patientId, materialVersionId: versionId, questionIds: qs.map((q) => q.id), nQuestions: qs.length, startedAt })
    .returning({ id: quizAttempts.id });
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const kind = pattern[i] ?? "c";
    const selectedIndex = kind === "u" ? null : kind === "c" ? q.correctIndex : (q.correctIndex + 1) % 3;
    const isUnknown = selectedIndex === null;
    const isCorrect = !isUnknown && selectedIndex === q.correctIndex;
    if (isCorrect) nCorrect++;
    else if (isUnknown) nUnknown++;
    else nWrong++;
    await db.insert(quizAnswers).values({ attemptId: attempt.id, questionId: q.id, selectedIndex, isUnknown, isCorrect, answeredAt: new Date(startedAt.getTime() + (i + 1) * 60 * 1000) });
  }
  await db
    .update(quizAttempts)
    .set({ nCorrect, nWrong, nUnknown, completedAt, scorePct: String((100 * nCorrect) / qs.length) })
    .where(eq(quizAttempts.id, attempt.id));
  await db
    .insert(learningProgress)
    .values({ patientId, materialVersionId: versionId, lastSlideSeq: 0, phase: "completed", updatedAt: completedAt })
    .onConflictDoUpdate({ target: [learningProgress.patientId, learningProgress.materialVersionId], set: { phase: "completed", updatedAt: completedAt } });
}
