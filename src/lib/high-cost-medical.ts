/**
 * 医療費シミュレーター（高額療養費制度を考慮した、保険診療 1 か月分の自己負担の概算）。
 * Claude は使わない。公式の表をそのまま定数にした決定論的な計算（入力が同じなら結果も同じ）。
 *
 * 対象（これ以外は金額を出さない）:
 *   - 診療月 2026年8月〜2027年7月（令和8年8月施行の見直し後・令和9年8月の区分細分化の前）
 *   - 70歳未満（小学校入学後。義務教育就学前は 2 割負担のため対象外）・窓口負担 3 割
 *   - 1 か月（1日〜月末）・1 つの医療機関の「外来」または「入院」のどちらか一方の保険診療（院外処方の薬局分は、処方せんを出した医療機関の外来に含める）。
 *     高額療養費は医療機関ごと・医科入院／医科外来／歯科入院／歯科外来ごとに計算する（協会けんぽ「高額療養費」）。
 *     世帯合算・複数医療機関・同じ医療機関の入院と外来（医科と歯科）の合算・年間上限・保険外の費用・付加給付は計算しない
 * 正本: 厚生労働省「患者負担割合及び高額療養費自己負担限度額（令和8年8月〜令和9年7月）」（高額療養費制度の見直しについて）・協会けんぽ「高額療養費」。
 * 端数: 1% の部分は 1 円未満を 50 銭未満切り捨て・50 銭以上切り上げ（健康保険法施行令第42条）。3 割の額は 1 円未満を四捨五入した概算（実際の窓口では 10 円単位）。
 */

export type AgeGroup = "under70" | "preschool" | "over70";
/** 被用者保険（協会けんぽ・健康保険組合・共済組合など）／国民健康保険。所得区分の判定基準が違う */
export type InsuranceType = "employee" | "national";
/** 区分ア〜オ */
export type Bracket = "a" | "b" | "c" | "d" | "e";

export type SimInput = {
  /** 診療月 YYYY-MM */
  serviceMonth: string;
  age: AgeGroup;
  insurance: InsuranceType | "unknown";
  bracket: Bracket | "unknown";
  /** 保険診療の総医療費（10 割・円） */
  totalCost: number;
  /** 多数回該当（直近 12 か月に 3 回以上、高額療養費の支給を受けた） */
  manyTimes: "yes" | "no" | "unknown";
};

type BracketRule = { base: number; threshold: number } | { fixed: number };
type RuleSet = {
  id: string;
  label: string;
  legal: string;
  from: string;
  to: string;
  brackets: Record<Bracket, BracketRule & { many: number }>;
};

/** 70歳未満・令和8年8月〜令和9年7月診療分（厚生労働省の表のとおり） */
export const RULE_2026_08: RuleSet = {
  id: "2026-08",
  label: "2026年8月〜2027年7月の診療分（令和8年8月施行の見直し後）",
  legal: "健康保険法施行令等の一部を改正する政令（令和8年政令第240号）",
  from: "2026-08",
  to: "2027-07",
  brackets: {
    a: { base: 270_300, threshold: 901_000, many: 140_100 },
    b: { base: 179_100, threshold: 597_000, many: 93_000 },
    c: { base: 85_800, threshold: 286_000, many: 44_400 },
    d: { fixed: 61_500, many: 44_400 },
    e: { fixed: 36_900, many: 24_600 },
  },
};

export const BRACKET_NAME: Record<Bracket, string> = { a: "区分ア", b: "区分イ", c: "区分ウ", d: "区分エ", e: "区分オ" };

/** 所得区分の判定基準（保険の種類ごと）。年収は目安で、区分は加入している健康保険が判定する */
export const BRACKET_CRITERIA: Record<InsuranceType, Record<Bracket, string>> = {
  employee: {
    a: "標準報酬月額 83万円以上",
    b: "標準報酬月額 53万〜79万円",
    c: "標準報酬月額 28万〜50万円",
    d: "標準報酬月額 26万円以下",
    e: "住民税非課税の方（低所得者）",
  },
  national: {
    a: "旧ただし書き所得 901万円超",
    b: "旧ただし書き所得 600万円超〜901万円以下",
    c: "旧ただし書き所得 210万円超〜600万円以下",
    d: "旧ただし書き所得 210万円以下",
    e: "住民税非課税世帯",
  },
};
export const BRACKET_INCOME_HINT: Record<Bracket, string> = {
  a: "年収 約1,160万円〜",
  b: "年収 約770万〜約1,160万円",
  c: "年収 約370万〜約770万円",
  d: "年収 〜約370万円",
  e: "住民税非課税",
};
export const INSURANCE_NAME: Record<InsuranceType, string> = {
  employee: "会社などの健康保険（協会けんぽ・健康保険組合・共済組合など）",
  national: "国民健康保険",
};

export const SOURCES = [
  {
    title: "高額療養費制度の見直しについて（患者負担割合及び高額療養費自己負担限度額 令和8年8月〜令和9年7月）",
    publisher: "厚生労働省",
    url: "https://www.mhlw.go.jp/content/001726232.pdf",
    checkedAt: "2026-11-05",
  },
  {
    title: "高額療養費制度を利用される皆さまへ",
    publisher: "厚生労働省",
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/kougakuiryou/",
    checkedAt: "2026-11-05",
  },
  {
    title: "高額療養費（限度額適用認定証・高額療養費・高額介護合算）",
    publisher: "全国健康保険協会（協会けんぽ）",
    url: "https://www.kyoukaikenpo.or.jp/benefit/high_cost_medical_expenses/002/index.html",
    checkedAt: "2026-11-05",
  },
] as const;

