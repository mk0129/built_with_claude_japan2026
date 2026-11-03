import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { requirePageUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { consultationSessions } from "@/server/db/schema";
import { ClinicianDApp } from "@/concept-d/ConceptDApp";

/**
 * 医療者ホーム（正式 UI: Figma Make Concept D）。患者情報は、患者が承認した有効な一時共有の間だけ表示する。
 * 再読み込み時は、この医療者の「いま有効な」一時共有（?s= で指定されたもの、なければ最新の 1 件）に戻る。過去の共有や患者一覧は扱わない。
 */
export default async function StaffHome({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const u = await requirePageUser("staff");
  const { s } = await searchParams;
  const now = new Date();
  const active = and(eq(consultationSessions.clinicianId, u.id), isNull(consultationSessions.endedAt), gt(consultationSessions.expiresAt, now));
  const uuid = /^[0-9a-f-]{36}$/i.test(s ?? "") ? s! : null;
  const [row] = await getDb()
    .select({ id: consultationSessions.id })
    .from(consultationSessions)
    .where(uuid ? and(active, eq(consultationSessions.id, uuid)) : active)
    .orderBy(desc(consultationSessions.startedAt))
    .limit(1);
  return <ClinicianDApp sessionId={row?.id ?? null} />;
}
