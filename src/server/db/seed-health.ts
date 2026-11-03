import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { healthRecords, healthSymptomEntries, visitNotes } from "./schema";

/**
 * デモ用の架空の体調記録と診察ノート（患者A のみ。実在の患者とは無関係）。今日から遡った日付で作る。
 * 外来間サマリーのデモ用に、未記録の日・同じ日の 2 回の測定・しびれの程度の変化・期間内に初めて記録された症状・
 * 途中から回答のない症状・教材に紐づかない質問を含める。すでに記録がある場合は何もしない。
 */
type Row = { daysAgo: number; hh: number; mm: number; v: Partial<Record<"temperature" | "systolic" | "diastolic" | "pulse" | "spo2", number>>; s: [string, number, { location?: string; interference?: string }?][] };
const ROWS: Row[] = [
  { daysAgo: 12, hh: 8, mm: 10, v: { temperature: 36.4, systolic: 122, diastolic: 76, pulse: 72, spo2: 98 }, s: [["fatigue", 1], ["nausea", 0], ["numbness", 1]] },
  { daysAgo: 10, hh: 7, mm: 55, v: { temperature: 36.5, systolic: 119, diastolic: 74, pulse: 70, spo2: 98 }, s: [["fatigue", 1], ["nausea", 1], ["numbness", 1]] },
  { daysAgo: 9, hh: 20, mm: 15, v: { temperature: 36.8, pulse: 78 }, s: [["fatigue", 2], ["numbness", 2, { location: "両手の指先" }]] },
  { daysAgo: 7, hh: 8, mm: 22, v: { temperature: 36.6, systolic: 126, diastolic: 78, pulse: 75, spo2: 98 }, s: [["fatigue", 2], ["nausea", 0], ["numbness", 3, { location: "両手の指先", interference: "ボタンを留めにくい" }]] },
  { daysAgo: 7, hh: 21, mm: 5, v: { temperature: 37.4, pulse: 86 }, s: [["numbness", 3]] },
  { daysAgo: 5, hh: 8, mm: 5, v: { temperature: 36.7, systolic: 121, diastolic: 75, pulse: 74, spo2: 97 }, s: [["fatigue", 1], ["numbness", 3], ["rash", 1, { location: "前腕" }]] },
  { daysAgo: 3, hh: 19, mm: 40, v: { temperature: 36.6, systolic: 124, diastolic: 77 }, s: [["numbness", 2], ["rash", 1]] },
  { daysAgo: 1, hh: 8, mm: 30, v: { temperature: 36.5, pulse: 72, spo2: 98 }, s: [["numbness", 2]] },
];

export async function seedDemoHealth(db: Db, patientId: string) {
  const [existing] = await db.select({ id: healthRecords.id }).from(healthRecords).where(eq(healthRecords.patientId, patientId)).limit(1);
  if (existing) return { skipped: true };
  const now = new Date();
  for (const r of ROWS) {
    const at = new Date(now);
    at.setDate(at.getDate() - r.daysAgo);
    at.setHours(r.hh, r.mm, 0, 0);
    const [row] = await db
      .insert(healthRecords)
      .values({
        patientId,
        measuredAt: at,
        temperature: r.v.temperature == null ? null : String(r.v.temperature),
        systolic: r.v.systolic ?? null,
        diastolic: r.v.diastolic ?? null,
        pulse: r.v.pulse ?? null,
        spo2: r.v.spo2 ?? null,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: healthRecords.id });
    const names: Record<string, string> = { fatigue: "だるさ・倦怠感", nausea: "吐き気", numbness: "手足のしびれ", rash: "皮疹・発疹" };
    await db.insert(healthSymptomEntries).values(
      r.s.map(([key, severity, extra]) => ({ recordId: row.id, symptomKey: key, symptomName: names[key], severity, location: extra?.location ?? null, interference: extra?.interference ?? null })),
    );
  }
  const noteAt = new Date(now);
  noteAt.setDate(noteAt.getDate() - 4);
  noteAt.setHours(21, 20, 0, 0);
  await db.insert(visitNotes).values({ patientId, body: "手のしびれは、治療が終わったら戻りますか？", source: "free", createdAt: noteAt, updatedAt: noteAt });
  return { skipped: false };
}
