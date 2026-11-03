import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { consultationExtensions, consultationSessions, homeworkSnapshots, organizationMembers, organizations, prescriptionSets, user } from "@/server/db/schema";
import { conflict, forbidden, notFound } from "@/server/authz/errors";
import { isSessionActive, type ConsultationContext } from "@/server/authz/consultation";
import { audit } from "./audit";
import { getPatientLibrary, learnedItems } from "./library";
import { CONSULTATION_TTL_MS } from "./qr";
import { listHomeworkForPatient, getSetForSession } from "./prescription";
import { computeHomeworkScore, computeScoreSummary } from "./scoring";
import { listMissedQuestions } from "./learning";
import { listQuestionsForClinician } from "./questions";

export type ConsultationView = {
  id: string;
  orgId: string;
  orgName: string;
  clinicianName: string;
  startedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
  endedBy: "patient" | "clinician" | "system" | null;
  active: boolean;
  remainingSec: number;
  pendingExtension: { id: string; requestedAt: Date } | null;
};

async function loadView(sessionId: string, db: Db): Promise<(ConsultationView & { patientId: string; clinicianId: string }) | null> {
  const [s] = await db
    .select({
      id: consultationSessions.id,
      patientId: consultationSessions.patientId,
      clinicianId: consultationSessions.clinicianId,
      orgId: consultationSessions.orgId,
      orgName: organizations.name,
      startedAt: consultationSessions.startedAt,
      expiresAt: consultationSessions.expiresAt,
      endedAt: consultationSessions.endedAt,
      endedBy: consultationSessions.endedBy,
    })
    .from(consultationSessions)
    .innerJoin(organizations, eq(organizations.id, consultationSessions.orgId))
    .where(eq(consultationSessions.id, sessionId))
    .limit(1);
  if (!s) return null;
  const [m] = await db
    .select({ displayName: organizationMembers.displayName })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, s.orgId), eq(organizationMembers.userId, s.clinicianId)))
    .limit(1);
  const [ext] = await db
    .select({ id: consultationExtensions.id, requestedAt: consultationExtensions.requestedAt })
    .from(consultationExtensions)
    .where(and(eq(consultationExtensions.sessionId, s.id), isNull(consultationExtensions.approvedAt), isNull(consultationExtensions.deniedAt)))
    .orderBy(desc(consultationExtensions.requestedAt))
    .limit(1);
  const active = isSessionActive(s);
  return {
    ...s,
    clinicianName: m?.displayName ?? "医療者",
    active,
    remainingSec: active ? Math.max(0, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)) : 0,
    pendingExtension: ext ?? null,
  };
}

/** 当事者（患者本人 or 担当医療者）だけがセッション状態を見られる */
export async function getConsultationForParty(sessionId: string, userId: string, db: Db = getDb()): Promise<ConsultationView> {
  const v = await loadView(sessionId, db);
  if (!v || (v.patientId !== userId && v.clinicianId !== userId)) throw notFound("SESSION_NOT_FOUND");
  const { patientId: _p, clinicianId: _c, ...view } = v;
  void _p;
  void _c;
  return view;
}

/** 患者のセッション一覧（共有画面・履歴用） */
export async function listPatientSessions(patientId: string, db: Db = getDb()) {
  const rows = await db
    .select({
      id: consultationSessions.id,
      orgId: consultationSessions.orgId,
      orgName: organizations.name,
      startedAt: consultationSessions.startedAt,
      expiresAt: consultationSessions.expiresAt,
      endedAt: consultationSessions.endedAt,
      endedBy: consultationSessions.endedBy,
    })
    .from(consultationSessions)
    .innerJoin(organizations, eq(organizations.id, consultationSessions.orgId))
    .where(eq(consultationSessions.patientId, patientId))
    .orderBy(desc(consultationSessions.startedAt))
    .limit(20);
  return rows.map((r) => ({ ...r, active: isSessionActive(r) }));
}

