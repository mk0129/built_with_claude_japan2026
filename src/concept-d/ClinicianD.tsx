import { useEffect, useRef, useState, type ReactNode } from "react"
import type { ClinicianLive } from "./live"
import type { ClinicianRecord, LiveConcern, LiveLibraryItem } from "./record"
import { SAFETY_KINDS, type Draft, type StudioLive } from "./studio"
import { DDraftPreview } from "./PatientD"
import { areaOf } from "./learning"
import { ShioriLogo } from "./ShioriLogo"
import {
  currentVisitDate,
  formatShortDate,
  intervisitEvents,
  previousVisitDate,
  severityLabels,
  symptomLibrary,
  symptomName,
  type HealthRecord,
} from "./healthData"

export type ClinicianDViewport = "1180" | "820"
type SessionState = "none" | "request" | "waiting" | "active" | "expired" | "ended"
type Workspace = "visit" | "course" | "library" | "studio"
type VisitPage = "summary" | "detail" | "prescribe" | "review" | "sent"
type ClinicalScenario = "standard" | "many" | "noQuiz" | "clear"

export function CIcon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    visit: (
      <>
        <path d="M4 5h16v15H4z" />
        <path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z" />
        <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5a3.5 3.5 0 0 1 3.5 3Z" />
      </>
    ),
    studio: (
      <>
        <path d="M4 4h16v16H4zM8 4v16M8 9h12M8 15h12" />
        <path d="m12 12 1 1 2-2" />
      </>
    ),
    qr: (
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v3h-3M14 19h3v1h-3z" />
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.5 20h19Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-1 .6-1.4 1.1-1.4 2.3M12 17h.01" />
      </>
    ),
    note: (
      <>
        <path d="M5 3h14v18H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6z" />
        <path d="M14 2v5h5M9 12h6M9 16h6" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10Z" />
        <path d="m13.5 7 3.5 3.5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 15v5h16v-5" />
      </>
    ),
    pulse: (
      <>
        <path d="M3 12h4l2-5 4 10 2-5h6" />
        <path d="M20 7a5 5 0 0 0-8-3 5 5 0 0 0-8 6c0 5 8 10 8 10s4-2.5 6.5-5.5" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}

function CLogo() {
  return <ShioriLogo variant="clinician" sub="for medical" />
}

function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode
  tone?: "blue" | "red" | "amber" | "green" | "gray" | "purple"
}) {
  return <span className={`cd-badge ${tone}`}>{children}</span>
}

const concerns = [
  {
    id: 1,
    type: "患者の質問",
    tone: "purple" as const,
    title: "腕のつっぱりはいつまで続きますか？",
    area: "手術",
    detail:
      "腕を動かすと傷が開きそうで怖いです。どのくらいまで上げてよいでしょうか。",
    answer: "患者記載の質問",
    source: "診察ノート · 6月14日",
  },
  {
    id: 2,
    type: "「わからない」",
    tone: "red" as const,
    title: "術後、どこまで腕を上げてよいか",
    area: "手術",
    detail: "設問：手術後の腕の動かし方として、適切なものを選んでください。",
    answer: "わからない",
    source: "手術後の腕と傷のケア · 6月13日",
  },
  {
    id: 3,
    type: "誤答",
    tone: "amber" as const,
    title: "リンパ浮腫の初期サイン",
    area: "副作用・支持療法",
    detail:
      "設問：リンパ浮腫の初期に気づくため、確認するとよい変化はどれですか。",
    answer: "痛みがなければ変化はない",
    source: "リンパ浮腫を知る · 6月12日",
  },
  {
    id: 4,
    type: "処方教材",
    tone: "blue" as const,
    title: "ホルモン療法を始める前に",
    area: "薬物療法",
    detail: "6月12日に処方。未学習です。",
    answer: "未学習",
    source: "今回の情報処方",
  },
]

const extraQuestions = [
  {
    id: 5,
    type: "患者の質問",
    tone: "purple" as const,
    title: "薬を飲み忘れたときは、どうすればよいですか？",
    area: "薬物療法",
    detail:
      "朝に飲む薬を忘れて夕方に気づいた場合、その日の分は飲んでよいでしょうか。次の日はいつも通りでよいですか。",
    answer: "患者記載の質問",
    source: "診察ノート · 6月14日",
  },
  {
    id: 6,
    type: "患者の質問",
    tone: "purple" as const,
    title: "仕事に戻る時期を相談したいです",
    area: "日常生活・相談支援",
    detail:
      "来月から仕事に戻る予定ですが、通勤と長時間のパソコン作業を始めてもよい時期を相談したいです。",
    answer: "患者記載の質問",
    source: "診察ノート · 6月13日",
  },
  {
    id: 7,
    type: "患者の質問",
    tone: "purple" as const,
    title: "傷の近くが赤く、昨日より熱く感じます",
    area: "手術",
    detail:
      "昨夜から傷の近くが少し赤く、触ると昨日より熱い感じがします。次の診察まで待ってよいでしょうか。",
    answer: "患者記載の質問",
    source: "診察ノート · 6月15日",
    symptomMention: true,
  },
  {
    id: 8,
    type: "患者の質問",
    tone: "purple" as const,
    title: "治療中の食事で避けるものはありますか？",
    area: "日常生活・相談支援",
    detail:
      "食欲はありますが、治療中に食べないほうがよいものや、積極的に食べたほうがよいものがあれば知りたいです。",
    answer: "患者記載の質問",
    source: "診察ノート · 6月12日",
  },
]

const areas = [
  ["検査・診断", "2 / 2", "3 / 4", "誤答 1", 100],
  ["手術", "1 / 2・途中1", "2 / 3", "不明 1", 66],
  ["薬物療法", "0 / 1", "未回答", "未学習 1", 0],
  ["放射線療法", "0 / 0", "—", "なし", 0],
  ["副作用・支持療法", "1 / 2", "1 / 2", "誤答 1", 50],
  ["日常生活・相談支援", "自主 1 / 2", "2 / 2", "なし", 50],
]

const libraryItems = [
  {
    id: 1,
    title: "手術後の腕と傷のケア",
    area: "手術",
    time: 8,
    target: "乳房手術後の患者",
    goal: "無理のない腕の動かし方と相談の目安を知る",
    scope: "共通教材",
  },
  {
    id: 2,
    title: "リンパ浮腫の初期サイン",
    area: "副作用・支持療法",
    time: 6,
    target: "リンパ節手術後の患者",
    goal: "日常で確認できる変化と相談の目安を知る",
    scope: "共通教材",
  },
  {
    id: 3,
    title: "ホルモン療法を始める前に",
    area: "薬物療法",
    time: 7,
    target: "ホルモン療法を開始する患者",
    goal: "治療目的、服用方法、相談する症状を確認する",
    scope: "共通教材",
  },
  {
    id: 4,
    title: "当院の相談窓口と連絡方法",
    area: "日常生活・相談支援",
    time: 4,
    target: "当院で治療を受ける患者",
    goal: "相談内容に応じた連絡先を選べる",
    scope: "施設内教材",
  },
  {
    id: 5,
    title: "放射線治療中の皮膚ケア",
    area: "放射線療法",
    time: 9,
    target: "放射線治療を受ける患者",
    goal: "皮膚を守る方法と相談の目安を知る",
    scope: "共通教材",
  },
]

/** 質問・理解確認の項目（Figma の架空データ、または本番の LiveConcern） */
type ConcernItem = {
  id: number | string
  type: string
  tone: "purple" | "red" | "amber" | "blue"
  title: string
  area: string
  detail: string
  answer: string
  source: string
  symptomMention?: boolean
} & Partial<Omit<LiveConcern, "id" | "type" | "tone" | "title" | "area" | "detail" | "answer" | "source">>
/** 領域別の行 [領域, 学習, 確認問題, 要確認, 学習済みの割合, 本番の内訳] */
type AreaRow = [string, string, string, string, number, { unknown: number; incomplete: boolean }?]
/** 教材カード（Figma の架空データ、または本番の LiveLibraryItem） */
type LibraryCard = Omit<(typeof libraryItems)[number], "id"> & { id: number | string } & Partial<Pick<LiveLibraryItem, "prescribedNow" | "prescribedBefore" | "thumbnail">>

export default function ClinicianD({
  variant = "prototype",
  live,
  record,
  studio,
  viewport,
  healthRecords,
  activeSymptomIds,
  customSymptomNames,
}: {
  /** prototype: Figma のテスト状態・診察シナリオ・Before/After つき（開発用）。app: 端末枠なしの実アプリ表示 */
  variant?: "app" | "prototype"
  /** 本番: 一時共有の実 API（共有状態・残り時間・患者名・延長・終了）。なければ Figma の架空の状態 */
  live?: ClinicianLive
  /** 本番（Step 2）: 診察サマリー・情報処方の実 API。なければ Figma の架空データ */
  record?: ClinicianRecord
  /** 本番（Step 5）: 教材スタジオの実 API。なければ Figma の架空の制作手順 */
  studio?: StudioLive
  viewport: ClinicianDViewport
  healthRecords: HealthRecord[]
  activeSymptomIds: string[]
  customSymptomNames: Record<string, string>
}) {
  const [sessionLocal, setSessionLocal] = useState<SessionState>("none")
  const session = live ? live.state : sessionLocal
  const setSession = live ? live.setState : setSessionLocal
  const [workspace, setWorkspace] = useState<Workspace>("visit")
  const [visitPage, setVisitPage] = useState<VisitPage>("summary")
  const [clinicalScenario, setClinicalScenario] =
    useState<ClinicalScenario>("standard")
  const [selectedConcern, setSelectedConcern] = useState<number | string>(2)
  // 本番は選択なしから始める（Figma は架空の 2 件が選択済み）
  const [prescription, setPrescription] = useState<(number | string)[]>(record ? [] : [1, 2])
  const [studioStep, setStudioStep] = useState(1)
  // URL で指定した既存の下書きを開いたときは、編集の手順（Step 5）から始める
  const openedDraft = studio?.openedFromUrl && studio.draft?.version.id === studio.openedFromUrl ? studio.openedFromUrl : null
  const [shownDraft, setShownDraft] = useState<string | null>(null)
  if (openedDraft && openedDraft !== shownDraft) {
    setShownDraft(openedDraft)
    setWorkspace("studio")
    setStudioStep(5)
  }
  const [notice, setNotice] = useState("")
  const [extendLocal, setExtendLocal] = useState(false)
  const extendRequested = live ? live.extensionRequested : extendLocal
  const setExtendRequested = live
    ? (value: boolean) => {
        if (value) void live.requestExtension()
      }
    : setExtendLocal
  const [comparisonOpen, setComparisonOpen] = useState(false)

  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(""), 2200)
  }
  const endSession = () => {
    if (live) void live.end()
    else setSession("none")
    setVisitPage("summary")
    setWorkspace("visit")
  }

  return (
    <div className="cd-wrap">
      {variant === "prototype" && (
      <div className="cd-testbar">
        <div>
          <Badge>開発用</Badge>
          <b>医療者プロトタイプ</b>
        </div>
        <label>
          テスト状態
          <select
            value={session}
            onChange={(event) => setSession(event.target.value as SessionState)}
          >
            <option value="none">患者との共有なし</option>
            <option value="request">接続申請</option>
            <option value="waiting">患者の承認待ち</option>
            <option value="active">一時共有中</option>
            <option value="expired">共有期限切れ</option>
          </select>
        </label>
        <label>
          診察シナリオ
          <select
            value={clinicalScenario}
            onChange={(event) =>
              setClinicalScenario(event.target.value as ClinicalScenario)
            }
          >
            <option value="standard">A/B：質問・確認事項あり</option>
            <option value="many">C：質問が5件</option>
            <option value="noQuiz">D：理解確認は未回答</option>
            <option value="clear">E：確認事項なし</option>
          </select>
        </label>
        <span>文章入力なしで診察終了できます</span>
        <button
          className="cd-compare-button"
          onClick={() => setComparisonOpen(true)}
        >
          Before / After
        </button>
      </div>
      )}
      <div
        className={`cd-device cd-${viewport}${variant === "app" ? " cd-device-app" : ""}`}
      >
        {session !== "active" ? (
          <SessionGate
            state={session}
            setState={setSession}
            notify={notify}
            variant={variant}
            live={live}
          />
        ) : (
          <div className="cd-app">
            <aside className="cd-sidebar">
              <CLogo />
              <div className="cd-session-card">
                <span className="cd-live" />
                <div>
                  <b>一時共有中</b>
                  <small>{live ? `残り ${live.remainingClock}` : "残り 42:18"}</small>
                </div>
              </div>
              <nav>
                <button
                  className={workspace === "visit" ? "active" : ""}
                  onClick={() => {
                    setWorkspace("visit")
                    setVisitPage("summary")
                  }}
                >
                  <CIcon name="visit" />
                  診察
                  {record ? (
                    record.questions.length + record.checks.length > 0 && (
                      <i>{record.questions.length + record.checks.length}</i>
                    )
                  ) : (
                  clinicalScenario !== "clear" && (
                    <i>
                      {clinicalScenario === "many"
                        ? 7
                        : clinicalScenario === "noQuiz"
                          ? 2
                          : 4}
                    </i>
                  )
                  )}
                </button>
                <button
                  className={workspace === "course" ? "active" : ""}
                  onClick={() => setWorkspace("course")}
                >
                  <CIcon name="home" />
                  在宅経過
                </button>
                <button
                  className={workspace === "library" ? "active" : ""}
                  onClick={() => setWorkspace("library")}
                >
                  <CIcon name="book" />
                  教材ライブラリ
                </button>
                <button
                  className={workspace === "studio" ? "active" : ""}
                  onClick={() => setWorkspace("studio")}
                >
                  <CIcon name="studio" />
                  教材スタジオ
                </button>
              </nav>
              <div className="cd-side-bottom">
                <p>
                  <CIcon name="shield" size={17} />
                  患者承認による一時共有
                </p>
                <button onClick={endSession} disabled={live?.ending} aria-busy={live?.ending}>
                  <CIcon name="lock" />
                  {live?.ending ? "終了しています…" : "共有を終了"}
                </button>
              </div>
            </aside>
            <main className="cd-main">
              {(workspace === "library" || workspace === "studio") ? (
                // 教材ライブラリ・スタジオでは患者ヘッダーを小さな共有中チップにまとめる（権限は変えない。共有中であることと残り時間は常に表示）
                <header className="cd-app-header cd-app-header-compact" data-header-compact>
                  <div>
                    <span className="cd-share-chip" data-share-chip>
                      <i className="cd-live" />
                      {live?.patientName ? `${live.patientName}さんと` : "佐藤 花子さんと"}一時共有中・残り{live ? live.remainingMin : 42}分
                    </span>
                  </div>
                  <div className="cd-session-actions">
                    <button className="cd-header-end" onClick={endSession} disabled={live?.ending} aria-busy={live?.ending}>
                      <CIcon name="lock" />
                      {live?.ending ? "終了しています…" : "共有終了"}
                    </button>
                  </div>
                </header>
              ) : (
              <header className="cd-app-header">
                <div>
                  <span className="cd-avatar">
                    {live?.patientName ? live.patientName.slice(0, 1) : "佐"}
                  </span>
                  <div>
                    <b>
                      {live?.patientName ? `${live.patientName}さん` : "佐藤 花子さん"}
                    </b>
                    <small>
                      {/* 本番: DB にない年齢・病歴・次回診察は項目ごと出さない（架空の値と実データを混ぜない。「未登録」の行も出さない） */}
                      {live
                        ? `患者本人の承認による一時共有${live.org?.orgName ? ` · ${live.org.orgName}` : ""}`
                        : "52歳 · 乳房部分切除術後 · 次回診察 6月20日"}
                    </small>
                  </div>
                </div>
                <div className="cd-session-actions">
                  {extendRequested ? (
                    <>
                      <Badge tone="amber">患者の再承認待ち</Badge>
                      {/* 架空の再承認ボタンは開発用画面（prototype）だけに出す。本番は患者の実際の再承認を待つ（Phase 2 で接続） */}
                      {variant === "prototype" && (
                      <button
                        onClick={() => {
                          setExtendRequested(false)
                          notify(
                            "患者が再承認しました。共有時間を60分へ延長しました",
                          )
                        }}
                      >
                        プロトタイプ：再承認
                      </button>
                      )}
                    </>
                  ) : (
                    <button onClick={() => setExtendRequested(true)}>
                      <CIcon name="clock" />
                      共有を延長
                    </button>
                  )}
                  <span className="cd-remaining">
                    <i className="cd-live" />
                    {live ? `残り${live.remainingMin}分` : "残り42分"}
                  </span>
                  <button className="cd-header-end" onClick={endSession} disabled={live?.ending} aria-busy={live?.ending}>
                    <CIcon name="lock" />
                    {live?.ending ? "終了しています…" : "共有終了"}
                  </button>
                </div>
              </header>
              )}
              {workspace === "visit" && (
                <VisitWorkspace
                  page={visitPage}
                  setPage={setVisitPage}
                  selectedConcern={selectedConcern}
                  setSelectedConcern={setSelectedConcern}
                  prescription={prescription}
                  setPrescription={setPrescription}
                  notify={notify}
                  endSession={endSession}
                  scenario={clinicalScenario}
                  healthRecords={healthRecords}
                  record={record}
                  onOpenCourse={() => setWorkspace("course")}
                />
              )}
              {workspace === "course" && record && (
                // 本番（Step 4）: 患者が共有した実際の体調記録
                <LiveHomeCourse record={record} />
              )}
              {workspace === "course" && !record && (
                <HomeCourse
                  records={healthRecords}
                  activeSymptomIds={activeSymptomIds}
                  customSymptomNames={customSymptomNames}
                />
              )}
              {workspace === "library" && (
                <PrescriptionLibrary
                  standalone
                  record={record}
                  selected={prescription}
                  setSelected={setPrescription}
                  onReview={() => {
                    setWorkspace("visit")
                    setVisitPage("review")
                  }}
                />
              )}
              {workspace === "studio" && (
                <Studio
                  step={studioStep}
                  setStep={setStudioStep}
                  notify={notify}
                  live={studio}
                  staffName={live?.org?.displayName}
                  onPublished={() => void record?.reload()}
                />
              )}
            </main>
          </div>
        )}
      </div>
      {notice && (
        <div className="cd-toast">
          <CIcon name="check" />
          {notice}
        </div>
      )}
      {comparisonOpen && (
        <ComparisonModal onClose={() => setComparisonOpen(false)} />
      )}
    </div>
  )
}

function ComparisonModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="cd-comparison-overlay" onClick={onClose}>
      <section onClick={(event) => event.stopPropagation()}>
        <div className="cd-comparison-head">
          <div>
            <p className="cd-eyebrow">追加の記録なし</p>
            <h2>診察UXの Before / After</h2>
          </div>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div className="cd-comparison-grid">
          <article className="before">
            <Badge tone="gray">Before</Badge>
            <h3>記録することが中心</h3>
            <ul>
              <li>統計カードから確認事項を探す</li>
              <li>各項目を別画面で開く</li>
              <li>説明内容と患者の反応を文章入力</li>
              <li>入力後に「対応済み」を保存</li>
              <li>全項目の処理を意識して診察終了</li>
            </ul>
            <dl>
              <div>
                <dt>閲覧のみの診察</dt>
                <dd>約8クリック</dd>
              </div>
              <div>
                <dt>必須文章入力</dt>
                <dd>1回以上</dd>
              </div>
            </dl>
          </article>
          <article className="after">
            <Badge tone="green">After</Badge>
            <h3>見るだけで価値を得る</h3>
            <ul>
              <li>質問原文を最初の画面に表示</li>
              <li>誤答・「わからない」を同じ画面で展開</li>
              <li>対応状態と補助メモは任意</li>
              <li>情報処方なしでも共有終了できる</li>
              <li>正式な記録は電子カルテに一本化</li>
            </ul>
            <dl>
              <div>
                <dt>閲覧のみの診察</dt>
                <dd>共有終了 1クリック</dd>
              </div>
              <div>
                <dt>必須文章入力</dt>
                <dd>0回</dd>
              </div>
            </dl>
          </article>
        </div>
        <div className="cd-comparison-flows">
          <div>
            <b>シナリオA · 閲覧のみ</b>
            <span>質問・理解確認を見る → 共有終了</span>
            <em>追加入力 0回</em>
          </div>
          <div>
            <b>シナリオB · 情報処方あり</b>
            <span>候補を見る → 選択 → 確認 → 処方確定 → 共有終了</span>
            <em>メッセージ入力 0回</em>
          </div>
        </div>
      </section>
    </div>
  )
}

