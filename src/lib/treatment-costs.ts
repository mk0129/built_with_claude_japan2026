/**
 * 医療費シミュレーター: 「これから受ける治療」から 1 か月分の保険診療の総医療費（10 割）の目安を出すための参考値。
 * 公開されている薬価（厚生労働省 薬価基準収載品目リスト・令和8年11月適用）と診療報酬点数（令和8年度）から、
 * 体表面積 1.5 m²・体重 55 kg を仮定して概算したレンジ（2026-11 調査）。実際の請求額ではない。
 * 体格・薬の量・先発／後発・併用薬（吐き気止め・白血球を増やす薬）・検査・入院日数・医療機関で大きく変わる。
 * 画面では必ず「概算の目安」「確定額ではない」「医療機関の会計窓口・がん相談支援センターで確認」を添える。
 */
export type TreatmentGroup = "手術・入院" | "化学療法（点滴）" | "分子標的薬" | "飲み薬・ホルモン療法" | "放射線治療" | "診察・検査";

export type TreatmentCost = {
  id: string;
  name: string;
  group: TreatmentGroup;
  /** 1 か月分の総医療費（10 割・円）の目安レンジ */
  low: number;
  high: number;
  /** 患者向けの補足（短く） */
  note: string;
};

export const TREATMENT_COSTS: TreatmentCost[] = [
  { id: "bcs", name: "乳房温存手術＋センチネルリンパ節生検（入院）", group: "手術・入院", low: 600_000, high: 800_000, note: "入院4〜7日の手術月。入院日数・検査で変わります" },
  { id: "mastectomy", name: "乳房全切除＋わきのリンパ節郭清（入院）", group: "手術・入院", low: 800_000, high: 1_000_000, note: "入院7〜12日の手術月" },
  { id: "ec", name: "EC療法（3週ごと）", group: "化学療法（点滴）", low: 50_000, high: 160_000, note: "白血球を増やす注射を併用すると高いほうに近づきます。月2回だと倍になります" },
  { id: "tc", name: "TC療法（3週ごと）", group: "化学療法（点滴）", low: 40_000, high: 160_000, note: "後発品か先発品か、白血球を増やす注射の有無で変わります" },
  { id: "docetaxel", name: "ドセタキセル（3週ごと）", group: "化学療法（点滴）", low: 30_000, high: 150_000, note: "白血球を増やす注射の有無で変わります" },
  { id: "paclitaxel", name: "パクリタキセル（週1回・月4回）", group: "化学療法（点滴）", low: 80_000, high: 110_000, note: "月4回の点滴の合計" },
  { id: "trastuzumab", name: "トラスツズマブ（3週ごと）", group: "分子標的薬", low: 40_000, high: 90_000, note: "バイオシミラーか先発品かで変わります" },
  { id: "pertuzumab", name: "ペルツズマブ＋トラスツズマブ（3週ごと）", group: "分子標的薬", low: 250_000, high: 490_000, note: "初回の月は高いほうに近づきます" },
  { id: "tdm1", name: "トラスツズマブ エムタンシン（T-DM1）", group: "分子標的薬", low: 500_000, high: 650_000, note: "体重で変わります" },
  { id: "tdxd", name: "トラスツズマブ デルクステカン（T-DXd）", group: "分子標的薬", low: 600_000, high: 800_000, note: "体重で変わります" },
  { id: "cdk46", name: "CDK4/6阻害薬＋ホルモン療法（飲み薬・1か月）", group: "飲み薬・ホルモン療法", low: 440_000, high: 510_000, note: "パルボシクリブ・アベマシクリブ" },
  { id: "capecitabine", name: "カペシタビン（飲み薬・1か月）", group: "飲み薬・ホルモン療法", low: 15_000, high: 30_000, note: "後発品か先発品かで変わります" },
  { id: "tamoxifen", name: "タモキシフェン（飲み薬・1か月）", group: "飲み薬・ホルモン療法", low: 3_000, high: 10_000, note: "診察・検査のある月は高いほうに近づきます" },
  { id: "ai", name: "アロマターゼ阻害薬（飲み薬・1か月）", group: "飲み薬・ホルモン療法", low: 4_000, high: 12_000, note: "アナストロゾール・レトロゾールなど" },
  { id: "lhrh", name: "LH-RHアゴニスト注射（月1回）", group: "飲み薬・ホルモン療法", low: 18_000, high: 43_000, note: "3か月製剤は注射した月だけ高くなります" },
  { id: "rt-breast", name: "放射線治療（温存術後の全乳房照射・一連）", group: "放射線治療", low: 500_000, high: 650_000, note: "回数によらず一連の定額。治療を始めた月にまとめて請求されることが多い" },
  { id: "rt-wall", name: "放射線治療（全切除後の胸壁など・1か月分）", group: "放射線治療", low: 370_000, high: 470_000, note: "1か月に16〜20回程度を想定" },
  { id: "visit", name: "外来の診察と血液検査だけの月", group: "診察・検査", low: 6_000, high: 12_000, note: "画像検査がある月は別に加わります" },
];

export const TREATMENT_GROUPS: TreatmentGroup[] = ["手術・入院", "化学療法（点滴）", "分子標的薬", "飲み薬・ホルモン療法", "放射線治療", "診察・検査"];

export const TREATMENT_COST_NOTES = [
  "公開されている薬価・診療報酬からの概算（保険診療10割）で、実際の請求額・確定額ではありません。",
  "体格（身長・体重）や薬の量、先発品か後発品か、併用する吐き気止め・白血球を増やす薬、検査の内容、入院日数、医療機関によって大きく変わります。",
  "正確な見積もりは、受診する医療機関の会計窓口やがん相談支援センターにご確認ください。",
] as const;

export const TREATMENT_COST_SOURCE = {
  checkedAt: "2026-11-08",
  items: [
    { publisher: "厚生労働省", title: "薬価基準収載品目リスト（令和8年11月1日適用）", url: "https://www.mhlw.go.jp/topics/2026/04/tp20260401-01.html" },
    { publisher: "厚生労働省", title: "診断群分類（DPC）電子点数表（令和8年10月更新）", url: "https://www.mhlw.go.jp/stf/newpage_67729.html" },
  ],
} as const;

/** 選んだ治療の合計（目安レンジと中央値） */
export function sumTreatments(ids: string[]) {
  const items = TREATMENT_COSTS.filter((t) => ids.includes(t.id));
  const low = items.reduce((n, t) => n + t.low, 0);
  const high = items.reduce((n, t) => n + t.high, 0);
  return { items, low, high, mid: Math.round((low + high) / 2 / 1000) * 1000 };
}
