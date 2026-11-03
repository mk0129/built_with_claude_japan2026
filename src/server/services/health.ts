import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { healthRecords, healthSymptomEntries, patientSymptomSettings } from "@/server/db/schema";
import { badRequest, notFound } from "@/server/authz/errors";
import { initialActiveSymptomIds, symptomLibrary } from "@/concept-d/healthData";
import { audit } from "./audit";

/**
 * 体調記録（Phase 2 Step 3）。患者本人だけが作成・編集・削除し、医療者は有効な一時共有の間だけ読む。
 * - バイタルは任意。未測定は null のまま保存（0・前回値で埋めない）。
 * - 自覚症状は患者本人による 0〜4。回答しなかった症状は保存しない（欠測）。CTCAE Grade は判定しない。
 * - 記録しても医療者へ通知しない（緊急連絡の仕組みではない）。
 */
export const VITAL_LIMITS = {
  temperature: [30, 45],
  systolic: [50, 260],
  diastolic: [30, 160],
  pulse: [20, 250],
  spo2: [50, 100],
} as const;
type VitalKey = keyof typeof VITAL_LIMITS;

export type SymptomInput = { key: string; severity: number; count?: number | null; location?: string | null; interference?: string | null };
export type HealthRecordInput = {
  measuredAt: string;
  vitals: Partial<Record<VitalKey, number | null>>;
  symptoms: SymptomInput[];
};

export type HealthRecordView = {
  id: string;
  measuredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  vitals: Record<VitalKey, number | null>;
  symptoms: { key: string; name: string; severity: number; count: number | null; location: string | null; interference: string | null }[];
};

const isLibraryKey = (key: string) => symptomLibrary.some((s) => s.id === key);
const isCustomKey = (key: string) => /^custom-[0-9a-z-]{4,60}$/i.test(key);

function validate(input: HealthRecordInput) {
  const measuredAt = new Date(input.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) throw badRequest("INVALID_MEASURED_AT", "測定日時を確認してください");
  // 未来の測定日時は受け付けない（端末の時計のずれを 10 分まで許容）
  if (measuredAt.getTime() > Date.now() + 10 * 60 * 1000) throw badRequest("INVALID_MEASURED_AT", "未来の日時は記録できません");
  for (const [k, v] of Object.entries(input.vitals)) {
    if (v == null) continue;
    const lim = VITAL_LIMITS[k as VitalKey];
    if (!lim) throw badRequest("INVALID_VITAL");
    if (!Number.isFinite(v) || v < lim[0] || v > lim[1]) throw badRequest("INVALID_VITAL", `${k} は ${lim[0]}〜${lim[1]} の範囲で入力してください`);
    if (k !== "temperature" && !Number.isInteger(v)) throw badRequest("INVALID_VITAL", `${k} は整数で入力してください`);
  }
  const seen = new Set<string>();
  for (const s of input.symptoms) {
    if (!isLibraryKey(s.key) && !isCustomKey(s.key)) throw badRequest("INVALID_SYMPTOM");
    if (seen.has(s.key)) throw badRequest("DUPLICATE_SYMPTOM");
    seen.add(s.key);
    if (!Number.isInteger(s.severity) || s.severity < 0 || s.severity > 4) throw badRequest("INVALID_SEVERITY", "症状の程度は 0〜4 です");
    if (s.count != null && (!Number.isInteger(s.count) || s.count < 0 || s.count > 99)) throw badRequest("INVALID_COUNT");
  }
  return measuredAt;
}

/** 独自の症状の表示名（保存時点の名前を記録に残す） */
async function symptomNames(patientId: string, keys: string[], db: Db) {
  const custom = keys.filter(isCustomKey);
  const rows = custom.length
    ? await db
        .select({ key: patientSymptomSettings.symptomKey, name: patientSymptomSettings.customName })
        .from(patientSymptomSettings)
        .where(and(eq(patientSymptomSettings.patientId, patientId), inArray(patientSymptomSettings.symptomKey, custom)))
    : [];
  const byKey = new Map(rows.map((r) => [r.key, r.name]));
  return (key: string) => (isLibraryKey(key) ? symptomLibrary.find((s) => s.id === key)!.name : (byKey.get(key) ?? null));
}