/** 患者・医療者どちらからでも即時終了できる（AUTH-05） */
export async function endConsultation(sessionId: string, userId: string, db: Db = getDb()) {
  const v = await loadView(sessionId, db);
  if (!v) throw notFound("SESSION_NOT_FOUND");
  const by = v.patientId === userId ? "patient" : v.clinicianId === userId ? "clinician" : null;
  if (!by) throw forbidden("NOT_PARTY");
  if (!v.active) return { alreadyEnded: true };
  await db
    .update(consultationSessions)
    .set({ endedAt: new Date(), endedBy: by })
    .where(and(eq(consultationSessions.id, sessionId), isNull(consultationSessions.endedAt)));
  await audit({ actorUserId: userId, orgId: v.orgId, action: `consultation.end.${by}`, resourceType: "consultation_session", resourceId: sessionId, consultationSessionId: sessionId, outcome: "ok" }, db);
  return { alreadyEnded: false };
}

/** 医療者が延長を要求。患者の再承認まで期限は変わらない */
export async function requestExtension(ctx: ConsultationContext, db: Db = getDb()) {
  const existing = await db
    .select({ id: consultationExtensions.id })
    .from(consultationExtensions)
    .where(and(eq(consultationExtensions.sessionId, ctx.sessionId), isNull(consultationExtensions.approvedAt), isNull(consultationExtensions.deniedAt)))
    .limit(1);
  if (existing.length) return { extensionId: existing[0].id, duplicate: true };
  const [row] = await db
    .insert(consultationExtensions)
    .values({ sessionId: ctx.sessionId, requestedByUserId: ctx.clinician.userId })
    .returning({ id: consultationExtensions.id });
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "consultation.extend.request", resourceType: "consultation_session", resourceId: ctx.sessionId, consultationSessionId: ctx.sessionId, outcome: "ok" }, db);
  return { extensionId: row.id, duplicate: false };
}

/** 患者が延長を承認 → 現在時刻から 60 分に延長。拒否も可 */
export async function decideExtension(sessionId: string, patientId: string, approve: boolean, db: Db = getDb()) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(consultationSessions).where(eq(consultationSessions.id, sessionId)).for("update").limit(1);
    if (!s || s.patientId !== patientId) throw notFound("SESSION_NOT_FOUND");
    if (!isSessionActive(s)) throw conflict("SESSION_NOT_ACTIVE");
    const [ext] = await tx
      .select()
      .from(consultationExtensions)
      .where(and(eq(consultationExtensions.sessionId, sessionId), isNull(consultationExtensions.approvedAt), isNull(consultationExtensions.deniedAt)))
      .orderBy(desc(consultationExtensions.requestedAt))
      .limit(1);
    if (!ext) throw notFound("NO_PENDING_EXTENSION");
    const now = new Date();
    if (approve) {
      const newExpiresAt = new Date(now.getTime() + CONSULTATION_TTL_MS);
      await tx.update(consultationExtensions).set({ approvedAt: now, newExpiresAt }).where(eq(consultationExtensions.id, ext.id));
      await tx.update(consultationSessions).set({ expiresAt: newExpiresAt }).where(eq(consultationSessions.id, sessionId));
    } else {
      await tx.update(consultationExtensions).set({ deniedAt: now }).where(eq(consultationExtensions.id, ext.id));
    }
    await audit(
      { actorUserId: patientId, orgId: s.orgId, action: approve ? "consultation.extend.approve" : "consultation.extend.deny", resourceType: "consultation_session", resourceId: sessionId, consultationSessionId: sessionId, outcome: "ok" },
      tx as unknown as Db,
    );
    return { approved: approve };
  });
}

/**
 * 医療者ダッシュボード（C-03, QNA-05, T17）。
 * ConsultationContext を要求するので、有効セッションなしには呼べない。
 * 優先順: 未確認の質問 → 誤答・わからない → 未完了教材 → スコア / スナップショット
 */
