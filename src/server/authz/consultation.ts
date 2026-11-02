import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { consultationSessions } from "@/server/db/schema";
import { forbidden } from "./errors";
import { requireOrgRole, requireStaff, type OrgMembership, type Principal } from "./principal";

/**
 * 医療者が特定患者のデータへアクセスする際の「証明」オブジェクト。
 * サービス層の患者データ関数はこれを引数に要求する。
 * 組織所属だけでは作れず、患者が承認した有効な診察セッションが必要（AUTH-06）。
 */
export type ConsultationContext = {
  sessionId: string;
  patientId: string;
  clinician: Principal;
  membership: OrgMembership;
  orgId: string;
  expiresAt: Date;
};

export function isSessionActive(s: { endedAt: Date | null; expiresAt: Date }, now = new Date()): boolean {
  return s.endedAt === null && s.expiresAt.getTime() > now.getTime();
}

/** セッションIDから有効性を検証。期限切れ・終了済み・他人のセッションは 403 */
export async function requireActiveConsultation(headers: Headers, sessionId: string, db: Db = getDb()): Promise<ConsultationContext> {
  const clinician = await requireStaff(headers);
  const now = new Date();
  const [s] = await db
    .select()
    .from(consultationSessions)
    .where(
      and(
        eq(consultationSessions.id, sessionId),
        eq(consultationSessions.clinicianId, clinician.userId),
        isNull(consultationSessions.endedAt),
        gt(consultationSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!s) throw forbidden("NO_ACTIVE_CONSULTATION");
  const membership = await requireOrgRole(clinician.userId, s.orgId, "clinician");
  return {
    sessionId: s.id,
    patientId: s.patientId,
    clinician,
    membership,
    orgId: s.orgId,
    expiresAt: s.expiresAt,
  };
}
