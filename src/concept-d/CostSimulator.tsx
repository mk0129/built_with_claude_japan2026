"use client"

/**
 * 医療費シミュレーター（患者向け）。高額療養費制度を考慮した、保険診療 1 か月分の自己負担の概算。
 * 計算は src/lib/high-cost-medical.ts の決定論的な関数だけで行う（Claude は使わない・入力はどこにも保存しない）。
 * 入口で「これから治療する（金額はまだわからない）」「総医療費（10割）や見積もりがわかる」を選ぶ。
 *   - 金額がわからない人には総医療費を推測させず、「費用を仮定して比べる」か「病院で見積もりを確認する」へ進める
 *   - 条件は一問ずつ選ぶ。所得区分が「わからない」ときは区分ごとに並べる（年収だけで区分を決めない）
 *   - 金額を出さない条件は「アプリ未対応」「情報が足りない」「制度の対象外」を区別し、次にできることを表示する
 * 分岐と結果の組み立ては ./cost-simulator-flow.ts（純粋な関数）。
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  BRACKET_CRITERIA,
  BRACKET_INCOME_HINT,
  BRACKET_NAME,
  INSURANCE_NAME,
  NOT_INCLUDED,
  SOURCES,
  SUPPORTED_MONTHS,
  monthLabel,
  type AgeGroup,
  type Bracket,
  type Estimate,
  type InsuranceType,
  type SimInput,
  type SimResult,
} from "@/lib/high-cost-medical"
import { ASSUMED_COSTS, DEFAULT_ASSUMED_COST, STEP_LABEL, buildOutcome, isOutsideSystem, stepsFor, type ReasonKind, type SimMode, type SimOutcome, type StepKey } from "./cost-simulator-flow"
import { SIM_ASK_FALLBACK, SIM_ASK_GROUPS, SIM_KIND_TEXT, SIM_NEXT_STEPS } from "./socialSupport"

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`
const man = (n: number) => `${(n / 10_000).toLocaleString("ja-JP")}万円`
/** 撮影・説明用の架空の条件（実在の方の情報ではない） */
const DEMO_INPUT: SimInput = { serviceMonth: "2026-11", age: "under70", insurance: "employee", bracket: "c", totalCost: 1_000_000, manyTimes: "no" }
const AGE_NAME: Record<AgeGroup, string> = { under70: "70歳未満（小学校入学後）", preschool: "小学校入学前", over70: "70歳以上" }
const MANY_NAME = { yes: "該当する", no: "該当しない", unknown: "わからない" } as const

type Draft = Partial<SimInput>
type Screen = "entry" | "plan" | "ask" | "steps"

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
    <button type="button" className={`d-sim-choice ${selected ? "selected" : ""}`} onClick={onClick} data-sim-choice={testId} aria-pressed={selected ?? false}>
      <span>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Svg d={ARROW} size={16} />
    </button>
  )
}

function KindBadge({ kind }: { kind: ReasonKind }) {
  return (
    <em className={`d-sim-kind d-sim-kind-${kind}`} data-sim-kind={kind}>
      {SIM_KIND_TEXT[kind].label}
    </em>
  )
}

