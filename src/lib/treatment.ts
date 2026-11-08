/**
 * 治療の記録: 患者側・医療者側・審査用デモで共通の定義と「今どこか」の計算。
 * 医学的な判断はしない。患者が登録した日付と種類だけから、日数と回数を数える。
 *
 * 日数の数え方（点滴と内服で違う）
 * - 点滴の薬物療法: 直近の点滴の日を 1 日目として数える（「点滴から 8 日目・第 3 コース」）。
 *   コース番号は、その日の記録に付けた番号。なければ点滴の記録の数。
 * - 内服の薬物療法: 内服を始めた（再開した）日を 1 日目として数える（「内服を始めて 23 日目・4 週目」）。
 * - 放射線療法: 照射した回数を数え、予定回数があれば「12 回目まで終了／25 回」。
 * - 手術: 手術の日を 1 日目（0 日目ではなく当日を 1 日目）として数える。
 * - 経過観察: 最後の治療の日から数える。
 * 外来に行っても治療をしない日は「外来のみ」として残し、数え方には影響しない。
 */

export const CANCER_TYPES = ["乳がん", "大腸がん", "胃がん", "肺がん", "前立腺がん", "子宮がん・卵巣がん", "血液のがん", "その他"] as const;

export type Modality = "infusion" | "oral" | "radiation" | "surgery" | "observation" | "none";
export const MODALITIES: Modality[] = ["infusion", "oral", "radiation", "surgery", "observation", "none"];
export const MODALITY_LABEL: Record<Modality, string> = {
  infusion: "点滴の薬物療法",
  oral: "内服の薬物療法",
  radiation: "放射線療法",
  surgery: "手術",
  observation: "経過観察（いまは治療なし）",
  none: "未設定",
};

export type EventKind = "infusion" | "oral_start" | "radiation" | "surgery" | "visit_only" | "other";
export const EVENT_KINDS: EventKind[] = ["infusion", "oral_start", "radiation", "surgery", "visit_only", "other"];
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  infusion: "点滴をした",
  oral_start: "内服を始めた・再開した",
  radiation: "放射線をあてた",
  surgery: "手術をした",
  visit_only: "外来のみ（治療なし）",
  other: "その他の治療",
};
/** 治療の種類から、外来の日に選びやすい既定の出来事 */
export const DEFAULT_EVENT_KIND: Record<Modality, EventKind> = {
  infusion: "infusion",
  oral: "visit_only",
  radiation: "radiation",
  surgery: "visit_only",
  observation: "visit_only",
  none: "visit_only",
};

export type TreatmentProfile = {
  cancerType: string | null;
  modality: Modality;
  treatmentName: string | null;
  startDate: string | null;
  cycleDays: number | null;
  plannedSessions: number | null;
};
export type TreatmentEvent = { id: string; date: string; kind: EventKind; label: string | null; courseNo: number | null };

export const EMPTY_PROFILE: TreatmentProfile = { cancerType: null, modality: "none", treatmentName: null, startDate: null, cycleDays: null, plannedSessions: null };

const dayMs = 864e5;
const parseDay = (date: string) => Date.parse(`${date}T00:00:00Z`);
/** from を 1 日目として today が何日目か */
export const dayNumber = (from: string, today: string) => Math.round((parseDay(today) - parseDay(from)) / dayMs) + 1;

export function isValidDay(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = parseDay(date);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}

export type TreatmentStatus = {
  /** 「点滴から 8 日目」など。数えられないときは null */
  headline: string | null;
  /** 「第 3 コース · 11月1日に点滴」など */
  detail: string | null;
  dayNo: number | null;
  anchorDate: string | null;
};

/** 「11月1日（金）」 */
export function visitDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${"日月火水木金土"[d.getUTCDay()]}）`;
}

const md = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
};

/** 今日までの出来事を新しい順に */
const upTo = (events: TreatmentEvent[], today: string) =>
  events.filter((e) => e.date <= today).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export function treatmentStatus(profile: TreatmentProfile, events: TreatmentEvent[], today: string): TreatmentStatus {
  const none: TreatmentStatus = { headline: null, detail: null, dayNo: null, anchorDate: null };
  const past = upTo(events, today);
  const latest = (kind: EventKind) => past.find((e) => e.kind === kind);
  const anchorOf = (kind: EventKind) => latest(kind)?.date ?? (profile.startDate && profile.startDate <= today ? profile.startDate : null);
  switch (profile.modality) {
    case "infusion": {
      const ev = latest("infusion");
      const anchor = anchorOf("infusion");
      if (!anchor) return none;
      const dayNo = dayNumber(anchor, today);
      const courseNo = ev?.courseNo ?? (ev ? past.filter((e) => e.kind === "infusion").length : null);
      const parts = [courseNo ? `第${courseNo}コース` : null, `${md(anchor)}に点滴`];
      return { headline: `点滴から ${dayNo}日目`, detail: parts.filter(Boolean).join(" · "), dayNo, anchorDate: anchor };
    }
    case "oral": {
      const anchor = anchorOf("oral_start");
      if (!anchor) return none;
      const dayNo = dayNumber(anchor, today);
      const week = Math.floor((dayNo - 1) / 7) + 1;
      return { headline: `内服を始めて ${dayNo}日目`, detail: `${week}週目 · ${md(anchor)}から`, dayNo, anchorDate: anchor };
    }
    case "radiation": {
      const sessions = past.filter((e) => e.kind === "radiation").length;
      const first = [...past].reverse().find((e) => e.kind === "radiation")?.date ?? (profile.startDate && profile.startDate <= today ? profile.startDate : null);
      if (!first && sessions === 0) return none;
      const dayNo = first ? dayNumber(first, today) : null;
      const headline = sessions > 0 ? `放射線 ${sessions}回目まで終了${profile.plannedSessions ? `／${profile.plannedSessions}回` : ""}` : `放射線療法 ${dayNo}日目`;
      return { headline, detail: first ? `${md(first)}に開始` : null, dayNo, anchorDate: first };
    }
    case "surgery": {
      const anchor = anchorOf("surgery");
      if (!anchor) return none;
      const dayNo = dayNumber(anchor, today);
      return { headline: `手術から ${dayNo}日目`, detail: `${md(anchor)}に手術`, dayNo, anchorDate: anchor };
    }
    case "observation": {
      const last = past.find((e) => e.kind !== "visit_only");
      if (!last) return none;
      const dayNo = dayNumber(last.date, today);
      return { headline: `最後の治療から ${dayNo}日目`, detail: `${md(last.date)} · ${EVENT_KIND_LABEL[last.kind]}`, dayNo, anchorDate: last.date };
    }
    default:
      return none;
  }
}

/** 医療者側の 1 行（がん種 · 治療 · 今どこか） */
export function treatmentLine(profile: TreatmentProfile, events: TreatmentEvent[], today: string): string | null {
  const parts: string[] = [];
  if (profile.cancerType) parts.push(profile.cancerType);
  if (profile.modality !== "none") parts.push(profile.treatmentName ? `${MODALITY_LABEL[profile.modality]}（${profile.treatmentName}）` : MODALITY_LABEL[profile.modality]);
  const st = treatmentStatus(profile, events, today);
  if (st.headline) parts.push(st.detail ? `${st.headline}（${st.detail}）` : st.headline);
  return parts.length ? parts.join(" · ") : null;
}
