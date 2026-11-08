import { and, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { patientTreatmentEvents, patientTreatmentProfiles } from "@/server/db/schema";
import { badRequest, notFound } from "@/server/authz/errors";
import type { ConsultationContext } from "@/server/authz/consultation";
import { audit } from "./audit";
import {
  CANCER_TYPES,
  EMPTY_PROFILE,
  EVENT_KINDS,
  MODALITIES,
  isValidDay,
  type EventKind,
  type Modality,
  type TreatmentEvent,
  type TreatmentProfile,
} from "@/lib/treatment";

/**
 * 治療の記録（患者本人が登録する。がん種・現在の治療・外来の日ごとの出来事）。
 * - 患者本人だけが登録・変更・削除する。医療者は有効な一時共有の間だけ読める（変更はできない）。
 * - 日付は "YYYY-MM-DD"（Asia/Tokyo の暦日）。誤入力を防ぐため今日の 2 年前から 1 年後までに限る。
 * - 診断や治療の内容を推定・補完しない。登録された日付と種類だけから日数を数える（計算は src/lib/treatment.ts）。
 */
export const tokyoToday = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

function validDay(date: string, now = new Date()): boolean {
  if (!isValidDay(date)) return false;
  const today = Date.parse(`${tokyoToday(now)}T00:00:00Z`);
  const t = Date.parse(`${date}T00:00:00Z`);
  return t >= today - 731 * 864e5 && t <= today + 366 * 864e5;
}

const text = (value: unknown, max: number) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw badRequest("TREATMENT_INVALID", "入力を確認してください");
  const v = value.trim();
  if (v.length > max) throw badRequest("TREATMENT_INVALID", `${max}文字以内で入力してください`);
  return v || null;
};
const smallInt = (value: unknown, max: number) => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw badRequest("TREATMENT_INVALID", `1〜${max} の整数で入力してください`);
  return n;
};

export async function getTreatment(patientId: string, db: Db = getDb()): Promise<{ profile: TreatmentProfile; events: TreatmentEvent[]; today: string }> {
  const [p] = await db.select().from(patientTreatmentProfiles).where(eq(patientTreatmentProfiles.patientId, patientId));
  const rows = await db
    .select()
    .from(patientTreatmentEvents)
    .where(eq(patientTreatmentEvents.patientId, patientId))
    .orderBy(desc(patientTreatmentEvents.eventDate), desc(patientTreatmentEvents.createdAt));
  const profile: TreatmentProfile = p
    ? {
        cancerType: p.cancerType,
        modality: (MODALITIES.includes(p.modality as Modality) ? p.modality : "none") as Modality,
        treatmentName: p.treatmentName,
        startDate: p.startDate,
        cycleDays: p.cycleDays,
        plannedSessions: p.plannedSessions,
      }
    : EMPTY_PROFILE;
  return {
    profile,
    events: rows.map((r) => ({ id: r.id, date: r.eventDate, kind: r.kind as EventKind, label: r.label, courseNo: r.courseNo })),
    today: tokyoToday(),
  };
}

export async function setTreatmentProfile(patientId: string, input: Record<string, unknown>, db: Db = getDb()) {
  const cancerType = text(input.cancerType, 30);
  if (cancerType && !(CANCER_TYPES as readonly string[]).includes(cancerType) && cancerType.length > 30) throw badRequest("TREATMENT_INVALID", "がん種を確認してください");
  const modality = (input.modality ?? "none") as Modality;
  if (!MODALITIES.includes(modality)) throw badRequest("TREATMENT_INVALID", "治療の種類を確認してください");
  const startDate = input.startDate === null || input.startDate === undefined || input.startDate === "" ? null : String(input.startDate);
  if (startDate !== null && !validDay(startDate)) throw badRequest("INVALID_TREATMENT_DATE", "開始日を確認してください（今日の2年前から1年後まで）");
  const values = {
    patientId,
    cancerType,
    modality,
    treatmentName: text(input.treatmentName, 60),
    startDate,
    cycleDays: smallInt(input.cycleDays, 60),
    plannedSessions: smallInt(input.plannedSessions, 60),
    updatedAt: new Date(),
  };
  await db
    .insert(patientTreatmentProfiles)
    .values(values)
    .onConflictDoUpdate({ target: patientTreatmentProfiles.patientId, set: { ...values } });
  await audit({ actorUserId: patientId, action: "treatment.profile.set", resourceType: "treatment", outcome: "ok" }, db);
  return getTreatment(patientId, db);
}

export async function addTreatmentEvent(patientId: string, input: Record<string, unknown>, db: Db = getDb()) {
  const date = String(input.date ?? "");
  if (!validDay(date)) throw badRequest("INVALID_TREATMENT_DATE", "日付を確認してください（今日の2年前から1年後まで）");
  const kind = input.kind as EventKind;
  if (!EVENT_KINDS.includes(kind)) throw badRequest("TREATMENT_INVALID", "治療の内容を確認してください");
  const [row] = await db
    .insert(patientTreatmentEvents)
    .values({ patientId, eventDate: date, kind, label: text(input.label, 60), courseNo: smallInt(input.courseNo, 99) })
    .returning({ id: patientTreatmentEvents.id });
  await audit({ actorUserId: patientId, action: "treatment.event.add", resourceType: "treatment_event", resourceId: row.id, outcome: "ok" }, db);
  return getTreatment(patientId, db);
}

export async function deleteTreatmentEvent(patientId: string, eventId: string, db: Db = getDb()) {
  const deleted = await db
    .delete(patientTreatmentEvents)
    .where(and(eq(patientTreatmentEvents.id, eventId), eq(patientTreatmentEvents.patientId, patientId)))
    .returning({ id: patientTreatmentEvents.id });
  if (deleted.length !== 1) throw notFound("TREATMENT_EVENT_NOT_FOUND");
  await audit({ actorUserId: patientId, action: "treatment.event.delete", resourceType: "treatment_event", resourceId: eventId, outcome: "ok" }, db);
  return getTreatment(patientId, db);
}

/** 医療者: 共有中の患者の治療の記録（読み取りだけ）。有効な診察セッションがなければ呼び出し側で 403 */
export async function getTreatmentForClinician(ctx: ConsultationContext, db: Db = getDb()) {
  const data = await getTreatment(ctx.patientId, db);
  await audit(
    { actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "patient.treatment.read", resourceType: "patient", resourceId: ctx.patientId, consultationSessionId: ctx.sessionId, outcome: "ok" },
    db,
  );
  return data;
}
