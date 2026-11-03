/**
 * 教材制作の 6 ステップ進行表示（スタジオ再設計の採用範囲）。
 * 1 原資料を選ぶ → 2 Claude の構成案 → 3 必須事項を確認 → 4 教材・クイズを生成 → 5 患者画面で確認 → 6 原資料と照合し編集・承認
 * current より前は完了、current は進行中。スマホでは番号と現在のラベルだけを出す。
 */
export const STUDIO_STEPS = ["原資料を選ぶ", "Claude の構成案", "必須事項を確認", "教材・クイズを生成", "患者画面で確認", "照合・編集・承認"] as const;

export function Stepper({ current, done = [] }: { current: number; done?: number[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5 items-center" aria-label="制作の進み方">
      {STUDIO_STEPS.map((label, i) => {
        const n = i + 1;
        const isDone = done.includes(n) || n < current;
        const isCurrent = n === current;
        return (
          <li
            key={n}
            aria-current={isCurrent ? "step" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:text-sm ${isCurrent ? "border-accent bg-sakura font-bold" : "border-line bg-surface text-ink-soft"}`}
          >
            <span aria-hidden className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[11px] font-bold ${isCurrent ? "bg-accent text-white" : isDone ? "bg-wakakusa text-ink" : "bg-line text-ink-soft"}`}>
              {isDone && !isCurrent ? "✓" : n}
            </span>
            <span className={isCurrent ? "" : "hidden sm:inline"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
