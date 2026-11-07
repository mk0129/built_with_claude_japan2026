/**
 * 医療費シミュレーターの入力の分岐と、結果の組み立て（画面に依存しない純粋な関数）。
 * 計算は src/lib/high-cost-medical.ts の simulate() だけで行い、計算式・制度データはここでは持たない。
 *
 * 入口の分岐:
 *   - known   … 総医療費（10割）や見積もりがわかる → 月・年齢・保険・区分・多数回該当・総医療費を一問ずつ → 目安
 *   - compare … これから治療する（金額はまだわからない）→ 費用を仮定して比べる（総医療費は入力しない。仮定額ごとに並べる）
 *   - ask     … これから治療する → 病院で見積もりを確認する（聞くことの案内。計算しない）
 * 所得区分が「わからない」ときは金額を確定させず、区分ごとに並べる（年収だけで区分を決めない）。
 */
import { simulate, type Bracket, type SimInput, type SimResult } from "@/lib/high-cost-medical"

export type SimMode = "known" | "compare"
export type StepKey = "month" | "age" | "insurance" | "bracket" | "manyTimes" | "cost"

export const STEP_LABEL: Record<StepKey, string> = {
  month: "診療月",
  age: "年齢",
  insurance: "健康保険",
  bracket: "所得区分",
  manyTimes: "多数回該当",
  cost: "医療費",
}

/** 入口ごとの質問の並び（総医療費を知らない人には総医療費を聞かない） */
export function stepsFor(mode: SimMode): StepKey[] {
  return mode === "known" ? ["month", "age", "insurance", "bracket", "manyTimes", "cost"] : ["month", "age", "insurance", "bracket", "manyTimes"]
}

/** 「費用を仮定して比べる」で並べる総医療費（10割）の仮定額。実際の治療費の予測ではない */
export const ASSUMED_COSTS = [300_000, 500_000, 1_000_000, 2_000_000] as const
export const DEFAULT_ASSUMED_COST = 1_000_000

/**
 * 金額を出さない理由の種類。
 * - app     … アプリ未対応（制度を使えるかどうかの判断ではない。この画面の計算が対応していない条件）
 * - info    … 情報が足りない（確かめれば計算できる）
 * - outside … 制度の対象外（保険外の費用など。高額療養費の計算に入らない）
 */
export type ReasonKind = "app" | "info" | "outside"
export const REASON_KIND: Record<string, ReasonKind> = {
  month_before: "app",
  month_after: "app",
  age_over70: "app",
  age_preschool: "app",
  insurance_unknown: "info",
  bracket_unknown: "info",
}
/** 「この目安に含まれないもの」のうち、保険外の費用は制度の対象外。ほかはこの画面が計算しない（アプリ未対応）もの */
export const isOutsideSystem = (notIncluded: string) => notIncluded.startsWith("保険外の費用")
export const reasonKind = (code: string): ReasonKind => REASON_KIND[code] ?? "app"

export type SimRow = { key: string; result: SimResult }
export type SimOutcome =
  | { kind: "unsupported"; reasons: { code: string; message: string; kind: ReasonKind }[] }
  | { kind: "invalid"; message: string }
  /** 条件がすべてそろった 1 件の目安 */
  | { kind: "single"; result: SimResult }
  /** 仮定額ごと（区分がわかる）・区分ごと（区分がわからない）に並べた目安 */
  | { kind: "table"; axis: "cost" | "bracket"; totalCost: number | null; assumed: boolean; rows: SimRow[] }

const BRACKETS: Bracket[] = ["a", "b", "c", "d", "e"]

function rowsOf(entries: [string, SimInput][]): SimRow[] {
  const rows: SimRow[] = []
  for (const [key, input] of entries) {
    const r = simulate(input)
    if (r.kind === "result") rows.push({ key, result: r })
  }
  return rows
}

/**
 * 入力から結果を組み立てる。
 * - compare では input.totalCost は使わない（仮定額で計算する）。区分がわからないときは assumedCost で区分ごとに並べる
 * - 所得区分「わからない」以外の理由があれば、金額は出さない（理由の種類つき）
 */
export function buildOutcome(input: SimInput, mode: SimMode, assumedCost: number = DEFAULT_ASSUMED_COST): SimOutcome {
  const probe = simulate(mode === "compare" ? { ...input, totalCost: assumedCost } : input)
  if (probe.kind === "invalid") return probe
  if (probe.kind === "unsupported") {
    const others = probe.reasons.filter((r) => r.code !== "bracket_unknown")
    if (others.length) return { kind: "unsupported", reasons: probe.reasons.map((r) => ({ ...r, kind: reasonKind(r.code) })) }
  }
  if (input.bracket === "unknown") {
    const totalCost = mode === "compare" ? assumedCost : input.totalCost
    const rows = rowsOf(BRACKETS.map((b) => [b, { ...input, bracket: b, totalCost }]))
    return { kind: "table", axis: "bracket", totalCost, assumed: mode === "compare", rows }
  }
  if (mode === "compare") {
    const rows = rowsOf(ASSUMED_COSTS.map((c) => [String(c), { ...input, totalCost: c }]))
    return { kind: "table", axis: "cost", totalCost: null, assumed: true, rows }
  }
  return { kind: "single", result: probe as SimResult }
}
