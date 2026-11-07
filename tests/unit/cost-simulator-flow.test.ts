import { describe, expect, it } from "vitest";
import { NOT_INCLUDED, simulate, type SimInput } from "@/lib/high-cost-medical";
import { ASSUMED_COSTS, REASON_KIND, buildOutcome, isOutsideSystem, stepsFor } from "@/concept-d/cost-simulator-flow";
import { SIM_ASK_GROUPS, SIM_KIND_TEXT, SIM_NEXT_STEPS } from "@/concept-d/socialSupport";

/** 既存の適用条件（2026年11月・70歳未満・会社の健康保険・区分ウ・多数回該当しない） */
const base: SimInput = { serviceMonth: "2026-11", age: "under70", insurance: "employee", bracket: "c", totalCost: 1_000_000, manyTimes: "no" };

describe("回帰: 既存の適用条件で総医療費100万円 → 自己負担92,940円", () => {
  it("計算関数の結果が変わらない（85,800＋(1,000,000−286,000)×1%）", () => {
    const r = simulate(base);
    expect(r.kind).toBe("result");
    if (r.kind !== "result") return;
    expect(r.main).toMatchObject({ copay: 300_000, outOfPocket: 92_940, reduction: 207_060, reachedLimit: true });
  });
  it("「総医療費がわかる」入口でも同じ 1 件の結果になる", () => {
    const o = buildOutcome(base, "known");
    expect(o.kind).toBe("single");
    if (o.kind === "single") expect(o.result.main.outOfPocket).toBe(92_940);
  });
});

describe("入口の分岐と質問の並び", () => {
  it("総医療費を知らない入口（仮定して比べる）では総医療費を聞かない。条件は一問ずつ", () => {
    expect(stepsFor("known")).toEqual(["month", "age", "insurance", "bracket", "manyTimes", "cost"]);
    expect(stepsFor("compare")).toEqual(["month", "age", "insurance", "bracket", "manyTimes"]);
  });

  it("費用を仮定して比べる: 仮定額ごとに並べ、入力の総医療費は使わない", () => {
    const o = buildOutcome({ ...base, totalCost: 12_345 }, "compare");
    expect(o.kind).toBe("table");
    if (o.kind !== "table") return;
    expect(o).toMatchObject({ axis: "cost", assumed: true });
    expect(o.rows.map((r) => r.result.input.totalCost)).toEqual([...ASSUMED_COSTS]);
    // 30万 85,940／50万 87,940／100万 92,940／200万 102,940（いずれも区分ウ）
    expect(o.rows.map((r) => r.result.main.outOfPocket)).toEqual([85_940, 87_940, 92_940, 102_940]);
  });

  it("所得区分がわからない: 区分を決めず、ア〜オを並べる（総医療費がわかる入口・仮定の入口とも）", () => {
    const known = buildOutcome({ ...base, bracket: "unknown" }, "known");
    expect(known).toMatchObject({ kind: "table", axis: "bracket", assumed: false, totalCost: 1_000_000 });
    if (known.kind === "table") expect(known.rows.map((r) => r.result.main.outOfPocket)).toEqual([271_290, 183_130, 92_940, 61_500, 36_900]);
    const assumed = buildOutcome({ ...base, bracket: "unknown" }, "compare", 300_000);
    expect(assumed).toMatchObject({ kind: "table", axis: "bracket", assumed: true, totalCost: 300_000 });
    if (assumed.kind === "table") expect(assumed.rows.map((r) => r.result.main.outOfPocket)).toEqual([90_000, 90_000, 85_940, 61_500, 36_900]);
  });

  it("多数回該当がわからない: 各行に該当する場合も出す", () => {
    const o = buildOutcome({ ...base, manyTimes: "unknown" }, "compare");
    if (o.kind !== "table") throw new Error("table expected");
    expect(o.rows.every((r) => r.result.ifManyTimes !== null)).toBe(true);
  });
});

describe("金額を出さない条件: アプリ未対応／情報が足りない／制度の対象外を区別する", () => {
  const reasonsOf = (over: Partial<SimInput>, mode: "known" | "compare" = "known") => {
    const o = buildOutcome({ ...base, ...over }, mode);
    if (o.kind !== "unsupported") throw new Error(`unsupported expected: ${o.kind}`);
    return o.reasons.map((r) => [r.code, r.kind]);
  };
  it("2024年8月の診療分 → アプリ未対応（見直し前の制度）", () => {
    expect(reasonsOf({ serviceMonth: "2024-08" })).toEqual([["month_before", "app"]]);
  });
  it("70歳以上・小学校入学前 → アプリ未対応（制度を使えるかどうかの判断ではない）", () => {
    expect(reasonsOf({ age: "over70" })).toEqual([["age_over70", "app"]]);
    expect(reasonsOf({ age: "preschool" }, "compare")).toEqual([["age_preschool", "app"]]);
  });
  it("保険がわからない → 情報が足りない（確かめ方を案内）", () => {
    expect(reasonsOf({ insurance: "unknown" })).toEqual([["insurance_unknown", "info"]]);
  });
  it("保険がわからず区分もわからない → 両方の理由を示し、区分ごとの表にはしない", () => {
    expect(reasonsOf({ insurance: "unknown", bracket: "unknown" })).toEqual([
      ["insurance_unknown", "info"],
      ["bracket_unknown", "info"],
    ]);
  });
  it("理由のコードすべてに種類と「次にできること」がある", () => {
    const all = [
      { serviceMonth: "2024-08" },
      { serviceMonth: "2027-08" },
      { age: "over70" as const },
      { age: "preschool" as const },
      { insurance: "unknown" as const },
      { bracket: "unknown" as const },
    ].flatMap((o) => {
      const r = simulate({ ...base, ...o });
      return r.kind === "unsupported" ? r.reasons.map((x) => x.code) : [];
    });
    expect(new Set(all)).toEqual(new Set(Object.keys(REASON_KIND)));
    for (const code of all) expect(SIM_NEXT_STEPS[code]?.length).toBeGreaterThan(0);
    for (const k of Object.values(REASON_KIND)) expect(SIM_KIND_TEXT[k].label).toBeTruthy();
  });
  it("「含まれないもの」は、保険外の費用（制度の対象外）が 1 件、ほかはアプリ未対応", () => {
    expect(NOT_INCLUDED.filter(isOutsideSystem)).toHaveLength(1);
    expect(NOT_INCLUDED.filter((x) => !isOutsideSystem(x))).toHaveLength(NOT_INCLUDED.length - 1);
  });
  it("見積もりの案内は、確認先ごとの質問を持つ（計算はしない）", () => {
    expect(SIM_ASK_GROUPS.map((g) => g.to)).toEqual(["病院の医療費の相談窓口・医療ソーシャルワーカー", "主治医", "加入している健康保険（保険者）"]);
    for (const g of SIM_ASK_GROUPS) expect(g.questions.length).toBeGreaterThan(0);
  });
});
