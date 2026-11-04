/**
 * 確認問題の正答位置の偏りを防ぐ（Claude が作った新しい下書きにだけ適用。公開済みの教材・患者の回答・採点は変えない）。
 * - 正答を 1・2・3 番目に分散させる（元の位置をできるだけ保つずらし方を選ぶ）。
 * - 正答以外の 2 つの選択肢は元の順番のまま。正答のインデックスを並べ替え後の位置に更新する。設問文・解説は変えない。
 * - 選択肢の位置や他の選択肢を参照する問題（「A」「2番目」「すべて」「いずれも」「上記」など）は並べ替えない。
 */
export type BalanceQuestion = { stem: string; options: string[]; correctIndex: number; explanation: string };

const POSITION_REF = /(^|[^A-Za-z])[ABCＡＢＣ](?=[）)」\s。、]|$)|[1-3１-３]\s*番目|選択肢\s*[1-3１-３ABCＡＢＣ]|すべて|全て|いずれも|どれも|上記|以上|以下のうち/;

export function referencesPositions(q: BalanceQuestion) {
  return POSITION_REF.test(q.explanation) || POSITION_REF.test(q.stem) || q.options.some((o) => POSITION_REF.test(o));
}

/** 正答を target 番目に移す（他の 2 つは元の順番） */
function moveCorrect<T extends BalanceQuestion>(q: T, target: number): T {
  const correct = q.options[q.correctIndex];
  const others = q.options.filter((_, i) => i !== q.correctIndex);
  const options = [...others];
  options.splice(target, 0, correct);
  return { ...q, options, correctIndex: target };
}

export function balanceAnswerPositions<T extends BalanceQuestion>(questions: T[]): { questions: T[]; moved: number[]; warning: string | null } {
  const movable = questions.map((q) => q.options.length === 3 && q.correctIndex >= 0 && q.correctIndex <= 2 && !referencesPositions(q));
  // ずらし方 offset（0〜2）: 問 i の目標位置は (i + offset) % 3。元の位置と一致する数が最も多いものを選ぶ
  let best = 0;
  let bestKeep = -1;
  for (let offset = 0; offset < 3; offset++) {
    const keep = questions.filter((q, i) => movable[i] && q.correctIndex === (i + offset) % 3).length;
    if (keep > bestKeep) {
      best = offset;
      bestKeep = keep;
    }
  }
  const moved: number[] = [];
  const out = questions.map((q, i) => {
    if (!movable[i]) return q;
    const target = (i + best) % 3;
    if (q.correctIndex === target) return q;
    moved.push(i);
    return moveCorrect(q, target);
  });
  const positions = out.map((q) => q.correctIndex);
  const warning = out.length >= 3 && new Set(positions).size === 1 ? "確認問題の正答がすべて同じ位置です。公開前に選択肢の順番を確認してください" : null;
  return { questions: out, moved, warning };
}
