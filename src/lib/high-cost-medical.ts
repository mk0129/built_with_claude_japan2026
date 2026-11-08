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

// ---------- 70 歳以上（令和8年8月〜令和9年7月診療分。厚生労働省「高額療養費制度の見直しについて」4 ページ目の表） ----------
/** 70 歳以上の所得区分。現役並み（3 割）は 70 歳未満のア〜ウと同じ計算式。一般・低所得は外来（個人）と世帯（入院を含む）の定額 */
export type SeniorTier = "active3" | "active2" | "active1" | "general" | "low2" | "low1";
export const SENIOR_NAME: Record<SeniorTier, string> = {
  active3: "現役並みIII",
  active2: "現役並みII",
  active1: "現役並みI",
  general: "一般",
  low2: "住民税非課税（低所得II）",
  low1: "住民税非課税で所得が一定以下（低所得I）",
};
export const SENIOR_INCOME_HINT: Record<SeniorTier, string> = {
  active3: "年収 約1,160万円〜（課税所得690万円以上）",
  active2: "年収 約770万〜約1,160万円（課税所得380万円以上）",
  active1: "年収 約370万〜約770万円（課税所得145万円以上）",
  general: "年収 〜約370万円（課税所得145万円未満）",
  low2: "世帯全員が住民税非課税",
  low1: "住民税非課税で、年金収入80万円以下など",
};
export const SENIOR_RULES: Record<SeniorTier, { kind: "formula"; base: number; threshold: number; many: number } | { kind: "fixed"; outpatient: number; household: number; many: number | null; outpatientYear: number | null }> = {
  active3: { kind: "formula", base: 270_300, threshold: 901_000, many: 140_100 },
  active2: { kind: "formula", base: 179_100, threshold: 597_000, many: 93_000 },
  active1: { kind: "formula", base: 85_800, threshold: 286_000, many: 44_400 },
  general: { kind: "fixed", outpatient: 22_000, household: 61_500, many: 44_400, outpatientYear: 216_000 },
  low2: { kind: "fixed", outpatient: 11_000, household: 25_700, many: 24_600, outpatientYear: 96_000 },
  low1: { kind: "fixed", outpatient: 8_000, household: 15_700, many: null, outpatientYear: null },
};
/** 70 歳以上の負担割合（保険証・資格確認書に書いてある）。3 割は現役並み、1〜2 割は一般・低所得 */
export type CopayRate = 1 | 2 | 3;
export const SENIOR_TIERS_BY_RATE: Record<CopayRate, SeniorTier[]> = { 3: ["active3", "active2", "active1"], 2: ["general", "low2", "low1"], 1: ["general", "low2", "low1"] };
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
    reasons.push({ code: "insurance_unknown", message: "加入している健康保険の種類によって所得区分の決め方が違います。加入している健康保険（保険者）は、マイナ保険証をお持ちの方はマイナポータルで、お持ちでない方は資格確認書で確かめられます。" });
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


// ---------- 拡張版（2026-11 の見直し）: 70 歳以上・小学校入学前・保険や区分が「わからない」場合も金額の目安を出す ----------
export type SimInputV2 = {
  serviceMonth: string;
  age: AgeGroup;
  /** 70 歳未満・小学校入学前: 保険の種類（わからないままでも計算できる） */
  insurance: InsuranceType | "unknown";
  /** 70 歳未満・小学校入学前: 所得区分（わからないときは全区分の目安を出す） */
  bracket: Bracket | "unknown";
  /** 70 歳以上: 窓口の負担割合（保険証・資格確認書の記載） */
  copayRate?: CopayRate;
  /** 70 歳以上: 所得区分（わからないときは負担割合に応じた区分の目安をすべて出す） */
  seniorTier?: SeniorTier | "unknown";
  /** 70 歳以上: 外来（個人ごとの上限）か入院（世帯ごとの上限）か */
  setting?: "outpatient" | "inpatient";
  totalCost: number;
  manyTimes: "yes" | "no" | "unknown";
};

