import { LEVEL_LABEL, type Level, type Phase } from "@/lib/understanding";

/** 学習の状態（未学習・途中・完了）。全画面で同じ見た目・言葉にする */
export function PhaseChip({ phase, lastSlideSeq, slideCount }: { phase: Phase; lastSlideSeq?: number; slideCount?: number }) {
  if (phase === "completed") return <span className="rs-st done">完了</span>;
  if (phase === "quiz") return <span className="rs-st doing">確認問題の途中</span>;
  if (phase === "reading")
    return <span className="rs-st doing">途中{lastSlideSeq && slideCount ? ` ${Math.min(lastSlideSeq, slideCount)}/${slideCount}` : ""}</span>;
  return <span className="rs-st todo">未学習</span>;
}

/** 理解の 3 段階（確認できた・もう一度・未学習） */
export function LevelChip({ level }: { level: Level }) {
  return <span className={`rs-lv ${level}`}>{LEVEL_LABEL[level]}</span>;
}

/** 状態に応じた行き先と主ボタンの文言 */
export function nextHref(i: { phase: Phase; versionId: string }) {
  return i.phase === "quiz" ? `/quiz/${i.versionId}` : `/learn/${i.versionId}`;
}
export function nextAction(i: { phase: Phase }) {
  if (i.phase === "quiz") return "確認問題の続きから";
  if (i.phase === "reading") return "続きから読む";
  if (i.phase === "completed") return "もう一度読む";
  return "読む・聞く";
}
