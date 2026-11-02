import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { consultationExtensions, consultationSessions, organizationMembers, organizations, user } from "@/server/db/schema";
import { conflict, forbidden, notFound } from "@/server/authz/errors";
import { isSessionActive, type ConsultationContext } from "@/server/authz/consultation";
import { audit } from "./audit";
import { CONSULTATION_TTL_MS } from "./qr";

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

/** 患者の現在有効なセッション一覧（共有画面・履歴用） */
export async function listPatientSessions(patientId: string, db: Db = getDb()) {
  const rows = await db
    .select({
      id: consultationSessions.id,
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
 * 医療者が診察セッション内で見る患者サマリ。
 * ConsultationContext を要求するので、有効セッションなしには呼べない。
 * Day2 で質問・誤答・未完了教材を追加する。
 */
export async function getPatientSummary(ctx: ConsultationContext, db: Db = getDb()) {
  const [u] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, ctx.patientId)).limit(1);
  if (!u) throw notFound("PATIENT_NOT_FOUND");
  const sessions = await listPatientSessions(ctx.patientId, db);
  await audit({ actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.summary.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" }, db);
  return {
    patient: { id: u.id, displayName: u.name },
    consultationCount: sessions.length,
    previousConsultations: sessions.filter((s) => s.id !== ctx.sessionId).slice(0, 5),
    // Day2: unreadQuestions, wrongAnswers, incompleteMaterials, scores
    unreadQuestions: [] as unknown[],
    wrongAnswers: [] as unknown[],
    incompleteMaterials: [] as unknown[],
  };
}
