import { getDb, type Db } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";

export type AuditInput = {
  actorUserId?: string | null;
  orgId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  consultationSessionId?: string | null;
  outcome: "ok" | "denied" | "error";
};

/** 監査ログ。本文・トークン・自由記述は渡さない（AUTH-08） */
export async function audit(input: AuditInput, db: Db = getDb()): Promise<void> {
  await db.insert(auditEvents).values({
    actorUserId: input.actorUserId ?? null,
    orgId: input.orgId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    consultationSessionId: input.consultationSessionId ?? null,
    outcome: input.outcome,
  });
}
