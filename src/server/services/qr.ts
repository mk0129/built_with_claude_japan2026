import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { consultationSessions, organizationMembers, organizations, qrGrants } from "@/server/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/server/authz/errors";
import { requireOrgRole } from "@/server/authz/principal";
import { audit } from "./audit";
import { onConsultationStarted } from "./consultation-hooks";

export const QR_TTL_MS = 5 * 60 * 1000;
export const CONSULTATION_TTL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 患者が QR を発行。生トークンは返すだけで保存しない（AUTH-03） */
export async function createGrant(patientId: string, db: Db = getDb()) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + QR_TTL_MS);
  // 発行中の古い pending グラントは失効させる（患者1人につき有効QRは1つ）
  await db
    .update(qrGrants)
    .set({ decision: "expired", decidedAt: new Date() })
    .where(and(eq(qrGrants.patientId, patientId), eq(qrGrants.decision, "pending")));

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(qrGrants)
        .values({ patientId, tokenHash: hashToken(token), code: newCode(), expiresAt })
        .returning({ id: qrGrants.id, code: qrGrants.code, expiresAt: qrGrants.expiresAt });
      await audit({ actorUserId: patientId, action: "qr.create", resourceType: "qr_grant", resourceId: row.id, outcome: "ok" }, db);
      return { grantId: row.id, token, code: row.code, expiresAt: row.expiresAt };
    } catch (e) {
      // 6桁コードの衝突（pending 内一意）のみ再試行
      if (attempt === 4 || !String(e).includes("qr_grants_code_pending_uq")) throw e;
    }
  }
  throw conflict("CODE_COLLISION");
}

/**
 * 医療者が QR トークンまたは 6 桁コードで読み取りを要求する。
 * 1 グラントにつき要求者は 1 人（AUTH-09）。原子的 UPDATE で確定する。
 * 患者情報は一切返さない（承認前）。
 */
export async function claimGrant(
  input: { token?: string; code?: string; staffUserId: string; orgId: string },
  db: Db = getDb(),
) {
  const membership = await requireOrgRole(input.staffUserId, input.orgId, "clinician");
  const now = new Date();
  const where = input.token
    ? eq(qrGrants.tokenHash, hashToken(input.token))
    : input.code
      ? eq(qrGrants.code, input.code.replace(/\D/g, ""))
      : null;
  if (!where) throw badRequest("TOKEN_OR_CODE_REQUIRED");

  const [row] = await db
    .update(qrGrants)
    .set({ claimedByUserId: input.staffUserId, claimedOrgId: input.orgId, claimedAt: now })
    .where(and(where, eq(qrGrants.decision, "pending"), isNull(qrGrants.claimedByUserId), gt(qrGrants.expiresAt, now)))
    .returning({ id: qrGrants.id, expiresAt: qrGrants.expiresAt });

  if (!row) {
    await audit({ actorUserId: input.staffUserId, orgId: input.orgId, action: "qr.claim", resourceType: "qr_grant", outcome: "denied" }, db);
    throw notFound("GRANT_INVALID_OR_USED");
  }
  await audit({ actorUserId: input.staffUserId, orgId: input.orgId, action: "qr.claim", resourceType: "qr_grant", resourceId: row.id, outcome: "ok" }, db);
  return { grantId: row.id, expiresAt: row.expiresAt, orgName: membership.orgName };
}

export type GrantStatus = {
  grantId: string;
  decision: "pending" | "approved" | "denied" | "expired";
  expiresAt: Date;
  claimed: null | { orgName: string; clinicianName: string; claimedAt: Date };
  consultationSessionId: string | null;
};

async function loadGrantStatus(grantId: string, db: Db): Promise<GrantStatus | null> {
  const [g] = await db.select().from(qrGrants).where(eq(qrGrants.id, grantId)).limit(1);
  if (!g) return null;
  let decision = g.decision;
  if (decision === "pending" && g.expiresAt.getTime() <= Date.now()) decision = "expired";
  let claimed: GrantStatus["claimed"] = null;
  if (g.claimedByUserId && g.claimedOrgId && g.claimedAt) {
    const [m] = await db
      .select({ orgName: organizations.name, clinicianName: organizationMembers.displayName })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
      .where(and(eq(organizationMembers.orgId, g.claimedOrgId), eq(organizationMembers.userId, g.claimedByUserId)))
      .limit(1);
    claimed = { orgName: m?.orgName ?? "不明な医療機関", clinicianName: m?.clinicianName ?? "不明な医療者", claimedAt: g.claimedAt };
  }
  return { grantId: g.id, decision, expiresAt: g.expiresAt, claimed, consultationSessionId: g.consultationSessionId };
}

/** 患者が自分のグラント状態を見る（承認ダイアログ用） */
export async function getGrantForPatient(grantId: string, patientId: string, db: Db = getDb()): Promise<GrantStatus> {
  const [g] = await db.select({ patientId: qrGrants.patientId }).from(qrGrants).where(eq(qrGrants.id, grantId)).limit(1);
  if (!g || g.patientId !== patientId) throw notFound("GRANT_NOT_FOUND");
  const s = await loadGrantStatus(grantId, db);
  if (!s) throw notFound("GRANT_NOT_FOUND");
  return s;
}