const num = (v: string | number | null) => (v == null ? null : Number(v));

async function loadRecords(patientId: string, db: Db, ids?: string[], range?: { from?: Date; to?: Date }): Promise<HealthRecordView[]> {
  const conds = [eq(healthRecords.patientId, patientId)];
  if (ids) conds.push(inArray(healthRecords.id, ids));
  if (range?.from) conds.push(gte(healthRecords.measuredAt, range.from));
  if (range?.to) conds.push(lte(healthRecords.measuredAt, range.to));
  const rows = await db.select().from(healthRecords).where(and(...conds)).orderBy(desc(healthRecords.measuredAt), desc(healthRecords.createdAt));
  if (rows.length === 0) return [];
  const entries = await db
    .select()
    .from(healthSymptomEntries)
    .where(inArray(healthSymptomEntries.recordId, rows.map((r) => r.id)))
    .orderBy(asc(healthSymptomEntries.symptomKey));
  const nameOf = await symptomNames(patientId, [...new Set(entries.map((e) => e.symptomKey))], db);
  return rows.map((r) => ({
    id: r.id,
    measuredAt: r.measuredAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    vitals: { temperature: num(r.temperature), systolic: r.systolic, diastolic: r.diastolic, pulse: r.pulse, spo2: r.spo2 },
    symptoms: entries
      .filter((e) => e.recordId === r.id)
      .map((e) => ({ key: e.symptomKey, name: e.symptomName ?? nameOf(e.symptomKey) ?? e.symptomKey, severity: e.severity, count: e.count, location: e.location, interference: e.interference })),
  }));
}

export async function listHealthRecords(patientId: string, range: { from?: Date; to?: Date } = {}, db: Db = getDb()) {
  return loadRecords(patientId, db, undefined, range);
}

async function writeEntries(tx: Db, patientId: string, recordId: string, symptoms: SymptomInput[]) {
  await tx.delete(healthSymptomEntries).where(eq(healthSymptomEntries.recordId, recordId));
  if (symptoms.length === 0) return;
  const nameOf = await symptomNames(patientId, symptoms.map((s) => s.key), tx);
  await tx.insert(healthSymptomEntries).values(
    symptoms.map((s) => ({
      recordId,
      symptomKey: s.key,
      symptomName: nameOf(s.key),
      severity: s.severity,
      count: s.count ?? null,
      location: s.location?.trim() || null,
      interference: s.interference?.trim() || null,
    })),
  );
}

const vitalColumns = (v: HealthRecordInput["vitals"]) => ({
  temperature: v.temperature == null ? null : String(v.temperature),
  systolic: v.systolic ?? null,
  diastolic: v.diastolic ?? null,
  pulse: v.pulse ?? null,
  spo2: v.spo2 ?? null,
});

/** 新しい記録（同じ日でも別の記録）。前回の値は引き継がない */
export async function createHealthRecord(patientId: string, input: HealthRecordInput, db: Db = getDb()) {
  const measuredAt = validate(input);
  const id = await db.transaction(async (tx) => {
    const [r] = await tx.insert(healthRecords).values({ patientId, measuredAt, ...vitalColumns(input.vitals) }).returning({ id: healthRecords.id });
    await writeEntries(tx as unknown as Db, patientId, r.id, input.symptoms);
    return r.id;
  });
  await audit({ actorUserId: patientId, action: "health.create", resourceType: "health_record", resourceId: id, outcome: "ok" }, db);
  return (await loadRecords(patientId, db, [id]))[0];
}

/** 本人の記録だけ編集できる（他の患者の記録は「見つからない」） */
export async function updateHealthRecord(patientId: string, recordId: string, input: HealthRecordInput, db: Db = getDb()) {
  const measuredAt = validate(input);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(healthRecords)
      .set({ measuredAt, ...vitalColumns(input.vitals), updatedAt: new Date() })
      .where(and(eq(healthRecords.id, recordId), eq(healthRecords.patientId, patientId)))
      .returning({ id: healthRecords.id });
    if (updated.length !== 1) throw notFound("HEALTH_RECORD_NOT_FOUND");
    await writeEntries(tx as unknown as Db, patientId, recordId, input.symptoms);
  });
  await audit({ actorUserId: patientId, action: "health.update", resourceType: "health_record", resourceId: recordId, outcome: "ok" }, db);
  return (await loadRecords(patientId, db, [recordId]))[0];
}

