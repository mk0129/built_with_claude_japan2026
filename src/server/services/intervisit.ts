import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import {
  consultationSessions,
  learningProgress,
  materialVersions,
  materials,
  organizationMembers,
  prescriptionItems,
  prescriptionSets,
  quizAnswers,
  quizAttempts,
  quizQuestions,
} from "@/server/db/schema";
import { badRequest } from "@/server/authz/errors";
import { demoNow } from "@/server/demo";
import { listHealthRecords } from "./health";
import { listVisitNotes } from "./notes";
import { listFeedbackForPatient } from "./questions";
import { fmtDate, fmtDateTime, localDay, severityLabelOf, TZ } from "./intervisit-format";

/**
 * 外来間の構造化データ（Phase 2 Step 4-B）。選んだ期間の体調記録・学習・理解確認・質問をサーバー側で統合する。
 * - すべての出来事に安定した ID（元の表と行 ID から作る）を付け、元データへたどれるようにする。
 * - 日時は Asia/Tokyo で日付に区切る。同じ日の出来事は時刻順（同時刻は ID 順）。
 * - 欠測は欠測のまま（「症状なし」「正常」「改善」と解釈しない）。CTCAE Grade・因果関係・診断は扱わない。
 * - 前回外来日は DB にないため使わない。期間は医療者が選ぶ（既定は直近 14 日）。過去の共有日は「前回共有日」として別に返す。
 */
export const VITAL_KEYS = ["temperature", "systolic", "diastolic", "pulse", "spo2"] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];
export const VITAL_LABEL: Record<VitalKey, { label: string; unit: string }> = {
  temperature: { label: "体温", unit: "℃" },
  systolic: { label: "収縮期血圧", unit: "mmHg" },
  diastolic: { label: "拡張期血圧", unit: "mmHg" },
  pulse: { label: "脈拍", unit: "回/分" },
  spo2: { label: "SpO₂", unit: "%" },
};

export type SourceRef = { table: string; id: string };
export type IntervisitEvent = {
  /** 安定した ID（例 hr:<記録 ID>、hs:<記録 ID>:<症状>、qa:<回答 ID>、vn:<質問 ID>） */
  id: string;
  kind: "vital" | "symptom" | "prescription" | "learning_start" | "learning_complete" | "answer" | "note" | "feedback";
  at: string;
  day: string;
  /** 画面・要約用の短い説明（元データの値だけで作る） */
  label: string;
  ref: SourceRef;
  data: Record<string, unknown>;
};

export type Intervisit = Awaited<ReturnType<typeof buildIntervisit>>;

const DAY = 24 * 60 * 60 * 1000;
/** "YYYY-MM-DD"（日本時間）→ その日の 0:00 / 23:59:59.999 の Date */
const dayStart = (d: string) => new Date(`${d}T00:00:00+09:00`);
const dayEnd = (d: string) => new Date(dayStart(d).getTime() + DAY - 1);
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(dayStart(d).getTime());

export function resolvePeriod(from?: string | null, to?: string | null, now = demoNow()) {
  const today = localDay(now);
  const end = to && isDay(to) ? to : today;
  const start = from && isDay(from) ? from : localDay(new Date(dayStart(end).getTime() - 13 * DAY));
  if (start > end) throw badRequest("INVALID_PERIOD", "開始日は終了日より前にしてください");
  if (end > today) throw badRequest("INVALID_PERIOD", "未来の日付は選べません");
  const days = Math.round((dayStart(end).getTime() - dayStart(start).getTime()) / DAY) + 1;
  if (days > 92) throw badRequest("INVALID_PERIOD", "期間は 92 日までです");
  return { from: start, to: end, days, isDefault: !from && !to, fromAt: dayStart(start), toAt: dayEnd(end) };
}

const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = dayStart(from).getTime(); t <= dayStart(to).getTime(); t += DAY) out.push(localDay(new Date(t)));
  return out;
};