export type Scenario = {
  /** 区分の表示名（例: 区分ウ、現役並みI、一般） */
  label: string;
  /** 区分の判定基準・年収の目安 */
  criteria: string;
  /** 多数回該当「はい」ならその額。「いいえ」「わからない」は該当しない場合 */
  main: Estimate;
  /** 多数回該当「わからない」のときだけ: 該当する場合（70 歳以上の外来の上限には多数回該当がない） */
  ifManyTimes: Estimate | null;
};
export type SimResultV2 = {
  kind: "result";
  rule: RuleSet;
  input: SimInputV2;
  /** 窓口の負担割合（1〜3） */
  rate: CopayRate;
  /** 区分がわかっているときは 1 件。わからないときは候補の区分ごと */
  scenarios: Scenario[];
  /** 区分が「わからない」で、複数の区分の目安を出している */
  assumed: boolean;
  /** 画面に出す注意（70 歳以上の外来・入院の扱いなど） */
  notes: string[];
};

function copayAt(totalCost: number, rate: CopayRate) {
  return Math.floor((totalCost * rate + 5) / 10);
}

function estimateWith(limit: number | null, formula: string, totalCost: number, rate: CopayRate): Estimate {
  const copay = copayAt(totalCost, rate);
  const reachedLimit = limit !== null && copay > limit;
  const outOfPocket = reachedLimit ? limit! : copay;
  return { copay, limit: reachedLimit ? limit : null, outOfPocket, reduction: copay - outOfPocket, reachedLimit, formula };
}

function bracketScenario(b: Bracket, input: SimInputV2, rate: CopayRate): Scenario {
  const r = RULE_2026_08.brackets[b];
  const normal = (() => {
    if ("fixed" in r) return estimateWith(r.fixed, yen(r.fixed), input.totalCost, rate);
    const limit = input.totalCost > r.threshold ? r.base + onePercent(input.totalCost - r.threshold) : null;
    return estimateWith(limit, `${yen(r.base)}＋（総医療費 − ${yen(r.threshold)}）× 1%`, input.totalCost, rate);
  })();
  const many = estimateWith(r.many, `多数回該当 ${yen(r.many)}`, input.totalCost, rate);
  const criteria = input.insurance === "unknown" ? BRACKET_INCOME_HINT[b] : `${BRACKET_CRITERIA[input.insurance][b]}（${BRACKET_INCOME_HINT[b]}）`;
  return { label: BRACKET_NAME[b], criteria, main: input.manyTimes === "yes" ? many : normal, ifManyTimes: input.manyTimes === "unknown" ? many : null };
}

function seniorScenario(t: SeniorTier, input: SimInputV2, rate: CopayRate): Scenario {
  const r = SENIOR_RULES[t];
  const setting = input.setting ?? "outpatient";
  if (r.kind === "formula") {
    const normal = (() => {
      const limit = input.totalCost > r.threshold ? r.base + onePercent(input.totalCost - r.threshold) : null;
      return estimateWith(limit, `${yen(r.base)}＋（総医療費 − ${yen(r.threshold)}）× 1%`, input.totalCost, rate);
    })();
    const many = estimateWith(r.many, `多数回該当 ${yen(r.many)}`, input.totalCost, rate);
    return { label: SENIOR_NAME[t], criteria: SENIOR_INCOME_HINT[t], main: input.manyTimes === "yes" ? many : normal, ifManyTimes: input.manyTimes === "unknown" ? many : null };
  }
  if (setting === "outpatient") {
    // 外来（個人ごと）の上限には多数回該当の区分がない
    const normal = estimateWith(r.outpatient, `外来（個人ごと）の上限 ${yen(r.outpatient)}`, input.totalCost, rate);
    return { label: SENIOR_NAME[t], criteria: SENIOR_INCOME_HINT[t], main: normal, ifManyTimes: null };
  }
  const normal = estimateWith(r.household, `世帯ごと（入院を含む）の上限 ${yen(r.household)}`, input.totalCost, rate);
  const many = r.many === null ? null : estimateWith(r.many, `多数回該当 ${yen(r.many)}`, input.totalCost, rate);
  return { label: SENIOR_NAME[t], criteria: SENIOR_INCOME_HINT[t], main: input.manyTimes === "yes" && many ? many : normal, ifManyTimes: input.manyTimes === "unknown" ? many : null };
}