export async function getPatientSummary(ctx: ConsultationContext, db: Db = getDb()) {
  const [u] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, ctx.patientId)).limit(1);
  if (!u) throw notFound("PATIENT_NOT_FOUND");
  const sessions = await listPatientSessions(ctx.patientId, db);
  const questions = await listQuestionsForClinician(ctx, db);
  const summary = await computeScoreSummary(ctx.patientId, db);
  const homework = await listHomeworkForPatient(ctx.patientId, db);

  const missed = [];
  for (const m of summary.materials) {
    if (!m.attemptId || m.nWrong + m.nUnknown === 0) continue;
    missed.push({
      materialId: m.materialId,
      title: m.title,
      attemptId: m.attemptId,
      completedAt: m.completedAt,
      isOldVersion: m.isOldVersion,
      nWrong: m.nWrong,
      nUnknown: m.nUnknown,
      questions: await listMissedQuestions(m.attemptId, db),
    });
  }

  const seen = new Set<string>();
  const incompleteMaterials = homework
    .flatMap((set) => set.items.map((i) => ({ ...i, setId: set.setId, orgName: set.orgName, setCreatedAt: set.createdAt })))
    .filter((i) => i.phase !== "completed" && !seen.has(i.materialId) && seen.add(i.materialId))
    .map((i) => ({ materialId: i.materialId, versionId: i.versionId, title: i.title, phase: i.phase, lastSlideSeq: i.lastSlideSeq, orgName: i.orgName, setCreatedAt: i.setCreatedAt }));

  // この診察で確定したスナップショットがあればそれを、なければ当院の宿題で最後に確定したものを「前回の宿題」として表示する
  // （確定は処方元病院の次回診察で一度だけ。表示だけのフォールバックで、値は不変）
  let snaps = await db.select().from(homeworkSnapshots).where(eq(homeworkSnapshots.consultationSessionId, ctx.sessionId)).limit(1);
  if (snaps.length === 0) {
    snaps = await db
      .select({ hs: homeworkSnapshots })
      .from(homeworkSnapshots)
      .innerJoin(prescriptionSets, eq(prescriptionSets.id, homeworkSnapshots.prescriptionSetId))
      .where(and(eq(prescriptionSets.patientId, ctx.patientId), eq(prescriptionSets.orgId, ctx.orgId)))
      .orderBy(desc(homeworkSnapshots.capturedAt))
      .limit(1)
      .then((rows) => rows.map((r) => r.hs));
  }
  const homeworkScores = [];
  for (const set of homework) {
    const hs = await computeHomeworkScore(set.setId, ctx.patientId, db);
    const [snap] = await db.select().from(homeworkSnapshots).where(eq(homeworkSnapshots.prescriptionSetId, set.setId)).limit(1);
    homeworkScores.push({
      setId: set.setId,
      orgName: set.orgName,
      createdAt: set.createdAt,
      score: hs.score,
      completedCount: hs.completedCount,
      assignedCount: hs.assignedCount,
      snapshot: snap
        ? { capturedAt: snap.capturedAt, score: snap.homeworkScore === null ? null : Number(snap.homeworkScore), completedCount: snap.completedCount, assignedCount: snap.assignedCount, items: snap.itemDetails }
        : null,
    });
  }

  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.summary.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" }, db);
  return {
    patient: { id: u.id, displayName: u.name },
    consultationCount: sessions.length,
    previousConsultations: sessions.filter((s) => s.id !== ctx.sessionId).slice(0, 5),
    unreadQuestions: questions.filter((q) => q.status === "unread"),
    questions,
    missed,
    incompleteMaterials,
    scores: { overall: summary.overall, byDomain: summary.byDomain, materials: summary.materials },
    homework: homeworkScores,
    snapshotForThisSession: snaps[0]
      ? {
          capturedAt: snaps[0].capturedAt,
          capturedInThisSession: snaps[0].consultationSessionId === ctx.sessionId,
          score: snaps[0].homeworkScore === null ? null : Number(snaps[0].homeworkScore),
          completedCount: snaps[0].completedCount,
          assignedCount: snaps[0].assignedCount,
          items: snaps[0].itemDetails,
          setId: snaps[0].prescriptionSetId,
        }
      : null,
    currentSet: await getSetForSession(ctx, db),
    // Phase E: 領域ごとの理解の地図に使う、処方・自主学習した教材の一覧（状態と 3 段階）
    learning: learnedItems((await getPatientLibrary(ctx.patientId, db)).items).map((i) => ({
      materialId: i.materialId,
      title: i.title,
      primaryDomain: i.primaryDomain,
      phase: i.phase,
      lastSlideSeq: i.lastSlideSeq,
      slideCount: i.slideCount,
      level: i.level,
      prescribed: !!i.prescribed,
      prescribedAt: i.prescribed?.createdAt ?? null,
      prescribedOrgName: i.prescribed?.orgName ?? null,
      selfLearning: i.selfLearning,
      nWrong: i.nWrong,
      nUnknown: i.nUnknown,
    })),
  };
}

export type PatientSummary = Awaited<ReturnType<typeof getPatientSummary>>;
