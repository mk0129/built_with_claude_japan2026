/**
 * 教材の品質チェック（純粋関数。DB・API に依存しない）。
 * - シード教材の点検: scripts/review/materials-lint.mts
 * - Claude の下書きの点検: src/server/services/ai-generation.ts の validateMaterial（医療者に警告として見せる）と公開デモの関数
 * 規約の本文は docs/design/materials_style_guide_20261108.md。しきい値を変えるときは規約も直す。
 * 判定はすべて「監修者が見る候補」で、医学的な正しさは判定しない。
 */

export type QualitySlide = { title: string; proposition?: string | null; body: string; detail?: string | null };
export type QualityQuestion = { stem: string; options: string[]; correctIndex: number; explanation: string; relatedSlide: number };
export type QualityMaterial = { title: string; objectives?: string[]; slides: QualitySlide[]; questions: QualityQuestion[] };

export type QualityCode =
  | "SLIDE_COUNT"
  | "TITLE_LONG"
  | "PROPOSITION_MISSING"
  | "PROPOSITION_LONG"
  | "BODY_SHORT"
  | "BODY_LONG"
  | "SENTENCE_LONG"
  | "BODY_MANY_SENTENCES"
  | "BODY_REPEATS_PROPOSITION"
  | "DETAIL_LONG"
  | "CLOSING_MISSING"
  | "ACTION_MISSING"
  | "INTERNAL_CODE"
  | "Q_COUNT"
  | "Q_OPTIONS"
  | "Q_UNKNOWN_OPTION"
  | "Q_CORRECT_INDEX"
  | "Q_DUPLICATE_OPTION"
  | "Q_RELATED_SLIDE"
  | "Q_OPTION_LENGTH"
  | "Q_CORRECT_LONGEST"
  | "Q_OBVIOUS_DISTRACTOR"
  | "Q_STEM_LONG"
  | "Q_NO_SITUATIONAL"
  | "Q_ALL_GENERIC"
  | "Q_EXPLANATION_LENGTH"
  | "Q_POSITION_SAME"
  | "Q_POSITION_SKEW";

export type QualityIssue = { code: QualityCode; level: "error" | "warning"; where: string; message: string };

/** 文字数の目安（スマートフォン 1 画面に収まる量から決めた。規約 §2・§4） */
export const QUALITY_LIMITS = {
  slideMin: 3,
  slideMax: 7,
  titleMax: 32,
  propositionMax: 45,
  bodyMin: 40,
  bodyMax: 120,
  closingBodyMax: 150,
  sentenceMax: 60,
  bodySentencesMax: 4,
  detailMax: 170,
  questionMin: 2,
  questionMax: 5,
  stemMax: 90,
  optionMax: 60,
  /** 選択肢の最長 ÷ 最短 がこれを超えると「長さに差」 */
  optionLengthRatio: 1.6,
  /** 正答が最長で、2 番目に長い選択肢の この倍 を超えると「正答が最も長い」 */
  correctLongestRatio: 1.3,
  explanationMin: 20,
  explanationMax: 150,
} as const;

/** 本文に含まれていてほしい「患者の行動」（連絡・受診・相談・伝える・聞く・記録する） */
const ACTION = /(連絡|受診|相談|伝え|聞い|聞き|聞く|尋ね|申し出|問い合わせ|申請|印をつけ|メモ|記録)/;
/** まとめ画面に必ず入れる文言 */
const CLOSING = /担当医の説明が優先/;
/** UI に出してはいけない内部コード（src/lib/labels.ts のラベルを使う） */
const INTERNAL = /\b(diagnosis_staging|surgery|drug_therapy|radiation|side_effects_daily_life|mental_care_support|clinician|patient_role|emergency|prohibition|other_material|needs_review)\b/;
/** 状況判断型の設問: 場面（とき・場合・〜ています）と、行動を問う語の両方を含む */
const SCENE = /(とき|場合|ています|ました|たら|ており|っていて|きました|言われ|聞きました)/;
const ASK_ACTION = /(どうし|どう考え|どう対応|対応|相談先|方法|何をし|すればよい|したほうがよい|できること|勧められる|おすすめ|すること|受け止め方|考え方|伝え方|食べ方|進め方|受け方|ケアとして)/;
/** 知識の再生だけを問う形（場面がなければ「一般的な問い」） */
const GENERIC = /(正しいものはどれ|合うものはどれ|含まれないものはどれ|最も近いものはどれ|誤っているものはどれ|あてはまるものはどれ)/;
/** 明らかに誤りとわかる誤答（患者が実際に迷う内容になっていない） */
const OBVIOUS_DISTRACTOR = [
  /^(何も(しない|行わない)|気にしない|放置する|無視する|様子を見る|そのままにする)。?$/,
  /^(治療には)?関係ない。?$/,
  /^(相談できる場所はない|誰にも言わない|我慢する|我慢して誰にも言わない|すぐに仕事を辞めると決める)。?$/,
  /(血液型|好きな食べ物|交通手段|天気|星座|趣味)/,
  /^(無料で受けられる|必ず治る|二度と戻らない|一度変わると二度と戻らない)。?$/,
  /^(レントゲン|何もしない|予約は不要|救急外来に行く|救急外来)。?$/,
];

