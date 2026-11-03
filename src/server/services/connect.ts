import { and, eq, gt } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { connectRequests, organizationMembers, organizations, qrGrants } from "@/server/db/schema";
import { conflict, notFound } from "@/server/authz/errors";
import { requireOrgRole } from "@/server/authz/principal";
import { audit } from "./audit";
import { QR_TTL_MS, hashToken, newCode, newToken, startConsultationSession } from "./qr";

/**
 * 医療者発行の接続申請（Concept D）: 医療者が QR を表示 → 患者が自分の端末で読み取り → 申請者を確認して明示承認 → 60 分の一時共有。
 *
 * 患者発行 QR（既存。患者が QR／6 桁コードを表示 → 医療者が読み取り → 患者が承認）との比較:
 * - どちらも患者の明示承認まで患者情報は医療者に一切渡らない。セッション作成・期限・延長・終了は同じ処理。
 * - 医療者発行 QR が他の患者に読まれても、その患者が「自分の情報を、表示された医療者へ共有するか」を判断するだけで、
 *   第三者の情報が漏れることはない。患者は承認前に申請者（医療者名・医療機関）を確認する。
 * - トークンは 5 分で失効し、1 回の承認で消費する。医療者 1 人につき有効な申請は 1 つ（新しく発行すると古い申請は取り消し）。
 * - 承認時は qr_grants に承認済みの行を作り（申請と相互参照）、既存の consultation_sessions の制約と監査をそのまま使う。
 */

export async function createConnectRequest(input: { clinicianId: string; orgId: string }, db: Db = getDb()) {
  const membership = await requireOrgRole(input.clinicianId, input.orgId, "clinician");
  const now = new Date();
  await db
    .update(connectRequests)
    .set({ decision: "cancelled", decidedAt: now })
    .where(and(eq(connectRequests.clinicianId, input.clinicianId), eq(connectRequests.decision, "pending")));
  const token = newToken();
  const [row] = await db
    .insert(connectRequests)
    .values({ clinicianId: input.clinicianId, orgId: input.orgId, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + QR_TTL_MS) })
    .returning({ id: connectRequests.id, expiresAt: connectRequests.expiresAt });
  await audit({ actorUserId: input.clinicianId, orgId: input.orgId, action: "connect.create", resourceType: "connect_request", resourceId: row.id, outcome: "ok" }, db);
  return { requestId: row.id, token, expiresAt: row.expiresAt, orgId: input.orgId, orgName: membership.orgName };
}

type Decision = "pending" | "approved" | "denied" | "expired" | "cancelled";
const effective = (r: { decision: Decision; expiresAt: Date }): Decision =>
  r.decision === "pending" && r.expiresAt.getTime() <= Date.now() ? "expired" : r.decision;

/** 医療者: 自分の申請の状態。承認前は患者情報を含めない（承認後もセッション ID だけ） */
export async function getConnectRequestForClinician(requestId: string, clinicianId: string, db: Db = getDb()) {
  const [r] = await db.select().from(connectRequests).where(eq(connectRequests.id, requestId)).limit(1);
  if (!r || r.clinicianId !== clinicianId) throw notFound("REQUEST_NOT_FOUND");
  return { requestId: r.id, decision: effective(r), expiresAt: r.expiresAt, consultationSessionId: r.decision === "approved" ? r.consultationSessionId : null };
}

export async function cancelConnectRequest(requestId: string, clinicianId: string, db: Db = getDb()) {
  const [r] = await db
    .update(connectRequests)
    .set({ decision: "cancelled", decidedAt: new Date() })
    .where(and(eq(connectRequests.id, requestId), eq(connectRequests.clinicianId, clinicianId), eq(connectRequests.decision, "pending")))
    .returning({ id: connectRequests.id, orgId: connectRequests.orgId });
  if (r) await audit({ actorUserId: clinicianId, orgId: r.orgId, action: "connect.cancel", resourceType: "connect_request", resourceId: r.id, outcome: "ok" }, db);
  return { cancelled: !!r };
}

