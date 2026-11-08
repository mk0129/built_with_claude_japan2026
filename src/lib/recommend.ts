/**
 * 情報処方のリコメンド（ルールベース）。患者の質問・症状・理解確認のつまずき・未学習から、
 * 「今回の外来で処方を検討したい教材」の候補と理由を決定論的に作る。
 * - 診断・治療の提案はしない。あくまで「説明の補助になりうる教材」を並べるだけで、採用は医療者が判断する。
 * - サーバー（Claude による言い換え・絞り込みの前段）と、審査用デモ（ブラウザだけ）の両方で同じ関数を使う。
 */
export type RecommendMaterial = { materialId: string; title: string; summary: string | null; primaryDomain: string; prescribedNow: boolean; prescribedBefore: boolean };
export type RecommendContext = {
  materials: RecommendMaterial[];
  /** 患者の質問（診察ノート・教材への反応。原文） */
  questions: { id: string; body: string; materialId: string | null }[];
  /** 理解確認の誤答・「わからない」 */
  misses: { materialId: string; materialTitle: string; stem: string; isUnknown: boolean }[];
  /** 期間内の症状（最大の程度） */
  symptoms: { key: string; name: string; max: number }[];
  /** 処方済みで未学習・学習途中の教材 */
  unlearned: { materialId: string; title: string; phase: string }[];
};
export type RecommendReasonKind = "question" | "miss" | "symptom" | "unlearned";
export type Recommendation = {
  materialId: string;
  title: string;
  /** 再処方（以前に処方済み）か新規か */
  rePrescribe: boolean;
  score: number;
  reasons: { kind: RecommendReasonKind; text: string; sourceId?: string }[];
};

/** 患者の言葉 → 教材の題名・要約に含まれる語（簡易な対応表。該当しない語は無視する） */
const QUESTION_KEYWORDS: [RegExp, string[]][] = [
  [/しびれ|ピリピリ|感覚/, ["しびれ", "副作用", "セルフケア", "リンパ"]],
  [/吐き気|食欲|食べ|味|口内炎|口の中/, ["口内炎", "味覚", "食事", "副作用", "セルフケア"]],
  [/熱|感染|白血球/, ["発熱", "副作用", "セルフケア", "化学療法室"]],
  [/だるさ|疲れ|倦怠/, ["副作用", "セルフケア", "両立"]],
  [/仕事|職場|勤務|復職|働/, ["両立", "相談先"]],
  [/お金|費用|医療費|高額|給付|手当|保険/, ["高額療養費", "傷病手当金", "相談先"]],
  [/不安|眠れ|落ち込|気持ち|こころ|心/, ["こころ", "相談先"]],
  [/手術|傷|切除|温存/, ["手術"]],
  [/腕|むくみ|リンパ|浮腫/, ["リンパ浮腫", "手術後の生活"]],
  [/放射線|皮膚|日焼け/, ["放射線"]],
  [/髪|脱毛|ウィッグ|眉|見た目|外見/, ["脱毛", "アピアランス"]],
  [/免疫|チェックポイント|オプジーボ|キイトルーダ/, ["免疫チェックポイント"]],
  [/痛み|痛い|骨|緩和/, ["緩和照射", "緩和ケア"]],
  [/セカンドオピニオン|別の病院|ほかの先生|他の医師/, ["セカンドオピニオン"]],
  [/飲み忘れ|飲み方|服薬|錠剤|カプセル/, ["飲み薬"]],
  [/ホルモン|飲み薬|タモキシフェン|内分泌/, ["薬物療法", "サブタイプ"]],
  [/HER2|サブタイプ|受容体|タイプ/, ["サブタイプ"]],
  [/病期|ステージ|進行|広が/, ["病期"]],
  [/抗がん剤|化学療法|点滴/, ["化学療法", "薬物療法"]],
  [/家族|子ども|伝え/, ["子ども", "家族", "こころ"]],
  [/相談|窓口|誰に/, ["相談先"]],
];
/** 症状 → 関係しうる教材の語 */
const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  nausea: ["副作用", "セルフケア"],
  vomiting: ["副作用", "セルフケア"],
  appetite: ["副作用", "セルフケア"],
  taste: ["味覚", "口内炎", "副作用", "セルフケア"],
  mucositis: ["口内炎", "副作用", "セルフケア"],
  fatigue: ["副作用", "セルフケア", "両立"],
  numbness: ["しびれ", "副作用", "セルフケア"],
  fever: ["発熱", "副作用", "セルフケア"],
  diarrhea: ["副作用", "セルフケア"],
  constipation: ["副作用", "セルフケア"],
  rash: ["放射線", "副作用"],
  itch: ["放射線", "副作用"],
  drySkin: ["放射線"],
  edema: ["リンパ浮腫", "手術後の生活"],
  anxiety: ["こころ"],
  depressedMood: ["こころ"],
  insomnia: ["こころ"],
  hotFlash: ["薬物療法", "サブタイプ"],
  jointPain: ["薬物療法"],
  dyspnea: ["副作用", "セルフケア"],
};

