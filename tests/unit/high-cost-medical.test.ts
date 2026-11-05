import { describe, expect, it } from "vitest";
import { RULE_2026_08, SUPPORTED_MONTHS, copayOf, onePercent, simulate, type SimInput, type SimResult } from "@/lib/high-cost-medical";

const base: SimInput = { serviceMonth: "2026-11", age: "under70", insurance: "employee", bracket: "c", totalCost: 1_000_000, manyTimes: "no" };
const run = (over: Partial<SimInput>) => simulate({ ...base, ...over });
const ok = (over: Partial<SimInput>) => {
  const r = run(over);
  if (r.kind !== "result") throw new Error(`expected result, got ${JSON.stringify(r)}`);
  return r as SimResult;
};

describe("医療費シミュレーター: 令和8年8月〜令和9年7月・70歳未満（厚生労働省の表）", () => {
  it("表の値（基準額・閾値・多数回該当）が公式の表と一致する", () => {
    expect(RULE_2026_08.brackets).toEqual({
      a: { base: 270_300, threshold: 901_000, many: 140_100 },
      b: { base: 179_100, threshold: 597_000, many: 93_000 },
      c: { base: 85_800, threshold: 286_000, many: 44_400 },
      d: { fixed: 61_500, many: 44_400 },
      e: { fixed: 36_900, many: 24_600 },
    });
    // 基準額は閾値の 3 割（閾値ちょうどで 3 割の額と上限額が一致する）
    for (const b of ["a", "b", "c"] as const) {
      const r = RULE_2026_08.brackets[b] as { base: number; threshold: number };
      expect(copayOf(r.threshold)).toBe(r.base);
    }
  });

  it("区分ごとの計算（総医療費100万円）", () => {
    // ア: 270,300＋(1,000,000−901,000)×1% = 271,290
    expect(ok({ bracket: "a" }).main).toMatchObject({ copay: 300_000, limit: 271_290, outOfPocket: 271_290, reduction: 28_710, reachedLimit: true });
    // イ: 179,100＋(1,000,000−597,000)×1% = 183,130
    expect(ok({ bracket: "b" }).main).toMatchObject({ outOfPocket: 183_130, reduction: 116_870 });
    // ウ: 85,800＋(1,000,000−286,000)×1% = 92,940
    expect(ok({ bracket: "c" }).main).toMatchObject({ outOfPocket: 92_940, reduction: 207_060 });
    // エ・オ: 定額
    expect(ok({ bracket: "d" }).main).toMatchObject({ outOfPocket: 61_500, reduction: 238_500 });
    expect(ok({ bracket: "e" }).main).toMatchObject({ outOfPocket: 36_900, reduction: 263_100 });
  });

  it("被用者保険と国民健康保険で計算式は同じ（判定基準だけが違う）", () => {
    expect(ok({ insurance: "national" }).main).toEqual(ok({ insurance: "employee" }).main);
  });

  it("旧制度（〜令和8年7月）の値を使わない", () => {
    const r = ok({ bracket: "c" }).main;
    expect(r.outOfPocket).not.toBe(80_100 + Math.round((1_000_000 - 267_000) / 100)); // 旧: 87,430
    expect(r.formula).toContain("85,800円");
    expect(r.formula).toContain("286,000円");
  });

  it("境界: 閾値以下は上限に届かない（3 割の額のまま）、閾値を 1 円超えても 3 割の額のほうが小さい間は届かない", () => {
    expect(ok({ totalCost: 286_000 }).main).toMatchObject({ copay: 85_800, outOfPocket: 85_800, reachedLimit: false, limit: null, reduction: 0 });
    // 286,001: 3割 85,800（85,800.3 → 四捨五入）、上限 85,800＋0 → 3割の額 = 上限額で、軽くなる額は 0
    expect(ok({ totalCost: 286_001 }).main).toMatchObject({ copay: 85_800, outOfPocket: 85_800, reduction: 0 });
    // 286,002: 3割 85,801（85,800.6）、上限 85,800（0.02 → 切り捨て）→ 上限に届く
    expect(ok({ totalCost: 286_002 }).main).toMatchObject({ copay: 85_801, outOfPocket: 85_800, reachedLimit: true, reduction: 1 });
    // エ: 3割が 61,500 になる総医療費 205,000 ちょうどは届かない、205,010 で届く
    expect(ok({ bracket: "d", totalCost: 205_000 }).main).toMatchObject({ copay: 61_500, reachedLimit: false });
    expect(ok({ bracket: "d", totalCost: 205_010 }).main).toMatchObject({ copay: 61_503, outOfPocket: 61_500, reachedLimit: true });
    // 少額（1 円）
    expect(ok({ totalCost: 1 }).main).toMatchObject({ copay: 0, outOfPocket: 0, reachedLimit: false });
  });

  it("端数: 1% の部分は 50 銭未満切り捨て・50 銭以上切り上げ（健康保険法施行令第42条）", () => {
    expect(onePercent(49)).toBe(0);
    expect(onePercent(50)).toBe(1);
    expect(onePercent(149)).toBe(1);
    expect(onePercent(150)).toBe(2);
    expect(onePercent(0)).toBe(0);
    expect(onePercent(-10)).toBe(0);
    // ウ 総医療費 1,000,049 → 714,049×1% = 7,140.49 → 7,140、1,000,050 → 7,140.50 → 7,141
    expect(ok({ totalCost: 1_000_049 }).main.outOfPocket).toBe(85_800 + 7_140);
    expect(ok({ totalCost: 1_000_050 }).main.outOfPocket).toBe(85_800 + 7_141);
    // 3 割の額: 1 円未満を四捨五入
    expect(copayOf(100_001)).toBe(30_000); // 30,000.3
    expect(copayOf(100_002)).toBe(30_001); // 30,000.6
    expect(copayOf(100_005)).toBe(30_002); // 30,001.5
  });

  it("多数回該当: 区分ごとの額に置き換わる。3 割の額のほうが小さければ 3 割の額", () => {
    expect(ok({ bracket: "a", manyTimes: "yes" }).main).toMatchObject({ outOfPocket: 140_100, formula: "多数回該当 140,100円" });
    expect(ok({ bracket: "b", manyTimes: "yes" }).main.outOfPocket).toBe(93_000);
    expect(ok({ bracket: "c", manyTimes: "yes" }).main.outOfPocket).toBe(44_400);
    expect(ok({ bracket: "d", manyTimes: "yes" }).main.outOfPocket).toBe(44_400);
    expect(ok({ bracket: "e", manyTimes: "yes" }).main.outOfPocket).toBe(24_600);
    expect(ok({ bracket: "c", manyTimes: "yes", totalCost: 100_000 }).main).toMatchObject({ copay: 30_000, outOfPocket: 30_000, reachedLimit: false });
  });

  it("多数回該当がわからないときは、該当しない場合と該当する場合を両方出す（推測しない）", () => {
    const r = ok({ manyTimes: "unknown" });
    expect(r.main.outOfPocket).toBe(92_940);
    expect(r.ifManyTimes?.outOfPocket).toBe(44_400);
    expect(ok({ manyTimes: "no" }).ifManyTimes).toBeNull();
  });

  it("入力が変わると結果が変わる（総医療費・区分）", () => {
    const a = ok({ totalCost: 500_000 }).main.outOfPocket; // 85,800＋2,140
    const b = ok({ totalCost: 2_000_000 }).main.outOfPocket; // 85,800＋17,140
    expect(a).toBe(87_940);
    expect(b).toBe(102_940);
    expect(ok({ bracket: "b", totalCost: 500_000 }).main.outOfPocket).toBe(150_000); // 3割 150,000 < 上限 179,100（閾値 597,000 以下）
  });
});

