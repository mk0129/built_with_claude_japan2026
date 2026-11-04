import { createHash } from "node:crypto";
import { z } from "zod";
import { callClaudeStructured, claudeMode, classifyClaudeError, type Generator } from "./claude";
import { fmtDate, fmtDateTime, localDay } from "./intervisit-format";
import type { Intervisit } from "./intervisit";
import { replayFile } from "@/server/demo";
import { ruleSummary, SECTIONS, sourceIndex, type SummaryItem } from "./intervisit-rules";

/**
 * Claude による外来間の時系列要約（Phase 2 Step 4-C）。
 * - 入力は構造化データ（出来事 ID・日時・値）だけ。氏名・メールなどの識別子は送らない。
 * - 外部 AI へ送るのは架空のデモ患者（@example.com）のデータに限る。実患者の利用は施設の承認・データ処理契約・
 *   セキュリティ評価を別途必要とするため、この実装では送信しない（ルールベースの要約を表示）。
 * - 出力は「節・文・根拠 ID」の構造化項目。サーバー側で、根拠 ID の存在・数値と日付が根拠にあること・引用が原文どおりであること・
 *   解釈や診断の語がないことを検証し、通らない項目は表示しない。安全上の違反や検証できない項目が多い場合は要約全体を
 *   ルールベースに切り替える。患者の元データは常に別に表示できる。
 */