const len = (s: string | null | undefined) => (s ? [...s.trim()].length : 0);
const sentences = (s: string) =>
  s
    .split(/(?<=[。！？!?])/)
    .map((x) => x.trim())
    .filter(Boolean);
const strip = (s: string) => s.replace(/[\s。、「」『』（）()]/g, "");

/** 場面が置かれているか: 場面を表す語か、問いの前に 1 文以上の説明がある */
function hasScene(stem: string) {
  const t = stem.trim();
  const i = t.indexOf("。");
  return SCENE.test(t) || (i >= 0 && i < t.length - 1);
}
export function isSituationalStem(stem: string) {
  return hasScene(stem) && ASK_ACTION.test(stem);
}
export function isGenericStem(stem: string) {
  return GENERIC.test(stem) && !hasScene(stem);
}
export function isObviousDistractor(option: string) {
  const o = option.trim();
  return OBVIOUS_DISTRACTOR.some((re) => re.test(o));
}

export function checkMaterialQuality(m: QualityMaterial, limits: typeof QUALITY_LIMITS = QUALITY_LIMITS): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const push = (code: QualityCode, level: QualityIssue["level"], where: string, message: string) => issues.push({ code, level, where, message });
  const n = m.slides.length;

  // ---- 画面 ----
  if (n < limits.slideMin || n > limits.slideMax) push("SLIDE_COUNT", "warning", "教材", `画面数が ${n} です（${limits.slideMin}〜${limits.slideMax} の範囲に）`);
  if (len(m.title) > limits.titleMax) push("TITLE_LONG", "warning", "教材", `題名が ${len(m.title)} 文字です（${limits.titleMax} 文字以内に）`);
  let hasAction = false;
  m.slides.forEach((s, i) => {
    const where = `画面 ${i + 1}`;
    const closing = i === n - 1;
    const all = [s.title, s.proposition ?? "", s.body, s.detail ?? ""].join("\n");
    if (INTERNAL.test(all)) push("INTERNAL_CODE", "error", where, "内部コード（drug_therapy など）が本文に入っています");
    if (!closing && !s.proposition?.trim()) push("PROPOSITION_MISSING", "warning", where, "要点（proposition）がありません");
    if (len(s.proposition) > limits.propositionMax) push("PROPOSITION_LONG", "warning", where, `要点が ${len(s.proposition)} 文字です（${limits.propositionMax} 文字以内に。結論を 1 文で）`);
    const bl = len(s.body);
    if (!closing && bl < limits.bodyMin) push("BODY_SHORT", "warning", where, `本文が ${bl} 文字です（${limits.bodyMin} 文字以上に）`);
    const bodyMax = closing ? limits.closingBodyMax : limits.bodyMax;
    if (bl > bodyMax) push("BODY_LONG", "warning", where, `本文が ${bl} 文字です（${bodyMax} 文字以内に。細部は補足へ）`);
    const ss = sentences(s.body);
    const long = ss.filter((x) => len(x) > limits.sentenceMax);
    if (long.length) push("SENTENCE_LONG", "warning", where, `${limits.sentenceMax} 文字を超える文が ${long.length} つあります（「${long[0].slice(0, 24)}…」）`);
    // まとめ画面は定型の 3 文（一般的な説明・担当医の説明が優先・次の診察で聞ける）を含むので、その分を許す
    const maxSentences = closing ? limits.bodySentencesMax + 3 : limits.bodySentencesMax;
    if (ss.length > maxSentences) push("BODY_MANY_SENTENCES", "warning", where, `本文が ${ss.length} 文です（${maxSentences} 文以内に）`);
    if (s.proposition && len(s.proposition) >= 12 && strip(s.body).includes(strip(s.proposition))) push("BODY_REPEATS_PROPOSITION", "warning", where, "本文が要点をそのまま繰り返しています");
    if (len(s.detail) > limits.detailMax) push("DETAIL_LONG", "warning", where, `補足が ${len(s.detail)} 文字です（${limits.detailMax} 文字以内に）`);
    if (!closing && ACTION.test(s.body)) hasAction = true;
  });
  if (n > 0 && !CLOSING.test(m.slides[n - 1].body)) push("CLOSING_MISSING", "warning", `画面 ${n}`, "まとめに「担当医の説明が優先されます」の趣旨がありません");
  if (n > 0 && !hasAction) push("ACTION_MISSING", "warning", "教材", "患者の行動（連絡・受診・相談・伝える・聞く・記録）につながる文が本文にありません");

  // ---- 確認問題 ----
  const q = m.questions;
  if (q.length < limits.questionMin || q.length > limits.questionMax) push("Q_COUNT", "warning", "確認問題", `問題数が ${q.length} です（${limits.questionMin}〜${limits.questionMax} に）`);
  let situational = 0;
  let generic = 0;
  q.forEach((x, i) => {
    const where = `問 ${i + 1}`;
    if (x.options.length !== 3) push("Q_OPTIONS", "error", where, "選択肢が 3 つではありません");
    if (x.options.some((o) => /わからない/.test(o))) push("Q_UNKNOWN_OPTION", "error", where, "「わからない」は選択肢に含めません（アプリが追加します）");
    if (x.correctIndex < 0 || x.correctIndex >= x.options.length) push("Q_CORRECT_INDEX", "error", where, "正答の番号が選択肢の範囲外です");
    if (new Set(x.options.map((o) => strip(o))).size !== x.options.length) push("Q_DUPLICATE_OPTION", "error", where, "同じ選択肢が重複しています");
    if (x.relatedSlide < 1 || x.relatedSlide > n) push("Q_RELATED_SLIDE", "warning", where, `関連画面 ${x.relatedSlide} が範囲外です`);
    if (len(x.stem) > limits.stemMax) push("Q_STEM_LONG", "warning", where, `設問が ${len(x.stem)} 文字です（${limits.stemMax} 文字以内に）`);
    const L = x.options.map((o) => len(o));
    if (L.some((l) => l > limits.optionMax)) push("Q_OPTION_LENGTH", "warning", where, `${limits.optionMax} 文字を超える選択肢があります`);
    else if (Math.min(...L) > 0 && Math.max(...L) / Math.min(...L) > limits.optionLengthRatio) push("Q_OPTION_LENGTH", "warning", where, `選択肢の長さに差があります（${Math.min(...L)}〜${Math.max(...L)} 文字。同じくらいの長さに）`);
    const c = x.correctIndex;
    if (c >= 0 && c < L.length) {
      const others = L.filter((_, j) => j !== c);
      if (L[c] > Math.max(...others) * limits.correctLongestRatio) push("Q_CORRECT_LONGEST", "warning", where, "正答だけが目立って長い選択肢です（長さで選べてしまう）");
      x.options.forEach((o, j) => {
        if (j !== c && isObviousDistractor(o)) push("Q_OBVIOUS_DISTRACTOR", "warning", where, `誤答「${o}」は明らかな誤りです（患者が迷う内容に）`);
      });
    }
    const el = len(x.explanation);
    if (el < limits.explanationMin || el > limits.explanationMax) push("Q_EXPLANATION_LENGTH", "warning", where, `解説が ${el} 文字です（${limits.explanationMin}〜${limits.explanationMax} 文字に）`);
    if (isSituationalStem(x.stem)) situational++;
    if (isGenericStem(x.stem)) generic++;
  });
  if (q.length >= 2 && situational === 0) push("Q_NO_SITUATIONAL", "warning", "確認問題", "状況判断型（「〜のとき、どうしますか」）の設問がありません（1 問以上に）");
  if (q.length >= 2 && generic === q.length) push("Q_ALL_GENERIC", "warning", "確認問題", "すべて「正しいものはどれですか」型です（場面を置いた設問を混ぜる）");
  const pos = q.map((x) => x.correctIndex);
  if (q.length >= 3 && new Set(pos).size === 1) push("Q_POSITION_SAME", "warning", "確認問題", `正答がすべて ${pos[0] + 1} 番目です（位置を分散させる）`);
  else if (q.length >= 4) {
    const counts = [0, 1, 2].map((p) => pos.filter((x) => x === p).length);
    if (Math.max(...counts) >= q.length - 1) push("Q_POSITION_SKEW", "warning", "確認問題", `正答の位置が ${counts.indexOf(Math.max(...counts)) + 1} 番目に偏っています`);
  }
  return issues;
}

/** 比較用の目安点（100 点満点。誤り 1 件 −15、注意 1 件 −4） */
export function qualityScore(issues: QualityIssue[]) {
  const e = issues.filter((i) => i.level === "error").length;
  const w = issues.length - e;
  return Math.max(0, 100 - e * 15 - w * 4);
}

export function formatIssue(i: QualityIssue) {
  return `${i.where}: ${i.message}`;
}
