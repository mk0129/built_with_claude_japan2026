"use client"

/**
 * 医療費シミュレーター（患者向け）。高額療養費制度を考えた、保険診療 1 か月分の自己負担の目安。
 * 計算は src/lib/high-cost-medical.ts の決定論的な関数だけで行う（Claude は使わない・入力はどこにも保存しない）。
 * 2026-11 の見直し: 選択肢を順にタップするだけで進む。70 歳以上・小学校入学前・保険や区分が「わからない」場合も目安を出す。
 * 医療費は、金額を入力するほか「これから受ける治療」から概算できる（治療費の参考値は src/lib/treatment-costs.ts）。
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  BRACKET_CRITERIA,
  BRACKET_INCOME_HINT,
  BRACKET_NAME,
  NOT_INCLUDED,
  SENIOR_INCOME_HINT,
  SENIOR_NAME,
  SENIOR_TIERS_BY_RATE,
  SOURCES,
  SUPPORTED_MONTHS,
  currentServiceMonth,
  monthLabel,
  simulateV2,
  type AgeGroup,
  type Bracket,
  type CopayRate,
  type Estimate,
  type InsuranceType,
  type SeniorTier,
  type SimInputV2,
  type SimResultV2,
} from "@/lib/high-cost-medical"
import { TREATMENT_COSTS, TREATMENT_COST_NOTES, TREATMENT_COST_SOURCE, TREATMENT_GROUPS, sumTreatments } from "@/lib/treatment-costs"

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`
const COST_PRESETS = [100_000, 300_000, 500_000, 1_000_000]
/** 撮影・説明用の架空の条件（実在の方の情報ではない） */
const DEMO_INPUT: SimInputV2 = { serviceMonth: "2026-11", age: "under70", insurance: "employee", bracket: "c", totalCost: 1_000_000, manyTimes: "no" }
const AGE_NAME: Record<AgeGroup, string> = { under70: "70歳未満", over70: "70歳以上", preschool: "小学校入学前のお子さん" }
const MANY_NAME = { yes: "ある", no: "ない", unknown: "わからない" } as const

type StepKey = "age" | "insurance" | "rate" | "bracket" | "senior" | "cost" | "many"
type Draft = Partial<SimInputV2> & { manyTimes: SimInputV2["manyTimes"] }

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
const ARROW = "m9 18 6-6-6-6"

function Choice({ selected, onClick, title, sub, testId }: { selected?: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <button type="button" className={`d-sim-choice ${selected ? "selected" : ""}`} onClick={onClick} data-sim-choice={testId}>
      <span>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Svg d={ARROW} size={16} />
    </button>
  )
}

/** 答える順番（年齢によって変わる）。診療月は今月を既定にし、結果の画面で変えられる */
function stepsFor(draft: Draft): StepKey[] {
  if (draft.age === "over70") return ["age", "rate", "senior", "cost", "many"]
  return ["age", "insurance", "bracket", "cost", "many"]
}
const STEP_LABEL: Record<StepKey, string> = { age: "年齢", insurance: "健康保険", rate: "負担割合", bracket: "所得の目安", senior: "所得の目安", cost: "医療費", many: "払い戻しの回数" }

