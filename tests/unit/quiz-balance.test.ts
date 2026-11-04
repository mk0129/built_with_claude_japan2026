import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { balanceAnswerPositions, referencesPositions } from "@/server/services/quiz-balance";

/** Claude が実際に作った確認問題（docs/design/phase2/step5/real/generation.json。正答がすべて 2 番目）で、正答位置の分散と整合性を確かめる */
const real = JSON.parse(readFileSync("docs/design/phase2/step5/real/generation.json", "utf8")).draft.output.questions as {
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}[];

describe("確認問題の正答位置の分散", () => {
  it("実際の生成結果（5 問とも正答が 2 番目）を分散し、設問・選択肢・正答・解説の対応を保つ", () => {
    expect(real.map((q) => q.correctIndex)).toEqual([1, 1, 1, 1, 1]);
    const { questions, moved, warning } = balanceAnswerPositions(real);
    expect(new Set(questions.map((q) => q.correctIndex)).size).toBe(3);
    expect(warning).toBeNull();
    // 元の位置をできるだけ保つ（5 問中 2 問はそのまま）
    expect(moved.length).toBe(3);
    questions.forEach((q, i) => {
      const o = real[i];
      expect(q.stem).toBe(o.stem);
      expect(q.explanation).toBe(o.explanation);
      // 正答の文は同じ・選択肢の集合は同じ・正答以外の 2 つは元の順番
      expect(q.options[q.correctIndex]).toBe(o.options[o.correctIndex]);
      expect([...q.options].sort()).toEqual([...o.options].sort());
      expect(q.options.filter((_, j) => j !== q.correctIndex)).toEqual(o.options.filter((_, j) => j !== o.correctIndex));
    });
  });

  it("選択肢の位置や他の選択肢を参照する問題は並べ替えない", () => {
    const qs = [
      { stem: "正しいものは？", options: ["x", "y", "上記のすべて"], correctIndex: 2, explanation: "e" },
      { stem: "正しいものは？", options: ["x", "y", "z"], correctIndex: 1, explanation: "正解は B です。" },
      { stem: "正しいものは？", options: ["x", "y", "z"], correctIndex: 1, explanation: "2番目が正解です。" },
    ];
    expect(qs.every(referencesPositions)).toBe(true);
    const { questions, moved, warning } = balanceAnswerPositions(qs);
    expect(moved).toEqual([]);
    expect(questions).toEqual(qs);
    expect(warning).toBeNull();
  });

  it("並べ替えられずに全問が同じ位置のときは警告する", () => {
    const qs = [0, 1, 2].map(() => ({ stem: "s", options: ["a", "b", "いずれも正しい"], correctIndex: 2, explanation: "e" }));
    expect(balanceAnswerPositions(qs).warning).toContain("同じ位置");
  });

  it("すでに分散している問題は変えない", () => {
    const qs = [0, 1, 2, 0].map((c) => ({ stem: "s", options: ["a", "b", "c"], correctIndex: c, explanation: "e" }));
    const r = balanceAnswerPositions(qs);
    expect(r.moved).toEqual([]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([0, 1, 2, 0]);
  });
});