/** 多くの教材に含まれる一般的な語。これだけで一致した教材は弱い候補（教材が増えても、話題に近い教材が上に来るように） */
const GENERIC_WORDS = new Set(["副作用", "セルフケア"]);
/** 一致の強さ: 具体的な語が題名にあれば 3、具体的な語が要約にあれば 2、一般的な語が題名にあれば 1、要約だけなら 0.5、なければ 0 */
const matchStrength = (m: RecommendMaterial, words: string[]) => {
  const specific = words.filter((w) => !GENERIC_WORDS.has(w));
  if (specific.some((w) => m.title.includes(w))) return 3;
  if (specific.some((w) => (m.summary ?? "").includes(w))) return 2;
  if (words.some((w) => m.title.includes(w))) return 1;
  return words.some((w) => (m.summary ?? "").includes(w)) ? 0.5 : 0;
};

export function recommendMaterials(ctx: RecommendContext, limit = 3): Recommendation[] {
  const byId = new Map<string, Recommendation>();
  // 一般的な語だけの一致は、教材ごとに 1 回しか加点しない（「副作用」を含む教材が質問と症状の数だけ積み上がらないように）
  const genericCounted = new Set<string>();
  const addMatched = (m: RecommendMaterial, st: number, base: number, reason: Recommendation["reasons"][number]) => {
    if (st === 3) return add(m, base, reason);
    if (st === 2) return add(m, Math.max(1, base - 1), reason);
    // 2 回目以降は加点しないが、理由（どの質問・症状に関係するか）は残す
    if (genericCounted.has(m.materialId)) return add(m, 0, reason);
    genericCounted.add(m.materialId);
    // 一般的な語でも題名にあれば（「化学療法中の副作用とセルフケア」など）その話題の教材なので 2、要約だけなら 1
    add(m, st === 1 ? 2 : 1, reason);
  };
  const add = (m: RecommendMaterial, score: number, reason: Recommendation["reasons"][number]) => {
    if (m.prescribedNow) return;
    const r = byId.get(m.materialId) ?? { materialId: m.materialId, title: m.title, rePrescribe: m.prescribedBefore, score: 0, reasons: [] };
    r.score += score;
    if (!r.reasons.some((x) => x.kind === reason.kind && x.text === reason.text)) r.reasons.push(reason);
    byId.set(m.materialId, r);
  };
  // 1. 理解確認でつまずいた教材（同じ教材の読み直し・再処方）
  for (const miss of ctx.misses) {
    const m = ctx.materials.find((x) => x.materialId === miss.materialId);
    if (m) add(m, miss.isUnknown ? 5 : 4, { kind: "miss", text: `理解確認で「${miss.stem}」に${miss.isUnknown ? "「わからない」と回答" : "誤答"}` });
  }
  // 2. 患者の質問に関係しうる教材
  for (const q of ctx.questions) {
    if (q.materialId) {
      const m = ctx.materials.find((x) => x.materialId === q.materialId);
      if (m) add(m, 4, { kind: "question", text: `質問「${short(q.body)}」はこの教材の学習中に出たもの`, sourceId: q.id });
    }
    for (const [re, words] of QUESTION_KEYWORDS) {
      if (!re.test(q.body)) continue;
      for (const m of ctx.materials) {
        const st = matchStrength(m, words);
        if (st) addMatched(m, st, 3, { kind: "question", text: `質問「${short(q.body)}」に関係しうる内容`, sourceId: q.id });
      }
    }
  }
  // 3. 期間内の症状（程度 2 以上）
  for (const s of ctx.symptoms.filter((x) => x.max >= 2)) {
    const words = SYMPTOM_KEYWORDS[s.key];
    if (!words) continue;
    for (const m of ctx.materials) {
      const st = matchStrength(m, words);
      if (st) addMatched(m, st, s.max >= 3 ? 3 : 2, { kind: "symptom", text: `症状「${s.name}」を最大 ${s.max}/4 で記録` });
    }
  }
  // 4. 処方済みで未学習（再処方ではなく、学習の声かけの候補として下位に）
  for (const u of ctx.unlearned) {
    const m = ctx.materials.find((x) => x.materialId === u.materialId);
    if (m && !byId.has(m.materialId)) byId.set(m.materialId, { materialId: m.materialId, title: m.title, rePrescribe: true, score: 1, reasons: [{ kind: "unlearned", text: u.phase === "not_started" ? "処方済みで未学習" : "処方済みで学習途中" }] });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja")).slice(0, limit);
}

const short = (s: string) => (s.length > 28 ? `${s.slice(0, 28)}…` : s);

/**
 * バイタルの目安の色分け（在宅経過表・診察サマリー）。一般的な目安で、CTCAE Grade の判定や診断ではない。
 * 0: 目安の範囲内、1: 注意（黄）、2: 要確認（赤）
 */
export type VitalFlag = 0 | 1 | 2;
export function vitalFlag(key: string, value: number): VitalFlag {
  switch (key) {
    case "temperature":
      return value >= 38 ? 2 : value >= 37.5 ? 1 : 0;
    case "systolic":
      return value >= 160 || value < 90 ? 2 : value >= 140 || value < 100 ? 1 : 0;
    case "diastolic":
      return value >= 100 ? 2 : value >= 90 ? 1 : 0;
    case "pulse":
      return value >= 120 || value < 50 ? 2 : value >= 100 ? 1 : 0;
    case "spo2":
      return value <= 93 ? 2 : value <= 95 ? 1 : 0;
    default:
      return 0;
  }
}
export const VITAL_FLAG_NOTE = "色は一般的な目安（体温 37.5℃以上／38℃以上、血圧 140 以上／160 以上または 90 未満、脈拍 100 以上／120 以上または 50 未満、SpO₂ 95%以下／93%以下）で、CTCAE Grade の判定や診断ではありません。";
