/**
 * 理解度の 3 段階（患者・医療者で共通）。点数は詳細に回し、画面では段階を主に見せる。
 * - ok: 確認問題をすべて正解した（最新の完了挑戦）
 * - review: 最新の完了挑戦に誤答または「わからない」がある
 * - none: まだ確認問題を終えていない（未学習・途中を含む）
 */
import { DOMAIN_LABEL } from "./labels";

export type Level = "ok" | "review" | "none";
export type Phase = "not_started" | "reading" | "quiz" | "completed";

export const LEVEL_LABEL: Record<Level, string> = { ok: "確認できた", review: "もう一度", none: "未学習" };
export const PHASE_LABEL_SHORT: Record<Phase, string> = { not_started: "未学習", reading: "途中", quiz: "確認問題の途中", completed: "完了" };

/** 治療の流れの順（診断 → 手術 → 薬物 → 放射線 → 副作用と生活 → 心のケア） */
export const DOMAIN_JOURNEY = ["diagnosis_staging", "surgery", "drug_therapy", "radiation", "side_effects_daily_life", "mental_care_support"] as const;

export function levelOf(score: { attemptId: string | null; nWrong: number; nUnknown: number } | null | undefined): Level {
  if (!score?.attemptId) return "none";
  return score.nWrong + score.nUnknown > 0 ? "review" : "ok";
}

export type MapInput = { primaryDomain: string; level: Level; phase: Phase; prescribed: boolean };
export type DomainCell = {
  domain: string;
  label: string;
  level: Level;
  total: number; // 処方 or 自主学習の対象教材数
  completed: number;
  inProgress: number;
  review: number;
  prescribed: number;
};

/**
 * 領域ごとの理解。対象は処方された教材と自主学習した教材だけ（未処方・未着手は数えない）。
 * 1 つでも「もう一度」があれば review。なければ 1 つでも「確認できた」があれば ok。どちらもなければ none。
 */
export function domainMap(items: MapInput[]): DomainCell[] {
  return DOMAIN_JOURNEY.map((domain) => {
    const xs = items.filter((i) => i.primaryDomain === domain);
    const review = xs.filter((i) => i.level === "review").length;
    const ok = xs.filter((i) => i.level === "ok").length;
    return {
      domain,
      label: DOMAIN_LABEL[domain] ?? domain,
      level: review > 0 ? "review" : ok > 0 ? "ok" : "none",
      total: xs.length,
      completed: xs.filter((i) => i.phase === "completed").length,
      inProgress: xs.filter((i) => i.phase === "reading" || i.phase === "quiz").length,
      review,
      prescribed: xs.filter((i) => i.prescribed).length,
    };
  });
}

/** 領域の補足文（例: 「2 教材中 1 完了」「まだ処方・学習なし」） */
export function domainNote(c: DomainCell): string {
  if (c.total === 0) return "まだ学習なし";
  const parts = [`${c.total}教材中 ${c.completed}完了`];
  if (c.inProgress > 0) parts.push(`途中 ${c.inProgress}`);
  return parts.join(" ・ ");
}