/** 拡張版の計算。対象外は診療月だけ（70 歳以上・小学校入学前・保険や区分が不明でも目安を出す） */
export function simulateV2(input: SimInputV2): SimResultV2 | Unsupported | InvalidInput {
  if (!monthOk(input.serviceMonth)) return { kind: "invalid", message: "診療月を選んでください" };
  if (!Number.isInteger(input.totalCost) || input.totalCost < 1 || input.totalCost > MAX_TOTAL_COST)
    return { kind: "invalid", message: `総医療費は 1円〜${yen(MAX_TOTAL_COST)} の整数で入力してください` };
  const rule = RULE_2026_08;
  const reasons: Unsupported["reasons"] = [];
  if (input.serviceMonth < rule.from) reasons.push({ code: "month_before", message: "2026年7月以前の診療分は見直し前の制度のため、この画面では計算しません。" });
  if (input.serviceMonth > rule.to) reasons.push({ code: "month_after", message: "2027年8月以降の診療分は所得区分が細かく分かれるため、この画面では計算しません。" });
  if (reasons.length) return { kind: "unsupported", reasons };
  const notes: string[] = [];
  if (input.age === "over70") {
    const rate: CopayRate = input.copayRate ?? 2;
    if (!input.copayRate) notes.push("負担割合が選ばれていないため 2 割として計算しています。");
    const tiers = input.seniorTier && input.seniorTier !== "unknown" ? [input.seniorTier] : SENIOR_TIERS_BY_RATE[rate];
    const scenarios = tiers.filter((t) => SENIOR_TIERS_BY_RATE[rate].includes(t)).map((t) => seniorScenario(t, input, rate));
    if (rate !== 3 && (input.setting ?? "outpatient") === "outpatient") notes.push("外来の上限は個人ごとの月額です。年間の外来上限（8月〜翌年7月）は別にあります。");
    if (rate !== 3 && input.setting === "inpatient") notes.push("入院の上限は世帯ごとの月額です。同じ世帯の70歳以上の方の医療費を合算して判定されます。");
    return { kind: "result", rule, input, rate, scenarios: scenarios.length ? scenarios : SENIOR_TIERS_BY_RATE[rate].map((t) => seniorScenario(t, input, rate)), assumed: !input.seniorTier || input.seniorTier === "unknown", notes };
  }
  const rate: CopayRate = input.age === "preschool" ? 2 : 3;
  if (input.age === "preschool") notes.push("小学校入学前のお子さんは窓口負担が2割です。上限額は世帯の所得区分（ア〜オ）で決まります。自治体の子ども医療費助成がある場合は、さらに負担が軽くなります。");
  if (input.insurance === "unknown") notes.push("保険の種類が未選択のため、所得区分は年収の目安で選んでいます。正式な区分は加入している健康保険（保険者）が判定します。");
  const brackets: Bracket[] = input.bracket === "unknown" ? ["a", "b", "c", "d", "e"] : [input.bracket];
  return { kind: "result", rule, input, rate, scenarios: brackets.map((b) => bracketScenario(b, input, rate)), assumed: input.bracket === "unknown", notes };
}

/** 今日の診療月（YYYY-MM）。対象の 12 か月に入っていなければ null */
export function currentServiceMonth(now = new Date()): string | null {
  const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return SUPPORTED_MONTHS.includes(m) ? m : null;
}
