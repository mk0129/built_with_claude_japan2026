/**
 * 医療者の診察サマリー（担当B）で使う、表示用の純粋な整理関数。
 * - 症状: 記録された値から「最大」「直近」とその日付・生活への影響（患者記載）をそのまま取り出す（言い換えない・推測しない）
 * - 学習: 観察期間内の回答の分母・正答・誤答・「わからない」を数える（理解全般は判定しない）
 * - 教材候補: 承認済み・公開中の教材一覧（サーバーが返したもの）だけを対象に、質問・設問・症状との「規則による一致」で並べる
 *   AI は使わない。一致の理由はそのまま文章にする。未承認の教材は一覧に含まれないため候補にも出ない。
 * - 処方状況: 「この診察で処方済み」「今回選択中」「前回処方済み（日付）」「未処方」を別々に返す
 */

export type SymptomEntryLike = {
  at: string
  severity: number
  sourceId: string
  interference?: string | null
}

export type SymptomStat = {
  max: number
  /** 最大値を記録した最初の日時と、同じ値を記録したほかの日数 */
  peakAt: string
  peakOtherDays: number
  last: { at: string; severity: number }
  count: number
  /** 生活への影響（患者が記載したもの。新しい順） */
  impacts: { at: string; text: string }[]
}

/** 端末の現地日付（YYYY-MM-DD） */
const day = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function symptomStat(entries: SymptomEntryLike[]): SymptomStat | null {
  if (!entries.length) return null
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at))
  const max = Math.max(...sorted.map((e) => e.severity))
  const peaks = sorted.filter((e) => e.severity === max)
  const peakDays = new Set(peaks.map((e) => day(e.at)))
  const last = sorted[sorted.length - 1]
  const impacts = sorted
    .filter((e) => e.interference && e.interference.trim())
    .map((e) => ({ at: e.at, text: e.interference!.trim() }))
    .reverse()
  return { max, peakAt: peaks[0].at, peakOtherDays: peakDays.size - 1, last: { at: last.at, severity: last.severity }, count: sorted.length, impacts }
}

export type PeriodAnswer = { sourceId: string; result: string; stem: string; at: string; title: string }

/** 観察期間内の回答の内訳（分母は回答した設問の数。未回答は含めない） */
export function answerStats(answers: PeriodAnswer[]) {
  const correct = answers.filter((a) => a.result === "正答").length
  const wrong = answers.filter((a) => a.result === "誤答").length
  const unknown = answers.filter((a) => a.result === "わからない").length
  return { answered: answers.length, correct, wrong, unknown }
}

export type CandidateReason = { kind: "question" | "answer" | "symptom"; text: string }
export type RxCandidate = { id: string; title: string; reasons: CandidateReason[]; score: number }

export type CandidateInput = {
  /** 承認済み・公開中の教材（サーバーが返した一覧そのもの） */
  library: { id: string; title: string; searchText?: string }[]
  questions: { sourceId: string; body: string; materialTitle: string | null; input?: "free_text" | "selection"; selectionLabel?: string }[]
  answers: PeriodAnswer[]
  symptoms: { key: string; name: string; max: number }[]
  limit?: number
}

const clip = (text: string, n = 28) => (text.length > n ? `${text.slice(0, n)}…` : text)

/** 症状名から教材の説明と照合する語（「・」で区切った 2 文字以上の語。例「だるさ・倦怠感」→ だるさ／倦怠感） */
export function symptomTerms(name: string) {
  return name
    .split(/[・、/／\s]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
}

/**
 * 規則による教材候補。
 * 1. 患者の質問が教材から残されたもの → その教材（3 点）
 * 2. 観察期間内の誤答・「わからない」 → その設問の教材（2 点）
 * 3. 症状（1/4 以上を記録）の語が教材の題名・説明・学習目標に含まれる → その教材（1 点）
 * 一覧（承認済み・公開中）にない教材は出さない。根拠のない教材は出さない。
 */
export function ruleCandidates({ library, questions, answers, symptoms, limit = 3 }: CandidateInput): RxCandidate[] {
  const byTitle = new Map(library.map((m) => [m.title, m]))
  const found = new Map<string, RxCandidate>()
  const add = (m: { id: string; title: string }, reason: CandidateReason, score: number) => {
    const c = found.get(m.id) ?? { id: m.id, title: m.title, reasons: [], score: 0 }
    if (!c.reasons.some((r) => r.text === reason.text)) {
      c.reasons.push(reason)
      c.score += score
    }
    found.set(m.id, c)
  }
  for (const q of questions) {
    const m = q.materialTitle ? byTitle.get(q.materialTitle) : undefined
    if (!m) continue
    add(
      m,
      {
        kind: "question",
        text: q.input === "selection" ? `この教材に「${q.selectionLabel ?? "質問がある"}」と回答` : `質問「${clip(q.body)}」がこの教材から残された`,
      },
      3,
    )
  }
  for (const a of answers) {
    if (a.result !== "誤答" && a.result !== "わからない") continue
    const m = byTitle.get(a.title)
    if (!m) continue
    add(m, { kind: "answer", text: `設問「${clip(a.stem)}」に${a.result === "誤答" ? "誤答" : "「わからない」と回答"}` }, 2)
  }
  for (const s of symptoms) {
    if (s.max < 1) continue
    for (const m of library) {
      const text = `${m.title}${m.searchText ?? ""}`
      const term = symptomTerms(s.name).find((t) => text.includes(t))
      if (term) add(m, { kind: "symptom", text: `症状「${s.name}」（最大 ${s.max}/4）と、教材の説明の「${term}」が一致` }, 1)
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja")).slice(0, limit)
}

export type RxStatusLike = { id: string | number; prescribedNow?: boolean; prescribedBefore?: boolean; prescribedAt?: string | null }

/** 教材の処方状況（表示用のラベル。複数当てはまれば両方） */
export function rxStatus(item: RxStatusLike, selected: (string | number)[]) {
  const labels: { key: "now" | "selected" | "before" | "none"; text: string }[] = []
  if (item.prescribedNow) labels.push({ key: "now", text: "この診察で処方済み" })
  if (!item.prescribedNow && selected.includes(item.id)) labels.push({ key: "selected", text: "今回選択中" })
  if (item.prescribedBefore) {
    const d = item.prescribedAt ? new Date(item.prescribedAt) : null
    labels.push({ key: "before", text: d ? `前回処方済み（${d.getMonth() + 1}月${d.getDate()}日）` : "前回処方済み" })
  }
  if (!item.prescribedNow && !item.prescribedBefore && !selected.includes(item.id)) labels.push({ key: "none", text: "未処方" })
  return labels
}
