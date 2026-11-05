"use client"

/**
 * 医療費シミュレーター（患者向け）。高額療養費制度を考慮した、保険診療 1 か月分の自己負担の概算。
 * 計算は src/lib/high-cost-medical.ts の決定論的な関数だけで行う（Claude は使わない・入力はどこにも保存しない）。
 * 数段階で条件を選ぶ → 結果。対象外の条件を選んだら金額を出さず、理由と確認先を表示する。
 */
import { useMemo, useState, type ReactNode } from "react"
import {
  BRACKET_CRITERIA,
  BRACKET_INCOME_HINT,
  BRACKET_NAME,
  INSURANCE_NAME,
  NOT_INCLUDED,
  SOURCES,
  SUPPORTED_MONTHS,
  monthLabel,
  simulate,
  type AgeGroup,
  type Bracket,
  type Estimate,
  type InsuranceType,
  type SimInput,
} from "@/lib/high-cost-medical"

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`
const STEPS = ["診療月", "年齢", "健康保険", "所得区分", "医療費"] as const
const COST_PRESETS = [300_000, 500_000, 1_000_000, 2_000_000]
/** 撮影・説明用の架空の条件（実在の方の情報ではない） */
const DEMO_INPUT: SimInput = { serviceMonth: "2026-11", age: "under70", insurance: "employee", bracket: "c", totalCost: 1_000_000, manyTimes: "no" }
const AGE_NAME: Record<AgeGroup, string> = { under70: "70歳未満（小学校入学後）", preschool: "小学校入学前", over70: "70歳以上" }
const MANY_NAME = { yes: "該当する", no: "該当しない", unknown: "わからない" } as const

type Draft = Partial<SimInput>

function Svg({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
const ARROW = "m9 18 6-6-6-6"
const CALC = "M6 3h12v18H6zM9 7h6M9 11h1M12 11h1M15 11h0M9 14h1M12 14h1M15 14v3M9 17h4"

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

export function CostSimulator({ onBack, onOpenMaterial }: { onBack: () => void; onOpenMaterial?: () => void }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>({ manyTimes: "no" })
  const [costText, setCostText] = useState("")
  const [shown, setShown] = useState<SimInput | null>(null)

  const result = useMemo(() => (shown ? simulate(shown) : null), [shown])

  /** 対象外の条件を選んだら、ほかの条件は計算できる値のまま結果（理由）を表示する */
  const choose = (patch: Draft, outOfScope = false) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (outOfScope) setShown({ ...DEMO_INPUT, ...patch } as SimInput)
    else setStep((s) => s + 1)
  }
  const parsedCost = Number(costText.replace(/[^\d]/g, ""))
  const costOk = Number.isInteger(parsedCost) && parsedCost >= 1 && parsedCost <= 100_000_000
  const calculate = () => {
    if (!costOk) return
    setShown({ ...(draft as SimInput), totalCost: parsedCost })
  }
  const fillDemo = () => {
    setDraft(DEMO_INPUT)
    setCostText(String(DEMO_INPUT.totalCost))
    setStep(STEPS.length - 1)
    setShown(DEMO_INPUT)
  }
  const restart = () => {
    setShown(null)
    setDraft({ manyTimes: "no" })
    setCostText("")
    setStep(0)
  }
  const editConditions = () => {
    setShown(null)
    setStep(STEPS.length - 1)
  }

  if (result) {
    return (
      <div className="d-sim" data-sim>
        <SimHeader onBack={() => setShown(null)} title="医療費の目安" />
        {result.kind === "result" ? (
          <SimResultView result={result} onEdit={editConditions} onRestart={restart} onOpenMaterial={onOpenMaterial} />
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

  return (
    <div className="d-sim" data-sim>
      <SimHeader onBack={step === 0 ? onBack : () => setStep(step - 1)} title="医療費シミュレーター" />
      <section className="d-sim-intro">
        <span className="d-sim-intro-icon">
          <Svg d={CALC} size={22} />
        </span>
        <p>
          高額療養費制度を考えた、<b>保険診療1か月分</b>の自己負担の目安を計算します。
          <small>
            対象: 2026年8月〜2027年7月の診療分・70歳未満・1つの医療機関の外来か入院のどちらか一方（院外処方の薬局の分は、処方せんを出した医療機関の外来に含めます）。入力した内容は保存しません。
          </small>
        </p>
      </section>
      <button className="d-sim-demo" data-sim-demo onClick={fillDemo}>
        架空の例で試す（2026年11月・70歳未満・会社の健康保険・区分ウ・総医療費100万円）
      </button>
      <ol className="d-sim-progress" aria-label={`${step + 1} / ${STEPS.length}`}>
        {STEPS.map((name, i) => (
          <li key={name} className={i === step ? "current" : i < step ? "done" : ""}>
            <i>{i + 1}</i>
            <span>{name}</span>
          </li>
        ))}
      </ol>
      <section className="d-sim-step" data-sim-step={step + 1}>
        {step === 0 && (
          <>
            <h2>いつの診療ですか</h2>
            <p className="d-sim-help">高額療養費は月ごと（1日から月末まで）に計算します。</p>
            <div className="d-sim-months">
              {SUPPORTED_MONTHS.map((m) => (
                <button key={m} type="button" className={draft.serviceMonth === m ? "selected" : ""} onClick={() => choose({ serviceMonth: m })}>
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
        {step === 1 && (
          <>
            <h2>診療を受けた方の年齢は</h2>
            <Choice testId="under70" title={AGE_NAME.under70} sub="窓口負担は3割" selected={draft.age === "under70"} onClick={() => choose({ age: "under70" })} />
            <Choice testId="over70" title={AGE_NAME.over70} sub="この画面では計算しません" onClick={() => choose({ age: "over70" }, true)} />
            <Choice testId="preschool" title={AGE_NAME.preschool} sub="この画面では計算しません" onClick={() => choose({ age: "preschool" }, true)} />
          </>
        )}
        {step === 2 && (
          <>
            <h2>加入している健康保険は</h2>
            <p className="d-sim-help">保険の種類によって、所得区分の決め方が違います。保険証や資格確認書の保険者名で確認できます。</p>
            <Choice testId="employee" title="会社などの健康保険" sub="協会けんぽ・健康保険組合・共済組合など" selected={draft.insurance === "employee"} onClick={() => choose({ insurance: "employee" })} />
            <Choice testId="national" title="国民健康保険" sub="市区町村・国民健康保険組合" selected={draft.insurance === "national"} onClick={() => choose({ insurance: "national" })} />
            <Choice testId="insurance-unknown" title="わからない" sub="確認先をご案内します" onClick={() => choose({ insurance: "unknown" }, true)} />
          </>
        )}
        {step === 3 && draft.insurance && draft.insurance !== "unknown" && (
          <>
            <h2>所得区分は</h2>
            <p className="d-sim-help">
              区分は加入している健康保険が判定します。{draft.insurance === "employee" ? "標準報酬月額" : "世帯の旧ただし書き所得の合計"}
              で選んでください。年収は目安です。
            </p>
            {(["a", "b", "c", "d", "e"] as Bracket[]).map((b) => (
              <Choice
                key={b}
                testId={`bracket-${b}`}
                title={`${BRACKET_NAME[b]}　${BRACKET_CRITERIA[draft.insurance as InsuranceType][b]}`}
                sub={`目安: ${BRACKET_INCOME_HINT[b]}`}
                selected={draft.bracket === b}
                onClick={() => choose({ bracket: b })}
              />
            ))}
            <Choice testId="bracket-unknown" title="わからない" sub="金額は出さず、確認先をご案内します" onClick={() => choose({ bracket: "unknown" }, true)} />
          </>
        )}
        {step === 4 && (
          <>
            <h2>1か月の総医療費（10割）</h2>
            <p className="d-sim-help">
              1つの医療機関の外来か入院のどちらか一方の、保険診療の医療費の総額です（窓口で払う3割の額ではありません）。院外処方の薬局の分は外来に含めます。領収書の保険診療の点数×10円が目安です。
            </p>
            <label className="d-sim-cost">
              <input
                data-sim-cost-input
                inputMode="numeric"
                placeholder="例：1000000"
                value={costText ? Number(costText.replace(/[^\d]/g, "") || 0).toLocaleString("ja-JP") : ""}
                onChange={(e) => setCostText(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
                aria-label="1か月の総医療費（円）"
              />
              <span>円</span>
            </label>
            {costText && !costOk && <p className="d-sim-error">1円〜1億円の範囲で入力してください</p>}
            <div className="d-sim-presets">
              {COST_PRESETS.map((v) => (
                <button key={v} type="button" onClick={() => setCostText(String(v))}>
                  {v / 10_000}万円
                </button>
              ))}
            </div>
            <h3>多数回該当</h3>
            <p className="d-sim-help">直近12か月に、高額療養費の支給をすでに3回以上受けていると、4回目から上限額が下がります。</p>
            <div className="d-sim-segment" role="radiogroup" aria-label="多数回該当">
              {(["no", "yes", "unknown"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={draft.manyTimes === v} className={draft.manyTimes === v ? "selected" : ""} onClick={() => setDraft({ ...draft, manyTimes: v })}>
                  {MANY_NAME[v]}
                </button>
              ))}
            </div>
            <button className="primary-button d-sim-calc" data-sim-calc disabled={!costOk} onClick={calculate}>
              目安を計算する
            </button>
          </>
        )}
      </section>
    </div>
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
  onEdit,
  onRestart,
  onOpenMaterial,
}: {
  result: Extract<ReturnType<typeof simulate>, { kind: "result" }>
  onEdit: () => void
  onRestart: () => void
  onOpenMaterial?: () => void
}) {
  const { input, main, ifManyTimes, rule } = result
  const formulaLine = (e: Estimate) =>
    e.reachedLimit ? `${e.formula} ＝ ${yen(e.outOfPocket)}` : `上限額（${e.formula}）に届かないため、3割の額のまま`
  return (
    <section className="d-sim-result" data-sim-result>
      <p className="d-sim-eyebrow">試算結果（概算）・{monthLabel(input.serviceMonth)}の診療分</p>
      <div className="d-sim-amount-card">
        <span>この月の自己負担の目安</span>
        <b data-sim-amount>{yen(main.outOfPocket)}</b>
        <small>
          窓口負担（3割）{yen(main.copay)}
          {main.reduction > 0 ? <> → 高額療養費で <strong>{yen(main.reduction)}</strong> 軽くなる目安</> : " ・ 上限額に届いていません"}
        </small>
      </div>
      {ifManyTimes && (
        <div className="d-sim-alt" data-sim-alt>
          多数回該当の場合は <b>{yen(ifManyTimes.outOfPocket)}</b>
          <small>多数回該当かどうかは、加入している健康保険に確認してください。</small>
        </div>
      )}
      <p className="d-sim-disclaimer">確定した請求額ではありません。特定の治療の費用の予測でもありません。</p>
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
          <dt>上限額の計算</dt>
          <dd>{formulaLine(main)}</dd>
        </div>
        <div>
          <dt>適用した制度</dt>
          <dd>
            {rule.label}
            <br />
            <small>{rule.legal}。1%の部分は1円未満を四捨五入、3割の額は1円未満を四捨五入した概算です。</small>
          </dd>
        </div>
      </dl>
      <section className="d-sim-excluded">
        <h3>この目安に含まれないもの</h3>
        <ul>
          {NOT_INCLUDED.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <SimContacts />
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
      <div className="d-sim-actions">
        <button className="primary-button" onClick={onEdit}>
          医療費を変えて計算する
        </button>
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