/** この画面で計算しないもの（結果にも必ず表示する） */
export const NOT_INCLUDED = [
  "年間上限（8月〜翌年7月の合計で判定。払い戻しの時期・手続きは加入している健康保険に確認）",
  "世帯合算・複数の医療機関の合算",
  "同じ医療機関の入院と外来の合算（医科と歯科も別に計算します）",
  "保険外の費用（入院中の食事代、差額ベッド代、先進医療、診断書料など）",
  "加入している健康保険の付加給付（独自の上乗せ）",
] as const;

export type Unsupported = { kind: "unsupported"; reasons: { code: string; message: string }[] };
export type Estimate = {
  /** 3 割の額（窓口負担の概算） */
  copay: number;
  /** この総医療費での月の上限額。上限に届かないときは null */
  limit: number | null;
  /** 自己負担の概算（3 割の額と上限額の小さいほう） */
  outOfPocket: number;
  /** 高額療養費として軽くなる額の概算（3 割の額 − 自己負担の概算） */
  reduction: number;
  reachedLimit: boolean;
  /** 上限額の計算式（表示用） */
  formula: string;
};
export type SimResult = {
  kind: "result";
  rule: RuleSet;
  input: SimInput & { insurance: InsuranceType; bracket: Bracket };
  /** 多数回該当「はい」「いいえ」のときはその結果。「わからない」は該当しない場合 */
  main: Estimate;
  /** 多数回該当「わからない」のときだけ: 該当する場合 */
  ifManyTimes: Estimate | null;
};
export type InvalidInput = { kind: "invalid"; message: string };

export const MAX_TOTAL_COST = 100_000_000;

/** 1% の部分（総医療費 − 基準額）× 1%。1 円未満は 50 銭未満切り捨て・50 銭以上切り上げ（健康保険法施行令第42条） */
export function onePercent(excess: number): number {
  if (excess <= 0) return 0;
  return Math.floor((excess + 50) / 100);
}

/** 3 割の額（1 円未満を四捨五入した概算） */
export function copayOf(totalCost: number): number {
  return Math.floor((totalCost * 3 + 5) / 10);
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

function estimate(rule: BracketRule & { many: number }, totalCost: number, manyTimes: boolean): Estimate {
  const copay = copayOf(totalCost);
  let limit: number | null;
  let formula: string;
  if (manyTimes) {
    limit = rule.many;
    formula = `多数回該当 ${yen(rule.many)}`;
  } else if ("fixed" in rule) {
    limit = rule.fixed;
    formula = yen(rule.fixed);
  } else {
    // 総医療費が基準額以下なら、3 割の額は必ず上限額より小さい（上限に届かない）
    limit = totalCost > rule.threshold ? rule.base + onePercent(totalCost - rule.threshold) : null;
    formula = `${yen(rule.base)}＋（総医療費 − ${yen(rule.threshold)}）× 1%`;
  }
  const reachedLimit = limit !== null && copay > limit;
  const outOfPocket = reachedLimit ? limit! : copay;
  return { copay, limit: reachedLimit ? limit : null, outOfPocket, reduction: copay - outOfPocket, reachedLimit, formula };
}

const monthOk = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** 計算する。対象外の条件は金額を出さず理由を返す。入力の形が正しくないときは invalid */
export function simulate(input: SimInput): SimResult | Unsupported | InvalidInput {
  if (!monthOk(input.serviceMonth)) return { kind: "invalid", message: "診療月を選んでください" };
  if (!Number.isInteger(input.totalCost) || input.totalCost < 1 || input.totalCost > MAX_TOTAL_COST)
    return { kind: "invalid", message: `総医療費は 1円〜${yen(MAX_TOTAL_COST)} の整数で入力してください` };

  const reasons: Unsupported["reasons"] = [];
  const rule = RULE_2026_08;
  if (input.serviceMonth < rule.from)
    reasons.push({ code: "month_before", message: "2026年7月以前の診療分は見直し前の制度のため、この画面では計算しません。" });
  if (input.serviceMonth > rule.to)
    reasons.push({ code: "month_after", message: "2027年8月以降の診療分は所得区分が細かく分かれるため、この画面では計算しません。" });
  if (input.age === "over70")
    reasons.push({ code: "age_over70", message: "70歳以上の方は、外来の上限など計算の条件が違うため、この画面では計算しません。" });
  if (input.age === "preschool")
    reasons.push({ code: "age_preschool", message: "小学校入学前のお子さんは窓口負担が2割のため、この画面では計算しません。" });
  if (input.insurance === "unknown")
    reasons.push({ code: "insurance_unknown", message: "加入している健康保険の種類によって所得区分の決め方が違います。保険証や資格確認書の保険者名を確認してください。" });
  if (input.bracket === "unknown")
    reasons.push({
      code: "bracket_unknown",
      message: "所得区分は加入している健康保険が判定します。年収の目安だけでは決められないため、保険者（協会けんぽ・健康保険組合・市区町村の国民健康保険の窓口など）に確認してください。",
    });
  if (reasons.length) return { kind: "unsupported", reasons };

  const insurance = input.insurance as InsuranceType;
  const bracket = input.bracket as Bracket;
  const r = rule.brackets[bracket];
  return {
    kind: "result",
    rule,
    input: { ...input, insurance, bracket },
    main: estimate(r, input.totalCost, input.manyTimes === "yes"),
    ifManyTimes: input.manyTimes === "unknown" ? estimate(r, input.totalCost, true) : null,
  };
}

/** 選べる診療月（対象の 12 か月） */
export const SUPPORTED_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, 7 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});
export const monthLabel = (m: string) => `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`;