/** 医療者が自分の要求したグラントの状態を見る。患者情報は含めない */
export async function getGrantForStaff(grantId: string, staffUserId: string, db: Db = getDb()) {
  const [g] = await db.select({ claimedBy: qrGrants.claimedByUserId }).from(qrGrants).where(eq(qrGrants.id, grantId)).limit(1);
  if (!g || g.claimedBy !== staffUserId) throw notFound("GRANT_NOT_FOUND");
  const s = await loadGrantStatus(grantId, db);
  if (!s) throw notFound("GRANT_NOT_FOUND");
  return { grantId: s.grantId, decision: s.decision, consultationSessionId: s.consultationSessionId };
}

/** 患者の最新グラント（共有画面の再表示用） */
export async function getLatestGrantForPatient(patientId: string, db: Db = getDb()): Promise<GrantStatus | null> {
  const [g] = await db
    .select({ id: qrGrants.id })
    .from(qrGrants)
    .where(eq(qrGrants.patientId, patientId))
    .orderBy(desc(qrGrants.createdAt))
    .limit(1);
  return g ? loadGrantStatus(g.id, db) : null;
}

/**
 * 患者の明示承認。トランザクション内で
 * 1) グラントが pending・claimed・期限内であることを再確認
 * 2) 60 分の診察セッションを作成
 * 3) グラントを approved にして消費
 * 4) 宿題スナップショットのフック（Day2 で実装）
 */
export async function approveGrant(grantId: string, patientId: string, db: Db = getDb()) {
  const now = new Date();
  const sessionId = await db.transaction(async (tx) => {
    const [g] = await tx.select().from(qrGrants).where(eq(qrGrants.id, grantId)).for("update").limit(1);
    if (!g || g.patientId !== patientId) throw notFound("GRANT_NOT_FOUND");
    if (g.decision !== "pending") throw conflict("GRANT_ALREADY_DECIDED");
    if (g.expiresAt.getTime() <= now.getTime()) throw conflict("GRANT_EXPIRED");
    if (!g.claimedByUserId || !g.claimedOrgId) throw conflict("GRANT_NOT_CLAIMED");

    const sid = await startConsultationSession(tx as unknown as Db, { patientId, clinicianId: g.claimedByUserId, orgId: g.claimedOrgId, qrGrantId: g.id, now });

    const updated = await tx
      .update(qrGrants)
      .set({ decision: "approved", decidedAt: now, consultationSessionId: sid })
      .where(and(eq(qrGrants.id, g.id), eq(qrGrants.decision, "pending")))
      .returning({ id: qrGrants.id });
    if (updated.length !== 1) throw conflict("GRANT_RACE");
    return sid;
  });
  return { consultationSessionId: sessionId };
}

/**
 * 患者の承認後に 60 分の診察セッションを作る（患者発行 QR・医療者発行 QR の共通処理。呼び出し側のトランザクション内で使う）。
 * 宿題スナップショットのフックと監査記録まで行う。
 */
export async function startConsultationSession(
  tx: Db,
  input: { patientId: string; clinicianId: string; orgId: string; qrGrantId: string; now: Date },
): Promise<string> {
  const { patientId, clinicianId, orgId, qrGrantId, now } = input;
  const [s] = await tx
    .insert(consultationSessions)
    .values({ patientId, clinicianId, orgId, qrGrantId, startedAt: now, expiresAt: new Date(now.getTime() + CONSULTATION_TTL_MS) })
    .returning({ id: consultationSessions.id });
  await onConsultationStarted({ sessionId: s.id, patientId, orgId, startedAt: now }, tx);
  await audit(
    { actorUserId: patientId, orgId, action: "consultation.approve", resourceType: "consultation_session", resourceId: s.id, consultationSessionId: s.id, outcome: "ok" },
    tx,
  );
  return s.id;
}

export { newToken, newCode };

export async function denyGrant(grantId: string, patientId: string, db: Db = getDb()) {
  const [g] = await db.select().from(qrGrants).where(eq(qrGrants.id, grantId)).limit(1);
  if (!g || g.patientId !== patientId) throw notFound("GRANT_NOT_FOUND");
  if (g.decision !== "pending") throw conflict("GRANT_ALREADY_DECIDED");
  await db.update(qrGrants).set({ decision: "denied", decidedAt: new Date() }).where(eq(qrGrants.id, grantId));
  await audit({ actorUserId: patientId, orgId: g.claimedOrgId, action: "consultation.deny", resourceType: "qr_grant", resourceId: grantId, outcome: "ok" }, db);
}

/** テスト・運用用: 期限切れ pending を expired に更新 */
export async function expireStaleGrants(db: Db = getDb()) {
  await db
    .update(qrGrants)
    .set({ decision: "expired", decidedAt: new Date() })
    .where(and(eq(qrGrants.decision, "pending"), sql`${qrGrants.expiresAt} <= now()`));
}

export { forbidden };
