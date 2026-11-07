/**
 * 体調記録の「保存前の入力」（下書き）。しんどい日に症状を一つ選んだまま別の画面へ移っても、
 * 同じ患者が同じ入力画面に戻れば入力が残るようにする。
 *
 * - 保存先は sessionStorage（このタブの間だけ）。localStorage は端末に残り、共用端末で次の人に体調の入力が残るため使わない。
 *   審査用公開デモ（.judge-demo）もタブ単位の架空データで動くため、同じ方式で動く。
 * - 下書きはサーバーへ送らない。明示的に「保存」したときだけ記録になる（医療者側には保存した記録しか出ない）。
 * - 1 つのキーに、持ち主（患者 ID）と入力を入れる。別の患者の下書きは読まずに消す（患者を切り替えても持ち越さない）。
 * - 症状の程度は 0〜4 の整数だけを残す。未入力はキー自体を持たない（「0 = なし」と「未入力」を区別する）。
 */

export const HEALTH_DRAFT_KEY = "shiori.healthDraft.v1"

export type HealthDraftVitals = Record<"temperature" | "systolic" | "diastolic" | "pulse" | "spo2", string>
export type HealthDraftDetail = { count?: string; location?: string; interference?: string }

export type HealthDraft = {
  measuredAt: string
  vitals: HealthDraftVitals
  /** 回答した症状だけ（未入力はキーなし） */
  symptoms: Record<string, number>
  details: Record<string, HealthDraftDetail>
  /** 履歴から編集中の記録（新しい記録は null） */
  editingId: string | null
}

type Stored = HealthDraft & { owner: string; v: 1 }

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

const VITAL_KEYS = ["temperature", "systolic", "diastolic", "pulse", "spo2"] as const

const isSeverity = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4

/** 画面の状態（未入力は undefined）から、回答した症状だけを取り出す。0 は残す */
export function answeredSymptoms(symptoms: Record<string, number | undefined>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(symptoms)) if (isSeverity(value)) out[id] = value
  return out
}

/** 残す価値のある入力があるか（測定日時だけ・空欄だけの下書きは作らない） */
export function hasDraftInput(draft: Pick<HealthDraft, "vitals" | "symptoms" | "details">): boolean {
  if (VITAL_KEYS.some((key) => (draft.vitals[key] ?? "").trim() !== "")) return true
  if (Object.values(draft.symptoms).some(isSeverity)) return true
  return Object.values(draft.details).some((detail) =>
    Object.values(detail ?? {}).some((value) => typeof value === "string" && value.trim() !== ""),
  )
}

/** 保存されていた文字列を検証して下書きに戻す。持ち主が違う・形が違うものは null */
export function parseHealthDraft(raw: string | null, owner: string): HealthDraft | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== "object") return null
  const d = data as Partial<Stored>
  if (d.v !== 1 || d.owner !== owner || typeof d.measuredAt !== "string") return null
  const vitals = {} as HealthDraftVitals
  for (const key of VITAL_KEYS) {
    const value = (d.vitals as Record<string, unknown> | undefined)?.[key]
    vitals[key] = typeof value === "string" ? value : ""
  }
  const symptoms: Record<string, number> = {}
  for (const [id, value] of Object.entries((d.symptoms as Record<string, unknown> | undefined) ?? {})) {
    if (isSeverity(value)) symptoms[id] = value
  }
  const details: Record<string, HealthDraftDetail> = {}
  for (const [id, value] of Object.entries((d.details as Record<string, unknown> | undefined) ?? {})) {
    if (!value || typeof value !== "object") continue
    const v = value as Record<string, unknown>
    const detail: HealthDraftDetail = {}
    for (const field of ["count", "location", "interference"] as const) {
      if (typeof v[field] === "string") detail[field] = v[field] as string
    }
    details[id] = detail
  }
  const draft: HealthDraft = {
    measuredAt: d.measuredAt,
    vitals,
    symptoms,
    details,
    editingId: typeof d.editingId === "string" ? d.editingId : null,
  }
  return hasDraftInput(draft) ? draft : null
}

const storage = (): DraftStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** 同じ患者の下書きを読む。別の患者・壊れた下書きはここで消す */
export function readHealthDraft(owner: string, store: DraftStorage | null = storage()): HealthDraft | null {
  if (!store) return null
  try {
    const raw = store.getItem(HEALTH_DRAFT_KEY)
    const draft = parseHealthDraft(raw, owner)
    if (raw && !draft) store.removeItem(HEALTH_DRAFT_KEY)
    return draft
  } catch {
    return null
  }
}

/** 入力があれば下書きとして残し、なければ消す */
export function writeHealthDraft(owner: string, draft: HealthDraft, store: DraftStorage | null = storage()): void {
  if (!store) return
  try {
    const cleaned: HealthDraft = { ...draft, symptoms: answeredSymptoms(draft.symptoms) }
    if (!hasDraftInput(cleaned)) {
      store.removeItem(HEALTH_DRAFT_KEY)
      return
    }
    const stored: Stored = { v: 1, owner, ...cleaned }
    store.setItem(HEALTH_DRAFT_KEY, JSON.stringify(stored))
  } catch {
    // 保存できない環境（プライベートモードの容量制限など）では下書きを残さないだけ
  }
}

export function clearHealthDraft(store: DraftStorage | null = storage()): void {
  try {
    store?.removeItem(HEALTH_DRAFT_KEY)
  } catch {
    // 消せない環境では何もしない
  }
}