describe("対象外・入力の確認（金額を出さない）", () => {
  it("対象の診療月は 2026年8月〜2027年7月の 12 か月", () => {
    expect(SUPPORTED_MONTHS).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07"]);
    expect(run({ serviceMonth: "2026-08" }).kind).toBe("result");
    expect(run({ serviceMonth: "2027-07" }).kind).toBe("result");
  });
  it.each([
    [{ serviceMonth: "2026-07" }, "month_before"],
    [{ serviceMonth: "2027-08" }, "month_after"],
    [{ age: "over70" as const }, "age_over70"],
    [{ age: "preschool" as const }, "age_preschool"],
    [{ insurance: "unknown" as const }, "insurance_unknown"],
    [{ bracket: "unknown" as const }, "bracket_unknown"],
  ])("%o は対象外（%s）", (over, code) => {
    const r = run(over);
    expect(r.kind).toBe("unsupported");
    if (r.kind === "unsupported") expect(r.reasons.map((x) => x.code)).toContain(code);
  });
  it("対象外の条件が複数あれば、すべての理由を返す", () => {
    const r = run({ serviceMonth: "2027-09", age: "over70", bracket: "unknown" });
    expect(r.kind === "unsupported" && r.reasons.map((x) => x.code)).toEqual(["month_after", "age_over70", "bracket_unknown"]);
  });
  it.each([0, -1, 1.5, Number.NaN, 100_000_001])("総医療費 %s は入力エラー", (totalCost) => {
    expect(run({ totalCost }).kind).toBe("invalid");
  });
  it("上限 1 億円ちょうどは計算できる", () => {
    expect(ok({ totalCost: 100_000_000, bracket: "a" }).main.outOfPocket).toBe(270_300 + 990_990);
  });
  it.each(["2026-13", "2026/11", "", "202611"])("診療月 %s は入力エラー", (serviceMonth) => {
    expect(run({ serviceMonth }).kind).toBe("invalid");
  });
});