export function CostSimulator({ onBack, onOpenMaterial }: { onBack: () => void; onOpenMaterial?: () => void }) {
  const [screen, setScreen] = useState<Screen>("entry")
  const [askFrom, setAskFrom] = useState<Screen>("plan")
  const [mode, setMode] = useState<SimMode>("known")
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>({})
  const [costText, setCostText] = useState("")
  const [shown, setShown] = useState<{ input: SimInput; mode: SimMode } | null>(null)
  const [assumedCost, setAssumedCost] = useState(DEFAULT_ASSUMED_COST)
  // 「架空の例で試す」から始めた条件か（結果に架空例と明示する。最初から選び直すと解除）
  const [fromDemo, setFromDemo] = useState(false)

  const steps = stepsFor(mode)
  const stepKey: StepKey = steps[Math.min(step, steps.length - 1)]
  const outcome = useMemo<SimOutcome | null>(() => (shown ? buildOutcome(shown.input, shown.mode, assumedCost) : null), [shown, assumedCost])

  // 画面が切り替わったら、先頭が見える位置に戻す（前の画面のスクロール位置を引き継がない）。
  // 患者画面は内側の領域（.d-main）がスクロールするため、スクロールしている祖先の要素とページ全体の両方を戻す
  const rootRef = useRef<HTMLDivElement>(null)
  const view = screen === "ask" ? "ask" : outcome ? `result:${outcome.kind}` : screen === "steps" ? `step:${mode}:${stepKey}` : screen
  useLayoutEffect(() => {
    for (let el = rootRef.current?.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTop = 0
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0 })
  }, [view])

  const startSteps = (m: SimMode) => {
    setMode(m)
    setDraft({})
    setCostText("")
    setFromDemo(false)
    setStep(0)
    setScreen("steps")
  }
  /** 対象外の条件を選んだら、ほかの条件は計算できる値のまま結果（理由）を表示する */
  const choose = (patch: Draft, outOfScope = false) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (outOfScope) setShown({ input: { ...DEMO_INPUT, ...patch } as SimInput, mode: "known" })
    else if (step + 1 < steps.length) setStep(step + 1)
    // 「費用を仮定して比べる」は総医療費を聞かずに結果へ
    else setShown({ input: { ...(next as SimInput), totalCost: DEFAULT_ASSUMED_COST }, mode })
  }
  const parsedCost = Number(costText.replace(/[^\d]/g, ""))
  const costOk = Number.isInteger(parsedCost) && parsedCost >= 1 && parsedCost <= 100_000_000
  const calculate = () => {
    if (!costOk) return
    setShown({ input: { ...(draft as SimInput), totalCost: parsedCost }, mode: "known" })
  }
  const fillDemo = () => {
    setMode("known")
    setDraft(DEMO_INPUT)
    setCostText(String(DEMO_INPUT.totalCost))
    setStep(stepsFor("known").indexOf("cost"))
    setScreen("steps")
    setFromDemo(true)
    setShown({ input: DEMO_INPUT, mode: "known" })
  }
  const restart = () => {
    setShown(null)
    setDraft({})
    setCostText("")
    setFromDemo(false)
    setAssumedCost(DEFAULT_ASSUMED_COST)
    setMode("known")
    setStep(0)
    setScreen("entry")
  }
  /** 直前の条件（診療月・年齢・保険・所得区分・多数回該当）を引き継いで、総医療費の入力へ（仮定で比べた後に実際の金額で計算するときも） */
  const editConditions = () => {
    setShown(null)
    setMode("known")
    setScreen("steps")
    setStep(stepsFor("known").indexOf("cost"))
  }
  /** 総医療費がわからない: 入力済みの条件のまま、費用を仮定して比べる */
  const switchToCompare = () => {
    setMode("compare")
    setFromDemo(false)
    setShown({ input: { ...(draft as SimInput), totalCost: DEFAULT_ASSUMED_COST }, mode: "compare" })
  }
  const openAsk = () => {
    setAskFrom(shown ? "steps" : screen)
    setScreen("ask")
  }
  const closeAsk = () => setScreen(askFrom)
  /** 見積もりの案内から「費用を仮定して比べる」へ（総医療費の画面から来たときは、入力済みの条件のまま） */
  const compareFromAsk = () => {
    if (shown) return closeAsk()
    if (askFrom === "steps") {
      setScreen("steps")
      return switchToCompare()
    }
    startSteps("compare")
  }

  if (screen === "ask") {
    return (
      <div className="d-sim" data-sim ref={rootRef} data-sim-view={view}>
        <SimHeader onBack={closeAsk} title="病院で見積もりを確認する" />
        <SimAsk onCompare={compareFromAsk} comparing={!!shown} />
      </div>
    )
  }

  if (outcome) {
    return (
      <div className="d-sim" data-sim ref={rootRef} data-sim-view={view}>
        <SimHeader onBack={() => setShown(null)} title="医療費の目安" />
        {outcome.kind === "single" && <SimResultView result={outcome.result} demo={fromDemo} onEdit={editConditions} onRestart={restart} onOpenMaterial={onOpenMaterial} />}
        {outcome.kind === "table" && (
          <SimTableView
            outcome={outcome}
            assumedCost={assumedCost}
            onAssumed={setAssumedCost}
            onActual={editConditions}
            onAsk={openAsk}
            onRestart={restart}
            onOpenMaterial={onOpenMaterial}
          />
        )}
        {(outcome.kind === "unsupported" || outcome.kind === "invalid") && (
          <section className="d-sim-unsupported" data-sim-unsupported>
            <p className="d-sim-eyebrow">この条件では計算できません</p>
            <h2>金額は表示しません</h2>
            {outcome.kind === "unsupported" ? (
              <ul className="d-sim-reasons">
                {outcome.reasons.map((r) => (
                  <li key={r.code} data-sim-reason={r.code}>
                    <KindBadge kind={r.kind} />
                    <p>{r.message}</p>
                    <small>{SIM_KIND_TEXT[r.kind].note}</small>
                    {SIM_NEXT_STEPS[r.code] && (
                      <div className="d-sim-next" data-sim-next>
                        <b>次にできること</b>
                        <ul>
                          {SIM_NEXT_STEPS[r.code].map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="d-sim-reasons">
                <li>{outcome.message}</li>
              </ul>
            )}
            <SimContacts />
            <div className="d-sim-actions">
              <button className="primary-button" onClick={restart}>
                条件を選び直す
              </button>
              <button className="secondary-button" data-sim-open-ask onClick={openAsk}>
                病院で見積もりを確認する（聞くことを見る）
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

  if (screen === "entry" || screen === "plan") {
    return (
      <div className="d-sim" data-sim ref={rootRef} data-sim-view={view}>
        <SimHeader onBack={screen === "entry" ? onBack : () => setScreen("entry")} title="医療費シミュレーター" />
        {screen === "entry" ? (
          <>
            <p className="d-sim-lead" data-sim-lead>
              高額療養費制度を考えた、<b>保険診療1か月分</b>の自己負担の目安を計算します。
            </p>
            <SimScope />
            <section className="d-sim-step d-sim-entry" data-sim-entry>
              <h2>いまの状況に近いほうを選んでください</h2>
              <Choice
                testId="entry-plan"
                title="これから治療する（金額はまだわからない）"
                sub="金額を入れずに、費用を仮定して比べる・病院で聞くことを確かめる"
                onClick={() => setScreen("plan")}
              />
              <Choice
                testId="entry-known"
                title="総医療費（10割）や見積もりがわかる"
                sub="領収書の保険診療の点数×10円や、病院から聞いた金額で計算する"
                onClick={() => startSteps("known")}
              />
            </section>
            {/* 初回の副操作（選択肢と混ざらないよう下に置く） */}
            <button className="d-sim-demo" data-sim-demo onClick={fillDemo}>
              <b>架空の例で試す</b>
              <small>2026年11月・70歳未満・会社の健康保険・区分ウ・総医療費100万円（架空の条件）</small>
            </button>
          </>
        ) : (
          <section className="d-sim-step d-sim-entry" data-sim-plan>
            <h2>金額がわからなくても使えます</h2>
            <p className="d-sim-help">総医療費を推測して入れる必要はありません。どちらかを選んでください。</p>
            <Choice
              testId="plan-compare"
              title="費用を仮定して比べる"
              sub={`総医療費を${ASSUMED_COSTS.map(man).join("・")}と仮定したときの、1か月の自己負担の目安を並べます（概算）`}
              onClick={() => startSteps("compare")}
            />
            <Choice testId="plan-ask" title="病院で見積もりを確認する" sub="誰に、何を聞けばよいかを見る（計算はしません）" onClick={openAsk} />
          </section>
        )}
      </div>
    )
  }

  const compare = mode === "compare"
  return (
    <div className="d-sim" data-sim ref={rootRef} data-sim-view={view} data-sim-mode={mode}>
      <SimHeader onBack={step === 0 ? () => setScreen(compare ? "plan" : "entry") : () => setStep(step - 1)} title={compare ? "費用を仮定して比べる" : "医療費シミュレーター"} />
      <SimScope />
      <div className="d-sim-progress" data-sim-progress role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-label="入力の進み具合">
        <p>
          <b>
            {step + 1}/{steps.length}
          </b>
          　{STEP_LABEL[stepKey]}
        </p>
        <span>
          <i style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </span>
      </div>
      <section className="d-sim-step" data-sim-step={step + 1} data-sim-step-key={stepKey}>
        {stepKey === "month" && (
          <>
            <h2>{compare ? "治療を受ける予定の月は" : "いつの診療ですか"}</h2>
            <p className="d-sim-help">
              高額療養費は月ごと（1日から月末まで）に計算します。{compare ? "予定の月を選んでください。" : ""}
            </p>
            <div className="d-sim-months">
              {SUPPORTED_MONTHS.map((m) => (
                <button key={m} type="button" className={draft.serviceMonth === m ? "selected" : ""} aria-pressed={draft.serviceMonth === m} onClick={() => choose({ serviceMonth: m })}>
                  {monthLabel(m)}
                </button>
              ))}
            </div>
            <div className="d-sim-other">
              <button type="button" onClick={() => choose({ serviceMonth: "2026-07" }, true)}>
                2026年7月以前
              </button>
              <button type="button" onClick={() => choose({ serviceMonth: "2027-08" }, true)}>
                2027年8月以降
              </button>
            </div>
          </>
        )}
        {stepKey === "age" && (
          <>
            <h2>{compare ? "治療を受ける方の年齢は" : "診療を受けた方の年齢は"}</h2>
            <Choice testId="under70" title={AGE_NAME.under70} sub="窓口負担は3割" selected={draft.age === "under70"} onClick={() => choose({ age: "under70" })} />
            <Choice testId="over70" title={AGE_NAME.over70} sub="この画面では計算しません（確認先をご案内します）" onClick={() => choose({ age: "over70" }, true)} />
            <Choice testId="preschool" title={AGE_NAME.preschool} sub="この画面では計算しません（確認先をご案内します）" onClick={() => choose({ age: "preschool" }, true)} />
          </>
        )}
        {stepKey === "insurance" && (
          <>
            <h2>加入している健康保険は</h2>
            <p className="d-sim-help">保険の種類によって、所得区分の決め方が違います。加入している健康保険（保険者）は、マイナ保険証をお持ちの方はマイナポータルで、お持ちでない方は資格確認書で確かめられます。</p>
            <Choice testId="employee" title="会社などの健康保険" sub="協会けんぽ・健康保険組合・共済組合など" selected={draft.insurance === "employee"} onClick={() => choose({ insurance: "employee" })} />
            <Choice testId="national" title="国民健康保険" sub="市区町村・国民健康保険組合" selected={draft.insurance === "national"} onClick={() => choose({ insurance: "national" })} />
            <Choice testId="insurance-unknown" title="わからない" sub="確かめ方と確認先をご案内します" onClick={() => choose({ insurance: "unknown" }, true)} />
          </>
        )}
        {stepKey === "bracket" && draft.insurance && draft.insurance !== "unknown" && (
          <>
            <h2>所得区分（ア〜オ）は</h2>
            <p className="d-sim-help" data-sim-bracket-help>
              区分は加入している健康保険が判定します。{draft.insurance === "employee" ? "標準報酬月額" : "世帯の旧ただし書き所得の合計"}
              で選んでください。<b>年収は目安で、年収だけでは区分は決まりません。</b>
            </p>
            {(["a", "b", "c", "d", "e"] as Bracket[]).map((b) => (
              <Choice
                key={b}
                testId={`bracket-${b}`}
                title={`${BRACKET_NAME[b]}　${BRACKET_CRITERIA[draft.insurance as InsuranceType][b]}`}
                sub={`年収の目安: ${BRACKET_INCOME_HINT[b]}`}
                selected={draft.bracket === b}
                onClick={() => choose({ bracket: b })}
              />
            ))}
            <Choice testId="bracket-unknown" title="わからない・確かめていない" sub="区分ごとに並べて表示します（あなたの区分は決めません）" selected={draft.bracket === "unknown"} onClick={() => choose({ bracket: "unknown" })} />
          </>
        )}
        {stepKey === "manyTimes" && (
          <>
            <h2>この12か月に、高額療養費を3回以上受けましたか</h2>
            <p className="d-sim-help">直近12か月に、高額療養費の支給をすでに3回以上受けていると、4回目から上限額が下がります（多数回該当）。</p>
            <Choice testId="many-no" title="受けていない・2回まで" sub="初めての治療の方はこちら" selected={draft.manyTimes === "no"} onClick={() => choose({ manyTimes: "no" })} />
            <Choice testId="many-yes" title="3回以上受けた" sub="多数回該当として計算します" selected={draft.manyTimes === "yes"} onClick={() => choose({ manyTimes: "yes" })} />
            <Choice testId="many-unknown" title="わからない" sub="該当しない場合と該当する場合の両方を表示します" selected={draft.manyTimes === "unknown"} onClick={() => choose({ manyTimes: "unknown" })} />
          </>
        )}
        {stepKey === "cost" && (
          <>
            <h2>1か月の医療費の総額は</h2>
            <label className="d-sim-cost-label" htmlFor="d-sim-cost">
              <b>保険診療の総医療費（10割）</b>
              <small>窓口で支払った額（3割）ではありません</small>
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
            <p className="d-sim-help" id="d-sim-cost-help">
              1つの医療機関の外来か入院のどちらか一方の、保険診療の医療費の総額です。院外処方の薬局の分は外来に含めます。領収書の保険診療の点数×10円が目安です。
            </p>
            <button className="primary-button d-sim-calc" data-sim-calc disabled={!costOk} onClick={calculate}>
              目安を計算する
            </button>
            <div className="d-sim-cost-unknown" data-sim-cost-unknown>
              <b>総医療費がわからないときは</b>
              <p>金額を推測して入れる必要はありません。</p>
              <button type="button" className="secondary-button" data-sim-switch-compare onClick={switchToCompare}>
                費用を仮定して比べる
              </button>
              <button type="button" className="secondary-button" data-sim-open-ask onClick={openAsk}>
                病院で見積もりを確認する
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** 適用範囲（短い要約）と、長い説明（開いたときだけ）。全手順の上部に同じ長文を繰り返さない */
function SimScope() {
  return (
    <details className="d-sim-fold d-sim-scope" data-sim-scope>
      <summary>
        <span>2026年8月〜2027年7月の診療分・70歳未満・1つの医療機関</span>
        <b>対象条件を見る</b>
      </summary>
      <ul>
        <li>診療月が2026年8月〜2027年7月（令和8年8月施行の見直し後）の、保険診療1か月分（1日〜月末）。</li>
        <li>70歳未満（小学校入学後）・窓口負担3割の方。</li>
        <li>1つの医療機関の外来か入院のどちらか一方（院外処方の薬局の分は、処方せんを出した医療機関の外来に含めます）。</li>
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

/** 「病院で見積もりを確認する」: 計算はせず、聞く相手と質問を示す（社会制度の原稿の質問の範囲） */
function SimAsk({ onCompare, comparing }: { onCompare: () => void; comparing: boolean }) {
  return (
    <section className="d-sim-ask" data-sim-ask>
      <p className="d-sim-lead">治療が決まる前でも、病院や加入している健康保険で目安を聞けます。次の質問をそのまま使えます。</p>
      {SIM_ASK_GROUPS.map((g) => (
        <div className="d-sim-ask-group" key={g.to} data-sim-ask-group>
          <h2>
            {g.to}
            <small>{g.why}</small>
          </h2>
          <ul>
            {g.questions.map((q) => (
              <li key={q}>「{q}」</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="d-sim-help">{SIM_ASK_FALLBACK}</p>
      <p className="d-sim-help">
        <span className="d-sim-kind d-sim-kind-outside">{SIM_KIND_TEXT.outside.label}</span> 入院中の食事代・差額ベッド代・先進医療などの保険外の費用は、高額療養費の計算に入りません。
      </p>
      <div className="d-sim-actions">
        <button className="primary-button" data-sim-ask-compare onClick={onCompare}>
          {comparing ? "比べた結果に戻る" : "費用を仮定して比べる"}
        </button>
      </div>
    </section>
  )
}

function ExcludedList() {
  return (
    <section className="d-sim-excluded">
      <h3>この目安に含まれないもの</h3>
      <p className="d-sim-excluded-kind">
        <KindBadge kind="outside" />
      </p>
      <ul data-sim-excluded="outside">
        {NOT_INCLUDED.filter(isOutsideSystem).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="d-sim-excluded-kind">
        <KindBadge kind="app" />
        <small>この画面では計算しません</small>
      </p>
      <ul data-sim-excluded="app">
        {NOT_INCLUDED.filter((x) => !isOutsideSystem(x)).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  )
}

function SourcesFold({ rule }: { rule: SimResult["rule"] }) {
  return (
    <details className="d-sim-fold" data-sim-detail="sources">
      <summary>制度と出典</summary>
      <dl className="d-sim-conditions">
        <div>
          <dt>適用した制度</dt>
          <dd>
            {rule.label}
            <br />
            <small>{rule.legal}。1%の部分は1円未満を四捨五入、3割の額は1円未満を四捨五入した概算です。</small>
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
  )
}

/** 仮定額ごと／所得区分ごとに並べた目安（金額を推測させない・区分を決めない） */
function SimTableView({
  outcome,
  assumedCost,
  onAssumed,
  onActual,
  onAsk,
  onRestart,
  onOpenMaterial,
}: {
  outcome: Extract<SimOutcome, { kind: "table" }>
  assumedCost: number
  onAssumed: (n: number) => void
  onActual: () => void
  onAsk: () => void
  onRestart: () => void
  onOpenMaterial?: () => void
}) {
  const first = outcome.rows[0]?.result
  if (!first) return null
  const { input, rule } = first
  const byBracket = outcome.axis === "bracket"
  const insuranceShort = input.insurance === "employee" ? "会社などの健康保険" : "国民健康保険"
  return (
    <section className="d-sim-result" data-sim-table={outcome.axis} data-sim-assumed={outcome.assumed ? "yes" : "no"}>
      <div className="d-sim-table-card" data-sim-summary>
        <p className="d-sim-month">
          {monthLabel(input.serviceMonth)}の診療分
          <em className="d-sim-demo-badge">概算</em>
        </p>
        <h2>{outcome.assumed ? (byBracket ? "費用を仮定して、区分ごとに比べる" : "費用を仮定して比べる") : "所得区分ごとの目安"}</h2>
        {outcome.assumed && (
          <p className="d-sim-assumed-note" data-sim-assumed-note>
            仮定の総医療費（10割）で計算した、保険診療1か月分の自己負担の目安です。実際の治療費の予測ではありません。
          </p>
        )}
      </div>
      {byBracket && (
        <div className="d-sim-notice" data-sim-bracket-notice>
          <KindBadge kind="info" />
          <p>所得区分がわからないため、区分ごとに並べています。あなたの区分は、加入している健康保険（保険者）が決めます。年収だけでは決まりません。</p>
        </div>
      )}
      {byBracket && outcome.assumed && (
        <div className="d-sim-chips" role="radiogroup" aria-label="仮定する総医療費（10割）">
          {ASSUMED_COSTS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={assumedCost === c} className={assumedCost === c ? "selected" : ""} data-sim-assumed-cost={c} onClick={() => onAssumed(c)}>
              {man(c)}
            </button>
          ))}
        </div>
      )}
      {byBracket && <p className="d-sim-table-caption">総医療費 {yen(outcome.totalCost ?? 0)}（10割）{outcome.assumed ? "と仮定" : ""}</p>}
      <ul className="d-sim-rows">
        {outcome.rows.map(({ key, result }) => (
          <li key={key} data-sim-row={key}>
            <span>
              {byBracket ? (
                <>
                  <b>{BRACKET_NAME[result.input.bracket]}</b>
                  <small>{BRACKET_CRITERIA[result.input.insurance][result.input.bracket]}</small>
                </>
              ) : (
                <>
                  <b>総医療費 {man(result.input.totalCost)}と仮定</b>
                  <small>3割の額 {yen(result.main.copay)}</small>
                </>
              )}
            </span>
            <span className="d-sim-row-amount">
              <b data-sim-row-amount>{yen(result.main.outOfPocket)}</b>
              {result.ifManyTimes && <small data-sim-row-alt>多数回該当なら {yen(result.ifManyTimes.outOfPocket)}</small>}
            </span>
          </li>
        ))}
      </ul>
      <p className="d-sim-key-conditions d-sim-table-conditions" data-sim-key-conditions>
        {byBracket ? "" : `${BRACKET_NAME[input.bracket]}・`}
        {insuranceShort}・多数回該当 {MANY_NAME[input.manyTimes]}・1つの医療機関の外来か入院の一方
      </p>
      <p className="d-sim-disclaimer">確定した請求額ではありません。特定の治療の費用の予測でもありません。</p>
      <div className="d-sim-actions">
        <button className="primary-button" data-sim-actual onClick={onActual}>
          {outcome.assumed ? "総医療費がわかったら：金額を入れて計算する" : "医療費を変えて計算する"}
        </button>
        <button className="secondary-button" data-sim-open-ask onClick={onAsk}>
          病院で見積もりを確認する（聞くことを見る）
        </button>
      </div>
      <details className="d-sim-fold" data-sim-detail="excluded">
        <summary>対象外の費用・相談先</summary>
        <ExcludedList />
        <SimContacts />
      </details>
      <SourcesFold rule={rule} />
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

function SimResultView({
  result,
  demo,
  onEdit,
  onRestart,
  onOpenMaterial,
}: {
  result: SimResult
  demo: boolean
  onEdit: () => void
  onRestart: () => void
  onOpenMaterial?: () => void
}) {
  const { input, main, ifManyTimes, rule } = result
  const formulaLine = (e: Estimate) =>
    e.reachedLimit ? `${e.formula} ＝ ${yen(e.outOfPocket)}` : `上限額（${e.formula}）に届かないため、3割の額のまま`
  const insuranceShort = input.insurance === "employee" ? "会社などの健康保険" : "国民健康保険"
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
        </p>
        <span>保険診療1か月分の自己負担の目安</span>
        {ifManyTimes ? (
          <div className="d-sim-amount-pair">
            <div>
              <small>多数回該当しない場合</small>
              <b data-sim-amount>{yen(main.outOfPocket)}</b>
            </div>
            <div data-sim-alt>
              <small>多数回該当する場合</small>
              <b>{yen(ifManyTimes.outOfPocket)}</b>
            </div>
          </div>
        ) : (
          <b data-sim-amount>{yen(main.outOfPocket)}</b>
        )}
        <p className="d-sim-key-conditions" data-sim-key-conditions>
          {BRACKET_NAME[input.bracket]}・{insuranceShort}・総医療費{yen(input.totalCost)}（10割）・1つの医療機関の外来か入院の一方
          {ifManyTimes ? "・多数回該当は加入している健康保険に確認してください" : input.manyTimes === "yes" ? "・多数回該当あり" : ""}
          {demo ? "（架空の条件）" : ""}
        </p>
        <p className="d-sim-disclaimer">確定した請求額ではありません。特定の治療の費用の予測でもありません。</p>
      </div>
      <button className="primary-button d-sim-recalc" onClick={onEdit}>
        医療費を変えて計算する
      </button>
      <details className="d-sim-fold" data-sim-detail="breakdown">
        <summary>計算条件・内訳</summary>
        <dl className="d-sim-conditions">
          <div>
            <dt>計算の条件</dt>
            <dd>
              {AGE_NAME.under70} ・ {INSURANCE_NAME[input.insurance]}
              <br />
              {BRACKET_NAME[input.bracket]}（{BRACKET_CRITERIA[input.insurance][input.bracket]}）
              <br />
              総医療費 {yen(input.totalCost)} ・ 多数回該当 {MANY_NAME[input.manyTimes]}
            </dd>
          </div>
          <div>
            <dt>窓口負担と軽くなる額</dt>
            <dd>
              窓口負担（3割）{yen(main.copay)}
              {main.reduction > 0 ? <> → 高額療養費で {yen(main.reduction)} 軽くなる目安</> : " ・ 上限額に届いていません"}
            </dd>
          </div>
          <div>
            <dt>上限額の計算</dt>
            <dd>
              {formulaLine(main)}
              {ifManyTimes && (
                <>
                  <br />
                  多数回該当する場合：{formulaLine(ifManyTimes)}
                </>
              )}
            </dd>
          </div>
        </dl>
      </details>
      <details className="d-sim-fold" data-sim-detail="excluded">
        <summary>対象外の費用・相談先</summary>
        <ExcludedList />
        <SimContacts />
      </details>
      <SourcesFold rule={rule} />
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
