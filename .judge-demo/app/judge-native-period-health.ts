// The submission’s pure vital/symptom aggregation from buildIntervisit.
// Raw records are supplied by the isolated browser fixture rather than Drizzle.
import type { ApiRecord } from "@/concept-d/health";
import { localDay, severityLabelOf } from "@/server/services/intervisit-format";
import type { IntervisitEvent } from "@/server/services/intervisit";
export const VITAL_KEYS = ["temperature", "systolic", "diastolic", "pulse", "spo2"] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];
export const VITAL_LABEL: Record<VitalKey, { label: string; unit: string }> = {
  temperature: { label: "体温", unit: "℃" },
  systolic: { label: "収縮期血圧", unit: "mmHg" },
  diastolic: { label: "拡張期血圧", unit: "mmHg" },
  pulse: { label: "脈拍", unit: "回/分" },
  spo2: { label: "SpO₂", unit: "%" },
};


const DAY=864e5;
const dayStart=(d:string)=>new Date(d+"T00:00:00+09:00");
const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = dayStart(from).getTime(); t <= dayStart(to).getTime(); t += DAY) out.push(localDay(new Date(t)));
  return out;
};


export function nativeHealthSummary(rows:ApiRecord[], period:{from:string;to:string}) {
  const events:IntervisitEvent[]=[];
  const end=dayStart(period.to).getTime()+DAY, start=dayStart(period.from).getTime();
  const all=rows.map(r=>({...r,measuredAt:new Date(r.measuredAt)}));
  const records=all.filter(r=>r.measuredAt.getTime()>=start && r.measuredAt.getTime()<end)
    .sort((a,b)=>a.measuredAt.getTime()-b.measuredAt.getTime() || a.id.localeCompare(b.id));
  const before=all.filter(r=>r.measuredAt.getTime()<start);
  const seenBefore = new Set(before.flatMap((r) => r.symptoms.map((s) => s.key)));

  const vitals = Object.fromEntries(
    VITAL_KEYS.map((k) => {
      const values = records
        .filter((r) => r.vitals[k] != null)
        .map((r) => ({ at: r.measuredAt.toISOString(), value: r.vitals[k] as number, sourceId: `hr:${r.id}` }));
      const min = values.reduce<(typeof values)[number] | null>((m, v) => (!m || v.value < m.value ? v : m), null);
      const max = values.reduce<(typeof values)[number] | null>((m, v) => (!m || v.value > m.value ? v : m), null);
      const measuredDays = new Set(values.map((v) => localDay(new Date(v.at))));
      return [k, { ...VITAL_LABEL[k], count: values.length, measuredDays: measuredDays.size, min, max, values }];
    }),
  ) as Record<VitalKey, { label: string; unit: string; count: number; measuredDays: number; min: { at: string; value: number; sourceId: string } | null; max: { at: string; value: number; sourceId: string } | null; values: { at: string; value: number; sourceId: string }[] }>;

  const allDays = daysBetween(period.from, period.to);
  const recordDays = new Set(records.map((r) => localDay(r.measuredAt)));
  for (const r of records) {
    const vs = VITAL_KEYS.filter((k) => r.vitals[k] != null);
    if (vs.length)
      events.push({
        id: `hr:${r.id}`,
        kind: "vital",
        at: r.measuredAt.toISOString(),
        day: localDay(r.measuredAt),
        label: vs.map((k) => `${VITAL_LABEL[k].label} ${r.vitals[k]}${VITAL_LABEL[k].unit}`).join("、"),
        ref: { table: "health_records", id: r.id },
        data: { vitals: Object.fromEntries(vs.map((k) => [k, r.vitals[k]])), missing: VITAL_KEYS.filter((k) => r.vitals[k] == null) },
      });
    for (const s of r.symptoms)
      events.push({
        id: `hs:${r.id}:${s.key}`,
        kind: "symptom",
        at: r.measuredAt.toISOString(),
        day: localDay(r.measuredAt),
        label: `${s.name} ${s.severity}/4（${severityLabelOf(s.severity)}）`,
        ref: { table: "health_symptom_entries", id: `${r.id}:${s.key}` },
        data: { key: s.key, name: s.name, severity: s.severity, count: s.count, location: s.location, interference: s.interference },
      });
  }

  const symptomKeys = [...new Set(records.flatMap((r) => r.symptoms.map((s) => s.key)))];
  const lastRecordDay = records.length ? localDay(records[records.length - 1].measuredAt) : null;
  const symptoms = symptomKeys.map((key) => {
    const entries = records
      .filter((r) => r.symptoms.some((s) => s.key === key))
      .map((r) => {
        const s = r.symptoms.find((x) => x.key === key)!;
        return { at: r.measuredAt.toISOString(), day: localDay(r.measuredAt), severity: s.severity, sourceId: `hs:${r.id}:${key}`, location: s.location, count: s.count, interference: s.interference };
      });
    const name = records.flatMap((r) => r.symptoms).find((s) => s.key === key)!.name;
    const sev = entries.map((e) => e.severity);
    const last = entries[entries.length - 1];
    // 記録が途切れた: この症状の最後の回答より後にも体調記録があるのに、その後は回答がない（欠測。症状がなくなったとは解釈しない）
    const laterRecords = records.filter((r) => r.measuredAt.toISOString() > last.at);
    return {
      key,
      name,
      entries,
      count: entries.length,
      min: Math.min(...sev),
      max: Math.max(...sev),
      first: entries[0],
      last,
      // 期間より前に体調記録があり、その中にこの症状がない場合だけ「新たに記録された」とする（記録自体が期間内に始まった場合は判定しない）
      newInPeriod: before.length > 0 && !seenBefore.has(key),
      changed: new Set(sev).size > 1,
      unansweredAfterLast: laterRecords.length,
      stoppedRecording: laterRecords.length > 0 && last.day !== lastRecordDay,
    };
  });

  return {events,symptoms,vitals:{recordCount:records.length,recordDays:recordDays.size,totalDays:allDays.length,
    missingDays:allDays.filter(d=>!recordDays.has(d)),metrics:vitals}};
}