export async function buildIntervisit(
  input: { patientId: string; sessionId?: string; from?: string | null; to?: string | null },
  db: Db = getDb(),
) {
  const period = resolvePeriod(input.from, input.to);
  const range = { from: period.fromAt, to: period.toAt };
  const events: IntervisitEvent[] = [];

  // ---------- A. バイタル・B. 自覚症状 ----------
  const records = (await listHealthRecords(input.patientId, range, db)).sort(
    (a, b) => a.measuredAt.getTime() - b.measuredAt.getTime() || a.id.localeCompare(b.id),
  );
  // 期間より前の症状記録（「新たに記録された症状」の判定用。期間前に一度も記録がない症状）
  const before = await listHealthRecords(input.patientId, { to: new Date(period.fromAt.getTime() - 1) }, db);
  const seenBefore = new Set(before.flatMap((r) => r.symptoms.map((s) => s.key)));

  const vitals = Object.fromEntries(
    VITAL_KEYS.map((k) => {
      const values = records
        .filter((r) => r.vitals[k] != null)
        .map((r) => ({ at: r.measuredAt.toISOString(), value: r.vitals[k] as number, sourceId: `hr:${r.id}` }));
      const min = values.reduce<(typeof values)[number] | null>((m, v) => (!m || v.value < m.value ? v : m), null);
      const max = values.reduce<(typeof values)[number] | null>((m, v) => (!m || v.value > m.value ? v : m), null);
      const measuredDays = new Set(values.map((v) => localDay(new Date(v.at))));
      return [k, { ...VITAL_LABEL[k], count: values.length, measuredDays: measuredDays.size, min, max, values }];
    }),
  ) as Record<VitalKey, { label: string; unit: string; count: number; measuredDays: number; min: { at: string; value: number; sourceId: string } | null; max: { at: string; value: number; sourceId: string } | null; values: { at: string; value: number; sourceId: string }[] }>;

  const allDays = daysBetween(period.from, period.to);
  const recordDays = new Set(records.map((r) => localDay(r.measuredAt)));
  for (const r of records) {
    const vs = VITAL_KEYS.filter((k) => r.vitals[k] != null);
    if (vs.length)
      events.push({
        id: `hr:${r.id}`,
        kind: "vital",
        at: r.measuredAt.toISOString(),
        day: localDay(r.measuredAt),
        label: vs.map((k) => `${VITAL_LABEL[k].label} ${r.vitals[k]}${VITAL_LABEL[k].unit}`).join("、"),
        ref: { table: "health_records", id: r.id },
        data: { vitals: Object.fromEntries(vs.map((k) => [k, r.vitals[k]])), missing: VITAL_KEYS.filter((k) => r.vitals[k] == null) },
      });
    for (const s of r.symptoms)
      events.push({
        id: `hs:${r.id}:${s.key}`,
        kind: "symptom",
        at: r.measuredAt.toISOString(),
        day: localDay(r.measuredAt),
        label: `${s.name} ${s.severity}/4（${severityLabelOf(s.severity)}）`,
        ref: { table: "health_symptom_entries", id: `${r.id}:${s.key}` },
        data: { key: s.key, name: s.name, severity: s.severity, count: s.count, location: s.location, interference: s.interference },
      });
  }

  const symptomKeys = [...new Set(records.flatMap((r) => r.symptoms.map((s) => s.key)))];
  const lastRecordDay = records.length ? localDay(records[records.length - 1].measuredAt) : null;
  const symptoms = symptomKeys.map((key) => {
    const entries = records
      .filter((r) => r.symptoms.some((s) => s.key === key))
      .map((r) => {
        const s = r.symptoms.find((x) => x.key === key)!;
        return { at: r.measuredAt.toISOString(), day: localDay(r.measuredAt), severity: s.severity, sourceId: `hs:${r.id}:${key}`, location: s.location, count: s.count, interference: s.interference };
      });
    const name = records.flatMap((r) => r.symptoms).find((s) => s.key === key)!.name;
    const sev = entries.map((e) => e.severity);
    const last = entries[entries.length - 1];
    // 記録が途切れた: この症状の最後の回答より後にも体調記録があるのに、その後は回答がない（欠測。症状がなくなったとは解釈しない）
    const laterRecords = records.filter((r) => r.measuredAt.toISOString() > last.at);
    return {
      key,
      name,
      entries,
      count: entries.length,
      min: Math.min(...sev),
      max: Math.max(...sev),
      first: entries[0],
      last,
      // 期間より前に体調記録があり、その中にこの症状がない場合だけ「新たに記録された」とする（記録自体が期間内に始まった場合は判定しない）
      newInPeriod: before.length > 0 && !seenBefore.has(key),
      changed: new Set(sev).size > 1,
      unansweredAfterLast: laterRecords.length,
      stoppedRecording: laterRecords.length > 0 && last.day !== lastRecordDay,
    };
  });

  // ---------- C. 学習 ----------
  const rx = await db
    .select({
      itemId: prescriptionItems.id,
      materialId: prescriptionItems.materialId,
      versionId: prescriptionItems.materialVersionId,
      versionNo: materialVersions.versionNo,
      title: materials.title,
      prescribedAt: prescriptionItems.prescribedAt,
      prescribedBy: organizationMembers.displayName,
    })
    .from(prescriptionItems)
    .innerJoin(prescriptionSets, eq(prescriptionSets.id, prescriptionItems.setId))
    .innerJoin(materials, eq(materials.id, prescriptionItems.materialId))
    .innerJoin(materialVersions, eq(materialVersions.id, prescriptionItems.materialVersionId))
    .leftJoin(organizationMembers, and(eq(organizationMembers.orgId, prescriptionSets.orgId), eq(organizationMembers.userId, prescriptionItems.prescribedByUserId)))
    .where(eq(prescriptionSets.patientId, input.patientId))
    .orderBy(asc(prescriptionItems.prescribedAt));
  const progress = await db
    .select({
      id: learningProgress.id,
      versionId: learningProgress.materialVersionId,
      phase: learningProgress.phase,
      lastSlideSeq: learningProgress.lastSlideSeq,
      startedAt: learningProgress.startedAt,
      updatedAt: learningProgress.updatedAt,
      materialId: materialVersions.materialId,
      versionNo: materialVersions.versionNo,
      title: materials.title,
    })
    .from(learningProgress)
    .innerJoin(materialVersions, eq(materialVersions.id, learningProgress.materialVersionId))
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(learningProgress.patientId, input.patientId));
  const attempts = await db
    .select({
      id: quizAttempts.id,
      versionId: quizAttempts.materialVersionId,
      startedAt: quizAttempts.startedAt,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.patientId, input.patientId))
    .orderBy(desc(quizAttempts.startedAt));
  const answers = attempts.length
    ? await db
        .select({
          id: quizAnswers.id,
          attemptId: quizAnswers.attemptId,
          questionId: quizAnswers.questionId,
          isUnknown: quizAnswers.isUnknown,
          isCorrect: quizAnswers.isCorrect,
          selectedIndex: quizAnswers.selectedIndex,
          answeredAt: quizAnswers.answeredAt,
          stem: quizQuestions.stem,
          options: quizQuestions.options,
          correctIndex: quizQuestions.correctIndex,
          seq: quizQuestions.seq,
        })
        .from(quizAnswers)
        .innerJoin(quizQuestions, eq(quizQuestions.id, quizAnswers.questionId))
        .where(and(inArray(quizAnswers.attemptId, attempts.map((a) => a.id)), gte(quizAnswers.answeredAt, range.from), lte(quizAnswers.answeredAt, range.to)))
        .orderBy(asc(quizAnswers.answeredAt), asc(quizAnswers.id))
    : [];
  const versionInfo = new Map<string, { materialId: string; title: string; versionNo: number }>();
  for (const r of rx) versionInfo.set(r.versionId, { materialId: r.materialId, title: r.title, versionNo: r.versionNo });
  for (const p of progress) versionInfo.set(p.versionId, { materialId: p.materialId, title: p.title, versionNo: p.versionNo });
  const missingVersions = [...new Set(attempts.map((a) => a.versionId))].filter((v) => !versionInfo.has(v));
  if (missingVersions.length) {
    const rows = await db
      .select({ id: materialVersions.id, materialId: materials.id, title: materials.title, versionNo: materialVersions.versionNo })
      .from(materialVersions)
      .innerJoin(materials, eq(materials.id, materialVersions.materialId))
      .where(inArray(materialVersions.id, missingVersions));
    for (const r of rows) versionInfo.set(r.id, { materialId: r.materialId, title: r.title, versionNo: r.versionNo });
  }
  const attemptVersion = new Map(attempts.map((a) => [a.id, a.versionId]));
  const inRange = (d: Date | null) => !!d && d >= range.from && d <= range.to;

  for (const r of rx.filter((x) => inRange(x.prescribedAt)))
    events.push({
      id: `rx:${r.itemId}`,
      kind: "prescription",
      at: r.prescribedAt.toISOString(),
      day: localDay(r.prescribedAt),
      label: `処方：「${r.title}」（第${r.versionNo}版）`,
      ref: { table: "prescription_items", id: r.itemId },
      data: { materialId: r.materialId, versionId: r.versionId, versionNo: r.versionNo, title: r.title, prescribedBy: r.prescribedBy },
    });
  for (const p of progress.filter((x) => inRange(x.startedAt)))
    events.push({
      id: `lp:${p.id}:start`,
      kind: "learning_start",
      at: p.startedAt!.toISOString(),
      day: localDay(p.startedAt!),
      label: `学習開始：「${p.title}」`,
      ref: { table: "learning_progress", id: p.id },
      data: { materialId: p.materialId, versionId: p.versionId, versionNo: p.versionNo, title: p.title },
    });
  for (const a of attempts.filter((x) => inRange(x.completedAt))) {
    const v = versionInfo.get(a.versionId);
    events.push({
      id: `at:${a.id}:complete`,
      kind: "learning_complete",
      at: a.completedAt!.toISOString(),
      day: localDay(a.completedAt!),
      label: `学習完了（理解確認まで）：「${v?.title ?? "教材"}」`,
      ref: { table: "quiz_attempts", id: a.id },
      data: { materialId: v?.materialId, versionId: a.versionId, versionNo: v?.versionNo, title: v?.title },
    });
  }
  for (const a of answers) {
    const v = versionInfo.get(attemptVersion.get(a.attemptId)!);
    const result = a.isUnknown ? "わからない" : a.isCorrect ? "正答" : "誤答";
    events.push({
      id: `qa:${a.id}`,
      kind: "answer",
      at: a.answeredAt.toISOString(),
      day: localDay(a.answeredAt),
      label: `理解確認（${result}）：「${a.stem}」`,
      ref: { table: "quiz_answers", id: a.id },
      data: {
        result,
        stem: a.stem,
        selected: a.selectedIndex == null ? null : a.options[a.selectedIndex],
        correct: a.options[a.correctIndex],
        materialId: v?.materialId,
        title: v?.title,
        versionNo: v?.versionNo,
        questionId: a.questionId,
      },
    });
  }
  const learning = [...new Set([...rx.map((r) => r.versionId), ...progress.map((p) => p.versionId)])].map((versionId) => {
    const v = versionInfo.get(versionId)!;
    const r = [...rx].reverse().find((x) => x.versionId === versionId);
    const p = progress.find((x) => x.versionId === versionId);
    const done = attempts.find((a) => a.versionId === versionId && a.completedAt);
    const ans = answers.filter((a) => attemptVersion.get(a.attemptId) === versionId);
    return {
      materialId: v.materialId,
      versionId,
      title: v.title,
      versionNo: v.versionNo,
      prescribedAt: r?.prescribedAt.toISOString() ?? null,
      prescriptionSourceId: r ? `rx:${r.itemId}` : null,
      startedAt: p?.startedAt?.toISOString() ?? null,
      completedAt: done?.completedAt?.toISOString() ?? null,
      status: done ? "完了" : p && p.phase !== "not_started" ? "学習途中" : "未学習",
      answersInPeriod: ans.map((a) => ({ sourceId: `qa:${a.id}`, result: a.isUnknown ? "わからない" : a.isCorrect ? "正答" : "誤答", stem: a.stem, at: a.answeredAt.toISOString() })),
    };
  });

  // ---------- D. 質問 ----------
  const notes = (await listVisitNotes(input.patientId, db)).filter((n) => inRange(n.createdAt) || inRange(n.updatedAt));
  const feedback = (await listFeedbackForPatient(input.patientId, db)).filter((f) => inRange(f.createdAt) && (f.freeText || f.selection === "have_question" || f.selection === "explain_again"));
  const questions = [
    ...notes.map((n) => ({
      sourceId: `vn:${n.id}`,
      kind: "診察ノート" as const,
      body: n.body,
      /** 患者の入力の種類（自由記述 / 選んだ回答）。body は要約・検証で使うため変えない */
      input: "free_text" as "free_text" | "selection",
      selection: null as "have_question" | "explain_again" | null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      materialTitle: n.materialTitle,
    })),
    ...feedback.map((f) => ({
      sourceId: `fb:${f.feedbackId}`,
      kind: "学習後の質問" as const,
      body: f.freeText ?? (f.selection === "explain_again" ? "（自由記述なし）もう一度説明してほしい" : "（自由記述なし）質問がある"),
      input: (f.freeText ? "free_text" : "selection") as "free_text" | "selection",
      selection: f.freeText ? null : ((f.selection === "explain_again" ? "explain_again" : "have_question") as "have_question" | "explain_again"),
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.createdAt.toISOString(),
      materialTitle: f.materialTitle,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const q of questions)
    events.push({
      id: q.sourceId,
      kind: q.kind === "診察ノート" ? "note" : "feedback",
      at: q.createdAt,
      day: localDay(new Date(q.createdAt)),
      label: `質問（${q.kind}）：「${q.body}」`,
      ref: { table: q.kind === "診察ノート" ? "visit_notes" : "patient_feedback", id: q.sourceId.slice(3) },
      data: { body: q.body, materialTitle: q.materialTitle, updatedAt: q.updatedAt },
    });

  events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  // 前回の共有日（前回外来日ではない。表示上は「前回共有日」と明記する）
  const prevShare = input.sessionId
    ? (
        await db
          .select({ startedAt: consultationSessions.startedAt })
          .from(consultationSessions)
          .where(and(eq(consultationSessions.patientId, input.patientId), ne(consultationSessions.id, input.sessionId)))
          .orderBy(desc(consultationSessions.startedAt))
          .limit(1)
      )[0]?.startedAt ?? null
    : null;

  return {
    timezone: TZ,
    period: { from: period.from, to: period.to, days: period.days, isDefault: period.isDefault, label: period.isDefault ? "直近14日間" : "指定期間" },
    previousShareAt: prevShare ? prevShare.toISOString() : null,
    vitals: { recordCount: records.length, recordDays: recordDays.size, totalDays: allDays.length, missingDays: allDays.filter((d) => !recordDays.has(d)), metrics: vitals },
    symptoms,
    learning,
    questions,
    events,
    generatedAt: new Date().toISOString(),
    fmt: { from: fmtDate(period.fromAt), to: fmtDate(period.toAt) },
  };
}

export { fmtDateTime };
