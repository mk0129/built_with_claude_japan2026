import { beforeAll, describe, expect, it } from "vitest";
import { eq, ne } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { homeworkSnapshots, materialVersions, materials, prescriptionSets, systemSettings } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { requireActiveConsultation, type ConsultationContext } from "@/server/authz/consultation";
import { endConsultation, getPatientSummary } from "@/server/services/consultation";
import { listHomeworkForPatient, prescribe } from "@/server/services/prescription";
import { answerQuestion, assertPatientHasVersion, getLearningView, saveProgress, startOrResumeAttempt } from "@/server/services/learning";
import { computeHomeworkScore, computeMaterialScores, computeScoreSummary } from "@/server/services/scoring";
import { listFeedbackForPatient, submitFeedback, updateQuestionStatus } from "@/server/services/questions";
import { listTemplates, listVisibleMaterials } from "@/server/services/materials";
import { DR_KOBAYASHI, DR_YAMADA, PATIENT_A, PATIENT_B, loginHeaders, setupDb, sleep, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
const uid = (email: string) => seeded.users.get(email)!;
const org = (slug: string) => seeded.orgs.get(slug)!;
const mat = (title: string) => seeded.materials.get(title)!;

const M_STAGE = "乳がんの診断と病期の考え方"; // 3問
const M_SELFCARE = "化学療法中の副作用とセルフケア"; // 4問
const M_SURGERY = "乳房の手術の種類と選び方"; // 3問
const M_SAKURA_ONLY = "さくら総合病院 外来化学療法室のご案内";

async function ctxFor(staffEmail: string, sessionId: string): Promise<ConsultationContext> {
  return requireActiveConsultation(await loginHeaders(staffEmail), sessionId);
}

/** 挑戦を指定パターンで回答する。pattern: "c"=正解, "w"=誤答, "u"=わからない */
async function answerPattern(patientId: string, versionId: string, pattern: string, forceNew = false) {
  const attempt = await startOrResumeAttempt(patientId, versionId, forceNew);
  const unanswered = attempt.questions.filter((q) => q.answer === null);
  let last: Awaited<ReturnType<typeof answerQuestion>> | null = null;
  for (let i = 0; i < pattern.length && i < unanswered.length; i++) {
    const q = unanswered[i];
    const content = await getDb().select().from(materials).where(eq(materials.id, mat(M_STAGE))); // 型確認用のダミー参照
    void content;
    const correct = await correctIndexOf(q.questionId);
    const sel = pattern[i] === "c" ? correct : pattern[i] === "w" ? (correct + 1) % 3 : null;
    last = await answerQuestion(patientId, attempt.attemptId, q.questionId, sel);
  }
  return { attempt, last };
}

async function correctIndexOf(questionId: string): Promise<number> {
  const { quizQuestions } = await import("@/server/db/schema");
  const [q] = await getDb().select({ c: quizQuestions.correctIndex }).from(quizQuestions).where(eq(quizQuestions.id, questionId));
  return q.c;
}

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).status).toBe(status);
    if (code) expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${status}`);
}

beforeAll(async () => {
  seeded = await setupDb();
});

describe("教材一覧・テンプレート（T05, D15）", () => {
  it("病院独自教材は他院から見えない。キーワード・領域で絞り込める", async () => {
    const sakura = await listVisibleMaterials({ orgId: org("sakura-general") });
    const hidamari = await listVisibleMaterials({ orgId: org("hidamari-medical") });
    expect(sakura.some((m) => m.title === M_SAKURA_ONLY)).toBe(true);
    expect(hidamari.some((m) => m.title === M_SAKURA_ONLY)).toBe(false);
    expect(sakura.every((m) => m.slideCount >= 3 && m.questionCount >= 2)).toBe(true);
    const q = await listVisibleMaterials({ orgId: org("sakura-general"), q: "手術" });
    expect(q.map((m) => m.title)).toContain(M_SURGERY);
    const d = await listVisibleMaterials({ orgId: org("sakura-general"), domain: "radiation" });
    expect(d).toHaveLength(1);
    const t = await listTemplates(org("hidamari-medical"));
    expect(t.some((x) => x.scope === "org")).toBe(false);
    expect(t.find((x) => x.name === "初回診断時セット")?.materials).toHaveLength(3);
  });

  it("他院専用の教材は処方できない", async () => {
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_KOBAYASHI, "hidamari-medical");
    const ctx = await ctxFor(DR_KOBAYASHI, sessionId);
    await expectAppError(prescribe(ctx, [mat(M_SAKURA_ONLY)]), 403, "MATERIAL_NOT_VISIBLE");
    await endConsultation(sessionId, uid(PATIENT_B));
  });
});

describe("情報処方 → 学習 → クイズ → 医療者の確認（縦断）", () => {
  let sessionA1: string;
  let setA1: string;

  it("T13: 同一診察の複数回処方は 1 宿題セット、同教材は 1 件に統合", async () => {
    sessionA1 = (await startSession(seeded, PATIENT_A, DR_YAMADA, "sakura-general")).sessionId;
    const ctx = await ctxFor(DR_YAMADA, sessionA1);
    const first = await prescribe(ctx, [mat(M_STAGE), mat(M_SELFCARE)]);
    const second = await prescribe(ctx, [mat(M_SELFCARE), mat(M_SURGERY), mat(M_SURGERY)]);
    expect(second.setId).toBe(first.setId);
    expect(second.items).toHaveLength(3);
    setA1 = second.setId;
    const sets = await getDb().select().from(prescriptionSets).where(eq(prescriptionSets.consultationSessionId, sessionA1));
    expect(sets).toHaveLength(1);
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    expect(hw[0].setId).toBe(setA1);
    expect(hw[0].items.every((i) => i.phase === "not_started")).toBe(true);
  });

  it("Phase E: 公開中の共通教材は処方前でも自主学習できる。他院の独自教材・未公開の版は開けない。処方済みは読める", async () => {
    const [other] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, mat("こころのケアと相談先")));
    expect(await assertPatientHasVersion(uid(PATIENT_A), other.v!)).toBe("self");
    expect((await getLearningView(uid(PATIENT_A), other.v!)).slides.length).toBeGreaterThanOrEqual(3);
    // 患者B はどの病院からも処方されていない → さくら総合病院の独自教材は開けない
    const [sakuraOnly] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, mat(M_SAKURA_ONLY)));
    await expectAppError(getLearningView(uid(PATIENT_B), sakuraOnly.v!), 403, "NOT_AVAILABLE");
    // 患者A はさくら総合病院から処方されている → 同院の独自教材は自主学習できる
    expect(await assertPatientHasVersion(uid(PATIENT_A), sakuraOnly.v!)).toBe("self");
    // 公開中でない版（下書きなど）は開けない
    const [draft] = await getDb().select({ id: materialVersions.id }).from(materialVersions).where(ne(materialVersions.status, "published")).limit(1);
    if (draft) await expectAppError(getLearningView(uid(PATIENT_A), draft.id), 403);
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_STAGE))!;
    const view = await getLearningView(uid(PATIENT_A), item.versionId);
    expect(view.slides.length).toBeGreaterThanOrEqual(3);
    expect(view.questionCount).toBe(3);
    await saveProgress(uid(PATIENT_A), item.versionId, 2, "reading");
    expect((await getLearningView(uid(PATIENT_A), item.versionId)).progress).toEqual({ phase: "reading", lastSlideSeq: 2 });
  });

  it("T10: 正解2・誤答1・わからない1 → 50 点、内訳を区別", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_SELFCARE))!;
    const { last } = await answerPattern(uid(PATIENT_A), item.versionId, "cwuc");
    expect(last?.completed).toBe(true);
    expect(last?.scorePct).toBe(50);
    expect([last?.nCorrect, last?.nWrong, last?.nUnknown]).toEqual([2, 1, 1]);
    const [score] = await computeMaterialScores(uid(PATIENT_A), [mat(M_SELFCARE)]);
    expect(score.scorePct).toBe(50);
    expect(score.nUnknown).toBe(1);
  });

  it("T11: 途中中断は再開でき、スコアは未確定、既存の完了スコアは維持", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_SELFCARE))!;
    const { attempt, last } = await answerPattern(uid(PATIENT_A), item.versionId, "cc", true); // 再挑戦を 2 問で中断
    expect(last?.completed).toBe(false);
    const resumed = await startOrResumeAttempt(uid(PATIENT_A), item.versionId);
    expect(resumed.attemptId).toBe(attempt.attemptId);
    expect(resumed.questions.filter((q) => q.answer !== null)).toHaveLength(2);
    expect(resumed.scorePct).toBeNull();
    const [score] = await computeMaterialScores(uid(PATIENT_A), [mat(M_SELFCARE)]);
    expect(score.scorePct).toBe(50); // 前回の完了スコアのまま
  });

  it("クイズ開始が同時に 2 回呼ばれても進行中の挑戦は 1 件になる", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_SURGERY))!;
    const [a, b] = await Promise.all([startOrResumeAttempt(uid(PATIENT_A), item.versionId), startOrResumeAttempt(uid(PATIENT_A), item.versionId)]);
    expect(a.attemptId).toBe(b.attemptId);
    const { quizAttempts } = await import("@/server/db/schema");
    const rows = await getDb().select().from(quizAttempts).where(eq(quizAttempts.materialVersionId, item.versionId));
    expect(rows).toHaveLength(1);
  });

  it("同一挑戦内で確定済みの回答は変更できない", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_SELFCARE))!;
    const resumed = await startOrResumeAttempt(uid(PATIENT_A), item.versionId);
    const answered = resumed.questions.find((q) => q.answer !== null)!;
    await expectAppError(answerQuestion(uid(PATIENT_A), resumed.attemptId, answered.questionId, 0), 409, "ANSWER_ALREADY_SUBMITTED");
    await expectAppError(answerQuestion(uid(PATIENT_B), resumed.attemptId, answered.questionId, 0), 404);
  });

  it("T12: 再受験で 100 点 → 現在スコアが更新され、初回挑戦の記録は保持", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const item = hw[0].items.find((i) => i.materialId === mat(M_SELFCARE))!;
    const { last } = await answerPattern(uid(PATIENT_A), item.versionId, "cc"); // 残り 2 問
    expect(last?.completed).toBe(true);
    expect(last?.scorePct).toBe(100);
    const [score] = await computeMaterialScores(uid(PATIENT_A), [mat(M_SELFCARE)]);
    expect(score.scorePct).toBe(100);
    const { quizAttempts } = await import("@/server/db/schema");
    const attempts = await getDb().select().from(quizAttempts).where(eq(quizAttempts.materialVersionId, item.versionId));
    expect(attempts.filter((a) => a.completedAt)).toHaveLength(2);
    expect(attempts.some((a) => Number(a.scorePct) === 50)).toBe(true);
  });

  it("スコア: 全体は教材単位の単純平均、領域別、宿題。未評価は分母から除外", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const stage = hw[0].items.find((i) => i.materialId === mat(M_STAGE))!;
    await answerPattern(uid(PATIENT_A), stage.versionId, "cwc"); // 66.67
    const summary = await computeScoreSummary(uid(PATIENT_A));
    expect(summary.overall.evaluated).toBe(2);
    expect(summary.overall.total).toBe(3);
    expect(summary.overall.score).toBeCloseTo((100 + 200 / 3) / 2, 5);
    const domain = summary.byDomain.find((d) => d.domain === "diagnosis_staging")!;
    expect(domain.score).toBeCloseTo(200 / 3, 5);
    const hwScore = await computeHomeworkScore(setA1, uid(PATIENT_A));
    expect(hwScore.completedCount).toBe(2);
    expect(hwScore.assignedCount).toBe(3);
  });

  it("T16/T17: 質問 → 医療者が未確認で優先表示 → 確認済み/対応済みを記録 → 患者履歴に残る", async () => {
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const stage = hw[0].items.find((i) => i.materialId === mat(M_STAGE))!;
    await submitFeedback(uid(PATIENT_A), stage.versionId, "mostly_understood", null);
    const { feedbackId } = await submitFeedback(uid(PATIENT_A), stage.versionId, "have_question", "ステージと再発の関係が気になります");
    const ctx = await ctxFor(DR_YAMADA, sessionA1);
    const summary = await getPatientSummary(ctx);
    expect(summary.unreadQuestions).toHaveLength(1);
    expect(summary.unreadQuestions[0].feedbackId).toBe(feedbackId);
    expect(summary.missed.some((m) => m.materialId === mat(M_STAGE) && m.nWrong === 1)).toBe(true);
    expect(summary.incompleteMaterials.map((m) => m.materialId)).toEqual([mat(M_SURGERY)]);
    await updateQuestionStatus(ctx, feedbackId, "reviewed", null, null);
    await updateQuestionStatus(ctx, feedbackId, "resolved", "verbal_explanation", "診察で説明");
    const after = await getPatientSummary(ctx);
    expect(after.unreadQuestions).toHaveLength(0);
    const history = await listFeedbackForPatient(uid(PATIENT_A));
    const q = history.find((h) => h.feedbackId === feedbackId)!;
    expect(q.status).toBe("resolved");
    expect(q.actions[0].responseType).toBe("verbal_explanation");
    expect(history.some((h) => h.selection === "mostly_understood")).toBe(true);
  });

  it("セッション終了後は医療者の閲覧・更新が拒否される（T04）", async () => {
    const ctx = await ctxFor(DR_YAMADA, sessionA1);
    await endConsultation(sessionA1, uid(PATIENT_A));
    await expectAppError(requireActiveConsultation(await loginHeaders(DR_YAMADA), sessionA1), 403, "NO_ACTIVE_CONSULTATION");
    // 失効前に得た ctx を使い回しても API 層では毎回 requireActiveConsultation を通るため、ここでは ctx の再取得が拒否されることを確認
    void ctx;
  });

  it("他院の診察開始では、さくら総合病院の宿題スナップショットは作られない（D29）", async () => {
    await sleep(10);
    const { sessionId } = await startSession(seeded, PATIENT_A, DR_KOBAYASHI, "hidamari-medical");
    const snaps = await getDb().select().from(homeworkSnapshots).where(eq(homeworkSnapshots.prescriptionSetId, setA1));
    expect(snaps).toHaveLength(0);
    const ctx = await ctxFor(DR_KOBAYASHI, sessionId);
    const summary = await getPatientSummary(ctx);
    expect(summary.snapshotForThisSession).toBeNull();
    // T22: 他院からも患者保有の履歴（スコア・質問）は見える
    expect(summary.scores.overall.evaluated).toBe(2);
    await endConsultation(sessionId, uid(PATIENT_A));
  });

  it("T14/T15: 処方元病院の次回診察で一度だけスナップショット。再処方は進捗を引き継ぐ。後の再学習で不変", async () => {
    await sleep(10);
    const { sessionId: sessionA2 } = await startSession(seeded, PATIENT_A, DR_YAMADA, "sakura-general");
    const snaps = await getDb().select().from(homeworkSnapshots).where(eq(homeworkSnapshots.prescriptionSetId, setA1));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].consultationSessionId).toBe(sessionA2);
    expect(snaps[0].completedCount).toBe(2);
    expect(snaps[0].assignedCount).toBe(3);
    const snapScore = Number(snaps[0].homeworkScore);
    expect(snapScore).toBeCloseTo((100 + 200 / 3) / 2, 5);

    const ctx = await ctxFor(DR_YAMADA, sessionA2);
    const summary = await getPatientSummary(ctx);
    expect(summary.snapshotForThisSession?.setId).toBe(setA1);

    // T14: 再処方しても進捗・スコアは引き継がれる
    const set2 = await prescribe(ctx, [mat(M_SELFCARE), mat("放射線治療の進め方と皮膚のケア")]);
    expect(set2.setId).not.toBe(setA1);
    const hw = await listHomeworkForPatient(uid(PATIENT_A));
    const re = hw.find((s) => s.setId === set2.setId)!.items.find((i) => i.materialId === mat(M_SELFCARE))!;
    expect(re.phase).toBe("completed");
    expect(re.scorePct).toBe(100);

    // T15: 診察後の再学習でスナップショットは変わらない
    await answerPattern(uid(PATIENT_A), re.versionId, "wwww", true);
    const [after] = await computeMaterialScores(uid(PATIENT_A), [mat(M_SELFCARE)]);
    expect(after.scorePct).toBe(0);
    const [snapAfter] = await getDb().select().from(homeworkSnapshots).where(eq(homeworkSnapshots.prescriptionSetId, setA1));
    expect(Number(snapAfter.homeworkScore)).toBeCloseTo(snapScore, 5);
    await endConsultation(sessionA2, uid(PATIENT_A));

    // 次の診察では set2 のスナップショットができ、setA1 は重複作成されない（一意制約）
    await sleep(10);
    const { sessionId: sessionA3 } = await startSession(seeded, PATIENT_A, DR_YAMADA, "sakura-general");
    const all = await getDb().select().from(homeworkSnapshots);
    expect(all.filter((s) => s.prescriptionSetId === setA1)).toHaveLength(1);
    expect(all.filter((s) => s.prescriptionSetId === set2.setId)).toHaveLength(1);
    await endConsultation(sessionA3, uid(PATIENT_A));
  });
});

describe("版・安全上の無効化・集計フラグ（D27, T18）", () => {
  it("実質改訂で新版未評価のときは旧版スコアをバッジ付きで平均に含め、フラグで除外にも切替できる", async () => {
    const materialId = mat(M_STAGE);
    const [m] = await getDb().select().from(materials).where(eq(materials.id, materialId));
    const [v2] = await getDb()
      .insert(materialVersions)
      .values({ materialId, versionNo: 2, status: "published", revisionClass: "substantive", createdByUserId: uid(DR_YAMADA), publishedAt: new Date(), approvedAt: new Date(), approvedByUserId: uid(DR_YAMADA) })
      .returning({ id: materialVersions.id });
    await getDb().update(materials).set({ currentPublishedVersionId: v2.id }).where(eq(materials.id, materialId));
    try {
      let [s] = await computeMaterialScores(uid(PATIENT_A), [materialId]);
      expect(s.isOldVersion).toBe(true);
      expect(s.oldVersionScorePct).toBeCloseTo(200 / 3, 5);
      expect(s.scorePct).toBeCloseTo(200 / 3, 5);
      await getDb().insert(systemSettings).values({ key: "scoring.includeOldVersionInAverage", value: false });
      [s] = await computeMaterialScores(uid(PATIENT_A), [materialId]);
      expect(s.scorePct).toBeNull();
      expect(s.oldVersionScorePct).toBeCloseTo(200 / 3, 5);
    } finally {
      await getDb().delete(systemSettings).where(eq(systemSettings.key, "scoring.includeOldVersionInAverage"));
      await getDb().update(materials).set({ currentPublishedVersionId: m.currentPublishedVersionId }).where(eq(materials.id, materialId));
      await getDb().delete(materialVersions).where(eq(materialVersions.id, v2.id));
    }
  });

  it("安全上の理由で無効化した版の結果は現在のスコアから除外される", async () => {
    const materialId = mat(M_STAGE);
    const [m] = await getDb().select().from(materials).where(eq(materials.id, materialId));
    await getDb().update(materialVersions).set({ retireReason: "safety" }).where(eq(materialVersions.id, m.currentPublishedVersionId!));
    try {
      const [s] = await computeMaterialScores(uid(PATIENT_A), [materialId]);
      expect(s.scorePct).toBeNull();
      expect(s.attemptId).toBeNull();
    } finally {
      await getDb().update(materialVersions).set({ retireReason: null }).where(eq(materialVersions.id, m.currentPublishedVersionId!));
    }
  });
});
