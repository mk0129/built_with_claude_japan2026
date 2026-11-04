import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { patientNextVisits } from "@/server/db/schema";
import { badRequest } from "@/server/authz/errors";
import { audit } from "./audit";

/**
 * 次回の診察日（患者ホーム）。患者本人だけが登録・変更・削除する。登録されていない日付を推定・表示しない。
 * 日付は "YYYY-MM-DD"（Asia/Tokyo の暦日）。誤入力を防ぐため、今日の 1 年前から 2 年後までに限る。
 */
const tokyoToday = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

export function validVisitDate(date: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false;
  const today = new Date(`${tokyoToday(now)}T00:00:00Z`).getTime();
  const day = 864e5;
  return d.getTime() >= today - 366 * day && d.getTime() <= today + 731 * day;
}

export async function getNextVisit(patientId: string, db: Db = getDb()) {
  const [row] = await db.select({ date: patientNextVisits.visitDate, updatedAt: patientNextVisits.updatedAt }).from(patientNextVisits).where(eq(patientNextVisits.patientId, patientId));
  return row ?? null;
}

/** date = null で削除（未登録に戻す） */
export async function setNextVisit(patientId: string, date: string | null, db: Db = getDb()) {
  if (date === null) {
    await db.delete(patientNextVisits).where(eq(patientNextVisits.patientId, patientId));
    await audit({ actorUserId: patientId, action: "next_visit.clear", resourceType: "next_visit", outcome: "ok" }, db);
    return null;
  }
  if (!validVisitDate(date)) throw badRequest("INVALID_VISIT_DATE", "日付を確認してください（今日の1年前から2年後まで）");
  const now = new Date();
  await db
    .insert(patientNextVisits)
    .values({ patientId, visitDate: date, updatedAt: now })
    .onConflictDoUpdate({ target: patientNextVisits.patientId, set: { visitDate: date, updatedAt: now } });
  await audit({ actorUserId: patientId, action: "next_visit.set", resourceType: "next_visit", outcome: "ok" }, db);
  return getNextVisit(patientId, db);
}