/** 患者: QR を読み取った申請の申請者を確認する（承認前。トークンを持つ患者だけが見られる） */
export async function previewConnectRequest(token: string, db: Db = getDb()) {
  const [r] = await db
    .select({
      id: connectRequests.id,
      decision: connectRequests.decision,
      expiresAt: connectRequests.expiresAt,
      orgName: organizations.name,
      clinicianName: organizationMembers.displayName,
    })
    .from(connectRequests)
    .innerJoin(organizations, eq(organizations.id, connectRequests.orgId))
    .leftJoin(organizationMembers, and(eq(organizationMembers.orgId, connectRequests.orgId), eq(organizationMembers.userId, connectRequests.clinicianId)))
    .where(eq(connectRequests.tokenHash, hashToken(token)))
    .limit(1);
  if (!r) throw notFound("REQUEST_INVALID");
  return { requestId: r.id, decision: effective(r), expiresAt: r.expiresAt, orgName: r.orgName, clinicianName: r.clinicianName ?? "医療者" };
}

/**
 * 患者の明示承認。トランザクション内で
 * 1) 申請が pending・期限内であることを行ロックで確認
 * 2) 承認済みの qr_grants 行を作る（既存の制約・監査と同じ形にするため。読み取り用トークンは使い捨てで保存しない）
 * 3) 60 分の診察セッションを作成（既存と共通）
 * 4) 申請を approved にして消費
 */
export async function approveConnectRequest(token: string, patientId: string, db: Db = getDb()) {
  const now = new Date();
  // 申請者がまだその医療機関の医療者であること（トランザクション外で先に確認。ローカル DB は接続が 1 本のため、トランザクション内で別接続の問い合わせをすると待ち合いになる）
  const [pre] = await db.select({ clinicianId: connectRequests.clinicianId, orgId: connectRequests.orgId }).from(connectRequests).where(eq(connectRequests.tokenHash, hashToken(token))).limit(1);
  if (!pre) throw notFound("REQUEST_INVALID");
  await requireOrgRole(pre.clinicianId, pre.orgId, "clinician");
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(connectRequests).where(eq(connectRequests.tokenHash, hashToken(token))).for("update").limit(1);
    if (!r) throw notFound("REQUEST_INVALID");
    if (r.decision !== "pending") throw conflict("REQUEST_ALREADY_DECIDED");
    if (r.expiresAt.getTime() <= now.getTime()) throw conflict("REQUEST_EXPIRED");

    const [g] = await tx
      .insert(qrGrants)
      .values({
        patientId,
        tokenHash: hashToken(newToken()),
        code: newCode(),
        createdAt: now,
        expiresAt: r.expiresAt,
        claimedByUserId: r.clinicianId,
        claimedOrgId: r.orgId,
        claimedAt: r.createdAt,
        decision: "approved",
        decidedAt: now,
      })
      .returning({ id: qrGrants.id });
    const sid = await startConsultationSession(tx as unknown as Db, { patientId, clinicianId: r.clinicianId, orgId: r.orgId, qrGrantId: g.id, now });
    await tx.update(qrGrants).set({ consultationSessionId: sid }).where(eq(qrGrants.id, g.id));
    const updated = await tx
      .update(connectRequests)
      .set({ decision: "approved", decidedAt: now, patientId, qrGrantId: g.id, consultationSessionId: sid })
      .where(and(eq(connectRequests.id, r.id), eq(connectRequests.decision, "pending"), gt(connectRequests.expiresAt, now)))
      .returning({ id: connectRequests.id });
    if (updated.length !== 1) throw conflict("REQUEST_RACE");
    return { consultationSessionId: sid };
  });
}

export async function denyConnectRequest(token: string, patientId: string, db: Db = getDb()) {
  const [r] = await db
    .update(connectRequests)
    .set({ decision: "denied", decidedAt: new Date() })
    .where(and(eq(connectRequests.tokenHash, hashToken(token)), eq(connectRequests.decision, "pending")))
    .returning({ id: connectRequests.id, orgId: connectRequests.orgId });
  if (!r) throw conflict("REQUEST_ALREADY_DECIDED");
  await audit({ actorUserId: patientId, orgId: r.orgId, action: "connect.deny", resourceType: "connect_request", resourceId: r.id, outcome: "ok" }, db);
  return { denied: true };
}
