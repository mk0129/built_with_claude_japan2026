/**
 * 教材制作の 6 ステップ進行表示（Experience Reset 01 の .stepper）。
 * ① 原資料 → ② 構成を選ぶ → ③ 必須事項 → ④ 生成・編集 → ⑤ 患者表示 → ⑥ 承認
 */
export const STUDIO_STEPS = ["① 原資料", "② 構成を選ぶ", "③ 必須事項", "④ 生成・編集", "⑤ 患者表示", "⑥ 承認"] as const;
const LONG = ["原資料を選ぶ", "Claude の構成案", "必須事項を確認", "教材・クイズを生成", "患者画面で確認", "照合・編集・承認"];

export function Stepper({ current, done = [] }: { current: number; done?: number[] }) {
  return (
    <ol className="rsd-stepper" aria-label="制作の進み方">
      {STUDIO_STEPS.map((label, i) => {
        const n = i + 1;
        const isDone = done.includes(n) || n < current;
        const isCurrent = n === current;
        return (
          <li key={n} aria-current={isCurrent ? "step" : undefined} className={`rsd-step ${isCurrent ? "on" : isDone ? "done" : ""}`} title={LONG[i]}>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