export function CostSimulator({ onBack, onOpenMaterial }: { onBack: () => void; onOpenMaterial?: () => void }) {
  const [draft, setDraft] = useState<Draft>({ manyTimes: "no", serviceMonth: currentServiceMonth() ?? undefined })
  const [stepIndex, setStepIndex] = useState(0)
  const [costMode, setCostMode] = useState<"treatment" | "amount">("treatment")
  const [costText, setCostText] = useState("")
  const [treatments, setTreatments] = useState<string[]>([])
  const [shown, setShown] = useState<SimInputV2 | null>(null)
  const [shownRange, setShownRange] = useState<{ low: number; high: number } | null>(null)
  const [fromDemo, setFromDemo] = useState(false)
  const [monthEdit, setMonthEdit] = useState(false)

  const steps = stepsFor(draft)
  const step = steps[Math.min(stepIndex, steps.length - 1)]
  const result = useMemo(() => (shown ? simulateV2(shown) : null), [shown])
  const rangeResults = useMemo(() => {
    if (!shown || !shownRange) return null
    const lo = simulateV2({ ...shown, totalCost: Math.max(1, shownRange.low) })
    const hi = simulateV2({ ...shown, totalCost: Math.max(1, shownRange.high) })
    return lo.kind === "result" && hi.kind === "result" ? { lo, hi } : null
  }, [shown, shownRange])

  // 手順や結果に切り替わったら、先頭が見える位置に戻す
  const rootRef = useRef<HTMLDivElement>(null)
  const view = result ? `result:${result.kind}` : `step:${step}`
  useLayoutEffect(() => {
    for (let el = rootRef.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0
    if (window.scrollY > 0) window.scrollTo({ top: 0 })
  }, [view])

  const next = (patch: Partial<SimInputV2>) => {
    const merged = { ...draft, ...patch }
    setDraft(merged)
    const list = stepsFor(merged)
    const i = list.indexOf(step)
    setStepIndex(Math.min(i + 1, list.length - 1))
  }
  const back = () => {
    if (stepIndex === 0) return onBack()
    setStepIndex(stepIndex - 1)
  }
  const parsedCost = Number(costText.replace(/[^\d]/g, ""))
  const costOk = Number.isInteger(parsedCost) && parsedCost >= 1 && parsedCost <= 100_000_000
  const treatmentSum = sumTreatments(treatments)
  const costReady = costMode === "amount" ? costOk : treatments.length > 0
  const goMany = () => {
    if (!costReady) return
    const total = costMode === "amount" ? parsedCost : treatmentSum.mid
    // 入院を伴う治療を選んだときは、70 歳以上の上限を「入院（世帯）」で計算する
    const inpatient = costMode === "treatment" && treatmentSum.items.some((t) => t.group === "手術・入院")
    setDraft({ ...draft, totalCost: total, ...(inpatient ? { setting: "inpatient" as const } : {}) })
    setShownRange(costMode === "treatment" ? { low: treatmentSum.low, high: treatmentSum.high } : null)
    setStepIndex(steps.indexOf("many"))
  }
  const calculate = (many: SimInputV2["manyTimes"]) => {
    const input = { ...draft, manyTimes: many, serviceMonth: draft.serviceMonth ?? SUPPORTED_MONTHS[0] } as SimInputV2
    setDraft(input)
    setFromDemo(false)
    setShown(input)
  }
  const fillDemo = () => {
    setDraft(DEMO_INPUT)
    setCostMode("amount")
    setCostText(String(DEMO_INPUT.totalCost))
    setTreatments([])
    setShownRange(null)
    setFromDemo(true)
    setShown(DEMO_INPUT)
  }
  const restart = () => {
    setShown(null)
    setShownRange(null)
    setDraft({ manyTimes: "no", serviceMonth: currentServiceMonth() ?? undefined })
    setCostText("")
    setTreatments([])
    setFromDemo(false)
    setStepIndex(0)
  }
  /** 直前の条件を引き継いで、医療費の入力に戻る */
  const editCost = () => {
    setShown(null)
    setStepIndex(steps.indexOf("cost"))
  }

  if (result) {
    return (
      <div className="d-sim" data-sim ref={rootRef} data-sim-view={view}>
        <SimHeader onBack={() => setShown(null)} title="医療費の目安" />
        {result.kind === "result" ? (
          <SimResultView
            result={result}
            range={rangeResults ? { low: shownRange!.low, high: shownRange!.high, lo: rangeResults.lo, hi: rangeResults.hi, items: treatmentSum.items.map((t) => t.name) } : null}
            demo={fromDemo}
            onEdit={editCost}
            onRestart={restart}
            onOpenMaterial={onOpenMaterial}
            monthEdit={monthEdit}
            setMonthEdit={setMonthEdit}
            onMonth={(m) => {
              const input = { ...result.input, serviceMonth: m }
              setDraft(input)
              setShown(input)
              setMonthEdit(false)
            }}
          />
        ) : (
          <section className="d-sim-unsupported" data-sim-unsupported>
            <p className="d-sim-eyebrow">この条件では計算できません</p>
            <h2>金額は表示しません</h2>
            <ul>{result.kind === "unsupported" ? result.reasons.map((r) => <li key={r.code}>{r.message}</li>) : <li>{result.message}</li>}</ul>
            <SimContacts />
            <div className="d-sim-actions">
              <button className="primary-button" onClick={restart}>
                条件を選び直す
              </button>
              {onOpenMaterial && (
                <button className="secondary-button" onClick={onOpenMaterial}>
                  「高額療養費制度を知る」を読む
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    )
  }

  const total = steps.length
  const n = steps.indexOf(step) + 1
  return (
    <div className="d-sim d-sim-v2" data-sim ref={rootRef} data-sim-view={view}>
      <SimHeader onBack={back} title="医療費シミュレーター" />
      {step === "age" && (
        <p className="d-sim-lead" data-sim-lead>
          いくつかの質問に答えるだけで、<b>保険診療1か月分</b>の自己負担の目安がわかります。入力は保存しません。
        </p>
      )}
      <div className="d-sim-progress" data-sim-progress role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={n} aria-label="入力の進み具合">
        <p>
          <b>
            {n}/{total}
          </b>
          　{STEP_LABEL[step]}
        </p>
        <span>
          <i style={{ width: `${(n / total) * 100}%` }} />
        </span>
      </div>
      <section className="d-sim-step" data-sim-step={step}>
        {step === "age" && (
          <>
            <h2>医療を受ける方の年齢は？</h2>
            <Choice testId="under70" title="70歳未満" sub="窓口負担は3割" selected={draft.age === "under70"} onClick={() => next({ age: "under70", copayRate: undefined, seniorTier: undefined })} />
            <Choice testId="over70" title="70歳以上" sub="負担割合（1〜3割）を次に選びます" selected={draft.age === "over70"} onClick={() => next({ age: "over70" })} />
            <Choice testId="preschool" title="小学校入学前のお子さん" sub="窓口負担は2割" selected={draft.age === "preschool"} onClick={() => next({ age: "preschool", copayRate: undefined, seniorTier: undefined })} />
          </>
        )}
        {step === "insurance" && (
          <>
            <h2>加入している健康保険は？</h2>
            <p className="d-sim-help">わからなくても進めます。</p>
            <Choice testId="employee" title="会社などの健康保険" sub="協会けんぽ・健康保険組合・共済組合など" selected={draft.insurance === "employee"} onClick={() => next({ insurance: "employee" })} />
            <Choice testId="national" title="国民健康保険" sub="市区町村・国民健康保険組合" selected={draft.insurance === "national"} onClick={() => next({ insurance: "national" })} />
            <Choice testId="insurance-unknown" title="わからない" sub="年収の目安だけで計算します" selected={draft.insurance === "unknown"} onClick={() => next({ insurance: "unknown" })} />
          </>
        )}
        {step === "rate" && (
          <>
            <h2>窓口での負担割合は？</h2>
            <p className="d-sim-help">保険証・資格確認書・高齢受給者証に「1割」「2割」「3割」と書かれています。</p>
            {([1, 2, 3] as CopayRate[]).map((r) => (
              <Choice key={r} testId={`rate-${r}`} title={`${r}割`} sub={r === 3 ? "現役並み所得の方" : r === 2 ? "70〜74歳の一般の方、75歳以上で一定以上の所得の方" : "75歳以上の一般・住民税非課税の方"} selected={draft.copayRate === r} onClick={() => next({ copayRate: r, seniorTier: undefined })} />
            ))}
          </>
        )}
        {step === "bracket" && (
          <>
            <h2>{draft.age === "preschool" ? "世帯の年収の目安は？" : "年収の目安は？"}</h2>
            <p className="d-sim-help">年収の目安で選んでください（正式な区分は加入している健康保険が判定します）。</p>
            {(["a", "b", "c", "d", "e"] as Bracket[]).map((b) => (
              <Choice
                key={b}
                testId={`bracket-${b}`}
                title={BRACKET_INCOME_HINT[b]}
                sub={`${BRACKET_NAME[b]}${draft.insurance && draft.insurance !== "unknown" ? ` · ${BRACKET_CRITERIA[draft.insurance as InsuranceType][b]}` : ""}`}
                selected={draft.bracket === b}
                onClick={() => next({ bracket: b })}
              />
            ))}
            <Choice testId="bracket-unknown" title="わからない" sub="すべての区分の目安を並べて表示します" selected={draft.bracket === "unknown"} onClick={() => next({ bracket: "unknown" })} />
          </>
        )}
        {step === "senior" && (
          <>
            <h2>所得の目安は？</h2>
            <p className="d-sim-help">{draft.copayRate === 3 ? "現役並み所得の3つの区分から選んでください。" : "住民税の課税状況で区分が変わります。わからなければ「わからない」で進めます。"}</p>
            {SENIOR_TIERS_BY_RATE[draft.copayRate ?? 2].map((t) => (
              <Choice key={t} testId={`senior-${t}`} title={SENIOR_NAME[t]} sub={SENIOR_INCOME_HINT[t]} selected={draft.seniorTier === t} onClick={() => next({ seniorTier: t })} />
            ))}
            <Choice testId="senior-unknown" title="わからない" sub="該当しうる区分の目安を並べて表示します" selected={draft.seniorTier === "unknown"} onClick={() => next({ seniorTier: "unknown" })} />
          </>
        )}
        {step === "cost" && (
          <>
            <h2>1か月の医療費は？</h2>
            {draft.age === "over70" && draft.copayRate !== 3 && (
              <>
                <p className="d-sim-help">70歳以上の方は、外来と入院で上限の決まり方が違います。</p>
                <div className="d-sim-segment" role="radiogroup" aria-label="外来か入院か">
                  {(["outpatient", "inpatient"] as const).map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={(draft.setting ?? "outpatient") === v} className={(draft.setting ?? "outpatient") === v ? "selected" : ""} onClick={() => setDraft({ ...draft, setting: v })} data-sim-setting={v}>
                      {v === "outpatient" ? "外来（通院）" : "入院"}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="d-sim-mode" role="tablist" aria-label="医療費の決め方">
              <button type="button" role="tab" aria-selected={costMode === "treatment"} className={costMode === "treatment" ? "active" : ""} onClick={() => setCostMode("treatment")} data-sim-mode="treatment">
                これから受ける治療から目安を出す
              </button>
              <button type="button" role="tab" aria-selected={costMode === "amount"} className={costMode === "amount" ? "active" : ""} onClick={() => setCostMode("amount")} data-sim-mode="amount">
                金額を入力する
              </button>
            </div>
            {costMode === "treatment" ? (
              <div className="d-sim-treatments" data-sim-treatments>
                <p className="d-sim-help">1か月に受ける予定の治療を選んでください（複数可）。</p>
                {TREATMENT_GROUPS.map((group) => (
                  <div key={group} className="d-sim-treatment-group">
                    <small>{group}</small>
                    {TREATMENT_COSTS.filter((t) => t.group === group).map((t) => {
                      const on = treatments.includes(t.id)
                      return (
                        <button key={t.id} type="button" className={`d-sim-treatment ${on ? "selected" : ""}`} aria-pressed={on} data-sim-treatment={t.id} onClick={() => setTreatments(on ? treatments.filter((x) => x !== t.id) : [...treatments, t.id])}>
                          <span className="d-sim-check">{on ? "✓" : ""}</span>
                          <span>
                            <b>{t.name}</b>
                            <small>{t.note}</small>
                          </span>
                          <em>
                            {Math.round(t.low / 10_000)}〜{Math.round(t.high / 10_000)}万円
                          </em>
                        </button>
                      )
                    })}
                  </div>
                ))}
                {treatments.length > 0 && (
                  <div className="d-sim-treatment-sum" data-sim-treatment-sum>
                    <span>選んだ治療の1か月の総医療費（10割）の目安</span>
                    <b>
                      約{Math.round(treatmentSum.low / 10_000)}万〜{Math.round(treatmentSum.high / 10_000)}万円
                    </b>
                    <small>計算には中央の {yen(treatmentSum.mid)} を使い、結果には幅も表示します。</small>
                  </div>
                )}
              </div>
            ) : (
              <>
                <label className="d-sim-cost-label" htmlFor="d-sim-cost">
                  <b>保険診療の総医療費（10割）</b>
                  <small>窓口で支払った額（{draft.age === "preschool" || (draft.age === "over70" && draft.copayRate !== 3) ? `${draft.copayRate ?? 2}割` : "3割"}）ではありません</small>
                </label>
                <div className="d-sim-cost">
                  <input
                    id="d-sim-cost"
                    data-sim-cost-input
                    inputMode="numeric"
                    placeholder="例：1,000,000"
                    value={costText ? Number(costText.replace(/[^\d]/g, "") || 0).toLocaleString("ja-JP") : ""}
                    onChange={(e) => setCostText(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
                    aria-describedby="d-sim-cost-help"
                  />
                  <span>円</span>
                </div>
                {costText && !costOk && <p className="d-sim-error">1円〜1億円の範囲で入力してください</p>}
                <div className="d-sim-presets">
                  {COST_PRESETS.map((v) => (
                    <button key={v} type="button" onClick={() => setCostText(String(v))}>
                      {v / 10_000}万円
                    </button>
                  ))}
                </div>
                <p className="d-sim-help" id="d-sim-cost-help">
                  1つの医療機関の外来か入院の、保険診療の総額（領収書の保険点数×10円）。薬局の分は外来に含めます。
                </p>
              </>
            )}
            <button className="primary-button d-sim-calc" data-sim-next disabled={!costReady} onClick={goMany}>
              次へ
            </button>
          </>
        )}
        {step === "many" && (
          <>
            <h2>この1年で、高額療養費の払い戻しを3回以上受けましたか？</h2>
            <p className="d-sim-help">直近12か月に3回以上あると、4回目から上限額が下がります（多数回該当）。</p>
            <Choice testId="many-no" title="ない・初めて" sub="通常の上限額で計算" selected={draft.manyTimes === "no"} onClick={() => calculate("no")} />
            <Choice testId="many-yes" title="3回以上ある" sub="4回目からの上限額で計算" selected={draft.manyTimes === "yes"} onClick={() => calculate("yes")} />
            <Choice testId="many-unknown" title="わからない" sub="両方の金額を表示" selected={draft.manyTimes === "unknown"} onClick={() => calculate("unknown")} />
          </>
        )}
      </section>
      {step === "age" && (
        <>
          <SimScope month={draft.serviceMonth ?? null} />
          <button className="d-sim-demo" data-sim-demo onClick={fillDemo}>
            <b>架空の例で試す</b>
            <small>70歳未満・会社の健康保険・区分ウ・総医療費100万円（架空）</small>
          </button>
        </>
      )}
    </div>
  )
}

/** 適用範囲（短い要約）と、長い説明（開いたときだけ） */
function SimScope({ month }: { month: string | null }) {
  return (
    <details className="d-sim-fold d-sim-scope" data-sim-scope>
      <summary>
        <span>{month ? `${monthLabel(month)}の診療分として計算（結果の画面で変更できます）` : "2026年8月〜2027年7月の診療分"} · 1つの医療機関</span>
        <b>対象条件を見る</b>
      </summary>
      <ul>
        <li>診療月が2026年8月〜2027年7月（令和8年8月施行の見直し後）の、保険診療1か月分（1日〜月末）。</li>
        <li>1つの医療機関の外来か入院のどちらか一方（院外処方の薬局の分は、処方せんを出した医療機関の外来に含めます）。</li>
        <li>70歳以上の方は負担割合と所得区分、小学校入学前のお子さんは世帯の所得区分で計算します。</li>
        <li>入力した内容は保存しません。</li>
      </ul>
    </details>
  )
}

function SimHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="d-page-title">
      <button className="back" onClick={onBack} aria-label="前の画面へ">
        ←
      </button>
      <div>
        <h1>{title}</h1>
      </div>
    </div>
  )
}

function SimContacts() {
  return (
    <section className="d-sim-contacts">
      <h3>確認・相談先</h3>
      <ul>
        <li>
          <b>加入している健康保険（保険者）</b>所得区分・多数回該当・限度額の適用・払い戻しの手続き
        </li>
        <li>
          <b>病院の医療費の相談窓口・がん相談支援センター</b>医療費の支払いや使える制度の相談（入院と外来、複数の医療機関、家族の医療費の合算なども）
        </li>
      </ul>
    </section>
  )
}

function SimResultView({
  result,
  range,
  demo,
  onEdit,
  onRestart,
  onOpenMaterial,
  monthEdit,
  setMonthEdit,
  onMonth,
}: {
  result: SimResultV2
  /** 治療内容から概算したとき: 医療費の幅と、その両端での結果 */
  range: { low: number; high: number; lo: SimResultV2; hi: SimResultV2; items: string[] } | null
  demo: boolean
  onEdit: () => void
  onRestart: () => void
  onOpenMaterial?: () => void
  monthEdit: boolean
  setMonthEdit: (v: boolean) => void
  onMonth: (m: string) => void
}) {
  const { input, scenarios, rule, rate, assumed, notes } = result
  const main = scenarios[0]
  const formulaLine = (e: Estimate) => (e.reachedLimit ? `${e.formula} ＝ ${yen(e.outOfPocket)}` : `上限額（${e.formula}）に届かないため、${rate}割の額のまま`)
  const insuranceShort = input.age === "over70" ? `${rate}割負担` : input.insurance === "employee" ? "会社などの健康保険" : input.insurance === "national" ? "国民健康保険" : "保険の種類は未選択"
  const settingShort = input.age === "over70" && rate !== 3 ? (input.setting === "inpatient" ? "入院（世帯の上限）" : "外来（個人の上限）") : "1つの医療機関の外来か入院の一方"
  const minOut = Math.min(...scenarios.map((s) => s.main.outOfPocket))
  const maxOut = Math.max(...scenarios.map((s) => s.main.outOfPocket))
  return (
    <section className="d-sim-result" data-sim-result>
      <div className="d-sim-amount-card" data-sim-summary>
        <p className="d-sim-month">
          {monthLabel(input.serviceMonth)}の診療分
          {demo && (
            <em className="d-sim-demo-badge" data-sim-demo-badge>
              架空の例
            </em>
          )}
          <button type="button" className="d-sim-month-change" onClick={() => setMonthEdit(!monthEdit)} data-sim-month-change>
            月を変える
          </button>
        </p>
        {monthEdit && (
          <div className="d-sim-months d-sim-months-inline">
            {SUPPORTED_MONTHS.map((m) => (
              <button key={m} type="button" className={input.serviceMonth === m ? "selected" : ""} onClick={() => onMonth(m)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>
        )}
        <span>保険診療1か月分の自己負担の目安</span>
        {assumed ? (
          <>
            <b data-sim-amount>{minOut === maxOut ? yen(minOut) : `${yen(minOut)}〜${yen(maxOut)}`}</b>
            <p className="d-sim-key-conditions">所得区分が「わからない」ため、該当しうる区分の幅で表示しています。下の表で区分ごとの目安を確認してください。</p>
          </>
        ) : main.ifManyTimes ? (
          <div className="d-sim-amount-pair">
            <div>
              <small>多数回該当しない場合</small>
              <b data-sim-amount>{yen(main.main.outOfPocket)}</b>
            </div>
            <div data-sim-alt>
              <small>多数回該当する場合</small>
              <b>{yen(main.ifManyTimes.outOfPocket)}</b>
            </div>
          </div>
        ) : (
          <b data-sim-amount>{yen(main.main.outOfPocket)}</b>
        )}
        {range && (
          <p className="d-sim-range" data-sim-range>
            治療内容からの概算: 総医療費 約{Math.round(range.low / 10_000)}万〜{Math.round(range.high / 10_000)}万円 → 自己負担の目安{" "}
            <b>
              {yen(Math.min(...range.lo.scenarios.map((s) => s.main.outOfPocket)))}〜{yen(Math.max(...range.hi.scenarios.map((s) => s.main.outOfPocket)))}
            </b>
          </p>
        )}
        <p className="d-sim-key-conditions" data-sim-key-conditions>
          {AGE_NAME[input.age]}・{insuranceShort}・{assumed ? "区分は未確定" : main.label}・総医療費{yen(input.totalCost)}（10割）・{settingShort}
          {main.ifManyTimes ? "・多数回該当は加入している健康保険に確認してください" : input.manyTimes === "yes" ? "・多数回該当あり" : ""}
          {demo ? "（架空の条件）" : ""}
        </p>
        <p className="d-sim-disclaimer">確定した請求額ではありません。{range ? "治療費は公開情報からの概算で、体格・薬の量・医療機関で変わります。" : "特定の治療の費用の予測でもありません。"}</p>
      </div>
      {notes.length > 0 && (
        <ul className="d-sim-notes" data-sim-notes>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {assumed && (
        <section className="d-sim-scenarios" data-sim-scenarios>
          <h3>区分ごとの目安</h3>
          <table>
            <thead>
              <tr>
                <th>区分（年収の目安）</th>
                <th>自己負担の目安</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.label}>
                  <td>
                    <b>{s.label}</b>
                    <small>{s.criteria}</small>
                  </td>
                  <td>
                    <b>{yen(s.main.outOfPocket)}</b>
                    {s.ifManyTimes && <small>多数回該当なら {yen(s.ifManyTimes.outOfPocket)}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>自分の区分は、加入している健康保険（保険者）の通知や、マイナポータルの資格情報で確認できます。</p>
        </section>
      )}
      <button className="primary-button d-sim-recalc" onClick={onEdit} data-sim-recalc>
        医療費を変えて計算する
      </button>
      {range && (
        <details className="d-sim-fold" data-sim-detail="treatments">
          <summary>選んだ治療と費用の目安</summary>
          <ul className="d-sim-treatment-list">
            {range.items.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <ul className="d-sim-treatment-notes">
            {TREATMENT_COST_NOTES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="d-sim-source-line">
            参考: {TREATMENT_COST_SOURCE.items.map((s) => `${s.publisher}「${s.title}」`).join("、")}（確認日 {TREATMENT_COST_SOURCE.checkedAt}）
          </p>
        </details>
      )}
      <details className="d-sim-fold" data-sim-detail="breakdown">
        <summary>計算条件・内訳</summary>
        <dl className="d-sim-conditions">
          <div>
            <dt>計算の条件</dt>
            <dd>
              {AGE_NAME[input.age]} ・ {insuranceShort}
              <br />
              {assumed ? "所得区分: わからない（候補ごとに計算）" : `${main.label}（${main.criteria}）`}
              <br />
              総医療費 {yen(input.totalCost)} ・ 多数回該当 {MANY_NAME[input.manyTimes]} ・ {settingShort}
            </dd>
          </div>
          {!assumed && (
            <>
              <div>
                <dt>窓口負担と軽くなる額</dt>
                <dd>
                  窓口負担（{rate}割）{yen(main.main.copay)}
                  {main.main.reduction > 0 ? <> → 高額療養費で {yen(main.main.reduction)} 軽くなる目安</> : " ・ 上限額に届いていません"}
                </dd>
              </div>
              <div>
                <dt>上限額の計算</dt>
                <dd>
                  {formulaLine(main.main)}
                  {main.ifManyTimes && (
                    <>
                      <br />
                      多数回該当する場合：{formulaLine(main.ifManyTimes)}
                    </>
                  )}
                </dd>
              </div>
            </>
          )}
        </dl>
      </details>
      <details className="d-sim-fold" data-sim-detail="excluded">
        <summary>対象外の費用・相談先</summary>
        <section className="d-sim-excluded">
          <h3>この目安に含まれないもの</h3>
          <ul>
            {NOT_INCLUDED.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <SimContacts />
      </details>
      <details className="d-sim-fold" data-sim-detail="sources">
        <summary>制度と出典</summary>
        <dl className="d-sim-conditions">
          <div>
            <dt>適用した制度</dt>
            <dd>
              {rule.label}
              <br />
              <small>{rule.legal}。1%の部分は1円未満を四捨五入、{rate}割の額は1円未満を四捨五入した概算です。</small>
            </dd>
          </div>
        </dl>
        <section className="d-sim-sources">
          <h3>出典（確認日 {SOURCES[0].checkedAt}）</h3>
          <ul>
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.publisher}「{s.title}」
                </a>
              </li>
            ))}
          </ul>
        </section>
      </details>
      <div className="d-sim-actions">
        <button className="secondary-button" onClick={onRestart}>
          最初から選び直す
        </button>
        {onOpenMaterial && (
          <button className="secondary-button" onClick={onOpenMaterial}>
            「高額療養費制度を知る」を読む
          </button>
        )}
      </div>
    </section>
  )
}

export type { SeniorTier }