// 構造化出力のスキーマには長さ・件数の上限を書かない（API が上限を保証せず、超えると SDK の検証で要約全体が失敗するため）。
// 長さ・件数はサーバー側の検証（validateItems）で 1 項目ずつ判定し、超えた項目だけを不採用にする
export const AiSummarySchema = z.object({
  items: z.array(
    z.object({
      section: z.enum(SECTIONS),
      text: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
});
const MAX_TEXT = 260;
const MAX_SOURCES = 40;
const MAX_ITEMS = 40;

export type AiSummaryResult = {
  status: "ai" | "fallback";
  generator: Generator | "rule" | "replay";
  /** 記録済みの Claude 出力を再生した場合の生成日（撮影用デモ環境のみ） */
  replayOf?: string | null;
  model: string | null;
  items: SummaryItem[];
  /** 表示しなかった項目の数と理由（患者情報は含めない） */
  rejected: { index: number; reason: string }[];
  /** 代替表示に切り替えた理由（患者情報は含めない） */
  fallbackReason: string | null;
  dataHash: string;
  generatedAt: string;
  cached: boolean;
  usage: { inputTokens: number; outputTokens: number } | null;
  /**
   * 不採用になった項目の本文（検証レポート用。サーバー内だけで使い、医療者向けの API には返さない。
   * 検証できない記述を画面に出さないため）
   */
  rejectedItems?: (SummaryItem & { reason: string })[];
};

// ---------- 検証 ----------
/** 解釈・診断・治療提案・能力判断の語（「」内の教材名・設問・患者の原文は対象外） */
const FORBIDDEN: [RegExp, string][] = [
  [/改善|悪化|軽快|増悪|回復|治っ|消失/, "解釈の語（改善・悪化など）"],
  [/正常|異常|基準値|高値|低値|高め|低め/, "正常・異常の判定"],
  [/グレード|Grade|grade|CTCAE|PRO-CTCAE/, "Grade の推定"],
  [/診断|疑い|疑わ|示唆|可能性/, "診断・推測"],
  [/原因|因果|起因|副作用による|薬による|治療による|影響で|によって生じ/, "因果関係"],
  [/推奨|すべき|検討して|必要があ|中止|減量|増量|変更を|処方を/, "治療の提案"],
  [/理解力|能力|理解できていない|理解不足|理解が不十分|理解が乏し/, "理解能力の判断"],
  [/症状(は|が)?(ない|なし|なかった|見られない)|問題(は|が)?(ない|なし)/, "欠測を「症状なし」とする記述"],
];
const outsideQuotes = (t: string) => t.replace(/「[^」]*」/g, "「」");
const quotes = (t: string) => [...t.matchAll(/「([^」]*)」/g)].map((m) => m[1]);
/** 数値（小数・x/4 の分子を含む） */
const numbers = (t: string) => [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
/** 日付は「M月D日」の形だけを日付とみなす（「3/4」は程度の表記） */
const dates = (t: string) => [...t.matchAll(/(\d{1,2})月(\d{1,2})日/g)].map((m) => `${Number(m[1])}/${Number(m[2])}`);

export function validateItems(items: SummaryItem[], iv: Intervisit) {
  const index = sourceIndex(iv);
  const valid: SummaryItem[] = [];
  const rejected: { index: number; reason: string }[] = [];
  let safetyViolation = false;
  items.forEach((item, i) => {
    const reject = (reason: string, safety = false) => {
      rejected.push({ index: i, reason });
      if (safety) safetyViolation = true;
    };
    if (!SECTIONS.includes(item.section)) return reject("不明な節");
    if (i >= MAX_ITEMS) return reject("項目が多すぎる");
    if (!item.text.trim() || item.text.length > MAX_TEXT) return reject("文が長すぎる（または空）");
    if (item.sourceIds.length > MAX_SOURCES) return reject("根拠 ID が多すぎる");
    const srcs = item.sourceIds.map((id) => index.get(id));
    if (item.sourceIds.length === 0 || srcs.some((x) => !x)) return reject("存在しない根拠 ID");
    const plain = outsideQuotes(item.text);
    // 理由には一致した禁止語（こちらの一覧の語。患者の記録ではない）を含め、原因を追跡できるようにする
    for (const [re, label] of FORBIDDEN) {
      const hit = plain.match(re);
      if (hit) return reject(`禁止された記述：${label}（${hit[0]}）`, true);
    }
    const pool = srcs.flatMap((x) => x!.values).join(" ");
    // 引用（「」内）は根拠の原文・教材名・設問に含まれる文字列であること（質問の意味を変えない）
    for (const q of quotes(item.text)) if (q && !pool.includes(q) && !["わからない", "誤答", "正答"].includes(q)) return reject("引用が原文と一致しない");
    // 患者の質問: 「患者からの質問」の節では、参照した質問の原文全体をそのまま「」で引用する（意味を変えない）。
    // 言い換え（引用符なしの短い言及）は「時系列の経過」の節だけで許す。言い換えを「」に入れて直接引用のように見せることは上の引用の照合で拒否される
    const qSrcs = srcs.filter((x) => x!.kind === "vn" || x!.kind === "fb")
    if (item.section === "患者からの質問") {
      if (qSrcs.length === 0 && !/質問は(ありません|ない)/.test(plain)) return reject("質問の根拠がない");
      for (const x of qSrcs) if (!quotes(item.text).includes(x!.body ?? "")) return reject("質問の原文が引用されていない");
    } else if (qSrcs.length > 0 && item.section !== "時系列の経過") {
      for (const x of qSrcs) if (!quotes(item.text).includes(x!.body ?? "")) return reject("質問の言い換えは時系列の経過だけで使える");
    }
    // 日付は根拠の出来事の日付（日本時間）か期間の端であること
    const okDays = new Set<string>();
    for (const x of srcs) if (x!.at) okDays.add(fmtShort(x!.at));
    okDays.add(fmtShort(`${iv.period.from}T12:00:00+09:00`));
    okDays.add(fmtShort(`${iv.period.to}T12:00:00+09:00`));
    for (const dd of dates(plain)) if (!okDays.has(dd)) return reject("根拠にない日付");
    // 時刻は根拠の出来事の時刻であること
    const okTimes = new Set(srcs.filter((x) => x!.at).map((x) => fmtDateTime(new Date(x!.at!)).slice(-5)));
    for (const m of plain.matchAll(/(\d{1,2}):(\d{2})/g)) if (!okTimes.has(`${m[1].padStart(2, "0")}:${m[2]}`)) return reject("根拠にない時刻");
    // 数値は根拠の値・日時の数字、程度の「/4」、または根拠の件数以下の件数であること
    const okNums = new Set<string>();
    const addNum = (n: string) => {
      okNums.add(n);
      okNums.add(String(Number(n)));
    };
    // 根拠の値（程度の分母「/4」と日付・時刻の数字は除く）と期間の日数
    for (const n of numbers(pool.replace(/\/\s*4(?!\d)/g, " ").replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, " ").replace(/\d{1,2}月\d{1,2}日/g, " ").replace(/\d{1,2}:\d{2}/g, " "))) addNum(n);
    addNum(String(iv.period.days));
    // 日付・時刻は上で確認済み。「n/4」は分母の 4 を除き、分子は根拠の値であること
    // 件数の判定では、結果を示す「わからない」「誤答」「正答」の語は残す（患者の原文などの引用は除く）
    const plainR = item.text.replace(/「([^」]*)」/g, (whole, c: string) => (["わからない", "誤答", "正答"].includes(c) ? c : "「」"));
    const rest = plainR.replace(/\d{1,2}月\d{1,2}日/g, " ").replace(/\d{1,2}:\d{2}/g, " ").replace(/(\d)\s*\/\s*4(?!\d)/g, "$1 ");
    // 件数（「3問中2問は正答」「2回」「7日」など）は、参照した根拠から計算した件数と一致すること
    const counts = countsOf(srcs as SourceEntry[])
    for (const m of rest.matchAll(/(\d+)\s*(問|回(?!\s*\/\s*分)|件|日|項目|教材|つ)([^\d。、，,]{0,12})/g)) {
      const n = Number(m[1])
      const unit = m[2]
      const after = m[3]
      const expected =
        unit === "問"
          ? /正答|正解/.test(after)
            ? [counts.correct]
            : /誤答/.test(after)
              ? [counts.wrong]
              : /わからない/.test(after)
                ? [counts.unknown]
                : [counts.answers]
          : unit === "日"
            ? [counts.days, ...counts.statDays]
            : [counts.refs, ...counts.byKind, ...counts.statCounts, ...counts.perDay]
      if (!expected.includes(n)) return reject("件数が根拠と一致しない")
    }
    const restNoCounts = rest.replace(/(\d+)\s*(問|回(?!\s*\/\s*分)|件|日|項目|教材|つ)/g, " ")
    for (const n of numbers(restNoCounts)) {
      if (okNums.has(n) || okNums.has(String(Number(n)))) continue
      return reject("根拠にない数値")
    }
    valid.push(item);
  });
  return { valid, rejected, safetyViolation };
}
type SourceEntry = ReturnType<typeof sourceIndex> extends Map<string, infer V> ? V : never;
/** 参照した根拠から数えられる件数（理解確認の結果別・種類別・記録日数・集計値） */
function countsOf(srcs: SourceEntry[]) {
  const qa = srcs.filter((x) => x.kind === "qa");
  const kinds = new Map<string, number>();
  for (const x of srcs) if (x.kind !== "stat") kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
  const days = new Set(srcs.filter((x) => x.at).map((x) => localDay(new Date(x.at!))));
  const stat = srcs.filter((x) => x.counts);
  // 同じ日の記録の件数（「10月28日は2回」など）
  const perDayMap = new Map<string, number>();
  for (const x of srcs) if (x.kind !== "stat" && x.at) perDayMap.set(localDay(new Date(x.at)), (perDayMap.get(localDay(new Date(x.at))) ?? 0) + 1);
  return {
    refs: srcs.filter((x) => x.kind !== "stat").length,
    byKind: [...kinds.values()],
    answers: qa.length,
    correct: qa.filter((x) => x.result === "正答").length,
    wrong: qa.filter((x) => x.result === "誤答").length,
    unknown: qa.filter((x) => x.result === "わからない").length,
    days: days.size,
    statCounts: stat.flatMap((x) => x.counts!),
    statDays: stat.flatMap((x) => x.counts!),
    perDay: [...perDayMap.values()],
  };
}

const fmtShort = (iso: string) => {
  const day = localDay(new Date(iso));
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
};

// ---------- プロンプト ----------
const SYSTEM = `あなたは外来診察の前に医療者が読む「外来間の経過」の要約を作る補助者です。与えられた構造化データ（患者が自宅で記録した体調・学習・理解確認・質問）だけを使い、日本語で短く整理します。
必ず守ること:
- データにない症状・日時・測定値・出来事を書かない。数値と日付はデータの値をそのまま書く（日付は「11月4日」の形）。
- 自覚症状の 0〜4 は患者本人による程度で、CTCAE Grade ではない。Grade を推定しない。「3/4」のように書く。
- 診断・推測（〜の可能性、疑い）をしない。治療薬・治療と症状の因果関係を書かない。治療の変更や対応を提案しない。
- 記録がない日・回答がない症状は「欠測」と書き、「症状なし」「正常」「改善」「悪化」と解釈しない。正常・異常の判定をしない。
- バイタル・症状の値には評価の語を付けない。「高め」「低め」「やや高い」「正常範囲」「基準値内」「安定」「改善」「悪化」「軽快」「問題ない」などは使わず、記録された値と日時だけを書く（例:「10月28日 21:05 に体温 37.4℃」）。
- 「わからない」という回答を、患者の理解力や能力の評価に置き換えない（「『わからない』と回答した」と事実だけを書く）。
- 患者の質問は原文を「」で引用し、言い換えない。教材名・設問文も「」で囲み、データのとおりに書く。
- 各項目の sourceIds には、その文の根拠となる出来事 ID・集計 ID（データ中の id）をすべて入れる。根拠のない文は書かない。
構成（section）: 「体調の変化」（バイタルと症状の推移を日付・程度とともに）、「学習の状況」（教材の状態、誤答、「わからない」）、「患者からの質問」（原文）、「時系列の経過」（必要な出来事を日付順に 3〜8 項目）。1 項目は 1〜2 文・120 字程度まで（長くても 250 字以内）、合計 20 項目以内。根拠 ID は 1 項目 20 件以内。
「患者からの質問」の各項目には、質問の原文全体を「」でそのまま引用する。件数を書くときは、sourceIds に入れた記録を数えた値と一致させる。`;

function buildUser(iv: Intervisit) {
  const index = sourceIndex(iv);
  const sources = [...index.entries()].map(([id, x]) => ({ id, at: x.at ? fmtDateTime(new Date(x.at)) : undefined, content: x.label }));
  const data = {
    period: { from: fmtDate(new Date(`${iv.period.from}T12:00:00+09:00`)), to: fmtDate(new Date(`${iv.period.to}T12:00:00+09:00`)), days: iv.period.days, label: iv.period.label },
    vitals: { recordCount: iv.vitals.recordCount, recordDays: iv.vitals.recordDays, totalDays: iv.vitals.totalDays, missingDays: iv.vitals.missingDays.length },
    symptoms: iv.symptoms.map((s) => ({
      name: s.name,
      statId: `stat:symptom:${s.key}`,
      entries: s.entries.map((e) => ({ id: e.sourceId, at: fmtDateTime(new Date(e.at)), severity: `${e.severity}/4` })),
      newInPeriod: s.newInPeriod,
      changed: s.changed,
      noAnswerInLaterRecords: s.stoppedRecording,
    })),
    learning: iv.learning.map((l) => ({ title: l.title, version: l.versionNo, status: l.status, answers: l.answersInPeriod.map((a) => ({ id: a.sourceId, result: a.result, stem: a.stem, at: fmtDateTime(new Date(a.at)) })) })),
    questions: iv.questions.map((q) => ({ id: q.sourceId, kind: q.kind, text: q.body, at: fmtDateTime(new Date(q.createdAt)), material: q.materialTitle })),
    sources,
  };
  return `<intervisit_data>\n${JSON.stringify(data, null, 1)}\n</intervisit_data>\n上のデータだけから要約項目を作ってください。`;
}

export const hashIntervisit = (iv: Intervisit) =>
  createHash("sha256")
    .update(JSON.stringify({ p: iv.period, e: iv.events.map((e) => [e.id, e.at, e.label]), q: iv.questions.map((q) => [q.sourceId, q.body]) }))
    .digest("hex")
    .slice(0, 16);

// ---------- 生成（キャッシュつき） ----------
const cache = new Map<string, Omit<AiSummaryResult, "cached">>();
const CACHE_MAX = 100;

// ---------- 記録済みの Claude 出力の再生（撮影用デモ環境のみ。scripts/build-intervisit-replay.ts で作成）----------
type ReplaySource = { stat: string } | { label: string; at: string };
export type ReplayFile = {
  generatedOn: string;
  model: string;
  origin: string;
  period: { from: string; to: string };
  fingerprint: string;
  items: { section: SummaryItem["section"]; text: string; sources: ReplaySource[] }[];
};

/** 記録の内容（ID によらない）の指紋: 期間内のすべての出来事の内容と日時、集計値 */
export function contentFingerprint(iv: Intervisit) {
  const idx = sourceIndex(iv);
  const rows = [...idx.entries()].map(([id, x]) => (id.startsWith("stat:") ? `${id}|${x.values.join(",")}` : `${x.label}|${x.at}`)).sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 16);
}

/** 再生用の項目の根拠を、現在の DB の ID に対応づける（内容と日時が一致する記録だけ） */
export function mapReplayItems(file: ReplayFile, iv: Intervisit): SummaryItem[] {
  const idx = sourceIndex(iv);
  const byContent = new Map<string, string>();
  for (const [id, x] of idx) if (!id.startsWith("stat:") && x.at) byContent.set(`${x.label}|${x.at}`, id);
  return file.items.map((it) => ({
    section: it.section,
    text: it.text,
    sourceIds: it.sources.map((s) => ("stat" in s ? (idx.has(s.stat) ? s.stat : "missing") : (byContent.get(`${s.label}|${s.at}`) ?? "missing"))),
  }));
}

let replayCache: { path: string; file: ReplayFile } | null = null;
async function loadReplay(path: string): Promise<ReplayFile> {
  if (replayCache?.path === path) return replayCache.file;
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(path, "utf8")) as ReplayFile;
  replayCache = { path, file };
  return file;
}

/** 同じ共有・期間・データの生成中の要求（同時に来た要求は同じ結果を待ち、Claude を二重に呼ばない） */
const inflight = new Map<string, Promise<AiSummaryResult>>();

export async function summarizeIntervisit(
  iv: Intervisit,
  opts: { sessionId: string; fictional: boolean; regenerate?: boolean; simulate?: "invalid" | "error" | null },
): Promise<AiSummaryResult> {
  const dataHash = hashIntervisit(iv);
  const key = `${opts.sessionId}|${iv.period.from}|${iv.period.to}|${dataHash}`;
  const hit = !opts.regenerate && !opts.simulate ? cache.get(key) : undefined;
  if (hit) return { ...hit, cached: true };
  if (!opts.simulate) {
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = generate(iv, opts, key, dataHash)
      .then((r) => {
        // 生成に失敗・検証で不採用になった結果も同じ共有・期間・データでは再利用し、画面を開き直しても Claude を再度呼ばない
        // （呼び直すのは医療者が「AI要約を再生成」を押したときだけ）
        if (r.status === "fallback" && !cache.has(key)) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
          const { cached: _c, ...rest } = r;
          void _c;
          cache.set(key, rest);
        }
        return r;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return generate(iv, opts, key, dataHash);
}

async function generate(
  iv: Intervisit,
  opts: { sessionId: string; fictional: boolean; regenerate?: boolean; simulate?: "invalid" | "error" | null },
  key: string,
  dataHash: string,
): Promise<AiSummaryResult> {
  const rules = ruleSummary(iv);
  let usage: AiSummaryResult["usage"] = null;
  let rawItems: SummaryItem[] = [];
  const rejectedItemsOf = (rejected: AiSummaryResult["rejected"]) => rejected.map((r) => ({ ...rawItems[r.index], reason: r.reason }));
  const fallback = (reason: string, rejected: AiSummaryResult["rejected"] = [], model: string | null = null): AiSummaryResult => ({
    status: "fallback",
    generator: "rule",
    model,
    items: rules,
    rejected,
    fallbackReason: reason,
    dataHash,
    generatedAt: new Date().toISOString(),
    cached: false,
    // Claude を呼んだ後の代替表示でも、使ったトークン数は残す
    usage,
    rejectedItems: rejectedItemsOf(rejected),
  });
  if (!opts.fictional) return fallback("架空のデモ患者以外のデータは外部 AI に送信しない設定です");
  // 撮影用デモ環境: 記録済みの Claude 出力を再生する（Claude は呼ばない）。現在の記録と内容が一致し、すべての文が検証を通るときだけ表示
  const replayPath = replayFile("INTERVISIT_REPLAY_FILE");
  if (replayPath) {
    const file = await loadReplay(replayPath);
    if (file.period.from !== iv.period.from || file.period.to !== iv.period.to || file.fingerprint !== contentFingerprint(iv))
      return fallback("再生用に記録した Claude の出力と現在の記録が一致しないため、AI 要約（記録済みの出力）は表示しません");
    const mapped = mapReplayItems(file, iv);
    rawItems = mapped;
    const { valid, rejected, safetyViolation } = validateItems(mapped, iv);
    console.info(`[intervisit-ai] replay validated items=${mapped.length} valid=${valid.length} rejected=${rejected.length} safety=${safetyViolation}`);
    if (safetyViolation || rejected.length > 0) return fallback("記録済みの Claude の出力が現在の記録で検証を通らないため表示しません", rejected, file.model);
    return { status: "ai", generator: "replay", replayOf: file.generatedOn, model: file.model, items: valid, rejected: [], fallbackReason: null, dataHash, generatedAt: new Date().toISOString(), cached: false, usage: null };
  }
  const mode = claudeMode();
  if (!mode) return fallback("Claude API が設定されていません");
  // 擬似生成・失敗の再現は開発・テスト用（実 API では使わない）
  if (opts.simulate && mode === "claude") return fallback("失敗の再現は開発用の擬似生成でのみ使えます");

  let items: SummaryItem[];
  let model: string;
  let generator: Generator;
  try {
    if (opts.simulate === "error") throw new Error("simulated");
    if (mode === "fake") {
      // 開発用の擬似生成: ルールベースの文をそのまま返す（Claude ではない。画面では「擬似生成」と表示）
      items = opts.simulate === "invalid"
        ? [
            { section: "体調の変化", text: "体温は39.9℃まで上昇し、症状は改善しています。", sourceIds: ["stat:records"] },
            { section: "学習の状況", text: "副作用による理解力の低下が示唆されます。", sourceIds: ["hr:00000000-0000-0000-0000-000000000000"] },
          ]
        : rules.map((r) => ({ ...r }));
      model = "fake:intervisit";
      generator = "fake";
    } else {
      // 実 API の呼び出し回数の上限（検証・デモで課金を抑える。INTERVISIT_AI_MAX_CALLS。プロセス内で数える）
      const g = globalThis as { __shioriIntervisitAiCalls?: number };
      const max = process.env.INTERVISIT_AI_MAX_CALLS ? Number(process.env.INTERVISIT_AI_MAX_CALLS) : Infinity;
      if (mode === "claude" && (g.__shioriIntervisitAiCalls ?? 0) >= max) return fallback("AI 要約の呼び出し回数の上限に達したため、ルールベースで表示しています");
      if (mode === "claude") g.__shioriIntervisitAiCalls = (g.__shioriIntervisitAiCalls ?? 0) + 1;
      // 出力の上限: 指示は 20 項目以内・1 項目 1〜2 文（目安 120 字）。検証の上限（40 項目・1 文 260 字）まで出力しても切れないよう
      // max_tokens に余裕を持たせる（40 × 260 字 ≒ 1 万字 ≒ 1.2 万トークン以下）
      const r = await callClaudeStructured({ system: SYSTEM, user: buildUser(iv), schema: AiSummarySchema, schemaName: "intervisit_summary", maxTokens: 16000 });
      items = r.data.items;
      model = r.model;
      generator = r.generator;
      usage = { inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    }
  } catch (e) {
    const err = classifyClaudeError(e);
    // 原因の調査用に、エラーの種類だけを記録する（本文・患者情報は記録しない）
    console.warn(`[intervisit-ai] generation failed code=${err.code} http=${err.httpStatus ?? "-"} type=${err.cause_ ?? "-"} requestId=${err.requestId ?? "-"}`);
    return fallback(`AI 要約を生成できませんでした（${err.code}）`);
  }
  rawItems = items;
  const { valid, rejected, safetyViolation } = validateItems(items, iv);
  // 調査用: 検証の結果（件数と不採用の理由の種類だけ。本文・患者情報は記録しない）
  const reasons = rejected.reduce<Record<string, number>>((m, r) => ((m[r.reason.replace(/：.*/, "")] = (m[r.reason.replace(/：.*/, "")] ?? 0) + 1), m), {});
  console.info(`[intervisit-ai] validated items=${items.length} valid=${valid.length} rejected=${rejected.length} safety=${safetyViolation} reasons=${JSON.stringify(reasons)} model=${model}`);
  if (safetyViolation) return fallback("AI 要約に安全上の記述（解釈・診断・因果・Grade など）が含まれたため表示しません", rejected, model);
  if (valid.length === 0 || rejected.length > items.length / 3) return fallback("AI 要約の多くを元データで検証できなかったため表示しません", rejected, model);
  if (iv.questions.length > 0 && !valid.some((v) => v.section === "患者からの質問")) return fallback("AI 要約に患者の質問が含まれなかったため表示しません", rejected, model);
  const result = { status: "ai" as const, generator, model, items: valid, rejected, fallbackReason: null, dataHash, generatedAt: new Date().toISOString(), usage, rejectedItems: rejectedItemsOf(rejected) };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return { ...result, cached: false };
}

/** 共有終了時などにキャッシュを消す */
export function clearIntervisitCache(sessionId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${sessionId}|`)) cache.delete(k);
}