function SessionGate({
  state,
  setState,
  notify,
  variant = "prototype",
  live,
}: {
  state: SessionState
  setState: (state: SessionState) => void
  notify: (message: string) => void
  variant?: "app" | "prototype"
  live?: ClinicianLive
}) {
  const [method, setMethod] = useState<"qr" | "code">("qr")
  const [code, setCode] = useState("")
  return (
    <div className="cd-gate">
      <header>
        <CLogo />
        <div>
          {/* 本番: 申請を出す医療機関と医療者の表示名（DB の所属）。Figma は架空の「乳腺外科 / 山田医師」 */}
          <span>{live ? (live.org?.orgName ?? "医療機関を選択してください") : "乳腺外科"}</span>
          <button
            onClick={() => notify("アカウントメニューはプロトタイプ対象外です")}
          >
            {live ? (live.org?.displayName ?? live.orgs[0]?.displayName ?? "医療者") : "山田医師"}
          </button>
        </div>
      </header>
      <main>
        {state === "none" && (
          <div className="cd-gate-home">
            <Badge>診察を始める</Badge>
            <h1>患者情報は、承認された間だけ表示されます</h1>
            <p>
              {live
                ? "患者のshioriに表示されたQRコードを読み取るか、6桁コードを入力して接続を申請します。患者本人が承認するまで、患者情報は表示されません。"
                : "QRコードまたは6桁の共有コードで、患者本人へ接続を申請します。患者情報は一覧として保存されません。"}
            </p>
            <div className="cd-privacy-visual">
              <span>
                <CIcon name="user" size={32} />
                患者
              </span>
              <i />
              <span>
                <CIcon name="shield" size={32} />
                60分だけ共有
              </span>
              <i />
              <span>
                <CIcon name="visit" size={32} />
                医療者
              </span>
            </div>
            <button className="cd-primary" onClick={() => setState("request")}>
              <CIcon name="qr" />
              {live ? "患者のQRを読み取る／6桁コードを入力" : "患者との接続を開始"}
            </button>
            <div className="cd-no-patients">
              <CIcon name="lock" />
              <p>
                <b>患者一覧はありません</b>
                過去に共有した患者情報を、医療者が自由に再閲覧することはできません。
              </p>
            </div>
          </div>
        )}
        {state === "request" && live && (
          <div className="cd-connect" data-connect-live>
            <button className="cd-back" onClick={() => setState("none")}>
              ← 戻る
            </button>
            <p className="cd-eyebrow">一時共有の申請</p>
            <h1>患者のQRを読み取る／6桁コードを入力</h1>
            <p>患者のshioriに表示されたQRコードと6桁コードは、同じ申請です。どちらか一方で申請してください。</p>
            {live.orgs.length > 1 && (
              <label className="cd-org-select">
                申請を出す医療機関
                <select
                  value={live.org?.orgId ?? ""}
                  onChange={(event) => live.chooseOrg(event.target.value)}
                >
                  <option value="" disabled>
                    選んでください
                  </option>
                  {live.orgs.map((o) => (
                    <option key={o.orgId} value={o.orgId}>
                      {o.orgName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="cd-qr-panel cd-scan-guide" data-scan-guide>
              <div className="cd-qr-placeholder">
                <CIcon name="qr" size={86} />
              </div>
              <div>
                <h2>QRコードを読み取る</h2>
                <ol className="cd-steps-numbered" data-scan-steps>
                  <li><span aria-hidden="true">1</span>この医療者アカウントでログインしたスマートフォン・タブレットの標準カメラで、患者のQRコードを読み取る</li>
                  <li><span aria-hidden="true">2</span>開いたshioriの画面で申請が送られる</li>
                  <li><span aria-hidden="true">3</span>このパソコンの画面も自動で「患者の承認を待っています」に切り替わります</li>
                </ol>
              </div>
            </div>
            <div className="cd-code-panel">
              <label>
                カメラがない場合は、患者の画面の6桁コードを入力
                <input
                  value={code}
                  maxLength={6}
                  inputMode="numeric"
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                />
              </label>
              <p>コードは発行から5分間・1回限り有効です。入力しただけでは共有されません。患者が申請者を確認して承認すると、診察サマリーが開きます。</p>
            </div>
            <button
              className="cd-primary"
              disabled={code.length !== 6 || !live.org}
              onClick={() => void live.claimCode(code)}
            >
              患者へ承認を依頼する
              <CIcon name="arrow" />
            </button>
          </div>
        )}
        {/* 開発用画面（/d/dev）の Figma プロトタイプ。本番は上の「患者のQRを読み取る／6桁コードを入力」 */}
        {state === "request" && !live && (
          <div className="cd-connect">
            <button className="cd-back" onClick={() => setState("none")}>
              ← 戻る
            </button>
            <p className="cd-eyebrow">一時共有の申請</p>
            <h1>患者へ接続を申請</h1>
            <p>患者のshioriアプリに表示される方法を選んでください。</p>
            <div className="cd-method-tabs">
              <button
                className={method === "qr" ? "active" : ""}
                onClick={() => setMethod("qr")}
              >
                QRコード
              </button>
              <button
                className={method === "code" ? "active" : ""}
                onClick={() => setMethod("code")}
              >
                6桁コード
              </button>
            </div>
            {method === "qr" ? (
              <div className="cd-qr-panel">
                <div className="cd-qr-placeholder">
                  <CIcon name="qr" size={86} />
                </div>
                <div>
                  <h2>患者のアプリで読み取ります</h2>
                  <ol>
                    <li>患者アプリで「共有する」を開く</li>
                    <li>このQRコードを読み取る</li>
                    <li>患者が共有内容を確認して承認する</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="cd-code-panel">
                <label>
                  患者のアプリに表示された6桁コード
                  <input
                    value={code}
                    maxLength={6}
                    inputMode="numeric"
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="000000"
                  />
                </label>
                <p>コードは10分間有効です。電話やメールでは送らないでください。</p>
              </div>
            )}
            <button
              className="cd-primary"
              disabled={method === "code" && code.length !== 6}
              onClick={() => setState("waiting")}
            >
              患者へ承認を依頼する
              <CIcon name="arrow" />
            </button>
          </div>
        )}
        {state === "waiting" && (
          <div className="cd-waiting">
            <span className="cd-wait-icon">
              <CIcon name="clock" size={38} />
            </span>
            <p className="cd-eyebrow">患者承認待ち</p>
            <h1>患者の承認を待っています</h1>
            <p>
              患者の端末で共有内容と60分の閲覧時間を確認しています。承認されるまで患者情報は表示されません。
            </p>
            {live && (
              <WaitingInfo
                orgName={live.org?.orgName ?? null}
                clinicianName={live.org?.displayName ?? null}
              />
            )}
            <div className="cd-wait-steps">
              <span className="done">
                <CIcon name="check" />
                接続申請
              </span>
              <i />
              <span className="current">
                <CIcon name="clock" />
                患者の確認
              </span>
              <i />
              <span>
                <CIcon name="lock" />
                共有開始
              </span>
            </div>
            {/* 架空の承認ボタンは開発用画面（prototype）だけに出す。本番は患者の実際の承認を待つ（Phase 2 で接続） */}
            {variant === "prototype" && (
            <button className="cd-primary" onClick={() => setState("active")}>
              プロトタイプ：患者が承認
            </button>
            )}
            <button
              className="cd-secondary"
              onClick={() => setState("request")}
            >
              申請を取り消す
            </button>
          </div>
        )}
        {state === "ended" && (
          <div className="cd-expired cd-ended" data-share-ended>
            <span>
              <CIcon name="check" size={38} />
            </span>
            <p className="cd-eyebrow">共有終了</p>
            <h1>共有を終了しました</h1>
            <p>
              {live?.endedInfo?.patientName ? `${live.endedInfo.patientName}さんとの` : ""}一時共有を終了しました。患者の学習情報・体調記録は、この画面からは閲覧できません。
            </p>
            <div className="cd-expired-info">
              <CIcon name="shield" />
              <p>
                次に閲覧するときは、新しい接続申請と患者本人の承認が必要です。
              </p>
            </div>
            <button className="cd-primary" onClick={() => setState("none")}>
              ホームへ戻る
            </button>
            <button className="cd-secondary" onClick={() => setState("request")}>
              次の患者と接続する
            </button>
          </div>
        )}
        {state === "expired" && (
          <div className="cd-expired">
            <span>
              <CIcon name="lock" size={38} />
            </span>
            <p className="cd-eyebrow">共有終了</p>
            <h1>一時共有は終了しました</h1>
            <p>
              期限切れ、または患者によって共有が終了されました。患者の学習情報は閲覧できません。
            </p>
            <div className="cd-expired-info">
              <CIcon name="shield" />
              <p>
                再度閲覧するには、新しい接続申請と患者本人の承認が必要です。
              </p>
            </div>
            <button className="cd-primary" onClick={() => setState("request")}>
              新しく接続を申請
            </button>
            <button className="cd-secondary" onClick={() => setState("none")}>
              ホームへ戻る
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

/** 承認待ちの画面: 申請元（所属・表示名）と、この画面で申請してからの経過時間（画面内の計時。サーバーの期限とは別） */
function WaitingInfo({ orgName, clinicianName }: { orgName: string | null; clinicianName: string | null }) {
  const [since] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const sec = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <dl className="cd-wait-info" data-wait-info>
      {orgName && (
        <div>
          <dt>申請元</dt>
          <dd>
            {orgName}
            {clinicianName ? ` ${clinicianName}` : ""}
          </dd>
        </div>
      )}
      <div>
        <dt>申請から</dt>
        <dd>
          {String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}
        </dd>
      </div>
      <div>
        <dt>承認後の閲覧時間</dt>
        <dd>60分</dd>
      </div>
    </dl>
  )
}

function VisitWorkspace({
  page,
  setPage,
  selectedConcern,
  setSelectedConcern,
  prescription,
  setPrescription,
  notify,
  endSession,
  scenario,
  healthRecords,
  record,
  onOpenCourse,
}: {
  page: VisitPage
  setPage: (page: VisitPage) => void
  selectedConcern: number | string
  setSelectedConcern: (id: number | string) => void
  prescription: (number | string)[]
  setPrescription: (ids: (number | string)[]) => void
  notify: (message: string) => void
  endSession: () => void
  scenario: ClinicalScenario
  healthRecords: HealthRecord[]
  record?: ClinicianRecord
  onOpenCourse?: () => void
}) {
  const [sentCount, setSentCount] = useState(0)
  if (page === "summary")
    return (
      <Summary
        scenario={scenario}
        healthRecords={healthRecords}
        record={record}
        onConcern={(id) => {
          setSelectedConcern(id)
          setPage("detail")
        }}
        onPrescribe={() => setPage("prescribe")}
        onOpenCourse={onOpenCourse}
      />
    )
  if (page === "detail")
    return (
      <ConcernDetail
        concern={
          record
            ? ([...record.questions, ...record.checks].find((item) => item.id === selectedConcern) as ConcernItem | undefined) ??
              null
            : ([...concerns, ...extraQuestions].find(
                (item) => item.id === selectedConcern,
              ) || concerns[0])
        }
        record={record}
        onBack={() => setPage("summary")}
        onAdd={() => {
          const target = record
            ? [...record.questions, ...record.checks].find((item) => item.id === selectedConcern)?.materialId
            : 1
          if (target == null) return
          if (record?.library?.find((item) => item.id === target)?.prescribedNow) {
            notify("この教材は、この診察で処方済みです")
            return
          }
          if (!prescription.includes(target)) setPrescription([...prescription, target])
          notify("関連教材を処方候補へ追加しました")
        }}
        onSave={notify}
        onNext={() => setPage("prescribe")}
      />
    )
  if (page === "prescribe")
    return (
      <PrescriptionLibrary
        record={record}
        selected={prescription}
        setSelected={setPrescription}
        onReview={() => setPage("review")}
        onBack={() => setPage("summary")}
      />
    )
  if (page === "review")
    return (
      <PrescriptionReview
        record={record}
        selected={prescription}
        onBack={() => setPage("prescribe")}
        onConfirm={async (note) => {
          if (!record) return setPage("sent")
          const n = await record.prescribe(prescription.map(String), note)
          if (n === null) return
          setSentCount(n)
          setPrescription([])
          setPage("sent")
        }}
      />
    )
  return (
    <PrescriptionSent
      record={record}
      count={record ? sentCount : prescription.length}
      onSummary={() => setPage("summary")}
      onEnd={endSession}
    />
  )
}

function dateRange(start: string, end: string) {
  const result: string[] = []
  const cursor = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

/**
 * 本番（Step 4）の外来間の経過。Figma の IntervisitSummary と同じ DOM・クラスで、サーバーが統合した構造化データ
 * （体調・学習・理解確認・質問）と要約を表示する。前回外来日は DB にないため「前回外来から」とは書かず、
 * 期間（既定は直近 14 日、医療者が変更可）と「前回共有日」を明記する。要約の各文から根拠の元データを開ける。
 */
/** 教材への反応で、患者が自由記述をせずに選んだ回答 */
const SELECTION_LABEL = { have_question: "質問がある", explain_again: "もう一度説明してほしい" } as const

function LiveIntervisit({ record, onOpenCourse }: { record: ClinicianRecord; onOpenCourse?: () => void }) {
  const [expanded, setExpanded] = useState<"vitals" | "symptoms" | "learning" | "questions" | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [periodEdit, setPeriodEdit] = useState(false)
  // 選んだ期間は在宅経過表と共有する（共有が変わったら消える）
  const { period, setPeriod } = record
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null)
  // 開いている根拠（要点の行・患者の質問・全項目の文）。開いた行のすぐ下に根拠を表示する
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [allOpen, setAllOpen] = useState(false)
  // 「ほか N 件」を開いた行（質問・症状・学習）
  const [moreOpen, setMoreOpen] = useState<string[]>([])
  const [fullQuestion, setFullQuestion] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [showRule, setShowRule] = useState(false)
  // サーバーの既定期間の終了日（撮影用デモ環境ではデモの基準日、通常は今日）。期間の変更で未来日を選ばせない
  const maxDay = record.defaultTo
  useEffect(() => {
    void record.loadIntervisit(period)
    // 要約は構造化データと同じ期間で 1 回生成（同じデータならサーバーが再利用。元データが変わっていれば再生成）
    void record.loadAiSummary(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.from, period?.to, record.sessionId])
  const periodKey = period ? `?from=${period.from}&to=${period.to}` : ""
  // 選んだ期間の構造化データだけを表示する（別の期間の応答は、読み込み中として扱う）
  const data = record.intervisitKey === periodKey ? record.intervisit : null
  // 期間の確認・変更（読み込み中も使える。続けて別の期間を選び直せる）
  const shownPeriod = record.intervisit && record.intervisitKey === "" ? record.intervisit.intervisit.period : null
  const openPeriodEditor = () => {
    const to = record.defaultTo ?? localDate(new Date())
    const from = new Date(`${to}T00:00:00`)
    from.setDate(from.getDate() - 13)
    setDraft(period ?? (shownPeriod ? { from: shownPeriod.from, to: shownPeriod.to } : { from: localDate(from), to }))
    setPeriodEdit(!periodEdit)
  }
  const periodButton = (
    <button onClick={openPeriodEditor}>
      <CIcon name="visit" />
      期間を確認・変更
    </button>
  )
  const periodEditor = periodEdit && draft && (
    <div className="cd-period-editor">
      <label>
        開始日
        <input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
      </label>
      <label>
        終了日
        <input type="date" value={draft.to} min={draft.from} max={maxDay ?? undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
      </label>
      <p>
        前回外来日が確認できないため、期間は医療者が選択します。日付を推測しません。{" "}
        <button
          className="cd-text-back"
          onClick={() => {
            setOpenKey(null)
            setPeriod(draft)
            setPeriodEdit(false)
          }}
        >
          この期間で表示
        </button>
      </p>
    </div>
  )
  if (!data)
    return (
      <section className="cd-intervisit" data-intervisit data-intervisit-loading>
        <div className="cd-intervisit-head">
          <div>
            <p className="cd-eyebrow">{period ? "指定期間の経過" : "外来間の経過"}</p>
            <h2>経過を読み込んでいます…</h2>
            {period && (
              <span>
                {period.from.replaceAll("-", "/")}〜{period.to.replaceAll("-", "/")}
              </span>
            )}
          </div>
          {periodButton}
        </div>
        {periodEditor}
      </section>
    )
  const iv = data.intervisit
  const ai = record.aiSummary && record.aiSummary.key === periodKey ? record.aiSummary.data : null
  // 表示する要約: AI（検証済み）→ なければルールベース。医療者はルールベースに切り替えて見比べられる
  const useAi = !!ai && ai.status === "ai" && !showRule
  const items = useAi ? ai!.items : data.ruleSummary
  const sources = useAi ? ai!.sources : data.sources
  const kind = useAi ? (ai!.generator === "claude" ? "claude" : ai!.generator === "replay" ? "replay" : "fake") : "rule"
  const md = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  const dt = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
  const temp = iv.vitals.metrics.temperature
  const lastTemp = temp?.values[temp.values.length - 1]
  const topSymptom = [...iv.symptoms].sort((a, b) => b.max - a.max)[0]
  const unknown = iv.learning.flatMap((l) => l.answersInPeriod).filter((a) => a.result === "わからない").length
  const wrong = iv.learning.flatMap((l) => l.answersInPeriod).filter((a) => a.result === "誤答").length
  const toggle = (value: "vitals" | "symptoms" | "learning" | "questions") => setExpanded(expanded === value ? null : value)
  // 前回共有日が表示期間より後（撮影用の基準日と実際の日付のずれなど）のときは、期間と矛盾して見えるため出さない
  const prevShareInPeriod = iv.previousShareAt && localDate(new Date(iv.previousShareAt)) <= iv.period.to ? iv.previousShareAt : null
  const mdJa = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  // 根拠の記録の表示（日時と元の入力）。患者の質問・理解確認の回答は構造化データから、ほかは根拠 ID の元の記録から
  const questionById = new Map(iv.questions.map((q) => [q.sourceId, q]))
  const unknownRecords = iv.learning.flatMap((l) => l.answersInPeriod.filter((a) => a.result === "わからない").map((a) => ({ ...a, title: l.title })))
  const answerById = new Map(iv.learning.flatMap((l) => l.answersInPeriod.map((a) => [a.sourceId, { ...a, title: l.title }] as const)))
  const sourceLine = (id: string) => {
    const q = questionById.get(id)
    // 患者の質問・教材への反応は、元の記録の種類（自由記述 / 選んだ回答）で表示する
    if (q)
      return `${dt(q.createdAt)} · ${q.kind}${q.materialTitle ? `・${q.materialTitle}` : ""}：${
        q.input === "selection" ? `患者が選んだ回答「${SELECTION_LABEL[q.selection ?? "have_question"]}」（自由記述なし）` : `「${q.body}」（患者原文）`
      }`
    const a = answerById.get(id)
    if (a) return `${dt(a.at)} · 教材「${a.title}」・設問「${a.stem}」・回答「${a.result}」`
    const src = data.sources[id] ?? sources[id]
    return `${src?.at ? `${dt(src.at)} · ` : ""}${src?.label ?? id}`
  }
  // 同じ記録が根拠に重ねて挙がっても、1 件として数えて表示する
  const uniq = (ids: string[]) => [...new Set(ids)]
  const evidenceFor = (key: string, rawIds: string[], ids = uniq(rawIds)) =>
    openKey === key && (
      <div className="cd-summary-evidence" data-summary-sources data-evidence-for={key}>
        <small>根拠の記録（{ids.length}件）</small>
        {ids.map((id) => (
          <p key={id} data-source-id={id}>
            {sourceLine(id)}
          </p>
        ))}
      </div>
    )
  /** 根拠を開く・閉じる。閉じたら、押した行が画面から外れていれば元の位置（行）に戻す */
  const toggleEvidence = (key: string, target: HTMLElement) => {
    if (openKey !== key) return setOpenKey(key)
    setOpenKey(null)
    requestAnimationFrame(() => {
      const r = target.getBoundingClientRect()
      if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: "center" })
    })
  }
  const evidenceButton = (key: string, rawIds: string[], children: ReactNode, attrs: Record<string, string | number> = {}, label = "根拠", ids = uniq(rawIds)) => (
    <button className={`cd-key-sentence${openKey === key ? " active" : ""}`} aria-expanded={openKey === key} onClick={(e) => toggleEvidence(key, e.currentTarget)} {...attrs}>
      {children}
      <small>
        {label} {ids.length}件
        <CIcon name="arrow" size={12} />
      </small>
    </button>
  )
  const moreButton = (key: string, rest: number, what = "件") => (
    <button className="cd-text-back cd-more-questions" data-row-more={key} aria-expanded={moreOpen.includes(key)} onClick={() => setMoreOpen(moreOpen.includes(key) ? moreOpen.filter((x) => x !== key) : [...moreOpen, key])}>
      {moreOpen.includes(key) ? "閉じる" : `ほか${rest}${what}`}
    </button>
  )
  // 患者の質問（原文）。新しい順に 1 件を先頭に、ほかは「ほか N 件」で開く。根拠は質問の元の記録（日時・原文）
  const questionsNewest = [...iv.questions].sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  const questionLine = (q: (typeof iv.questions)[number]) => {
    const selected = q.input === "selection"
    const long = !selected && q.body.length > 60
    const full = fullQuestion === q.sourceId
    return (
      <div key={q.sourceId} className="cd-key-question" data-key-question={q.sourceId} data-question-input={selected ? "selection" : "free_text"}>
        {evidenceButton(
          `q:${q.sourceId}`,
          [q.sourceId],
          <span>
            {selected ? (
              <span>患者が選んだ回答：{SELECTION_LABEL[q.selection ?? "have_question"]}</span>
            ) : (
              <span className={long && !full ? "cd-clamp" : ""}>「{q.body}」</span>
            )}
            <em>
              {mdJa(q.createdAt)}・{selected ? "選択のみ（自由記述なし）" : "患者原文"}
            </em>
          </span>,
        )}
        {long && (
          <button className="cd-text-back cd-full-question" onClick={() => setFullQuestion(full ? null : q.sourceId)}>
            {full ? "全文を閉じる" : "全文を表示"}
          </button>
        )}
        {evidenceFor(`q:${q.sourceId}`, [q.sourceId])}
      </div>
    )
  }
  // 症状: 記録された値（程度の最大とその日付・直近の記録）を日付つきでそのまま示す（言い換えない）。元の記録は 1 操作で開く
  const recordedSymptoms = [...iv.symptoms].filter((x) => x.count > 0).sort((a, b) => b.max - a.max || b.count - a.count)
  const symptomLine = (sym: (typeof iv.symptoms)[number]) => {
    const entries = [...sym.entries].sort((a, b) => a.at.localeCompare(b.at))
    const last = entries[entries.length - 1]
    const peak = entries.filter((e) => e.severity === sym.max)
    const peakDays = uniq(peak.map((e) => localDate(new Date(e.at))))
    const text =
      sym.max === 0
        ? `記録${entries.length}件・すべて0/4（なし）`
        : entries.length === 1
          ? `${mdJa(last.at)} ${last.severity}/4（記録1件）`
          : `${mdJa(peak[0].at)} ${sym.max}/4${peakDays.length > 1 ? `（同じ値 ほか${peakDays.length - 1}日）` : ""}、直近の記録は${mdJa(last.at)} ${last.severity}/4`
    return (
      <div key={sym.key} data-symptom={sym.key}>
        {evidenceButton(
          `s:${sym.key}`,
          entries.map((e) => e.sourceId),
          <span>
            <span>
              <strong>{sym.name}</strong>　{text}
            </span>
          </span>,
          {},
          "元の記録",
        )}
        {evidenceFor(`s:${sym.key}`, entries.map((e) => e.sourceId))}
      </div>
    )
  }
  const unknownLine = (a: (typeof unknownRecords)[number]) => (
    <div key={a.sourceId} data-key-record={a.sourceId}>
      {evidenceButton(
        `u:${a.sourceId}`,
        [a.sourceId],
        <span>
          <span>「{a.stem}」に「わからない」と回答</span>
          <em>
            {mdJa(a.at)}・{a.title}
          </em>
        </span>,
      )}
      {evidenceFor(`u:${a.sourceId}`, [a.sourceId])}
    </div>
  )
  // 生成元（画面内で 1 回だけ短く示す。詳細は「作成情報」）
  const kindShort =
    kind === "claude" ? "AI要約（Claude）" : kind === "replay" ? "AI要約（記録再生）" : kind === "fake" ? "開発用の擬似要約（AIではありません）" : "記録の自動整理（ルールベース）"
  const origin =
    kind === "claude"
      ? `Claude による生成（${ai?.model ?? "モデル不明"}・${ai ? dt(ai.generatedAt) : ""}）。この診察のために生成しました。`
      : kind === "replay"
        ? `撮影用デモ環境: 記録済みの Claude 出力（${ai?.model ?? "モデル不明"}・${ai?.replayOf ?? ""} 生成）を再生しています。今回は Claude を呼び出していません。`
        : kind === "fake"
          ? "開発用の擬似生成です。Claude ではありません。"
          : "保存された記録から自動で整理しました（AI を使っていません）。"
  return (
    <section className="cd-intervisit" data-intervisit>
      <div className="cd-intervisit-head">
        <p className="cd-period-line" data-period-line>
          <b>観察期間</b>
          <span>
            {iv.fmt.from}〜{iv.fmt.to}（{iv.period.days}日間）
          </span>
          <small>
            {iv.period.isDefault ? iv.period.label : "指定期間"} ·{" "}
            {prevShareInPeriod
              ? `前回共有日 ${md(prevShareInPeriod)}（前回外来日ではありません）`
              : iv.previousShareAt
                ? "期間内の共有記録なし"
                : "前回の共有記録なし"}
          </small>
        </p>
        {periodButton}
      </div>
      {periodEditor}
      <div className="cd-medical-summary">
        <div className="cd-summary-narrative" data-summary-kind={kind}>
          <ul className="cd-key-summary" data-key-summary>
            <li data-key-row="questions">
              <b>患者の質問</b>
              <div>
                {questionsNewest.length ? (
                  <>
                    {questionLine(questionsNewest[0])}
                    {questionsNewest.length > 1 && moreButton("questions", questionsNewest.length - 1)}
                    {moreOpen.includes("questions") && questionsNewest.slice(1).map(questionLine)}
                  </>
                ) : (
                  <p className="cd-key-none" data-no-questions>
                    この期間に患者さんが残した質問はありません
                  </p>
                )}
              </div>
            </li>
            <li data-key-row="symptom">
              <b>
                症状<small data-severity-scale>患者評価 0〜4</small>
              </b>
              <div>
                {recordedSymptoms.length ? (
                  <>
                    {recordedSymptoms.slice(0, 2).map(symptomLine)}
                    {recordedSymptoms.length > 2 && moreButton("symptoms", recordedSymptoms.length - 2, "症状")}
                    {moreOpen.includes("symptoms") && recordedSymptoms.slice(2).map(symptomLine)}
                  </>
                ) : (
                  <p className="cd-key-none" data-symptom-state="none-recorded">
                    この期間に症状の記録はありません（記録なし。「症状なし」とは扱いません）
                  </p>
                )}
                {onOpenCourse && (
                  <button className="cd-text-back cd-open-course" onClick={onOpenCourse}>
                    在宅経過表・症状のグラフで確認
                  </button>
                )}
              </div>
            </li>
            <li data-key-row="unknown">
              <b>学習</b>
              <div>
                {unknownRecords.length ? (
                  <>
                    {unknownLine(unknownRecords[0])}
                    {unknownRecords.length > 1 && moreButton("unknown", unknownRecords.length - 1)}
                    {moreOpen.includes("unknown") && unknownRecords.slice(1).map(unknownLine)}
                  </>
                ) : (
                  <p className="cd-key-none">この期間に「わからない」と回答した設問はありません</p>
                )}
              </div>
            </li>
          </ul>
          <div className="cd-ai-line" data-ai-line>
            <span className="cd-ai-kind" data-ai-kind>
              {kindShort}
            </span>
            {record.aiLoading && !ai && <small data-ai-status="loading">AI要約を作成中（この間は記録の自動整理を表示）</small>}
            {ai && ai.status === "fallback" && <small data-ai-status="fallback">AI要約は表示していません：{ai.fallbackReason}</small>}
            {ai && ai.status === "ai" && ai.rejected.length > 0 && !showRule && <small data-ai-status="partial">照合できなかった{ai.rejected.length}項目を除外</small>}
            <button className="cd-text-back" data-ai-info-toggle aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)}>
              作成情報
            </button>
          </div>
          {infoOpen && (
            <div className="cd-ai-info" data-ai-info>
              <p>
                <b>生成元</b>
                {origin}
              </p>
              <p>
                <b>照合</b>
                {kind === "rule"
                  ? "記録の値・日付・原文をそのまま整理しています。"
                  : `各項目の数値・日付・時刻・引用を、根拠の元の記録と照合し、通らない項目は表示しません${kind === "replay" ? "（現在の記録で再照合）" : ""}。`}
              </p>
              {/* 「1/4」などが分数・日付に見えないよう、程度の表記を説明する */}
              <p className="cd-severity-legend" data-severity-legend>
                <b>「1/4」などの数値</b>は、患者本人が記録した自覚症状の程度（0 なし・1 軽い・2 中くらい・3 強い・4 非常に強い）です。CTCAE Grade ではありません。記録がない日は欠測で、「症状なし（0）」とは扱いません。
              </p>
              <p className="cd-summary-safety">
                <CIcon name="shield" />
                保存された記録だけから構成。各文を押すと根拠の記録を表示します。欠測を「症状なし」「改善」とは扱わず、原因・治療との因果関係・CTCAE Grade・診断・治療の提案を出しません。AI要約は数値・日付・引用を元データで検証し、通らない文は表示しません。
              </p>
            </div>
          )}
          <button className="cd-summary-all-toggle" data-summary-all-toggle aria-expanded={allOpen} onClick={() => setAllOpen(!allOpen)}>
            要約の全項目（{items.length}項目・各文を押すと根拠の記録）
            <span>{allOpen ? "閉じる" : "開く"}</span>
          </button>
          {allOpen && (
            <div data-summary-all>
              {(["体調の変化", "学習の状況", "患者からの質問", "時系列の経過"] as const).map((section) => {
                const list = items.map((item, index) => ({ item, index })).filter((x) => x.item.section === section)
                const opened = list.find((x) => openKey === `list:${x.index}`)
                return (
                  <div key={section} className="cd-summary-all-section">
                    <p>
                      <strong>{section}：</strong>
                      {list.map(({ item, index }) => (
                        <button
                          key={index}
                          className={`cd-summary-sentence${openKey === `list:${index}` ? " active" : ""}`}
                          aria-expanded={openKey === `list:${index}`}
                          onClick={(e) => toggleEvidence(`list:${index}`, e.currentTarget)}
                          data-summary-item={index}
                        >
                          {item.text}
                        </button>
                      ))}
                    </p>
                    {opened && evidenceFor(`list:${opened.index}`, opened.item.sourceIds)}
                  </div>
                )
              })}
              <p className="cd-summary-actions">
                {ai && ai.status === "ai" && (
                  <button
                    className="cd-text-back"
                    onClick={() => {
                      setOpenKey(null)
                      setShowRule(!showRule)
                    }}
                  >
                    {showRule ? "AI要約を表示" : "記録の自動整理（ルールベース）を表示"}
                  </button>
                )}
                {/* 記録済みの出力を再生する撮影用デモ環境では、再生成しても同じ出力のため出さない */}
                {kind !== "replay" && (
                  <button
                    className="cd-text-back"
                    disabled={record.aiLoading}
                    onClick={() => {
                      setOpenKey(null)
                      void record.loadAiSummary(period, { regenerate: true })
                    }}
                  >
                    {record.aiLoading ? "生成中…" : "外来間サマリーを再生成"}
                  </button>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="cd-intervisit-cards">
        <article className={expanded === "vitals" ? "active" : ""}>
          <button onClick={() => toggle("vitals")}>
            <span className="blue">
              <CIcon name="pulse" />
            </span>
            <div>
              <small>バイタル</small>
              <b>
                {iv.vitals.recordDays}日記録 · {iv.vitals.recordCount}件
              </b>
              <p>最新 {lastTemp ? `${md(lastTemp.at)} ${lastTemp.value}℃` : "体温の記録なし"}</p>
            </div>
            <span>{expanded === "vitals" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "vitals" && (
            <div className="cd-summary-evidence">
              {Object.values(iv.vitals.metrics).map((m) => (
                <p key={m.label}>
                  {m.label}{" "}
                  {m.count && m.min && m.max
                    ? `${m.count}回 · ${m.min.value}〜${m.max.value} ${m.unit}`
                    : "未記録"}
                </p>
              ))}
              <small>記録のない日（{iv.vitals.missingDays.length}日）は欠測です。正常・異常の判定はしていません。</small>
            </div>
          )}
        </article>
        <article className={expanded === "symptoms" ? "active" : ""}>
          <button onClick={() => toggle("symptoms")}>
            <span className="amber">
              <CIcon name="help" />
            </span>
            <div>
              <small>自覚症状</small>
              <b>{topSymptom ? `${topSymptom.name} 最大 ${topSymptom.max} / 4` : "記録なし"}</b>
              <p>
                {topSymptom
                  ? topSymptom.entries.map((e) => `${md(e.at)} ${e.severity}`).slice(-3).join(" → ")
                  : "期間内の回答はありません"}
              </p>
            </div>
            <span>{expanded === "symptoms" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "symptoms" && (
            <div className="cd-summary-evidence">
              {iv.symptoms.map((sym) => (
                <p key={sym.key}>
                  {sym.name}：{sym.entries.map((e) => `${md(e.at)} ${e.severity}/4`).join("、")}
                  {sym.newInPeriod ? "（期間内に初めて記録）" : ""}
                  {sym.stoppedRecording ? "（その後の記録では未回答）" : ""}
                </p>
              ))}
              <small>0〜4は患者本人による程度で、CTCAE Gradeではありません。未記録日を「症状なし」や改善とは扱いません。</small>
            </div>
          )}
        </article>
        <article className={expanded === "learning" ? "active" : ""}>
          <button onClick={() => toggle("learning")}>
            <span className="green">
              <CIcon name="book" />
            </span>
            <div>
              <small>学習履歴</small>
              <b>
                完了{iv.learning.filter((l) => l.status === "完了").length} · 途中{iv.learning.filter((l) => l.status === "学習途中").length}
              </b>
              <p>
                誤答{wrong} · 「わからない」{unknown}
              </p>
            </div>
            <span>{expanded === "learning" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "learning" && (
            <div className="cd-summary-evidence" data-learning-evidence>
              {iv.learning.map((l) => (
                <p key={l.versionId}>
                  {l.title}（第{l.versionNo}版）：{l.status}
                  {l.answersInPeriod
                    .filter((a) => a.result !== "正答")
                    .map((a) => ` · ${md(a.at)} ${a.result}「${a.stem}」`)
                    .join("")}
                </p>
              ))}
              {iv.learning.length === 0 && <p>記録はありません</p>}
            </div>
          )}
        </article>
        <article className={expanded === "questions" ? "active" : ""}>
          <button onClick={() => toggle("questions")}>
            <span className="purple">
              <CIcon name="note" />
            </span>
            <div>
              <small>患者の質問</small>
              <b>{iv.questions.length ? `${md(iv.questions[iv.questions.length - 1].createdAt)}に保存` : "なし"}</b>
              <p>{iv.questions.length ? `期間内 ${iv.questions.length}件` : "期間内の質問はありません"}</p>
            </div>
            <span>{expanded === "questions" ? "閉じる" : "原文"}</span>
          </button>
          {expanded === "questions" && (
            <div className="cd-summary-evidence">
              {iv.questions.map((q) => (
                <p key={q.sourceId}>
                  「{q.body}」 · {q.kind}
                  {q.materialTitle ? `・${q.materialTitle}` : ""} · {md(q.createdAt)}
                </p>
              ))}
              {iv.questions.length === 0 && <p>質問はありません</p>}
            </div>
          )}
        </article>
      </div>
      <div className="cd-integrated-timeline">
        <button onClick={() => setTimelineOpen(!timelineOpen)}>
          <span>
            <CIcon name="clock" />
            <b>症状・学習・質問の統合タイムライン</b>
          </span>
          {timelineOpen ? "閉じる" : "表示"}
        </button>
        {timelineOpen && (
          <div data-timeline>
            {iv.events.map((event) => (
              <article key={event.id} data-event-id={event.id}>
                <time>{md(event.at)}</time>
                <span className={event.kind === "symptom" || event.kind === "vital" ? "symptom" : event.kind === "note" || event.kind === "feedback" ? "question" : "learning"}>
                  <CIcon
                    name={event.kind === "symptom" || event.kind === "vital" ? "pulse" : event.kind === "note" || event.kind === "feedback" ? "note" : "book"}
                  />
                </span>
                <div>
                  <b>{event.label}</b>
                  <small>{dt(event.at)}</small>
                </div>
              </article>
            ))}
            {iv.events.length === 0 && (
              <article>
                <div>
                  <b>期間内の記録はありません</b>
                </div>
              </article>
            )}
          </div>
        )}
      </div>
      <p className="cd-summary-limit">
        記録がない日は欠測です。この要約は診療判断を補助する参考情報で、正式な診療記録ではありません。
      </p>
    </section>
  )
}

/** 本番用: 端末の現地日付で日付の列を作る（Figma の dateRange は UTC に変換するため、日本時間では 1 日ずれる） */
function dateRangeLocal(start: string, end: string) {
  const result: string[] = []
  const cursor = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (cursor <= last) {
    result.push(localDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

function IntervisitSummary({ records }: { records: HealthRecord[] }) {
  const [expanded, setExpanded] =
    useState<"vitals" | "symptoms" | "learning" | "questions" | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [periodEdit, setPeriodEdit] = useState(false)
  const [startDate, setStartDate] = useState(previousVisitDate)
  const [endDate, setEndDate] = useState(currentVisitDate)
  const periodRecords = records
    .filter(
      (record) =>
        record.measuredAt.slice(0, 10) >= startDate &&
        record.measuredAt.slice(0, 10) <= endDate,
    )
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const latest = periodRecords[periodRecords.length - 1]
  const temperatures = periodRecords
    .map((record) => record.vitals.temperature)
    .filter((value): value is number => value !== undefined)
  const numbnessRecords = periodRecords.filter(
    (record) => record.symptoms.numbness,
  )
  const maxNumbness = Math.max(
    0,
    ...numbnessRecords.map((record) => record.symptoms.numbness.severity),
  )
  const peakNumbness = numbnessRecords.reduce<HealthRecord | undefined>(
    (peak, record) =>
      !peak ||
      record.symptoms.numbness.severity > peak.symptoms.numbness.severity
        ? record
        : peak,
    undefined,
  )
  const latestNumbness = numbnessRecords[numbnessRecords.length - 1]
  const rashRecords = periodRecords.filter((record) => record.symptoms.rash)
  const totalDays = dateRange(startDate, endDate).length

  const toggle = (value: "vitals" | "symptoms" | "learning" | "questions") =>
    setExpanded(expanded === value ? null : value)

  return (
    <section className="cd-intervisit">
      <div className="cd-intervisit-head">
        <div>
          <p className="cd-eyebrow">外来間の経過</p>
          <h2>前回外来からの経過</h2>
          <span>
            {formatShortDate(startDate)} 前回外来（確認済み）〜{" "}
            {formatShortDate(endDate)} 今回外来
          </span>
        </div>
        <button onClick={() => setPeriodEdit(!periodEdit)}>
          <CIcon name="visit" />
          期間を確認・変更
        </button>
      </div>
      {periodEdit && (
        <div className="cd-period-editor">
          <label>
            開始日
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          <p>
            前回外来日が確認できない場合は、医療者が期間を選択します。日付を推測しません。
          </p>
        </div>
      )}
      <div className="cd-medical-summary">
        <div className="cd-summary-narrative">
          <b>観察期間：前回外来から今回まで</b>
          <p>
            <strong>体調の変化：</strong>
            体調記録は{periodRecords.length}日 / {totalDays}
            日。手足のしびれは
            {peakNumbness
              ? `${formatShortDate(peakNumbness.measuredAt)}に「${
                  severityLabels[peakNumbness.symptoms.numbness.severity]
                }」（自己申告値${peakNumbness.symptoms.numbness.severity}/4）`
              : "未記録"}
            、直近は
            {latestNumbness
              ? `${formatShortDate(latestNumbness.measuredAt)}「${
                  severityLabels[latestNumbness.symptoms.numbness.severity]
                }」（${latestNumbness.symptoms.numbness.severity}/4）`
              : "未記録"}
            。皮疹・発疹は
            {rashRecords.length
              ? `${formatShortDate(rashRecords[0].measuredAt)}に新たに「${
                  severityLabels[rashRecords[0].symptoms.rash.severity]
                }」（${rashRecords[0].symptoms.rash.severity}/4）と記録され、その後は未記録`
              : "未記録"}
            です。
          </p>
          <p>
            <strong>学習の状況：</strong>
            「病理結果の見かた」を6/10に完了。「手術後の腕と傷のケア」は学習途中です。「わからない」1件があります。
          </p>
          <p>
            <strong>患者からの質問：</strong>
            「手のしびれは治療が終われば戻りますか？」
          </p>
        </div>
        <p className="cd-summary-safety">
          <CIcon name="shield" />
          保存された架空データのみから構成。原因・治療との因果関係・CTCAE
          Gradeを自動判定しません。
        </p>
      </div>
      <div className="cd-intervisit-cards">
        <article className={expanded === "vitals" ? "active" : ""}>
          <button onClick={() => toggle("vitals")}>
            <span className="blue">
              <CIcon name="pulse" />
            </span>
            <div>
              <small>バイタル</small>
              <b>{periodRecords.length}日記録</b>
              <p>
                最新{" "}
                {latest
                  ? `${formatShortDate(latest.measuredAt)} ${latest.vitals.temperature ?? "—"}℃`
                  : "記録なし"}
              </p>
            </div>
            <span>{expanded === "vitals" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "vitals" && (
            <div className="cd-summary-evidence">
              <p>
                体温範囲{" "}
                {temperatures.length
                  ? `${Math.min(...temperatures).toFixed(1)}〜${Math.max(...temperatures).toFixed(1)}℃`
                  : "未記録"}
              </p>
              <p>
                最新血圧{" "}
                {latest?.vitals.systolic && latest.vitals.diastolic
                  ? `${latest.vitals.systolic}/${latest.vitals.diastolic} mmHg`
                  : "未記録"}
              </p>
              <small>大きな変化の医学的基準は未実装です。</small>
            </div>
          )}
        </article>
        <article className={expanded === "symptoms" ? "active" : ""}>
          <button onClick={() => toggle("symptoms")}>
            <span className="amber">
              <CIcon name="help" />
            </span>
            <div>
              <small>自覚症状</small>
              <b>しびれ 最大 {maxNumbness} / 4</b>
              <p>6/13 強い → 6/19 中くらい</p>
            </div>
            <span>{expanded === "symptoms" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "symptoms" && (
            <div className="cd-summary-evidence">
              {numbnessRecords.slice(-4).map((record) => (
                <p key={record.id}>
                  {formatShortDate(record.measuredAt)}：手足のしびれ{" "}
                  {record.symptoms.numbness.severity} / 4（
                  {severityLabels[record.symptoms.numbness.severity]}）
                </p>
              ))}
              <small>
                未記録日を「症状なし」や改善とは扱いません。新規症状：関節痛（6/2〜）、皮疹・発疹（6/13）。
              </small>
            </div>
          )}
        </article>
        <article className={expanded === "learning" ? "active" : ""}>
          <button onClick={() => toggle("learning")}>
            <span className="green">
              <CIcon name="book" />
            </span>
            <div>
              <small>学習履歴</small>
              <b>完了1 · 途中1</b>
              <p>誤答1 · 「わからない」1</p>
            </div>
            <span>{expanded === "learning" ? "閉じる" : "根拠"}</span>
          </button>
          {expanded === "learning" && (
            <div className="cd-summary-evidence">
              <p>5/24 処方：ホルモン療法を始める前に（未学習）</p>
              <p>6/10 完了：病理結果の見かた</p>
              <p>6/13 回答：「わからない」— 術後の腕の動かし方</p>
            </div>
          )}
        </article>
        <article className={expanded === "questions" ? "active" : ""}>
          <button onClick={() => toggle("questions")}>
            <span className="purple">
              <CIcon name="note" />
            </span>
            <div>
              <small>患者の質問</small>
              <b>6/14に保存</b>
              <p>しびれに関する質問</p>
            </div>
            <span>{expanded === "questions" ? "閉じる" : "原文"}</span>
          </button>
          {expanded === "questions" && (
            <div className="cd-summary-evidence">
              <p>「手のしびれは治療が終われば戻りますか？」</p>
              <small>関連：手足のしびれ · 患者が6/14に保存</small>
            </div>
          )}
        </article>
      </div>
      <div className="cd-integrated-timeline">
        <button onClick={() => setTimelineOpen(!timelineOpen)}>
          <span>
            <CIcon name="clock" />
            <b>症状・学習・質問の統合タイムライン</b>
          </span>
          {timelineOpen ? "閉じる" : "表示"}
        </button>
        {timelineOpen && (
          <div>
            {intervisitEvents.map((event) => (
              <article key={`${event.date}-${event.title}`}>
                <time>{formatShortDate(event.date)}</time>
                <span className={event.type}>
                  <CIcon
                    name={
                      event.type === "symptom"
                        ? "pulse"
                        : event.type === "learning"
                          ? "book"
                          : event.type === "question"
                            ? "note"
                            : "visit"
                    }
                  />
                </span>
                <div>
                  <b>{event.title}</b>
                  <small>{event.detail}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="cd-summary-limit">
        記録がない日は欠測です。この要約は診療判断を補助する参考情報で、正式な診療記録ではありません。
      </p>
    </section>
  )
}

/** 端末の現地日付（YYYY-MM-DD） */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/**
 * 本番の在宅経過表。「今日」はサーバーの外来間の既定期間の終了日（撮影用デモ環境ではデモの基準日、通常は今日）にそろえ、
 * 外来間サマリーと同じ観察期間を表示する。既定期間がまだ読み込まれていなければ読み込む（読み込めなければ端末の今日）。
 */
function LiveHomeCourse({ record }: { record: ClinicianRecord }) {
  const serverToday = record.defaultTo
  const [requested, setRequested] = useState(false)
  useEffect(() => {
    if (serverToday || requested) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequested(true)
    void record.loadIntervisit(null)
  }, [serverToday, requested, record])
  if (!serverToday && (!requested || record.intervisitLoading))
    return (
      <div className="cd-content cd-home-course">
        <p>在宅経過を読み込んでいます…</p>
      </div>
    )
  return (
    <HomeCourse
      key={serverToday ?? "device"}
      live
      today={serverToday ?? undefined}
      sharedPeriod={record.period}
      onSharedPeriod={record.setPeriod}
      records={record.healthRecords}
      activeSymptomIds={record.symptomSettings.active}
      customSymptomNames={record.symptomSettings.customNames}
    />
  )
}

function HomeCourse({
  records,
  activeSymptomIds,
  customSymptomNames,
  live = false,
  today: todayProp,
  sharedPeriod = null,
  onSharedPeriod,
}: {
  /** 本番: 診察サマリーで選んだ期間（null は既定の直近 14 日）。ここで変えた期間もサマリーに戻す */
  sharedPeriod?: { from: string; to: string } | null
  onSharedPeriod?: (p: { from: string; to: string } | null) => void
  /** 本番: 期間の終わりにする日（YYYY-MM-DD）。サーバーの既定期間の終了日 */
  today?: string
  records: HealthRecord[]
  activeSymptomIds: string[]
  customSymptomNames: Record<string, string>
  /**
   * 本番（Step 4）: 患者が共有した実際の記録。期間は今日までの 7/14/28 日か指定期間（前回外来日は DB にないため
   * 「前回外来から」は出さない）。同じ日の複数回の測定はすべて残し、セルには最後の値と件数、詳細に全件を示す。
   */
  live?: boolean
}) {
  const [period, setPeriodRaw] = useState<"7" | "14" | "28" | "visit" | "custom">(live ? (sharedPeriod ? "custom" : "14") : "visit")
  const today = todayProp ?? localDate(new Date())
  const [customStart, setCustomStartRaw] = useState(() => {
    if (sharedPeriod) return sharedPeriod.from
    const d = new Date(`${today}T00:00:00`)
    d.setDate(d.getDate() - 13)
    return localDate(d)
  })
  const [customEnd, setCustomEndRaw] = useState(sharedPeriod?.to ?? today)
  // 本番: 期間の変更をサマリーと共有する（既定の 14 日は null。7・28 日と指定期間は開始日・終了日）
  const share = (p: typeof period, from: string, to: string) => {
    if (!live || !onSharedPeriod) return
    if (p === "14") return onSharedPeriod(null)
    if (p === "custom") return onSharedPeriod(from <= to ? { from, to } : null)
    if (p === "7" || p === "28") {
      const d = new Date(`${today}T00:00:00`)
      d.setDate(d.getDate() - Number(p) + 1)
      onSharedPeriod({ from: localDate(d), to: today })
    }
  }
  const setPeriod = (p: typeof period) => {
    setPeriodRaw(p)
    share(p, customStart, customEnd)
  }
  const setCustomStart = (v: string) => {
    setCustomStartRaw(v)
    share("custom", v, customEnd)
  }
  const setCustomEnd = (v: string) => {
    setCustomEndRaw(v)
    share("custom", customStart, v)
  }
  const [view, setView] = useState<"table" | "vitals" | "symptom">("table")
  const [chartSymptomRaw, setChartSymptom] = useState("numbness")
  // 本番: 選んだ症状に記録がなければ、記録のある最初の症状
  const hasSymptom = (id: string) => records.some((record) => record.symptoms[id])
  const chartSymptom =
    live && !hasSymptom(chartSymptomRaw)
      ? ([...activeSymptomIds, ...records.flatMap((record) => Object.keys(record.symptoms))].find(hasSymptom) ?? chartSymptomRaw)
      : chartSymptomRaw
  const [selected, setSelected] = useState<{
    record?: HealthRecord
    label: string
    value: string
    /** 本番: その日の同じ項目の全測定（時刻・値） */
    entries?: { at: string; value: string; detail?: string }[]
  } | null>(null)
  const end = live ? (period === "custom" ? customEnd : today) : currentVisitDate
  const dayCount = period === "visit" ? 29 : Number(period)
  const startDate =
    period === "visit"
      ? previousVisitDate
      : period === "custom"
        ? customStart
        : (() => {
            const date = new Date(`${end}T00:00:00`)
            date.setDate(date.getDate() - dayCount + 1)
            return live ? localDate(date) : date.toISOString().slice(0, 10)
          })()
  const dates = startDate <= end ? (live ? dateRangeLocal(startDate, end) : dateRange(startDate, end)) : []
  const recordByDate = Object.fromEntries(
    records.map((record) => [record.measuredAt.slice(0, 10), record]),
  )
  // 本番: 日付ごとの全記録（時刻順）
  const recordsByDate: Record<string, HealthRecord[]> = {}
  for (const record of [...records].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)))
    (recordsByDate[record.measuredAt.slice(0, 10)] ??= []).push(record)
  const timeOf = (record: HealthRecord) =>
    new Date(record.measuredAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
  const symptomIds = Array.from(
    new Set([
      ...activeSymptomIds,
      ...records.flatMap((record) => Object.keys(record.symptoms)),
    ]),
  )
  const symptomLabel = (id: string) =>
    customSymptomNames[id] ||
    records.map((record) => record.symptoms[id]?.customName).find(Boolean) ||
    symptomName(id)
  const vitalRows = [
    {
      key: "temperature",
      label: "体温",
      unit: "℃",
      value: (record?: HealthRecord) => record?.vitals.temperature,
    },
    {
      key: "systolic",
      label: "収縮期血圧",
      unit: "mmHg",
      value: (record?: HealthRecord) => record?.vitals.systolic,
    },
    {
      key: "diastolic",
      label: "拡張期血圧",
      unit: "mmHg",
      value: (record?: HealthRecord) => record?.vitals.diastolic,
    },
    {
      key: "pulse",
      label: "脈拍",
      unit: "回/分",
      value: (record?: HealthRecord) => record?.vitals.pulse,
    },
    {
      key: "spo2",
      label: "SpO₂",
      unit: "%",
      value: (record?: HealthRecord) => record?.vitals.spo2,
    },
  ]
  const chartRecords = records
    .filter(
      (record) =>
        record.measuredAt.slice(0, 10) >= startDate &&
        record.measuredAt.slice(0, 10) <= end,
    )
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const chartPoints = chartRecords
    .map((record, index) => ({
      index,
      value: record.symptoms[chartSymptom]?.severity,
    }))
    .filter((item) => item.value !== undefined)
  const chartLine = chartPoints
    .map(
      (item) =>
        `${35 + (item.index / Math.max(chartRecords.length - 1, 1)) * 620},${
          135 - Number(item.value) * 27
        }`,
    )
    .join(" ")
  /*
   * 本番の症状グラフ: 横軸は日付（期間の各日を等間隔）。0（なし）は値として描き、記録のない日は点を置かない。
   * 記録のない日をはさむ 2 点は線で結ばない（欠測を連続した経過のように描かない）。
   */
  const liveChart = (() => {
    if (!live) return null
    const n = Math.max(dates.length, 1)
    const xOf = (measuredAt: string) => {
      const day = dates.indexOf(measuredAt.slice(0, 10))
      const [h, m] = measuredAt.slice(11, 16).split(":").map(Number)
      const frac = Number.isFinite(h) ? ((h || 0) * 60 + (m || 0)) / 1440 : 0.5
      return { day, x: 35 + ((day + frac) / n) * 620 }
    }
    const points = chartRecords
      .filter((record) => record.symptoms[chartSymptom])
      .map((record) => ({ ...xOf(record.measuredAt), value: record.symptoms[chartSymptom].severity, at: record.measuredAt }))
      .filter((p) => p.day >= 0)
    const segments: (typeof points)[] = []
    for (const point of points) {
      const last = segments[segments.length - 1]
      const prev = last?.[last.length - 1]
      if (prev && point.day - prev.day <= 1) last.push(point)
      else segments.push([point])
    }
    return { points, segments }
  })()

  return (
    <div className="cd-content cd-home-course">
      <div className="cd-title-row">
        <div>
          <p className="cd-eyebrow">在宅経過</p>
          <h1>在宅経過表</h1>
          <p>患者が自宅で任意に記録し、一時共有したデータです。</p>
        </div>
        <div className="cd-course-view">
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            経過表
          </button>
          <button
            className={view === "vitals" ? "active" : ""}
            onClick={() => setView("vitals")}
          >
            バイタル統合
          </button>
          <button
            className={view === "symptom" ? "active" : ""}
            onClick={() => setView("symptom")}
          >
            症状グラフ
          </button>
        </div>
      </div>
      <div className="cd-course-controls">
        <div>
          {(live
            ? [
                ["7", "7日"],
                ["14", "14日"],
                ["28", "28日"],
                ["custom", "指定期間"],
              ]
            : [
                ["7", "7日"],
                ["14", "14日"],
                ["28", "28日"],
                ["visit", "前回外来から"],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={period === value ? "active" : ""}
              onClick={() => setPeriod(value as typeof period)}
            >
              {label}
            </button>
          ))}
        </div>
        {live ? (
          <p>
            記録日 {dates.filter((date) => recordsByDate[date]).length}日 / {dates.length}日 ·{" "}
            {dates.reduce((n, date) => n + (recordsByDate[date]?.length ?? 0), 0)}件 · — は記録なし（0は「なし」）
          </p>
        ) : (
        <p>
          記録日{" "}
          {
            records.filter(
              (record) => record.measuredAt.slice(0, 10) >= startDate,
            ).length
          }
          日 / {dates.length}日 · — は未記録
        </p>
        )}
      </div>
      {live && period === "custom" && (
        <div className="cd-period-editor">
          <label>
            開始日
            <input type="date" value={customStart} max={customEnd} onChange={(event) => setCustomStart(event.target.value)} />
          </label>
          <label>
            終了日
            <input type="date" value={customEnd} min={customStart} max={today} onChange={(event) => setCustomEnd(event.target.value)} />
          </label>
          <p>期間は医療者が選択します。前回外来日は推測しません。</p>
        </div>
      )}
      {view === "table" ? (
        <>
          <div className="cd-course-table-wrap">
            <table className="cd-course-table">
              <thead>
                <tr>
                  <th>項目</th>
                  {dates.map((date) => (
                    <th key={date}>
                      <span>{formatShortDate(date)}</span>
                      <small>
                        {new Date(`${date}T00:00:00`).toLocaleDateString(
                          "ja-JP",
                          { weekday: "short" },
                        )}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="section">
                  <th colSpan={dates.length + 1}>バイタルサイン</th>
                </tr>
                {vitalRows.map((row) => (
                  <tr key={row.key}>
                    <th>
                      <b>{row.label}</b>
                      <small>{row.unit}</small>
                    </th>
                    {dates.map((date) => {
                      if (live) {
                        const measured = (recordsByDate[date] ?? []).filter((record) => row.value(record) !== undefined)
                        const last = measured[measured.length - 1]
                        return (
                          <td key={date}>
                            <button
                              disabled={!last}
                              onClick={() =>
                                setSelected({
                                  record: last,
                                  label: row.label,
                                  value: `${row.value(last)} ${row.unit}`,
                                  entries: measured.map((record) => ({ at: timeOf(record), value: `${row.value(record)} ${row.unit}` })),
                                })
                              }
                            >
                              {last ? row.value(last) : "—"}
                              {measured.length > 1 && <sup>×{measured.length}</sup>}
                            </button>
                          </td>
                        )
                      }
                      const record = recordByDate[date]
                      const value = row.value(record)
                      return (
                        <td key={date}>
                          <button
                            disabled={value === undefined}
                            onClick={() =>
                              setSelected({
                                record,
                                label: row.label,
                                value: `${value} ${row.unit}`,
                              })
                            }
                          >
                            {value ?? "—"}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="section">
                  <th colSpan={dates.length + 1}>自覚症状（自己申告 0〜4）</th>
                </tr>
                {symptomIds.map((id) => (
                  <tr key={id}>
                    <th>
                      <b>{symptomLabel(id)}</b>
                      <small>患者自己申告</small>
                    </th>
                    {dates.map((date) => {
                      if (live) {
                        const answered = (recordsByDate[date] ?? []).filter((record) => record.symptoms[id])
                        const last = answered[answered.length - 1]
                        const e = last?.symptoms[id]
                        return (
                          <td key={date}>
                            <button
                              className={e ? `severity s${e.severity}` : ""}
                              disabled={!e}
                              onClick={() =>
                                setSelected({
                                  record: last,
                                  label: symptomLabel(id),
                                  value: `${e?.severity} / 4（${e ? severityLabels[e.severity] : "未記録"}）`,
                                  entries: answered.map((record) => {
                                    const x = record.symptoms[id]
                                    return {
                                      at: timeOf(record),
                                      value: `${x.severity} / 4（${severityLabels[x.severity]}）`,
                                      detail: [
                                        x.count != null ? `回数 ${x.count}` : "",
                                        x.location ? `部位 ${x.location}` : "",
                                        x.interference ? `支障 ${x.interference}` : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" · "),
                                    }
                                  }),
                                })
                              }
                            >
                              {e ? e.severity : "—"}
                              {answered.length > 1 && <sup>×{answered.length}</sup>}
                            </button>
                          </td>
                        )
                      }
                      const record = recordByDate[date]
                      const entry = record?.symptoms[id]
                      return (
                        <td key={date}>
                          <button
                            className={
                              entry ? `severity s${entry.severity}` : ""
                            }
                            disabled={!entry}
                            onClick={() =>
                              setSelected({
                                record,
                                label: symptomLabel(id),
                                value: `${entry?.severity} / 4（${
                                  entry
                                    ? severityLabels[entry.severity]
                                    : "未記録"
                                }）`,
                              })
                            }
                          >
                            {entry ? entry.severity : "—"}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cd-course-legend">
            {severityLabels.map((label, index) => (
              <span key={label} className={`s${index}`}>
                <i>{index}</i>
                {label}
              </span>
            ))}
            <span>
              <i>—</i>{live ? "記録なし" : "未記録"}
            </span>
          </div>
        </>
      ) : view === "vitals" ? (
        <VitalCombinedGraph
          records={chartRecords}
          startDate={startDate}
          endDate={end}
          breakGaps={live}
        />
      ) : (
        <section className="cd-course-chart cd-panel">
          <div className="cd-panel-head">
            <div>
              <p className="cd-eyebrow">症状ごとの推移</p>
              <h2>個別症状の推移</h2>
            </div>
            <select
              value={chartSymptom}
              onChange={(event) => setChartSymptom(event.target.value)}
            >
              {symptomIds.map((id) => (
                <option key={id} value={id}>
                  {symptomLabel(id)}
                </option>
              ))}
            </select>
          </div>
          <svg
            viewBox="0 0 700 170"
            role="img"
            aria-label={`${symptomLabel(chartSymptom)}の自己申告値推移`}
          >
            {[0, 1, 2, 3, 4].map((value) => (
              <g key={value}>
                <line
                  x1="35"
                  y1={135 - value * 27}
                  x2="655"
                  y2={135 - value * 27}
                />
                <text x="13" y={139 - value * 27}>
                  {value}
                </text>
              </g>
            ))}
            {liveChart ? (
              <>
                {liveChart.segments
                  .filter((segment) => segment.length > 1)
                  .map((segment) => (
                    <polyline key={segment[0].at} points={segment.map((p) => `${p.x},${135 - p.value * 27}`).join(" ")} />
                  ))}
                {liveChart.points.map((p) => (
                  <circle key={p.at} cx={p.x} cy={135 - p.value * 27} r="5">
                    <title>{`${formatShortDate(p.at)} ${p.value} / 4（${severityLabels[p.value]}）`}</title>
                  </circle>
                ))}
                {dates.length > 0 && (
                  <>
                    <text x="35" y="162">{formatShortDate(dates[0])}</text>
                    <text x="655" y="162" textAnchor="end">{formatShortDate(dates[dates.length - 1])}</text>
                  </>
                )}
              </>
            ) : (
            <>
            <polyline points={chartLine} />
            {chartPoints.map((item) => (
              <circle
                key={`${item.index}-${item.value}`}
                cx={
                  35 + (item.index / Math.max(chartRecords.length - 1, 1)) * 620
                }
                cy={135 - Number(item.value) * 27}
                r="5"
              />
            ))}
            </>
            )}
          </svg>
          <p>
            {live
              ? "0は「なし」（患者が記録した値）です。記録のない日は点を置かず、記録のない日をはさむ点は線で結びません。"
              : "記録がある日のみ線で結んでいます。間の日を「症状なし」とは扱いません。"}
          </p>
        </section>
      )}
      <p className="cd-course-safety">
        <CIcon name="shield" />
        0〜4は患者の自己申告で、CTCAE
        Gradeではありません。この画面は24時間監視や自動診断を行いません。
      </p>
      {selected && (
        <div className="cd-course-detail">
          <div>
            <p className="cd-eyebrow">元の記録</p>
            <h2>{formatShortDate(selected.record?.measuredAt || "")}の記録</h2>
          </div>
          <button onClick={() => setSelected(null)}>閉じる</button>
          <dl>
            <dt>項目</dt>
            <dd>{selected.label}</dd>
            <dt>記録値</dt>
            <dd>{selected.value}</dd>
            <dt>測定日時</dt>
            <dd>
              {selected.record
                ? new Date(selected.record.measuredAt).toLocaleString("ja-JP")
                : "—"}
            </dd>
            {selected.entries && selected.entries.length > 0 && (
              <>
                <dt>この日の記録</dt>
                <dd data-day-entries>
                  {selected.entries.map((entry, index) => (
                    <span key={index} style={{ display: "block" }}>
                      {entry.at} {entry.value}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
          <p>
            患者本人が自宅で入力した値です。自動補正・自動判定はしていません。
          </p>
        </div>
      )}
    </div>
  )
}

type VitalMetricKey = "temperature" | "systolic" | "diastolic" | "pulse" | "spo2"

const vitalMetrics: {
  key: VitalMetricKey
  label: string
  unit: string
  min: number
  max: number
  color: string
  dash?: string
}[] = [
  {
    key: "temperature",
    label: "体温",
    unit: "℃",
    min: 35,
    max: 40,
    color: "#ba6e63",
  },
  {
    key: "systolic",
    label: "収縮期血圧",
    unit: "mmHg",
    min: 70,
    max: 200,
    color: "#3f7180",
  },
  {
    key: "diastolic",
    label: "拡張期血圧",
    unit: "mmHg",
    min: 40,
    max: 130,
    color: "#769ba4",
    dash: "7 4",
  },
  {
    key: "pulse",
    label: "脈拍",
    unit: "回/分",
    min: 40,
    max: 160,
    color: "#9a7135",
    dash: "3 3",
  },
  {
    key: "spo2",
    label: "SpO₂",
    unit: "%",
    min: 80,
    max: 100,
    color: "#6f6489",
    dash: "10 4",
  },
]

function vitalValue(record: HealthRecord, key: VitalMetricKey) {
  return record.vitals[key]
}

function VitalCombinedGraph({
  records,
  startDate,
  endDate,
  breakGaps = false,
}: {
  records: HealthRecord[]
  startDate: string
  endDate: string
  /** 本番: その指標を測らなかった日をはさむ 2 点は線で結ばない（欠測期間を連続測定のように描かない） */
  breakGaps?: boolean
}) {
  const [visible, setVisible] = useState<Record<VitalMetricKey, boolean>>({
    temperature: true,
    systolic: true,
    diastolic: true,
    pulse: true,
    spo2: true,
  })
  const [focus, setFocus] = useState<"all" | VitalMetricKey>("all")
  const [hovered, setHovered] = useState<HealthRecord | null>(null)
  const plot = { left: 46, right: 874, top: 42, bottom: 260 }
  const startTime = new Date(`${startDate}T00:00:00`).getTime()
  const endTime = new Date(`${endDate}T23:59:59`).getTime()
  const xFor = (date: string) =>
    plot.left +
    ((new Date(date).getTime() - startTime) /
      Math.max(endTime - startTime, 1)) *
      (plot.right - plot.left)
  const yFor = (value: number, min: number, max: number) => {
    const clamped = Math.min(max, Math.max(min, value))
    return (
      plot.bottom - ((clamped - min) / (max - min)) * (plot.bottom - plot.top)
    )
  }
  const activeMetrics = vitalMetrics.filter(
    (metric) =>
      visible[metric.key] && (focus === "all" || focus === metric.key),
  )
  const latestFor = (key: VitalMetricKey) =>
    [...records]
      .reverse()
      .find((record) => vitalValue(record, key) !== undefined)

  const toggleMetric = (key: VitalMetricKey) =>
    setVisible({ ...visible, [key]: !visible[key] })

  return (
    <section className="cd-vital-combined cd-panel">
      <div className="cd-vital-chart-head">
        <div>
          <p className="cd-eyebrow">バイタル</p>
          <h2>バイタル統合グラフ</h2>
          <span>
            {formatShortDate(startDate)}〜{formatShortDate(endDate)} ·
            固定表示スケール
          </span>
        </div>
        <label>
          表示
          <select
            value={focus}
            onChange={(event) => {
              const value = event.target.value as "all" | VitalMetricKey
              setFocus(value)
              if (value !== "all") setVisible({ ...visible, [value]: true })
            }}
          >
            <option value="all">5指標を重ねる</option>
            {vitalMetrics.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}だけ
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cd-vital-latest">
        {vitalMetrics.map((metric) => {
          const latest = latestFor(metric.key)
          const value = latest ? vitalValue(latest, metric.key) : undefined
          return (
            <div key={metric.key}>
              <i style={{ background: metric.color }} />
              <span>
                <small>{metric.label}</small>
                <b>
                  {value ?? "未測定"}{" "}
                  {value !== undefined && <em>{metric.unit}</em>}
                </b>
                <time>
                  {latest
                    ? new Date(latest.measuredAt).toLocaleString("ja-JP", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </time>
              </span>
            </div>
          )
        })}
      </div>
      <div className="cd-vital-legend">
        {vitalMetrics.map((metric) => (
          <button
            key={metric.key}
            className={visible[metric.key] ? "active" : ""}
            onClick={() => toggleMetric(metric.key)}
            aria-pressed={visible[metric.key]}
          >
            <i
              style={{
                borderColor: metric.color,
                borderTopStyle: metric.dash ? "dashed" : "solid",
              }}
            />
            <span>
              <b>{metric.label}</b>
              <small>
                {metric.min}〜{metric.max} {metric.unit}
              </small>
            </span>
            <em>{visible[metric.key] ? "表示" : "非表示"}</em>
          </button>
        ))}
      </div>
      <div className="cd-vital-plot">
        {hovered && (
          <div
            className="cd-vital-tooltip"
            style={{
              left: `${Math.min(
                76,
                Math.max(
                  4,
                  ((xFor(hovered.measuredAt) - plot.left) /
                    (plot.right - plot.left)) *
                    100,
                ),
              )}%`,
            }}
          >
            <b>{new Date(hovered.measuredAt).toLocaleString("ja-JP")}</b>
            {vitalMetrics.map((metric) => {
              const value = vitalValue(hovered, metric.key)
              return (
                <span key={metric.key}>
                  <i style={{ background: metric.color }} />
                  {metric.label}
                  <strong>
                    {value !== undefined ? `${value} ${metric.unit}` : "未測定"}
                  </strong>
                </span>
              )
            })}
          </div>
        )}
        <svg
          viewBox="0 0 920 300"
          role="img"
          aria-label="体温、収縮期血圧、拡張期血圧、脈拍、SpO₂の統合グラフ"
          onMouseLeave={() => setHovered(null)}
        >
          {[0, 1, 2, 3, 4].map((line) => {
            const y = plot.top + (line / 4) * (plot.bottom - plot.top)
            return (
              <line
                key={line}
                className="grid"
                x1={plot.left}
                y1={y}
                x2={plot.right}
                y2={y}
              />
            )
          })}
          {(breakGaps ? dateRangeLocal(startDate, endDate) : dateRange(startDate, endDate))
            .filter(
              (_, index, all) =>
                index % Math.max(Math.floor(all.length / 6), 1) === 0,
            )
            .map((date) => {
              const x = xFor(`${date}T12:00`)
              return (
                <g key={date}>
                  <line
                    className="date-grid"
                    x1={x}
                    y1={plot.top}
                    x2={x}
                    y2={plot.bottom}
                  />
                  <text x={x} y="282" textAnchor="middle">
                    {formatShortDate(date)}
                  </text>
                </g>
              )
            })}
          <text x={plot.right} y="296" textAnchor="end">
            X軸：日付・時刻
          </text>
          {activeMetrics.map((metric) => {
            const values = records
              .map((record, index) => ({
                record,
                index,
                value: vitalValue(record, metric.key),
              }))
              .filter(
                (item): item is {
                  record: HealthRecord
                  index: number
                  value: number
                } => item.value !== undefined,
              )
            const pathParts: string[] = []
            let previous: {
              record: HealthRecord
              index: number
              value: number
            } | undefined
            const dayIndex = (iso: string) => Math.floor(new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() / 86400000)
            values.forEach((item) => {
              const connects =
                Boolean(previous) &&
                (!breakGaps || dayIndex(item.record.measuredAt) - dayIndex(previous!.record.measuredAt) <= 1)
              pathParts.push(
                `${connects ? "L" : "M"} ${xFor(item.record.measuredAt)} ${yFor(
                  item.value,
                  metric.min,
                  metric.max,
                )}`,
              )
              previous = item
            })
            return (
              <g key={metric.key} className={`metric ${metric.key}`}>
                <path
                  d={pathParts.join(" ")}
                  fill="none"
                  stroke={metric.color}
                  strokeDasharray={metric.dash}
                />
                {values.map((item) => {
                  const out = item.value < metric.min || item.value > metric.max
                  return (
                    <g key={item.record.id}>
                      <circle
                        className={out ? "out-of-range" : ""}
                        cx={xFor(item.record.measuredAt)}
                        cy={yFor(item.value, metric.min, metric.max)}
                        r={out ? 6 : 4}
                        fill="#fff"
                        stroke={metric.color}
                      />
                      {out && (
                        <text
                          className="out-label"
                          x={xFor(item.record.measuredAt)}
                          y={
                            yFor(item.value, metric.min, metric.max) +
                            (item.value > metric.max ? 14 : -9)
                          }
                          textAnchor="middle"
                        >
                          範囲外
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
          {records.map((record, index) => {
            const x = xFor(record.measuredAt)
            const nextX = records[index + 1]
              ? xFor(records[index + 1].measuredAt)
              : plot.right
            const previousX = records[index - 1]
              ? xFor(records[index - 1].measuredAt)
              : plot.left
            const width = Math.max(12, Math.min(70, (nextX - previousX) / 2))
            return (
              <rect
                key={record.id}
                className="hover-zone"
                x={x - width / 2}
                y={plot.top}
                width={width}
                height={plot.bottom - plot.top}
                onMouseEnter={() => setHovered(record)}
              />
            )
          })}
        </svg>
      </div>
      <p className="cd-vital-explanation">
        <CIcon name="help" />
        異なる単位の指標を、変化を比較するため個別スケールで重ねています。各線は記録された測定点同士を結ぶ視覚ガイドで、線上の中間位置は実測値ではありません。
      </p>
      <p className="cd-vital-safety">
        線の高さは指標間の医学的な大小関係を示しません。未測定の項目と実測値・単位はカーソル表示で確認できます。表示範囲は固定で、正常・異常の医学的判定は行いません。
      </p>
    </section>
  )
}

function Summary({
  scenario,
  healthRecords,
  record,
  onConcern,
  onPrescribe,
  onOpenCourse,
}: {
  scenario: ClinicalScenario
  healthRecords: HealthRecord[]
  record?: ClinicianRecord
  onConcern: (id: number | string) => void
  onPrescribe: () => void
  onOpenCourse?: () => void
}) {
  const [areaDetail, setAreaDetail] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<number | string | null>(null)
  const [expandedCheck, setExpandedCheck] = useState<number | string | null>(null)
  // 本番: サマリーを開くたびに最新の学習記録を読み直す
  useEffect(() => {
    void record?.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const figmaQuestions: ConcernItem[] =
    scenario === "clear"
      ? []
      : scenario === "many"
        ? [concerns[0], ...extraQuestions]
        : [concerns[0], extraQuestions[0]]
  const questions: ConcernItem[] = record ? record.questions : figmaQuestions
  const checks: ConcernItem[] = record
    ? record.checks
    : scenario === "clear" || scenario === "noQuiz"
      ? []
      : concerns.filter((item) => item.id === 2 || item.id === 3)
  // 理解確認への回答がない（Figma の検証シナリオ D と同じ表示）。0% とは表示しない
  const noQuiz = record ? (record.summary?.answers.length ?? 0) === 0 : scenario === "noQuiz"
  const figmaAreas =
    scenario === "clear"
      ? areas.map((area) => [
          area[0],
          area[0] === "放射線療法" ? "0 / 0" : "2 / 2",
          area[0] === "放射線療法" ? "未回答" : "3 / 3",
          "なし",
          area[0] === "放射線療法" ? 0 : 100,
        ])
      : scenario === "noQuiz"
        ? areas.map((area) => [area[0], area[1], "未回答", "なし", area[4]])
        : areas
  const displayedAreas = (record ? record.areas : figmaAreas) as unknown as AreaRow[]
  if (record && !record.loaded)
    return (
      <div className="cd-content cd-summary">
        <p>診察サマリーを読み込んでいます…</p>
      </div>
    )
  return (
    <div className="cd-content cd-summary">
      <div className="cd-title-row">
        <div>
          <p className="cd-eyebrow">診察</p>
          <h1>診察サマリー</h1>
          <p>
            共有された学習記録と患者の質問を、診察の確認順に整理しています。
          </p>
        </div>
        <p className="cd-zero-doc">
          <CIcon name="shield" />
          閲覧だけで終了できます。診療記録は電子カルテへ。
        </p>
      </div>
      {record?.summary ? (
        <LiveIntervisit record={record} onOpenCourse={onOpenCourse} />
      ) : (
        <IntervisitSummary records={healthRecords} />
      )}
      <div className="cd-clinical-grid">
        <div className="cd-clinical-main">
          <section className="cd-panel cd-question-priority">
            <div className="cd-panel-head">
              <div>
                <p className="cd-eyebrow">患者の質問</p>
                <h2>患者が診察で聞きたいこと</h2>
              </div>
              <Badge tone={questions.length ? "purple" : "green"}>
                {questions.length ? `${questions.length}件` : "質問なし"}
              </Badge>
            </div>
            {questions.length ? (
              <div className="cd-question-list">
                {questions.map((item, index) => (
                  <article
                    key={item.id}
                    className={
                      "symptomMention" in item && item.symptomMention
                        ? "symptom"
                        : ""
                    }
                  >
                    <button
                      className="cd-question-toggle"
                      onClick={() =>
                        setExpandedQuestion(
                          expandedQuestion === item.id ? null : item.id,
                        )
                      }
                    >
                      <span className="cd-question-number">{index + 1}</span>
                      <span>
                        <b>{item.title}</b>
                        <small>{item.area} · 患者原文</small>
                      </span>
                      <span>
                        {expandedQuestion === item.id ? "閉じる" : "全文"}
                      </span>
                    </button>
                    {"symptomMention" in item && item.symptomMention === true && (
                      <p className="cd-symptom-note">
                        <CIcon name="alert" />
                        症状に関する記載があります。緊急度を自動判定するものではありません。
                      </p>
                    )}
                    {expandedQuestion === item.id && (
                      <div className="cd-question-expanded">
                        <p>{item.detail}</p>
                        <div>
                          <span>
                            関連教材：
                            {record ? (item.materialTitle ?? "なし（自由な質問）") : "手術後の腕と傷のケア"}
                          </span>
                          <button onClick={() => onConcern(item.id)}>
                            詳しく確認
                            <CIcon name="arrow" />
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="cd-nothing-to-review">
                <CIcon name="check" />
                <span>
                  <b>患者からの質問はありません</b>
                  <small>対応操作は必要ありません</small>
                </span>
              </div>
            )}
          </section>
          <section className="cd-panel cd-understanding">
            <div className="cd-panel-head">
              <div>
                <p className="cd-eyebrow">理解確認</p>
                <h2>理解を確認したいこと</h2>
              </div>
              <Badge tone={checks.length ? "amber" : "green"}>
                {noQuiz
                  ? "未回答"
                  : checks.length
                    ? `${checks.length}件`
                    : "要確認なし"}
              </Badge>
            </div>
            {noQuiz ? (
              <div className="cd-unanswered">
                <CIcon name="help" />
                <div>
                  <b>確認問題は未回答です</b>
                  <p>
                    {record
                      ? "理解確認への回答はまだありません。理解度0%とは表示しません。"
                      : "教材は学習済みですが、理解確認への回答はありません。理解度0%とは表示しません。"}
                  </p>
                </div>
              </div>
            ) : checks.length ? (
              <div className="cd-check-list">
                {checks.map((item) => (
                  <article key={item.id}>
                    <button
                      onClick={() =>
                        setExpandedCheck(
                          expandedCheck === item.id ? null : item.id,
                        )
                      }
                    >
                      <Badge tone={item.tone}>{item.type}</Badge>
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.area} · 回答「{item.answer}」
                        </small>
                      </span>
                      <span>
                        {expandedCheck === item.id ? "閉じる" : "詳細"}
                      </span>
                    </button>
                    {expandedCheck === item.id && (
                      <div className="cd-check-expanded">
                        <p>
                          <b>設問：</b>
                          {item.detail}
                        </p>
                        <p>
                          <b>正答・解説：</b>
                          {item.correct
                            ? `「${item.correct}」 ${item.explanation ?? ""}`
                            : "無理のない範囲でゆっくり動かします。適切な範囲は術式や傷の状態で異なります。"}
                        </p>
                        {item.source && record && (
                          <p>
                            <b>回答：</b>
                            {item.source}
                          </p>
                        )}
                        <div>
                          <span>関連教材：{item.materialTitle ?? "手術後の腕と傷のケア"}</span>
                          <button onClick={() => onConcern(item.id)}>
                            詳しく確認
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="cd-nothing-to-review">
                <CIcon name="check" />
                <span>
                  <b>誤答・「わからない」はありません</b>
                  <small>追加の確認操作は必要ありません</small>
                </span>
              </div>
            )}
          </section>
        </div>
        <aside className="cd-clinical-side">
          <section className="cd-panel">
            <div className="cd-panel-head">
              <div>
                <p className="cd-eyebrow">領域別</p>
                <h2>領域別の学習・理解確認</h2>
              </div>
            </div>
            <div className="cd-area-compact">
              {displayedAreas.map((area) => (
                <button
                  key={String(area[0])}
                  onClick={() =>
                    setAreaDetail(
                      areaDetail === area[0] ? null : String(area[0]),
                    )
                  }
                >
                  <span>
                    <b>{area[0]}</b>
                    <small>学習 {area[1]}</small>
                  </span>
                  <span>
                    <small>確認問題</small>
                    <b>{area[2]}</b>
                  </span>
                  <Badge tone={area[3] === "なし" ? "gray" : "amber"}>
                    {area[3]}
                  </Badge>
                  {areaDetail === area[0] && (
                    <div>
                      <p>
                        途中・未学習：
                        {(area[5] ? area[5].incomplete : Number(area[4]) < 100) ? "あり" : "なし"}
                      </p>
                      <p>
                        「わからない」：
                        {area[5]
                          ? area[5].unknown
                            ? `${area[5].unknown}件`
                            : "なし"
                          : String(area[3]).includes("不明")
                            ? "1件"
                            : "なし"}
                      </p>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="cd-clinical-note">
              <CIcon name="shield" />
              学習進捗と確認問題は別の指標です。医学的理解を断定しません。
            </p>
          </section>
          {(record ? questions.length + checks.length > 0 : scenario !== "clear") && (
            <section className="cd-panel cd-suggested-prescription">
              <div>
                <span className="blue">
                  <CIcon name="book" />
                </span>
                <div>
                  <p className="cd-eyebrow">任意</p>
                  <h2>関連教材の候補</h2>
                </div>
              </div>
              <p>
                質問・回答に関連する承認済み教材です。必要性は医療者が判断します。
              </p>
              <button className="cd-primary" onClick={onPrescribe}>
                候補を確認する
                <CIcon name="arrow" />
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function ConcernDetail({
  concern: concernOrNull,
  record,
  onBack,
  onAdd,
  onSave,
  onNext,
}: {
  concern: ConcernItem | null
  record?: ClinicianRecord
  onBack: () => void
  onAdd: () => void
  onSave: (message: string) => void
  onNext: () => void
}) {
  const [statusLocal, setStatus] = useState<"unread" | "reviewed" | "addressed">(
    "unread",
  )
  const [memoOpen, setMemoOpen] = useState(false)
  const [memo, setMemo] = useState("")
  if (!concernOrNull)
    return (
      <div className="cd-content">
        <button className="cd-back" onClick={onBack}>
          ← 戻る
        </button>
        <p>この項目は表示できません。</p>
      </div>
    )
  const concern = concernOrNull
  // 本番: 質問の確認状態は DB に記録（任意・診療記録ではない）。理解確認の項目は状態を持たない
  const status: "unread" | "reviewed" | "addressed" = record
    ? concern.status === "resolved"
      ? "addressed"
      : concern.status === "reviewed"
        ? "reviewed"
        : "unread"
    : statusLocal
  const changeStatus = (next: "reviewed" | "addressed") => {
    if (!record) return setStatus(next)
    if (concern.feedbackId)
      void record.setQuestionStatus(concern.feedbackId, next === "addressed" ? "resolved" : "reviewed")
  }
  return (
    <div className="cd-content">
      <div className="cd-page-head">
        <button className="cd-back" onClick={onBack}>
          ← 戻る
        </button>
        <div>
          <p className="cd-eyebrow">診察で確認</p>
          <h1>詳しく確認する</h1>
        </div>
        <Badge
          tone={
            status === "addressed"
              ? "green"
              : status === "reviewed"
                ? "blue"
                : "gray"
          }
        >
          {status === "addressed"
            ? "対応済み（任意）"
            : status === "reviewed"
              ? "確認済み"
              : "未確認"}
        </Badge>
      </div>
      <div className="cd-detail-layout">
        <section className="cd-panel cd-evidence">
          <Badge tone={concern.tone}>{concern.type}</Badge>
          <h2>{concern.title}</h2>
          <p className="cd-source">{concern.source}</p>
          <div className="cd-original">
            <span>
              {concern.type === "患者の質問" ? "患者の原文" : "設問全文"}
            </span>
            <p>{concern.detail}</p>
            {concern.type === "患者の質問" && (
              <small>患者が入力した原文は変更されません</small>
            )}
          </div>
          {concern.type === "患者の質問" ? (
            (!record || concern.related) && (
            <div className="cd-related-check">
              <span>関連する理解確認</span>
              <b>
                {concern.related
                  ? `${concern.related.stem} · 回答「${concern.related.answer}」`
                  : "手術後の腕の動かし方 · 回答「わからない」"}
              </b>
              <small>患者の質問と関連する可能性がある項目として表示</small>
            </div>
            )
          ) : (
            <div className="cd-answer-compare">
              <div>
                <span>患者の実際の回答</span>
                <b>{concern.answer}</b>
              </div>
              <div>
                <span>正答・確認ポイント</span>
                <b>{concern.correct ?? "無理のない範囲でゆっくり動かす"}</b>
              </div>
            </div>
          )}
          {(!record || concern.explanation) && (
          <div className="cd-explanation">
            <h3>解説</h3>
            <p>
              {concern.explanation ??
                "手術方法や傷の状態によって適切な範囲は異なります。強い痛みを我慢せず、担当医療者から伝えられた範囲を優先します。"}
            </p>
          </div>
          )}
          {(!record || concern.materialTitle) && (
          <div className="cd-related-material">
            <span>
              <CIcon name="book" />
            </span>
            <div>
              <small>関連教材</small>
              <b>{concern.materialTitle ?? "手術後の腕と傷のケア"}</b>
              <p>{record ? concern.materialStatus || "学習記録なし" : "最終学習 6月13日 · 途中 66%"}</p>
            </div>
            <button onClick={onAdd}>
              <CIcon name="plus" />
              再処方候補へ
            </button>
          </div>
          )}
        </section>
        <aside className="cd-panel cd-light-actions">
          <div className="cd-panel-head">
            <div>
              <p className="cd-eyebrow">任意の操作</p>
              <h2>必要な場合だけ操作</h2>
            </div>
          </div>
          <p className="cd-no-action-required">
            内容を読むだけで完了できます。shioriへの記録やチェックは必須ではありません。
          </p>
          {(!record || (concern.kind === "question" && concern.feedbackId)) && (
          <div className="cd-status-actions">
            <button
              className={status === "reviewed" ? "active" : ""}
              onClick={() => changeStatus("reviewed")}
            >
              <CIcon name="eye" />
              確認済みにする
            </button>
            <button
              className={status === "addressed" ? "active" : ""}
              onClick={() => changeStatus("addressed")}
            >
              <CIcon name="check" />
              対応済みにする
              <small>診療記録ではありません</small>
            </button>
          </div>
          )}
          <button
            className="cd-copy-question"
            onClick={() => {
              void navigator.clipboard?.writeText(record ? concern.detail : concern.title)
              onSave(record ? "コピーしました" : "患者の質問をコピーしました（架空情報）")
            }}
          >
            <CIcon name="note" />
            {record && concern.kind === "check" ? "設問をコピー" : "患者の質問をコピー"}
            <small>{record ? "院内ルールを確認" : "架空情報 · 院内ルールを確認"}</small>
          </button>
          {/* 任意メモは保存先がないため、本番では出さない（保存したように見せない） */}
          {!record && (
          <button
            className="cd-optional-memo-toggle"
            onClick={() => setMemoOpen(!memoOpen)}
          >
            <CIcon name="edit" />
            {memoOpen ? "任意メモを閉じる" : "任意メモを追加"}
          </button>
          )}
          {!record && memoOpen && (
            <div className="cd-optional-memo">
              <label>
                補助メモ（任意・正式な診療記録ではありません）
                <textarea
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="必要な場合のみ入力"
                />
              </label>
              <button
                className="cd-secondary"
                disabled={!memo.trim()}
                onClick={() => onSave("任意メモを保存しました")}
              >
                任意メモを保存
              </button>
            </div>
          )}
          <p className="cd-ai-boundary">
            <CIcon name="shield" />
            正式な診療記録は電子カルテへ。shioriは自動記録・無断転記を行いません。
          </p>
          <button className="cd-secondary" onClick={onNext}>
            関連教材の候補を見る
            <CIcon name="arrow" />
          </button>
          <button className="cd-text-back" onClick={onBack}>
            何も記録せずサマリーへ戻る
          </button>
        </aside>
      </div>
    </div>
  )
}

function PrescriptionLibrary({
  selected,
  setSelected,
  onReview,
  onBack,
  standalone = false,
  record,
}: {
  selected: (number | string)[]
  setSelected: (ids: (number | string)[]) => void
  onReview: () => void
  onBack?: () => void
  standalone?: boolean
  /** 本番: 公開・承認済みの教材（共通＋自施設）と、この診察での処方状況 */
  record?: ClinicianRecord
}) {
  const [query, setQuery] = useState("")
  const [area, setArea] = useState("すべて")
  const items: LibraryCard[] = record ? (record.library ?? []) : libraryItems
  // 「未登録」の項目は表示しない（検索の対象にもしない）
  const known = (value: string) => (value && value !== "未登録" ? value : "")
  const results = items.filter(
    (item) =>
      (area === "すべて" || item.area === area) &&
      `${item.title}${known(item.goal)}${known(item.target)}`.includes(query),
  )
  // 本番: 処方テンプレート（セット）を既存 API から読む（読み取りのみ）
  const sessionId = record?.sessionId
  const loadTemplates = record?.loadTemplates
  useEffect(() => {
    if (sessionId && loadTemplates) void loadTemplates()
  }, [sessionId, loadTemplates])
  // セットに含まれる教材のうち、ライブラリに表示中（公開中）で、この診察で未処方のもの
  const templateSets = (record?.templates ?? [])
    .map((t) => {
      const cards = t.materials
        .map((m) => items.find((item) => item.id === m.id))
        .filter((x): x is LibraryCard => !!x)
      const addable = cards.filter((c) => !c.prescribedNow).map((c) => c.id)
      return { t, cards, addable, pending: addable.filter((id) => !selected.includes(id)) }
    })
    .filter((x) => x.cards.length > 0)
  const toggle = (id: number | string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    )
  return (
    <div className="cd-content cd-library">
      <div className="cd-page-head">
        {!standalone && (
          <button className="cd-back" onClick={onBack}>
            ← 戻る
          </button>
        )}
        <div>
          <p className="cd-eyebrow">承認済みの教材のみ</p>
          <h1>{standalone ? "教材ライブラリ" : "情報処方を作成"}</h1>
          <p>公開・医学的承認済みの教材だけが表示されています。</p>
        </div>
        <button
          className="cd-primary"
          disabled={selected.length === 0}
          onClick={onReview}
        >
          選択中 {selected.length}件
          <CIcon name="arrow" />
        </button>
      </div>
      {record && templateSets.length > 0 && (
        <section className="cd-template-sets" data-template-sets>
          <div className="cd-template-head">
            <h2>セットから選ぶ</h2>
            <p>セットの教材をまとめて選択に追加します。内容は確定前に確認できます。</p>
          </div>
          <div className="cd-template-list">
            {templateSets.map(({ t, cards, addable, pending }) => (
              <article key={t.id} data-template={t.id} data-template-name={t.name}>
                <div>
                  <Badge tone={t.scope === "org" ? "purple" : "blue"}>{t.scope === "org" ? "施設のセット" : "共通のセット"}</Badge>
                  <h3>
                    {t.name}（{cards.length}件）
                  </h3>
                  {t.description && <p>{t.description}</p>}
                  <ul>
                    {cards.map((c) => (
                      <li key={c.id} className={selected.includes(c.id) || c.prescribedNow ? "added" : ""}>
                        {(selected.includes(c.id) || c.prescribedNow) && <CIcon name="check" size={12} />}
                        {c.title}
                        {c.prescribedNow ? "（この診察で処方済み）" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  className={pending.length === 0 ? "selected" : ""}
                  disabled={pending.length === 0}
                  onClick={() => setSelected([...selected, ...pending])}
                >
                  <CIcon name={pending.length === 0 ? "check" : "plus"} />
                  {pending.length === 0
                    ? addable.length === 0
                      ? "この診察で処方済み"
                      : "選択に追加済み"
                    : `セットを選択に追加（${pending.length}件）`}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="cd-library-tools">
        <label>
          <CIcon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={record ? "教材名・学習目標で検索" : "教材名・対象者・学習目標で検索"}
          />
        </label>
        <select value={area} onChange={(event) => setArea(event.target.value)}>
          <option>すべて</option>
          <option>検査・診断</option>
          <option>手術</option>
          <option>薬物療法</option>
          <option>放射線療法</option>
          <option>副作用・支持療法</option>
          <option>日常生活・相談支援</option>
        </select>
      </div>
      <div className="cd-library-grid">
        {results.map((item) => (
          <article
            key={item.id}
            className={selected.includes(item.id) ? "selected" : ""}
          >
            {item.thumbnail ? (
              <div className="cd-material-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnail.src} alt={item.thumbnail.alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            ) : (
            <div className="cd-material-image">
              <span>医学図解</span>
              <CIcon name="book" size={30} />
              <small>図解は準備中</small>
            </div>
            )}
            <div className="cd-material-body">
              <div>
                <Badge tone={item.scope === "施設内教材" ? "purple" : "blue"}>
                  {item.scope}
                </Badge>
                <span>
                  <CIcon name="clock" size={14} />
                  {item.time}分
                </span>
              </div>
              <h2>{item.title}</h2>
              <dl>
                {known(item.target) && (
                  <>
                    <dt>対象者</dt>
                    <dd>{item.target}</dd>
                  </>
                )}
                {known(item.goal) && (
                  <>
                    <dt>学習目標</dt>
                    <dd>{item.goal}</dd>
                  </>
                )}
              </dl>
              <p>
                <CIcon name="check" />
                {record ? "医学的承認済み（デモ・架空の承認者）· 公開中" : "医学的承認済み · 公開中"}
                {item.prescribedBefore ? " · 以前に処方" : ""}
              </p>
              {item.prescribedNow ? (
                // 同じ診察では同じ教材を重複して処方しない
                <button className="selected" disabled>
                  <CIcon name="check" />
                  この診察で処方済み
                </button>
              ) : (
              <button
                className={selected.includes(item.id) ? "selected" : ""}
                onClick={() => toggle(item.id)}
              >
                <CIcon name={selected.includes(item.id) ? "check" : "plus"} />
                {selected.includes(item.id)
                  ? "選択済み"
                  : item.prescribedBefore
                    ? "再処方に追加"
                    : "処方に追加"}
              </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {results.length === 0 && (
        <div className="cd-empty-results">
          <CIcon name="search" size={34} />
          <h2>一致する承認済み教材がありません</h2>
          <p>検索語やカテゴリーを変更してください。</p>
        </div>
      )}
    </div>
  )
}

function PrescriptionReview({
  selected,
  onBack,
  onConfirm,
  record,
}: {
  selected: (number | string)[]
  onBack: () => void
  onConfirm: (message: string) => void
  record?: ClinicianRecord
}) {
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const items: LibraryCard[] = record ? (record.library ?? []) : libraryItems
  return (
    <div className="cd-content">
      <div className="cd-page-head">
        <button className="cd-back" onClick={onBack}>
          ← 教材選択
        </button>
        <div>
          <p className="cd-eyebrow">情報処方の確認</p>
          <h1>今回の情報処方を確認</h1>
        </div>
      </div>
      <div className="cd-review-layout">
        <section className="cd-panel">
          <div className="cd-panel-head">
            <h2>選択した教材</h2>
            <Badge>{selected.length}件</Badge>
          </div>
          <div className="cd-selected-materials">
            {items
              .filter((item) => selected.includes(item.id))
              .map((item, index) => (
                <div key={item.id}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{item.title}</b>
                    <small>
                      {item.area} · {item.time}分 · {item.scope}
                    </small>
                  </div>
                  <Badge tone="green">{item.prescribedBefore ? "再処方" : "承認済み"}</Badge>
                </div>
              ))}
          </div>
        </section>
        <aside className="cd-panel cd-confirm-panel">
          <h2>患者へのメッセージ（任意）</h2>
          <p>入力しなくても情報処方を確定できます。</p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={120}
            placeholder="必要な場合のみ入力"
          />
          <small>{message.length} / 120文字</small>
          <div className="cd-confirm-recipient">
            <span>届け先</span>
            <b>{record ? `${record.summary?.patientName ?? ""}さん` : "佐藤 花子さん"}</b>
          </div>
          <button
            className="cd-primary"
            disabled={selected.length === 0 || sending}
            onClick={async () => {
              setSending(true)
              try {
                await onConfirm(message)
              } finally {
                setSending(false)
              }
            }}
          >
            <CIcon name="book" />
            {selected.length}件の情報処方を確定
          </button>
          <p className="cd-final-action">この操作で患者アプリへ反映されます</p>
        </aside>
      </div>
    </div>
  )
}

function PrescriptionSent({
  count,
  onSummary,
  onEnd,
  record,
}: {
  count: number
  onSummary: () => void
  onEnd: () => void
  record?: ClinicianRecord
}) {
  const family = (record?.summary?.patientName ?? "").split(/[\s　]/)[0]
  return (
    <div className="cd-content cd-sent">
      <span>
        <CIcon name="check" size={42} />
      </span>
      <p className="cd-eyebrow">情報処方の完了</p>
      <h1>情報処方を届けました</h1>
      <p>
        {count}
        件の教材が、{record ? family : "佐藤"}さんの患者アプリ「今回の学び」に反映されました。
      </p>
      <div className="cd-patient-reflection">
        <CIcon name="user" />
        <div>
          <small>患者アプリでの表示</small>
          <b>今回の情報処方 · 新しい教材 {count}件</b>
          <p>{record?.summary?.currentSet ? "この診察の情報処方 · ただいま" : "乳腺外科 山田医師から · ただいま"}</p>
        </div>
      </div>
      <div className="cd-sent-actions">
        <button className="cd-secondary" onClick={onSummary}>
          診察サマリーへ戻る
        </button>
        <button className="cd-primary" onClick={onEnd}>
          <CIcon name="lock" />
          診察を終えて共有終了
        </button>
      </div>
    </div>
  )
}

const stepNames = [
  "原資料",
  "作成方針",
  "構成案",
  "必ず含める内容",
  "教材編集",
  "患者プレビュー",
  "承認・公開",
]

function Studio({
  step,
  setStep,
  notify,
  live,
  staffName,
  onPublished,
}: {
  step: number
  setStep: (step: number) => void
  notify: (message: string) => void
  /** 本番（Step 5）: 教材制作の実 API */
  live?: StudioLive
  staffName?: string
  onPublished?: () => void
}) {
  const [sourceReady, setSourceReady] = useState(false)
  const [aiAllowed, setAiAllowed] = useState(true)
  const [licenseChecked, setLicenseChecked] = useState(false)
  const [approach, setApproach] = useState<"claude" | "manual">("claude")
  const [proposal, setProposal] = useState(1)
  const [expandedProposal, setExpandedProposal] = useState<number | null>(null)
  const [mustCover, setMustCover] = useState([true, true, false, true])
  const [sourceShown, setSourceShown] = useState<number | null>(null)
  const [editingPage, setEditingPage] = useState(1)
  const [imageState, setImageState] = useState("未設定")
  const [approvalChecks, setApprovalChecks] = useState([
    false,
    false,
    false,
    false,
  ])
  const [publishStateLocal, setPublishState] =
    useState<"editing" | "review" | "published" | "returned">("editing")
  // ---- 本番（Step 5）の入力 ----
  const [file, setFile] = useState<File | null>(null)
  const [srcMeta, setSrcMeta] = useState({ title: "", rightsHolder: "", evidenceNote: "" })
  const [perm, setPerm] = useState({ allowDerive: true, allowPublish: true, allowShare: false })
  const [piiChecked, setPiiChecked] = useState(false)
  const [brief, setBrief] = useState({ theme: "", audience: "", objective: "" })
  const [mustChecked, setMustChecked] = useState<Record<string, boolean>>({})
  const [mustText, setMustText] = useState<Record<string, string>>({})
  const d = live?.draft ?? null
  const liveState: "editing" | "review" | "published" | "returned" = !d
    ? "editing"
    : d.version.status === "published"
      ? "published"
      : d.version.status === "in_review"
        ? "review"
        : d.version.status === "retired"
          ? "returned"
          : d.version.reviewComment
            ? "returned"
            : "editing"
  const publishState = live ? liveState : publishStateLocal
  // 撮影用デモ環境: 構成案が記録済みの Claude 出力の再生なら、案 1 だけを選べる（案 2・3 の記録はない）
  const replayOnly = !!live && live.outlineJob?.generator === "replay"

  const canNext = live
    ? step === 1
      ? !!(live.sourceId || file) && aiAllowed && licenseChecked && piiChecked && !!srcMeta.rightsHolder.trim() && !!srcMeta.evidenceNote.trim()
      : step === 2
        ? approach === "claude" || (!!brief.theme.trim() && !!brief.objective.trim())
        : step === 3
          ? live.outlines.length > 0
          : step === 4
            ? live.candidates.every((c) => mustChecked[c.id])
            : step === 5
              ? !!d
              : true
    : step === 1
      ? sourceReady && aiAllowed && licenseChecked
      : step === 4
        ? mustCover.every(Boolean)
        : true
  /** 本番の「次へ」: 各手順で実際の処理を行い、終わったら次の手順へ */
  const nextLive = async () => {
    if (!live) return
    if (step === 1) {
      if (!live.sourceId && file) {
        const id = await live.upload(file, { title: srcMeta.title, rightsHolder: srcMeta.rightsHolder, evidenceNote: srcMeta.evidenceNote, perm: { allowAi: aiAllowed, ...perm }, piiAttestedNone: piiChecked })
        if (!id) return
      }
      return setStep(2)
    }
    if (step === 2) {
      if (approach === "claude") {
        if (await live.requestOutlines()) setStep(3)
        return
      }
      const objectives = brief.objective.split(/\n/).map((x) => x.trim()).filter(Boolean).slice(0, 3)
      if (await live.requestFreeform({ theme: brief.theme.trim(), audience: brief.audience.trim(), objectives })) setStep(5)
      return
    }
    if (step === 4) {
      const must = live.candidates.map((c) => ({
        id: c.id,
        text: (mustText[c.id] ?? c.text).trim() || c.text,
        kind: c.kind,
        sourceRef: c.sourceRef,
        status: (mustChecked[c.id] ? "required" : "needs_review") as "required" | "needs_review",
      }))
      // 撮影用デモ環境（記録済み出力の再生）では案 1 だけを再生できるため、案 1 で下書きを作る
      if (await live.requestDraft(replayOnly ? 0 : proposal - 1, must)) setStep(5)
      return
    }
    setStep(step + 1)
  }
  return (
    <div className="cd-content cd-studio">
      <div className="cd-title-row">
        <div>
          <p className="cd-eyebrow">Claude 教材スタジオ</p>
          <h1>教材スタジオ</h1>
          <p>原資料から、患者向け教材を作成・確認・承認します。</p>
        </div>
        <div className="cd-draft-status">
          <Badge
            tone={
              publishState === "published"
                ? "green"
                : publishState === "review"
                  ? "amber"
                  : publishState === "returned"
                    ? "red"
                    : "gray"
            }
          >
            {publishState === "published"
              ? "公開済み"
              : publishState === "review"
                ? "承認待ち"
                : publishState === "returned"
                  ? "差し戻し"
                  : "編集中"}
          </Badge>
          <span>
            {live
              ? live.savedAt
                ? `自動保存 ${live.savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                : d
                  ? "下書き"
                  : "未作成"
              : "自動保存 たった今"}
          </span>
        </div>
      </div>
      <div className="cd-stepper">
        {stepNames.map((name, index) => (
          <button
            key={name}
            className={
              step === index + 1 ? "active" : step > index + 1 ? "done" : ""
            }
            disabled={index + 1 > step}
            onClick={() => setStep(index + 1)}
          >
            <span>
              {step > index + 1 ? <CIcon name="check" size={14} /> : index + 1}
            </span>
            {name}
          </button>
        ))}
      </div>
      {live && live.allowed === false ? (
        <div className="cd-studio-body">
          <div className="cd-studio-step">
            <div className="cd-step-heading">
              <Badge tone="gray">権限</Badge>
              <h2>教材スタジオを使う権限がありません</h2>
              <p>教材の作成は「教材編集」、承認・公開は「教材承認」の役割を持つ医療者が行います。</p>
            </div>
          </div>
        </div>
      ) : (
      <div className="cd-studio-body">
        {live && (live.outlineJob?.generator === "replay" || live.draftJob?.generator === "replay") && (
          <p className="cd-studio-busy" data-studio-replay>
            撮影用デモ環境: 記録済みのClaude出力（{live.draftJob?.model ?? live.outlineJob?.model}）を再生しています。今回はClaudeを呼び出していません。
          </p>
        )}
        {live && live.busy && (
          <p className="cd-studio-busy" data-studio-busy>
            {live.busy === "upload"
              ? "原資料を登録しています…"
              : live.busy === "outline"
                ? `Claudeが構成案を作成しています…（${live.outlineJob?.progress ?? "待機中"}）`
                : live.busy === "draft"
                  ? `Claudeが下書きを作成しています…（${live.draftJob?.progress ?? "待機中"}）`
                  : "処理しています…"}
          </p>
        )}
        {step === 1 && (
          <SourceStep
            sourceReady={live ? !!(live.sourceId || file) : sourceReady}
            setSourceReady={setSourceReady}
            aiAllowed={aiAllowed}
            setAiAllowed={setAiAllowed}
            licenseChecked={licenseChecked}
            setLicenseChecked={setLicenseChecked}
            live={
              live
                ? {
                    file,
                    setFile,
                    uploaded: live.sourceInfo,
                    remove: () => {
                      setFile(null)
                      live.removeSource()
                    },
                    meta: srcMeta,
                    setMeta: setSrcMeta,
                    perm,
                    setPerm,
                    pii: piiChecked,
                    setPii: setPiiChecked,
                  }
                : undefined
            }
          />
        )}
        {step === 2 && (
          <ApproachStep approach={approach} setApproach={setApproach} live={live ? { brief, setBrief } : undefined} />
        )}
        {step === 3 && (
          <ProposalStep
            selected={replayOnly ? 1 : proposal}
            setSelected={setProposal}
            replayOnly={replayOnly}
            expanded={expandedProposal}
            setExpanded={setExpandedProposal}
            live={live ? { outlines: live.outlines, sourceTitle: live.sourceInfo?.title ?? "原資料" } : undefined}
          />
        )}
        {step === 4 && (
          <MustCoverStep
            checked={mustCover}
            setChecked={setMustCover}
            sourceShown={sourceShown}
            setSourceShown={setSourceShown}
            live={
              live
                ? {
                    candidates: live.candidates,
                    checked: mustChecked,
                    setChecked: setMustChecked,
                    text: mustText,
                    setText: setMustText,
                    meta: {
                      title: live.sourceInfo?.title ?? "",
                      rightsHolder: srcMeta.rightsHolder,
                      registrant: staffName ?? "",
                      license: [perm.allowPublish ? "施設内公開" : "公開不可", perm.allowDerive ? "改変可" : "改変不可", perm.allowShare ? "施設外共有可" : "施設外共有不可"].join("・"),
                    },
                  }
                : undefined
            }
          />
        )}
        {step === 5 && (
          <EditStep
            editingPage={editingPage}
            setEditingPage={setEditingPage}
            imageState={imageState}
            setImageState={setImageState}
            live={live && d ? { draft: d, save: live.saveDraft } : undefined}
          />
        )}
        {step === 6 && (
          <PreviewStep
            onClose={() => setStep(5)}
            onComplete={async () => {
              if (live) {
                if (d?.version.status === "draft" && !(await live.submit())) return
                setStep(7)
                return
              }
              setPublishState("review")
              setStep(7)
            }}
            live={live && d ? { draft: d } : undefined}
          />
        )}
        {step === 7 && (
          <ApprovalStep
            checks={approvalChecks}
            setChecks={setApprovalChecks}
            state={publishState}
            setState={setPublishState}
            notify={notify}
            live={
              live && d
                ? {
                    draft: d,
                    busy: !!live.busy,
                    approve: async (ack: boolean) => {
                      if (await live.approve(ack, ack ? "最終確認で安全上の重要事項と相談の目安を確認した" : null)) {
                        notify("医学的承認が完了し、教材を公開しました")
                        onPublished?.()
                      }
                    },
                    returnToDraft: async () => {
                      if (await live.returnToDraft("最終確認で修正が必要")) {
                        notify("修正のため差し戻しました")
                        setStep(5)
                      }
                    },
                    retire: async () => {
                      if (await live.retire()) {
                        notify("公開を停止しました（患者の新しい処方候補には表示されません）")
                        onPublished?.()
                      }
                    },
                  }
                : undefined
            }
          />
        )}
      </div>
      )}
      {step < 7 && (
        <div className="cd-wizard-actions">
          <button
            className="cd-secondary"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
          >
            前へ
          </button>
          <div>
            {step === 1 && !aiAllowed && (
              <span>AI処理が許可されていないため進めません</span>
            )}
            {live && step === 1 && aiAllowed && (!licenseChecked || !piiChecked) && (
              <span>利用許諾と個人情報の確認が必要です</span>
            )}
            {step === 4 && (live ? !live.candidates.every((c) => mustChecked[c.id]) : !mustCover.every(Boolean)) && (
              <span>「必ず含める内容」に未確認の項目があります</span>
            )}
            <button
              className="cd-primary"
              disabled={!canNext || !!live?.busy || (!!live && live.allowed === false)}
              onClick={() => (live ? void nextLive() : setStep(step + 1))}
            >
              {step === 2 && approach === "claude"
                ? "Claudeに構成案を依頼"
                : live && step === 2
                  ? "Claudeに下書きを依頼"
                  : live && step === 4
                    ? "確認した内容で下書きを作成"
                    : "次へ進む"}
              <CIcon name="arrow" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SourceStep({
  sourceReady,
  setSourceReady,
  aiAllowed,
  setAiAllowed,
  licenseChecked,
  setLicenseChecked,
  live,
}: {
  sourceReady: boolean
  setSourceReady: (value: boolean) => void
  aiAllowed: boolean
  setAiAllowed: (value: boolean) => void
  licenseChecked: boolean
  setLicenseChecked: (value: boolean) => void
  /** 本番: 実際のファイル・資料名・許諾元・許諾の根拠・利用条件・個人情報を含まないことの確認 */
  live?: {
    file: File | null
    setFile: (file: File | null) => void
    uploaded: { title: string; filename: string; size: number; charCount: number; warnings: string[] } | null
    remove: () => void
    meta: { title: string; rightsHolder: string; evidenceNote: string }
    setMeta: (meta: { title: string; rightsHolder: string; evidenceNote: string }) => void
    perm: { allowDerive: boolean; allowPublish: boolean; allowShare: boolean }
    setPerm: (perm: { allowDerive: boolean; allowPublish: boolean; allowShare: boolean }) => void
    pii: boolean
    setPii: (value: boolean) => void
  }
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 1</Badge>
        <h2>原資料を登録</h2>
        <p>利用許諾を確認し、AI処理できる資料だけを登録します。</p>
      </div>
      <div className="cd-source-layout">
        <section className="cd-panel">
          {live && (
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.pptx"
              style={{ display: "none" }}
              data-source-file
              onChange={(event) => {
                const f = event.target.files?.[0] ?? null
                live.setFile(f)
                if (f && !live.meta.title) live.setMeta({ ...live.meta, title: f.name.replace(/\.[^.]+$/, "") })
              }}
            />
          )}
          {live && sourceReady ? (
            <div className="cd-file-ready">
              <span>
                <CIcon name="file" size={28} />
              </span>
              <div>
                <b>{live.uploaded?.filename ?? live.file?.name}</b>
                <small>
                  {(((live.uploaded?.size ?? live.file?.size ?? 0) / 1024 / 1024) || 0).toFixed(1)}MB ·{" "}
                  {live.uploaded ? `${live.uploaded.charCount}文字を読み取り済み` : "登録前（「次へ進む」で登録）"}
                </small>
                {live.uploaded?.warnings.map((w) => (
                  <small key={w} style={{ color: "#a0523f" }}>
                    {w}
                  </small>
                ))}
              </div>
              <button onClick={live.remove}>削除</button>
            </div>
          ) : live ? (
            <button className="cd-upload" onClick={() => fileRef.current?.click()}>
              <CIcon name="upload" size={32} />
              <b>PDF・テキスト資料を登録</b>
              <span>クリックしてファイルを選択</span>
              <small>PDF / Word / PowerPoint / TXT · 最大15MB</small>
            </button>
          ) : !sourceReady ? (
            <button className="cd-upload" onClick={() => setSourceReady(true)}>
              <CIcon name="upload" size={32} />
              <b>PDF・テキスト資料を登録</b>
              <span>クリックしてサンプル資料を登録</span>
              <small>PDF / TXT · 最大20MB</small>
            </button>
          ) : (
            <div className="cd-file-ready">
              <span>
                <CIcon name="file" size={28} />
              </span>
              <div>
                <b>乳がん術後リハビリテーション指針.pdf</b>
                <small>2.4MB · 38ページ · 読み取り完了</small>
              </div>
              <button onClick={() => setSourceReady(false)}>削除</button>
            </div>
          )}
          {live ? (
            <div className="cd-form-grid">
              <label>
                資料名
                <input value={live.meta.title} disabled={!!live.uploaded} onChange={(event) => live.setMeta({ ...live.meta, title: event.target.value })} />
              </label>
              <label>
                作成元（許諾元）
                <input value={live.meta.rightsHolder} disabled={!!live.uploaded} onChange={(event) => live.setMeta({ ...live.meta, rightsHolder: event.target.value })} />
              </label>
              <label className="wide">
                利用許諾の根拠（確認した内容）
                <textarea value={live.meta.evidenceNote} disabled={!!live.uploaded} onChange={(event) => live.setMeta({ ...live.meta, evidenceNote: event.target.value })} />
              </label>
            </div>
          ) : (
          <div className="cd-form-grid">
            <label>
              資料名
              <input defaultValue="乳がん術後リハビリテーション指針" />
            </label>
            <label>
              作成元
              <input defaultValue="日本乳腺ケア学会" />
            </label>
            <label className="wide">
              資料の説明
              <textarea defaultValue="乳房手術後の上肢運動と生活上の注意に関する医療者向け資料" />
            </label>
          </div>
          )}
        </section>
        <aside className="cd-panel cd-permissions">
          <h3>利用条件</h3>
          <ToggleRow
            label="AI処理"
            description="Claudeによる解析・構成案生成"
            value={aiAllowed}
            setValue={setAiAllowed}
            critical
          />
          {live ? (
            <>
              <ToggleRow label="内容の改変" description="患者向けへの要約・編集" value={live.perm.allowDerive} setValue={(v) => live.setPerm({ ...live.perm, allowDerive: v })} />
              <ToggleRow label="Web公開" description="shioriで患者へ公開" value={live.perm.allowPublish} setValue={(v) => live.setPerm({ ...live.perm, allowPublish: v })} />
              <ToggleRow label="施設外共有" description="共通教材として他施設で利用" value={live.perm.allowShare} setValue={(v) => live.setPerm({ ...live.perm, allowShare: v })} />
            </>
          ) : (
            <>
          <ToggleRow label="内容の改変" description="患者向けへの要約・編集" />
          <ToggleRow label="Web公開" description="shioriで患者へ公開" />
          <ToggleRow
            label="施設外共有"
            description="共通教材として他施設で利用"
            defaultValue={false}
          />
            </>
          )}
          {!aiAllowed && (
            <p className="cd-permission-warning">
              <CIcon name="alert" />
              AI処理不可の資料はClaudeによる教材生成へ進めません。
            </p>
          )}
          <label className="cd-license-check">
            <input
              type="checkbox"
              checked={licenseChecked}
              onChange={(event) => setLicenseChecked(event.target.checked)}
            />
            <span>
              <b>利用許諾を確認しました</b>
              <small>登録者が資料の利用条件を確認します</small>
            </span>
          </label>
          {live && (
            // 本番: 患者個人情報を含まないことの確認（含む資料は AI 処理しない）
            <label className="cd-license-check">
              <input type="checkbox" checked={live.pii} onChange={(event) => live.setPii(event.target.checked)} />
              <span>
                <b>患者個人情報を含みません</b>
                <small>含む資料はClaudeに送信しません</small>
              </span>
            </label>
          )}
        </aside>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  setValue,
  defaultValue = true,
  critical = false,
}: {
  label: string
  description: string
  value?: boolean
  setValue?: (value: boolean) => void
  defaultValue?: boolean
  critical?: boolean
}) {
  const [local, setLocal] = useState(defaultValue)
  const actual = value ?? local
  const update = setValue ?? setLocal
  return (
    <label className="cd-toggle-row">
      <span>
        <b>
          {label}
          {critical && <em>必須</em>}
        </b>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={actual}
        onChange={(event) => update(event.target.checked)}
      />
      <i />
    </label>
  )
}

function ApproachStep({
  approach,
  setApproach,
  live,
}: {
  approach: "claude" | "manual"
  setApproach: (value: "claude" | "manual") => void
  /** 本番: テーマ・対象者・学習目標（1 行に 1 つ、3 つまで） */
  live?: { brief: { theme: string; audience: string; objective: string }; setBrief: (b: { theme: string; audience: string; objective: string }) => void }
}) {
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 2</Badge>
        <h2>教材の作成方針</h2>
        <p>原資料をどのように患者向け教材へ構成するか選びます。</p>
      </div>
      <div className="cd-approach-grid">
        <button
          className={approach === "claude" ? "selected" : ""}
          onClick={() => setApproach("claude")}
        >
          <span>
            <CIcon name="studio" size={28} />
          </span>
          <Badge>おすすめ</Badge>
          <h3>Claudeが3つの構成案を提案</h3>
          <p>対象者や情報量の異なる3案を比較し、医療者が最適な案を選びます。</p>
          <i>{approach === "claude" && <CIcon name="check" />}</i>
        </button>
        <button
          className={approach === "manual" ? "selected" : ""}
          onClick={() => setApproach("manual")}
        >
          <span>
            <CIcon name="edit" size={28} />
          </span>
          <h3>テーマ・学習目標を指定</h3>
          <p>医療者がテーマ、対象者、学習目標を指定して構成を作ります。</p>
          <i>{approach === "manual" && <CIcon name="check" />}</i>
        </button>
      </div>
      {approach === "manual" && live && (
        <div className="cd-panel cd-manual-brief">
          <label>
            テーマ
            <input value={live.brief.theme} onChange={(event) => live.setBrief({ ...live.brief, theme: event.target.value })} />
          </label>
          <label>
            対象者
            <input value={live.brief.audience} onChange={(event) => live.setBrief({ ...live.brief, audience: event.target.value })} />
          </label>
          <label className="wide">
            学習目標（1行に1つ・3つまで）
            <textarea value={live.brief.objective} onChange={(event) => live.setBrief({ ...live.brief, objective: event.target.value })} />
          </label>
        </div>
      )}
      {approach === "manual" && !live && (
        <div className="cd-panel cd-manual-brief">
          <label>
            テーマ
            <input defaultValue="乳房手術後の腕の動かし方" />
          </label>
          <label>
            対象者
            <input defaultValue="退院後1か月以内の患者" />
          </label>
          <label className="wide">
            学習目標
            <textarea defaultValue="無理のない腕の動かし方と、医療者へ相談すべき変化を説明できる" />
          </label>
        </div>
      )}
    </div>
  )
}

const proposals = [
  {
    title: "退院後すぐに確認する 腕と傷のケア",
    target: "退院直後〜術後2週間の患者",
    goal: "毎日の腕の動かし方と相談の目安を知る",
    pages: "4画面 · 約7分",
    focus: "行動を優先",
  },
  {
    title: "手術後の回復に合わせた腕の運動",
    target: "術後の回復期にある患者",
    goal: "回復段階に合わせた運動の考え方を理解する",
    pages: "5画面 · 約10分",
    focus: "段階的に説明",
  },
  {
    title: "こんな変化は相談を 術後セルフチェック",
    target: "自宅療養中の患者と家族",
    goal: "日常の観察点と医療機関へ連絡する目安を知る",
    pages: "3画面 · 約6分",
    focus: "安全情報を優先",
  },
]

function ProposalStep({
  selected,
  setSelected,
  expanded,
  setExpanded,
  live,
  replayOnly = false,
}: {
  /** 撮影用デモ環境: 案 1 だけを選べる（記録済みの出力は案 1 のみ） */
  replayOnly?: boolean
  selected: number
  setSelected: (value: number) => void
  expanded: number | null
  setExpanded: (value: number | null) => void
  /** 本番: Claude が原資料から作った構成案（下書き） */
  live?: { outlines: import("./studio").Outline[]; sourceTitle: string }
}) {
  const items = live
    ? live.outlines.map((o) => ({
        title: o.title,
        target: o.targetReader,
        goal: o.learningObjectives.join(" / "),
        pages: `${o.slideTitles.length}画面 · 約${Math.max(1, Math.round(o.slideTitles.length * 1.5 + 1))}分`,
        focus: o.rationale.length > 14 ? `${o.rationale.slice(0, 14)}…` : o.rationale,
        slideTitles: o.slideTitles,
        refs: [...new Set(o.sourceRefs.map((r) => r.section).filter(Boolean))].slice(0, 3).join("、"),
        rationale: o.rationale,
      }))
    : proposals.map((p) => ({ ...p, slideTitles: ["手術後の腕の変化", "無理のない動かし方", "傷を守る生活の工夫", "医療機関へ相談する目安"], refs: "原資料 p.12–18, p.26", rationale: "" }))
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 3</Badge>
        <h2>Claudeの構成案を比較</h2>
        <p>提案は下書きです。採用と医学的な判断は医療者が行います。</p>
        {replayOnly && (
          <p className="cd-replay-note" data-replay-only>
            撮影用デモ環境のため、記録済みの案 1 で下書きを作成します。
          </p>
        )}
      </div>
      <div className="cd-proposal-grid">
        {items.map((item, index) => (
          <article
            key={item.title}
            className={selected === index + 1 ? "selected" : ""}
          >
            <div className="cd-proposal-number">案 {index + 1}</div>
            <Badge
              tone={index === 0 ? "blue" : index === 1 ? "purple" : "amber"}
            >
              {item.focus}
            </Badge>
            <h3>{item.title}</h3>
            <dl>
              <dt>対象者</dt>
              <dd>{item.target}</dd>
              <dt>学習目標</dt>
              <dd>{item.goal}</dd>
            </dl>
            <p>{item.pages}</p>
            <button
              className="cd-proposal-detail"
              onClick={() =>
                setExpanded(expanded === index + 1 ? null : index + 1)
              }
            >
              {expanded === index + 1 ? "詳細を閉じる" : "詳細を見る"}
            </button>
            {expanded === index + 1 && (
              <div className="cd-proposal-expanded">
                <b>画面構成</b>
                <ol>
                  {item.slideTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                {item.rationale && <small>{item.rationale}</small>}
                <small>主な出典：{live ? `${live.sourceTitle}${item.refs ? `（${item.refs}）` : ""}` : item.refs}</small>
              </div>
            )}
            <button
              className={
                selected === index + 1 ? "cd-selected-button" : "cd-primary"
              }
              disabled={replayOnly && index > 0}
              onClick={() => setSelected(index + 1)}
            >
              <CIcon name={selected === index + 1 ? "check" : "plus"} />
              {selected === index + 1 ? "この案を選択中" : replayOnly ? "デモでは選べません" : "この案を選ぶ"}
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

const mustItems = [
  "強い痛みを我慢して動かす必要はない",
  "手術方法や傷の状態により適切な運動範囲は異なる",
  "回数は一律ではなく担当医療者の指示を優先する",
  "急な腫れ・赤み・熱感は医療機関へ相談する",
]

function MustCoverStep({
  checked,
  setChecked,
  sourceShown,
  setSourceShown,
  live,
}: {
  checked: boolean[]
  setChecked: (value: boolean[]) => void
  sourceShown: number | null
  setSourceShown: (value: number | null) => void
  /** 本番: Claude が原資料から挙げた必須事項の候補（医療者が確認・修正し、確認した項目を必須として下書きに含める） */
  live?: {
    candidates: import("./studio").MustCandidate[]
    checked: Record<string, boolean>
    setChecked: (v: Record<string, boolean>) => void
    text: Record<string, string>
    setText: (v: Record<string, string>) => void
    meta: { title: string; rightsHolder: string; registrant: string; license: string }
  }
}) {
  if (live) {
    const kindLabel: Record<string, string> = { emergency: "すぐに連絡・受診", visit: "受診・連絡の目安", prohibition: "してはいけないこと", caution: "注意", fact: "前提となる事実" }
    return (
      <div className="cd-studio-step">
        <div className="cd-step-heading">
          <Badge>手順 4</Badge>
          <h2>必ず含める内容を確認</h2>
          <p>患者が学ぶべき医学的内容を選択し、原資料と照合します。</p>
        </div>
        <div className="cd-must-layout">
          <section className="cd-panel">
            <div className="cd-panel-head">
              <h3>必須事項の候補</h3>
              <Badge tone="amber">未確認 {live.candidates.filter((c) => !live.checked[c.id]).length}件</Badge>
            </div>
            <div className="cd-must-list">
              {live.candidates.length === 0 && <p>Claudeから必須事項の候補はありませんでした。</p>}
              {live.candidates.map((c, index) => {
                const safety = SAFETY_KINDS.includes(c.kind)
                return (
                  <div key={c.id} className={safety ? "safety" : ""} data-must-item>
                    <label>
                      <input type="checkbox" checked={!!live.checked[c.id]} onChange={() => live.setChecked({ ...live.checked, [c.id]: !live.checked[c.id] })} />
                      <span>
                        {safety && <Badge tone="red">安全上重要</Badge>}
                        <textarea value={live.text[c.id] ?? c.text} onChange={(event) => live.setText({ ...live.text, [c.id]: event.target.value })} />
                        <small>
                          {kindLabel[c.kind]} · {c.sourceRef.section || "原資料"}
                        </small>
                      </span>
                    </label>
                    <button onClick={() => setSourceShown(sourceShown === index ? null : index)}>
                      <CIcon name="eye" />
                      原文と照合
                    </button>
                    {sourceShown === index && (
                      <blockquote>
                        <b>{live.meta.title}{c.sourceRef.section ? ` · ${c.sourceRef.section}` : ""}</b>
                        <p>{c.sourceRef.quote || "（引用なし）"}</p>
                      </blockquote>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
          <aside className="cd-panel cd-metadata-separation">
            <h3>教材内容に含めない情報</h3>
            <p>資料管理用のメタデータは、患者向け本文と分けて保持します。</p>
            <dl>
              <dt>原資料</dt>
              <dd>{live.meta.title}</dd>
              <dt>作成元（許諾元）</dt>
              <dd>{live.meta.rightsHolder || "未登録"}</dd>
              <dt>登録者</dt>
              <dd>{live.meta.registrant || "—"}</dd>
              <dt>利用許諾</dt>
              <dd>{live.meta.license}</dd>
            </dl>
            <p>チェックした項目は「この教材で必須」、外した項目は「医療者の確認が必要」として下書きに渡します。</p>
          </aside>
        </div>
      </div>
    )
  }
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 4</Badge>
        <h2>必ず含める内容を確認</h2>
        <p>患者が学ぶべき医学的内容を選択し、原資料と照合します。</p>
      </div>
      <div className="cd-must-layout">
        <section className="cd-panel">
          <div className="cd-panel-head">
            <h3>必須事項の候補</h3>
            <Badge tone="amber">
              未確認 {checked.filter((item) => !item).length}件
            </Badge>
          </div>
          <div className="cd-must-list">
            {mustItems.map((item, index) => (
              <div key={item} className={index === 3 ? "safety" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked[index]}
                    onChange={() =>
                      setChecked(
                        checked.map((value, itemIndex) =>
                          itemIndex === index ? !value : value,
                        ),
                      )
                    }
                  />
                  <span>
                    {index === 3 && <Badge tone="red">安全上重要</Badge>}
                    <textarea defaultValue={item} />
                    <small>医学的内容 · 原資料 p.{12 + index * 4}</small>
                  </span>
                </label>
                <button
                  onClick={() =>
                    setSourceShown(sourceShown === index ? null : index)
                  }
                >
                  <CIcon name="eye" />
                  原文と照合
                </button>
                {sourceShown === index && (
                  <blockquote>
                    <b>原資料 p.{12 + index * 4}</b>
                    <p>
                      術後の上肢運動は疼痛および創部の状態を観察し、個々の術式と回復過程に応じて段階的に行う。
                    </p>
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </section>
        <aside className="cd-panel cd-metadata-separation">
          <h3>教材内容に含めない情報</h3>
          <p>資料管理用のメタデータは、患者向け本文と分けて保持します。</p>
          <dl>
            <dt>原資料作成者</dt>
            <dd>日本乳腺ケア学会</dd>
            <dt>発行年</dt>
            <dd>2025年</dd>
            <dt>登録者</dt>
            <dd>山田医師</dd>
            <dt>利用許諾</dt>
            <dd>施設内公開・改変可</dd>
          </dl>
        </aside>
      </div>
    </div>
  )
}

function EditStep({
  editingPage,
  setEditingPage,
  imageState,
  setImageState,
  live,
}: {
  editingPage: number
  setEditingPage: (value: number) => void
  imageState: string
  setImageState: (value: string) => void
  /** 本番: Claude の下書き（本文・確認問題）を医療者が編集し、自動保存 */
  live?: { draft: Draft; save: (d: Draft) => Promise<void> }
}) {
  const [evidenceShown, setEvidenceShown] = useState(false)
  if (live) return <LiveEditStep key={`${live.draft.version.id}:${live.draft.version.status}`} draft={live.draft} save={live.save} page={editingPage} setPage={setEditingPage} />
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 5</Badge>
        <h2>教材と確認問題を編集</h2>
        <p>1画面1主題で本文・図解・確認問題を編集します。</p>
      </div>
      <div className="cd-editor">
        <aside>
          <h3>教材の画面</h3>
          {[1, 2, 3, 4].map((page) => (
            <button
              key={page}
              className={editingPage === page ? "active" : ""}
              onClick={() => setEditingPage(page)}
            >
              <span>{page}</span>
              <div>
                <b>
                  {
                    [
                      "術後の腕の変化",
                      "腕の動かし方",
                      "生活の工夫",
                      "相談する目安",
                    ][page - 1]
                  }
                </b>
                <small>{page === 2 ? "編集中" : "下書き保存済み"}</small>
              </div>
            </button>
          ))}
          <button
            className={editingPage === 5 ? "active quiz" : "quiz"}
            onClick={() => setEditingPage(5)}
          >
            <span>Q</span>
            <div>
              <b>理解確認</b>
              <small>3択＋わからない</small>
            </div>
          </button>
        </aside>
        <section className="cd-panel cd-edit-form">
          {editingPage < 5 ? (
            <>
              <div className="cd-edit-top">
                <span>画面 {editingPage} / 4</span>
                <Badge tone="gray">自動保存</Badge>
              </div>
              <label>
                見出し
                <input defaultValue="腕は、無理のない範囲でゆっくり動かします" />
              </label>
              <label>
                要点
                <textarea defaultValue="強い痛みを我慢して動かす必要はありません。傷の状態を見ながら、少しずつ動かします。" />
              </label>
              <label>
                本文
                <textarea
                  className="large"
                  defaultValue="手術後は、痛みや傷の状態を見ながら、少しずつ腕を動かします。手術方法によって動かせる範囲は異なるため、担当の医療者から伝えられた範囲を優先してください。"
                />
              </label>
              <div className="cd-illustration-editor">
                <div>
                  <span>医学図解</span>
                  <CIcon name="book" size={30} />
                  <b>医学図解の挿入枠</b>
                  <small>完成画像は自動トリミングしません</small>
                </div>
                <section>
                  <label>
                    図解の状態
                    <select
                      value={imageState}
                      onChange={(event) => setImageState(event.target.value)}
                    >
                      <option>未設定</option>
                      <option>監修待ち</option>
                      <option>承認済み</option>
                    </select>
                  </label>
                  <label>
                    caption
                    <input defaultValue="腕を動かす範囲の目安" />
                  </label>
                  <label>
                    代替テキスト
                    <textarea defaultValue="手術後の腕を段階的に上げる方法を示す医学図解" />
                  </label>
                </section>
              </div>
              <div className="cd-evidence-source">
                <CIcon name="file" />
                <span>
                  <b>原資料の根拠</b>
                  <small>p.16–18「術後上肢運動」</small>
                </span>
                <button onClick={() => setEvidenceShown(!evidenceShown)}>
                  {evidenceShown ? "原文を閉じる" : "原文を表示"}
                </button>
              </div>
              {evidenceShown && (
                <blockquote className="cd-editor-source">
                  <b>原資料 p.16–18</b>
                  <p>
                    術後の上肢運動は疼痛および創部の状態を観察し、個々の術式と回復過程に応じて段階的に行う。
                  </p>
                </blockquote>
              )}
            </>
          ) : (
            <div className="cd-question-editor">
              <div className="cd-edit-top">
                <span>理解確認 1問目</span>
                <Badge tone="gray">下書き</Badge>
              </div>
              <label>
                設問
                <textarea defaultValue="腕を動かすとき、適切なのはどれですか？" />
              </label>
              <div className="cd-option-editor">
                {[
                  "痛みを我慢して大きく動かす",
                  "無理のない範囲でゆっくり動かす",
                  "診察まで腕をまったく動かさない",
                ].map((option, index) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="correct"
                      defaultChecked={index === 1}
                    />
                    <span>{["A", "B", "C"][index]}</span>
                    <input defaultValue={option} />
                  </label>
                ))}
                <div>
                  <span>?</span>
                  <b>わからない</b>
                  <small>患者には常に表示</small>
                </div>
              </div>
              <label>
                正答後・誤答後の解説
                <textarea
                  className="large"
                  defaultValue="強い痛みを我慢せず、無理のない範囲でゆっくり動かすことが基本です。適切な範囲は手術方法や傷の状態によって異なります。"
                />
              </label>
              <div className="cd-evidence-source">
                <CIcon name="file" />
                <span>
                  <b>原資料の根拠</b>
                  <small>p.16–18「術後上肢運動」</small>
                </span>
                <button onClick={() => setEvidenceShown(!evidenceShown)}>
                  {evidenceShown ? "原文を閉じる" : "原文を表示"}
                </button>
              </div>
              {evidenceShown && (
                <blockquote className="cd-editor-source">
                  <b>原資料 p.16–18</b>
                  <p>
                    強い疼痛を伴う運動は避け、患者ごとの術式と創部の状態に応じた運動範囲を指導する。
                  </p>
                </blockquote>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** 本番の教材編集（Figma の EditStep と同じ DOM）。入力欄を離れたときに自動保存 */
function LiveEditStep({ draft, save, page, setPage }: { draft: Draft; save: (d: Draft) => Promise<void>; page: number; setPage: (p: number) => void }) {
  const [local, setLocal] = useState(draft)
  const [evidenceShown, setEvidenceShown] = useState(false)
  const n = local.slides.length
  const quizPage = n + 1
  const cur = page <= n ? local.slides[page - 1] : null
  const editable = local.version.status === "draft"
  const setSlide = (patch: Partial<Draft["slides"][number]>) =>
    setLocal({ ...local, slides: local.slides.map((sl, i) => (i === page - 1 ? { ...sl, ...patch } : sl)) })
  const setQuestion = (qi: number, patch: Partial<Draft["questions"][number]>) =>
    setLocal({ ...local, questions: local.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) })
  const commit = () => editable && void save(local)
  const ref = cur?.sourceRefs[0]
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 5</Badge>
        <h2>教材と確認問題を編集</h2>
        <p>1画面1主題で本文・図解・確認問題を編集します。{!editable && "（承認待ち・公開後は編集できません）"}</p>
      </div>
      <div className="cd-editor">
        <aside>
          <h3>教材の画面</h3>
          {local.slides.map((sl, i) => (
            <button key={sl.seq} className={page === i + 1 ? "active" : ""} onClick={() => setPage(i + 1)}>
              <span>{i + 1}</span>
              <div>
                <b>{sl.title}</b>
                <small>{page === i + 1 ? "編集中" : "下書き保存済み"}</small>
              </div>
            </button>
          ))}
          <button className={page === quizPage ? "active quiz" : "quiz"} onClick={() => setPage(quizPage)}>
            <span>Q</span>
            <div>
              <b>理解確認</b>
              <small>{local.questions.length}問 · 3択＋わからない</small>
            </div>
          </button>
        </aside>
        <section className="cd-panel cd-edit-form" data-studio-editor>
          {cur ? (
            <>
              <div className="cd-edit-top">
                <span>
                  画面 {page} / {n}
                </span>
                <Badge tone="gray">自動保存</Badge>
              </div>
              <label>
                見出し
                <input value={cur.title} disabled={!editable} onChange={(e) => setSlide({ title: e.target.value })} onBlur={commit} />
              </label>
              <label>
                要点
                <textarea value={cur.proposition ?? ""} disabled={!editable} onChange={(e) => setSlide({ proposition: e.target.value })} onBlur={commit} />
              </label>
              <label>
                本文
                <textarea className="large" value={cur.bodyMd} disabled={!editable} onChange={(e) => setSlide({ bodyMd: e.target.value })} onBlur={commit} />
              </label>
              <label>
                もう少し詳しく（任意。患者は開閉して読みます）
                <textarea
                  className="large"
                  data-studio-detail
                  value={cur.detailMd ?? ""}
                  placeholder="空欄のときは「もう少し詳しく」を表示しません"
                  disabled={!editable}
                  onChange={(e) => setSlide({ detailMd: e.target.value })}
                  onBlur={commit}
                />
              </label>
              <div className="cd-illustration-editor">
                <div>
                  <span>医学図解</span>
                  <CIcon name="book" size={30} />
                  <b>医学図解の挿入枠</b>
                  <small>完成画像は自動トリミングしません</small>
                </div>
                <section>
                  <label>
                    図解の状態
                    <select value="未設定" disabled>
                      <option>未設定</option>
                    </select>
                  </label>
                  <label>
                    図解の扱い
                    <small>医学図解は別途登録し、内容の監修（承認）後にだけ患者へ表示します。</small>
                  </label>
                </section>
              </div>
              <div className="cd-evidence-source">
                <CIcon name="file" />
                <span>
                  <b>原資料の根拠</b>
                  <small>{ref ? ref.section || "引用あり" : "根拠の引用なし（要確認）"}</small>
                </span>
                <button disabled={!ref} onClick={() => setEvidenceShown(!evidenceShown)}>
                  {evidenceShown ? "原文を閉じる" : "原文を表示"}
                </button>
              </div>
              {evidenceShown && ref && (
                <blockquote className="cd-editor-source">
                  <b>{local.sources.find((x) => x.id === ref.sourceId)?.title ?? "原資料"}{ref.section ? ` · ${ref.section}` : ""}</b>
                  <p>{ref.quote}</p>
                </blockquote>
              )}
            </>
          ) : (
            local.questions.map((q, qi) => (
              <div className="cd-question-editor" key={q.seq}>
                <div className="cd-edit-top">
                  <span>理解確認 {qi + 1}問目</span>
                  <Badge tone="gray">下書き</Badge>
                </div>
                <label>
                  設問
                  <textarea value={q.stem} disabled={!editable} onChange={(e) => setQuestion(qi, { stem: e.target.value })} onBlur={commit} />
                </label>
                <div className="cd-option-editor">
                  {q.options.map((option, oi) => (
                    <label key={oi}>
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.correctIndex === oi}
                        disabled={!editable}
                        onChange={() => {
                          const next = { ...local, questions: local.questions.map((x, i) => (i === qi ? { ...x, correctIndex: oi } : x)) }
                          setLocal(next)
                          if (editable) void save(next)
                        }}
                      />
                      <span>{["A", "B", "C"][oi]}</span>
                      <input
                        value={option}
                        disabled={!editable}
                        onChange={(e) => setQuestion(qi, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) as [string, string, string] })}
                        onBlur={commit}
                      />
                    </label>
                  ))}
                  <div>
                    <span>?</span>
                    <b>わからない</b>
                    <small>患者には常に表示</small>
                  </div>
                </div>
                <label>
                  正答後・誤答後の解説
                  <textarea className="large" value={q.explanation} disabled={!editable} onChange={(e) => setQuestion(qi, { explanation: e.target.value })} onBlur={commit} />
                </label>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}

function PreviewStep({
  onClose,
  onComplete,
  live,
}: {
  onClose: () => void
  onComplete: () => void
  /** 本番: 下書きをそのまま患者向けの学習画面と同じ構成で表示（学習記録は作らない） */
  live?: { draft: Draft }
}) {
  const [page, setPage] = useState(live ? 1 : 2)
  const [audio, setAudio] = useState(false)
  if (live) {
    const d = live.draft
    const published = d.version.status === "published"
    const publishBlocked = !!d.approvalBlock || d.sources.some((x) => !x.perm?.allowPublish)
    const stateLabel = [published ? null : "未監修", publishBlocked ? "公開不可" : published ? "公開中" : "未公開"].filter(Boolean).join("・")
    const extraTags = (d.material.tags ?? []).filter((t) => t !== d.material.primaryDomain)
    return (
      <div className="cd-studio-step">
        <div className="cd-step-heading">
          <Badge>手順 6</Badge>
          <h2>患者表示をプレビュー</h2>
          <p>患者さんと同じ学習画面で確認します。</p>
        </div>
        <div className="cd-preview-layout">
          <section className="cd-preview-info">
            <h3>プレビューの確認項目</h3>
            <label>
              <input type="checkbox" /> 成人患者に読みやすい表現
            </label>
            <label>
              <input type="checkbox" /> 1画面1主題
            </label>
            <label>
              <input type="checkbox" /> 医学図解と説明文
            </label>
            <label>
              <input type="checkbox" /> 安全上の重要事項
            </label>
            <p>
              <CIcon name="shield" />
              プレビュー操作は患者の学習進捗や回答履歴を変更しません。
            </p>
            <dl className="cd-preview-state" data-preview-state>
              <dt>状態</dt>
              <dd>{stateLabel}</dd>
              <dt>学習領域</dt>
              <dd>
                {areaOf(d.material.primaryDomain)}
                {extraTags.length > 0 && `（タグ: ${extraTags.join("、")}）`}
              </dd>
              <dt>内容</dt>
              <dd>
                {d.slides.length}画面 · 理解確認 {d.questions.length}問
              </dd>
            </dl>
            {/* 下書きの提出（承認依頼）は、従来どおりプレビューの確認後に行う。端末内は患者画面と同じ表示にするため、ここに置く */}
            <div className="cd-preview-actions">
              <button className="cd-primary" onClick={onComplete}>
                {d.version.status === "draft" ? "承認依頼へ" : "承認確認へ"}
              </button>
            </div>
          </section>
          <DDraftPreview key={d.version.id} material={{ title: d.material.title, slides: d.slides, questions: d.questions }} stateLabel={stateLabel} onClose={onClose} />
        </div>
      </div>
    )
  }
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 6</Badge>
        <h2>患者表示をプレビュー</h2>
        <p>患者さんと同じ学習画面で確認します。</p>
      </div>
      <div className="cd-preview-layout">
        <section className="cd-preview-info">
          <h3>プレビューの確認項目</h3>
          <label>
            <input type="checkbox" /> 成人患者に読みやすい表現
          </label>
          <label>
            <input type="checkbox" /> 1画面1主題
          </label>
          <label>
            <input type="checkbox" /> 医学図解と説明文
          </label>
          <label>
            <input type="checkbox" /> 安全上の重要事項
          </label>
          <p>
            <CIcon name="shield" />
            プレビュー操作は患者の学習進捗や回答履歴を変更しません。
          </p>
        </section>
        <div className="cd-patient-preview">
          <header>
            <button onClick={onClose}>閉じる</button>
            <span>{page} / 4</span>
            <button onClick={() => setAudio(!audio)}>
              {audio ? "音声停止" : "音声"}
            </button>
          </header>
          <i>
            <i style={{ width: `${page * 25}%` }} />
          </i>
          <main>
            <p>手術後の腕と傷のケア</p>
            <h2>腕は、無理のない範囲でゆっくり動かします</h2>
            <p>
              手術後は、痛みや傷の状態を見ながら、少しずつ腕を動かします。強い痛みを我慢して動かす必要はありません。
            </p>
            {audio && (
              <div className="cd-preview-audio">読み上げ中 0:18 / 1:24</div>
            )}
            <div className="cd-preview-image">
              <span>医学図解</span>
              <CIcon name="book" size={30} />
              <b>監修済み図解を配置</b>
            </div>
            <small>腕を動かす範囲の目安</small>
            <aside>
              <b>覚えておくこと</b>
              <p>強い痛みがあるときは無理をせず、医療者へ相談してください。</p>
            </aside>
          </main>
          <footer>
            <button
              disabled={page === 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              前へ
            </button>
            <button
              className="cd-primary"
              onClick={() =>
                page === 4 ? onComplete() : setPage(Math.min(4, page + 1))
              }
            >
              {page === 4 ? "承認確認へ" : "次へ"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}

function ApprovalStep({
  checks,
  setChecks,
  state,
  setState,
  notify,
  live,
}: {
  checks: boolean[]
  setChecks: (checks: boolean[]) => void
  state: "editing" | "review" | "published" | "returned"
  setState: (state: "editing" | "review" | "published" | "returned") => void
  notify: (message: string) => void
  /** 本番: 実際の承認・公開・差し戻し・公開停止（承認権限はサーバーで検証） */
  live?: { draft: Draft; busy: boolean; approve: (acknowledgeSafety: boolean) => Promise<void>; returnToDraft: () => Promise<void>; retire: () => Promise<void> }
}) {
  const allChecked = checks.every(Boolean)
  const safetyOpen = live ? live.draft.preCheck.mustCover.safetyUnconfirmed : []
  return (
    <div className="cd-studio-step">
      <div className="cd-step-heading">
        <Badge>手順 7</Badge>
        <h2>医学的承認と公開</h2>
        <p>公開前の最終確認です。承認前の教材は患者に表示されません。</p>
      </div>
      <div className="cd-approval-layout">
        <section className="cd-panel">
          <h3>最終確認</h3>
          {[
            "原資料との整合を確認した",
            "必ず含める内容がすべて含まれている",
            "医学的な正確性を確認した",
            "安全上の重要事項と相談の目安を確認した",
          ].map((label, index) => (
            <label className="cd-approval-check" key={label}>
              <input
                type="checkbox"
                checked={checks[index]}
                onChange={() =>
                  setChecks(
                    checks.map((value, itemIndex) =>
                      itemIndex === index ? !value : value,
                    ),
                  )
                }
              />
              <span>
                <b>{label}</b>
                <small>{index === 3 ? "安全上重要" : "医療者による確認"}</small>
              </span>
            </label>
          ))}
          <div className="cd-approval-meta">
            <div>
              <span>作成者</span>
              <b>{live ? live.draft.creatorName : "山田 太郎 医師"}</b>
            </div>
            <div>
              <span>承認権限</span>
              <b>{live ? (live.draft.role.canApprove ? "施設内教材 承認者" : "承認権限なし") : "施設内教材 承認者"}</b>
            </div>
            <div>
              <span>公開範囲</span>
              <b>{live ? (live.draft.material.scope === "org" ? "当院の患者のみ" : "共通教材") : "当院の患者のみ"}</b>
            </div>
          </div>
          {live && (
            // デモの承認者は架空。本番の医学的監修ではないことを明示
            <p className="cd-demo-approval-note">
              <CIcon name="alert" />
              デモの承認者は架空の承認者です。この承認は本番の医学的監修を意味しません。
              {safetyOpen.length > 0 && ` 安全上の重要事項 ${safetyOpen.length}件が未確認のため、「安全上の重要事項と相談の目安を確認した」の確認をもって承認します。`}
              {live.draft.approvalBlock && ` ${live.draft.approvalBlock}`}
            </p>
          )}
        </section>
        <aside className="cd-panel cd-publish-panel">
          <div className="cd-publish-icon">
            <CIcon
              name={state === "published" ? "check" : "shield"}
              size={38}
            />
          </div>
          <Badge
            tone={
              state === "published"
                ? "green"
                : state === "returned"
                  ? "red"
                  : "amber"
            }
          >
            {state === "published"
              ? "公開済み"
              : state === "returned"
                ? "差し戻し"
                : "承認前・非公開"}
          </Badge>
          <h3>
            {state === "published"
              ? "教材を公開しました"
              : "患者にはまだ表示されません"}
          </h3>
          <p>
            {state === "published"
              ? "承認済み教材として、情報処方ライブラリに追加されました。"
              : "すべての確認を完了し、明示的に承認してください。"}
          </p>
          {live ? (
            state !== "published" ? (
              live.draft.version.status === "in_review" && (
                <>
                  <button
                    className="cd-primary"
                    disabled={!allChecked || live.busy || !live.draft.role.canApprove || !!live.draft.approvalBlock}
                    onClick={() => void live.approve(safetyOpen.length > 0)}
                  >
                    <CIcon name="check" />
                    医学的に承認して公開
                  </button>
                  <button className="cd-return" disabled={live.busy || !live.draft.role.canApprove} onClick={() => void live.returnToDraft()}>
                    修正のため差し戻す
                  </button>
                </>
              )
            ) : (
              <button className="cd-secondary" disabled={live.busy} onClick={() => void live.retire()}>
                公開を停止
              </button>
            )
          ) : (
            <>
          {state !== "published" && (
            <>
              <button
                className="cd-primary"
                disabled={!allChecked}
                onClick={() => {
                  setState("published")
                  notify("医学的承認が完了し、教材を公開しました")
                }}
              >
                <CIcon name="check" />
                医学的に承認して公開
              </button>
              <button
                className="cd-return"
                onClick={() => setState("returned")}
              >
                修正のため差し戻す
              </button>
            </>
          )}
          {state === "published" && (
            <button
              className="cd-secondary"
              onClick={() => setState("editing")}
            >
              公開を停止して編集へ戻す
            </button>
          )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