export async function deleteHealthRecord(patientId: string, recordId: string, db: Db = getDb()) {
  const deleted = await db
    .delete(healthRecords)
    .where(and(eq(healthRecords.id, recordId), eq(healthRecords.patientId, patientId)))
    .returning({ id: healthRecords.id });
  if (deleted.length !== 1) throw notFound("HEALTH_RECORD_NOT_FOUND");
  await audit({ actorUserId: patientId, action: "health.delete", resourceType: "health_record", resourceId: recordId, outcome: "ok" }, db);
  return { deleted: true };
}

// ---------- 症状の表示設定 ----------
export type SymptomSettingsView = {
  /** 日々の入力に表示する症状（並び順どおり） */
  active: string[];
  /** 非表示にした症状（過去の記録は残る） */
  hidden: string[];
  /** 独自の症状名 */
  customNames: Record<string, string>;
};

export async function getSymptomSettings(patientId: string, db: Db = getDb()): Promise<SymptomSettingsView> {
  const rows = await db.select().from(patientSymptomSettings).where(eq(patientSymptomSettings.patientId, patientId)).orderBy(asc(patientSymptomSettings.position));
  if (rows.length === 0) return { active: [...initialActiveSymptomIds], hidden: [], customNames: {} };
  return {
    active: rows.filter((r) => !r.hidden).map((r) => r.symptomKey),
    hidden: rows.filter((r) => r.hidden).map((r) => r.symptomKey),
    customNames: Object.fromEntries(rows.filter((r) => r.customName).map((r) => [r.symptomKey, r.customName!])),
  };
}

/**
 * 表示する症状の並びと独自の症状名を保存する。並びにない症状は「非表示」として残す（削除しない）。
 * 独自の症状名は追加時に決め、以後の名前変更は新しい症状として扱う（過去の記録の名前を変えない）。
 */
export async function saveSymptomSettings(patientId: string, input: { active: string[]; customNames: Record<string, string> }, db: Db = getDb()) {
  const active = [...new Set(input.active)];
  if (active.length > 60) throw badRequest("TOO_MANY_SYMPTOMS");
  for (const key of active) if (!isLibraryKey(key) && !isCustomKey(key)) throw badRequest("INVALID_SYMPTOM");
  for (const [key, name] of Object.entries(input.customNames)) {
    if (!isCustomKey(key)) throw badRequest("INVALID_SYMPTOM");
    if (!name.trim() || name.trim().length > 40) throw badRequest("INVALID_SYMPTOM_NAME", "症状名は 1〜40 文字です");
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(patientSymptomSettings).where(eq(patientSymptomSettings.patientId, patientId));
    // 初めて設定を変えるとき: 既定で表示していた症状も行として持つ（以後は行で管理）
    const known = new Map(existing.map((r) => [r.symptomKey, r]));
    const allKeys = [...new Set([...active, ...existing.map((r) => r.symptomKey), ...(existing.length ? [] : initialActiveSymptomIds)])];
    for (const key of allKeys) {
      const position = active.indexOf(key);
      const hidden = position < 0;
      const customName = isCustomKey(key) ? (known.get(key)?.customName ?? input.customNames[key]?.trim() ?? null) : null;
      if (isCustomKey(key) && !customName) throw badRequest("INVALID_SYMPTOM_NAME");
      if (known.has(key)) {
        await tx
          .update(patientSymptomSettings)
          .set({ position: hidden ? 1000 : position, hidden, updatedAt: now })
          .where(and(eq(patientSymptomSettings.patientId, patientId), eq(patientSymptomSettings.symptomKey, key)));
      } else {
        await tx.insert(patientSymptomSettings).values({ patientId, symptomKey: key, customName, position: hidden ? 1000 : position, hidden });
      }
    }
  });
  return getSymptomSettings(patientId, db);
}
