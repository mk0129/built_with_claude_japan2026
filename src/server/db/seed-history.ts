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
import { onConsultationStarted } from "@/server/services/consultation-hooks";

/**
 * デモ用の自然な診察履歴（患者A のみ、Phase E で充実）。
 * - 初回（28 日前・さくら総合病院・山田医師）: 病期・サブタイプ・こころのケアを処方 → 3 教材とも完了
 *   （病期は誤答と「わからない」あり。サブタイプ・こころは全問正解）。病期について質問を 1 件。
 * - 2 回目（10 日前・同院）: 開始時に初回の宿題スナップショットを確定。薬物療法・化学療法の副作用を処方
 *   → 薬物療法は完了（「わからない」1 つ）、副作用は 2 画面目で途中。副作用について質問を 1 件。
 * - 自主学習: 処方されていない「放射線治療」を自分で読み、全問正解。
 * 次の診察（QR 承認）で 2 回目の宿題が確定し、理解の地図は 診断=もう一度 / 手術=なし / 薬物=もう一度 /
 * 放射線=確認できた（自主） / 副作用=途中 / 心のケア=確認できた となる。患者B は履歴なし（E2E 用）。
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
  const versionOf = async (title: string) => {
    const materialId = ids.materialIdByTitle.get(title)!;
    const [m] = await db.select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
    return { materialId, versionId: m.v! };
  };

  async function visit(daysAgo: number, titles: string[], tag: string) {
    const visitAt = new Date(Date.now() - daysAgo * day);
    visitAt.setHours(10, 15, 0, 0);
    const [grant] = await db
      .insert(qrGrants)
      .values({
        patientId: ids.patientId,
        tokenHash: `demo-history-${tag}-${ids.patientId}`,
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
    const startedAt = new Date(visitAt.getTime() + 90 * 1000);
    const [session] = await db
      .insert(consultationSessions)
      .values({
        patientId: ids.patientId,
        clinicianId: ids.clinicianId,
        orgId: ids.orgId,
        qrGrantId: grant.id,
        startedAt,
        expiresAt: new Date(visitAt.getTime() + 61.5 * 60 * 1000),
        endedAt: new Date(visitAt.getTime() + 25 * 60 * 1000),
        endedBy: "clinician",
      })
      .returning({ id: consultationSessions.id });
    await db.update(qrGrants).set({ consultationSessionId: session.id }).where(eq(qrGrants.id, grant.id));
    // 診察開始時のフック（前回の宿題スナップショット）を本番と同じ処理で確定する
    await onConsultationStarted({ sessionId: session.id, patientId: ids.patientId, orgId: ids.orgId, startedAt }, db);
    const prescribedAt = new Date(visitAt.getTime() + 12 * 60 * 1000);
    const [set] = await db
      .insert(prescriptionSets)
      .values({ consultationSessionId: session.id, patientId: ids.patientId, orgId: ids.orgId, createdAt: prescribedAt })
      .returning({ id: prescriptionSets.id });
    const versions = new Map<string, string>();
    for (const title of titles) {
      const { materialId, versionId } = await versionOf(title);
      versions.set(title, versionId);
      await db.insert(prescriptionItems).values({ setId: set.id, materialId, materialVersionId: versionId, prescribedByUserId: ids.clinicianId, prescribedAt });
    }
    const at = (daysAfter: number, hour: number, minute = 0) => {
      const d = new Date(visitAt.getTime() + daysAfter * day);
      d.setHours(hour, minute, 0, 0);
      return d;
    };
    return { sessionId: session.id, setId: set.id, versions, at };
  }

  // 初回
  const T_STAGE = "乳がんの診断と病期の考え方";
  const T_SUBTYPE = "サブタイプと治療方針のつながり";
  const T_MIND = "こころのケアと相談先";
  const v1 = await visit(28, [T_STAGE, T_SUBTYPE, T_MIND], "v1");
  await completeAttempt(db, ids.patientId, v1.versions.get(T_STAGE)!, ["c", "w", "u"], v1.at(3, 20, 10));
  await completeAttempt(db, ids.patientId, v1.versions.get(T_SUBTYPE)!, ["c", "c"], v1.at(5, 21, 0));
  await completeAttempt(db, ids.patientId, v1.versions.get(T_MIND)!, ["c", "c"], v1.at(8, 19, 30));
  await db.insert(patientFeedback).values([
    { patientId: ids.patientId, materialVersionId: v1.versions.get(T_SUBTYPE)!, prescriptionSetId: v1.setId, selection: "mostly_understood", freeText: null, createdAt: v1.at(5, 21, 5) },
    {
      patientId: ids.patientId,
      materialVersionId: v1.versions.get(T_STAGE)!,
      prescriptionSetId: v1.setId,
      selection: "have_question",
      freeText: "ステージが同じでも治療が違うことがあると読みました。私の場合はどういう理由で今の治療になったのか、次に教えてください。",
      createdAt: v1.at(3, 20, 20),
    },
  ]);

  // 2 回目（開始時に初回の宿題スナップショットが確定する）
  const T_DRUGS = "薬物療法の種類（化学療法・ホルモン療法・分子標的）";
  const T_SELFCARE = "化学療法中の副作用とセルフケア";
  const v2 = await visit(10, [T_DRUGS, T_SELFCARE], "v2");
  await completeAttempt(db, ids.patientId, v2.versions.get(T_DRUGS)!, ["c", "c", "u"], v2.at(2, 20, 40));
  await db.insert(learningProgress).values({ patientId: ids.patientId, materialVersionId: v2.versions.get(T_SELFCARE)!, lastSlideSeq: 2, phase: "reading", startedAt: v2.at(4, 21, 5), updatedAt: v2.at(4, 21, 15) });
  await db.insert(patientFeedback).values({
    patientId: ids.patientId,
    materialVersionId: v2.versions.get(T_SELFCARE)!,
    prescriptionSetId: v2.setId,
    selection: "have_question",
    freeText: "吐き気止めは、気持ち悪くなってから飲むのか、決まった時間に飲むのか分かりませんでした。次の診察で確認したいです。",
    createdAt: v2.at(4, 21, 20),
  });

  // 自主学習（処方されていない教材）
  const radiation = await versionOf("放射線治療の進め方と皮膚のケア");
  await completeAttempt(db, ids.patientId, radiation.versionId, ["c", "c", "c"], v2.at(6, 20, 0));

  return { skipped: false, sessionId: v2.sessionId, setId: v2.setId };
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
    .values({ patientId, materialVersionId: versionId, lastSlideSeq: 0, phase: "completed", startedAt: new Date(startedAt.getTime() - 10 * 60 * 1000), updatedAt: completedAt })
    .onConflictDoUpdate({ target: [learningProgress.patientId, learningProgress.materialVersionId], set: { phase: "completed", updatedAt: completedAt } });
}
