import { treatmentLine } from "@/lib/treatment"
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { ClinicianLive } from "./live"
import type { ClinicianRecord, LiveConcern, LiveLibraryItem } from "./record"
import { SAFETY_KINDS, type Draft, type MustCandidate, type StudioLive } from "./studio"
import { DDraftPreview } from "./PatientD"
import { areaOf, patientSetName } from "./learning"
import { setCoverFor } from "./thumbnails"
import { ShioriLogo } from "./ShioriLogo"
import { VITAL_FLAG_NOTE, vitalFlag } from "@/lib/recommend"
import {
  currentVisitDate,
  formatShortDate,
  intervisitEvents,
  previousVisitDate,
  severityLabels,
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
  // 画面を切り替えたら先頭から表示する（前の画面のスクロール位置を引き継がない）
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [workspace])
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
    setStudioStep(2)
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
                    // 未解決の質問の数（患者が「聞けた」にすると減る。医療者側では変えない）
                    record.questions.filter((q) => !q.resolved).length > 0 && (
                      <i title="未解決の質問" key={record.questions.filter((q) => !q.resolved).length} className="cd-pop">{record.questions.filter((q) => !q.resolved).length}</i>
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
            <main className="cd-main" ref={mainRef}>
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
                  onOpenStudio={() => setWorkspace("studio")}
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
                  <li><span aria-hidden="true">1</span>ログイン済みのスマートフォンの標準カメラで、患者の QR を読み取る</li>
                  <li><span aria-hidden="true">2</span>開いた shiori の画面から申請が送られる</li>
                  <li><span aria-hidden="true">3</span>この画面が「患者の承認を待っています」に切り替わる</li>
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
              <p>5分間・1回限り。患者が申請者を確認して承認したときに共有が始まります。</p>
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
        // 候補を選んであれば教材ライブラリを経由せず、確認画面へ直行（手数を 1 つ減らす）
        onPrescribe={() => setPage(prescription.length ? "review" : "prescribe")}
        onOpenCourse={onOpenCourse}
        prescription={prescription}
        onAddToPrescription={(id) => {
          if (!prescription.includes(id)) setPrescription([...prescription, id])
          notify("処方に追加しました")
        }}
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

function LiveIntervisit({ record, onOpenCourse, embedded = false }: { record: ClinicianRecord; onOpenCourse?: () => void; embedded?: boolean }) {
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
    // 診察サマリー（LiveSummary）に埋め込まれているときは、親が同じ期間で読み込む
    if (embedded) return
    void record.loadIntervisit(period)
    // 要約は構造化データと同じ期間で 1 回生成（同じデータならサーバーが再利用。元データが変わっていれば再生成）
    void record.loadAiSummary(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.from, period?.to, record.sessionId, embedded])
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
    <section className={`cd-intervisit${embedded ? " cd-intervisit-embedded" : ""}`} data-intervisit>
      <div className="cd-intervisit-head" hidden={embedded}>
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
      {!embedded && periodEditor}
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
  const [overlayAll, setOverlayAll] = useState(false)
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
      // 血圧は「上/下」を 1 行に（色の目安は上下の強い方）
      key: "systolic",
      label: "血圧",
      unit: "mmHg",
      value: (record?: HealthRecord) => record?.vitals.systolic,
      display: (record?: HealthRecord) => (record?.vitals.systolic === undefined ? undefined : `${record.vitals.systolic}/${record.vitals.diastolic ?? "–"}`),
      flagOf: (record: HealthRecord) => Math.max(vitalFlag("systolic", Number(record.vitals.systolic)), record.vitals.diastolic === undefined ? 0 : vitalFlag("diastolic", Number(record.vitals.diastolic))),
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
    {
      key: "oxygenFlow",
      label: "酸素投与量",
      unit: "L/分",
      value: (record?: HealthRecord) => record?.vitals.oxygenFlow,
    },
  ].filter((row) => row.key !== "oxygenFlow" || records.some((record) => record.vitals.oxygenFlow !== undefined)) as {
    key: string
    label: string
    unit: string
    value: (record?: HealthRecord) => number | undefined
    display?: (record?: HealthRecord) => string | undefined
    flagOf?: (record: HealthRecord) => number
  }[]
  const cellText = (row: (typeof vitalRows)[number], record?: HealthRecord) => (row.display ? row.display(record) : row.value(record))
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
  /** 症状ごとの点と線分（隣の日は実線、間に記録のない日があれば破線で結ぶ。欠測の日に点は置かない） */
  const seriesFor = (id: string) => {
    const n = Math.max(dates.length, 1)
    const xOf = (measuredAt: string) => {
      const day = dates.indexOf(measuredAt.slice(0, 10))
      const [h, m] = measuredAt.slice(11, 16).split(":").map(Number)
      const frac = Number.isFinite(h) ? ((h || 0) * 60 + (m || 0)) / 1440 : 0.5
      return { day, x: 35 + ((day + frac) / n) * 620 }
    }
    const points = chartRecords
      .filter((record) => record.symptoms[id])
      .map((record) => ({ ...xOf(record.measuredAt), value: record.symptoms[id].severity, at: record.measuredAt }))
      .filter((p) => p.day >= 0)
    const links: { a: (typeof points)[number]; b: (typeof points)[number]; gap: boolean }[] = []
    for (let k = 1; k < points.length; k++) links.push({ a: points[k - 1], b: points[k], gap: points[k].day - points[k - 1].day > 1 })
    return { id, points, links }
  }
  const liveChart = live ? seriesFor(chartSymptom) : null
  const overlaySeries = live && overlayAll ? symptomIds.map(seriesFor).filter((x) => x.points.length > 0) : []
  const overlayColors = ["#3f7180", "#ba6e63", "#9a7135", "#6f6489", "#4f785b", "#a15349", "#527f89", "#8a672f"]

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
            バイタル推移
          </button>
          <button
            className={view === "symptom" ? "active" : ""}
            onClick={() => setView("symptom")}
          >
            症状推移
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
                        const flag = last ? (row.flagOf ? row.flagOf(last) : vitalFlag(row.key, Number(row.value(last)))) : 0
                        return (
                          <td key={date}>
                            <button
                              disabled={!last}
                              className={flag ? `vflag${flag}` : ""}
                              data-vital-flag={last ? flag : undefined}
                              onClick={() =>
                                setSelected({
                                  record: last,
                                  label: row.label,
                                  value: `${cellText(row, last)} ${row.unit}`,
                                  entries: measured.map((record) => ({ at: timeOf(record), value: `${cellText(row, record)} ${row.unit}` })),
                                })
                              }
                            >
                              {last ? cellText(row, last) : "—"}
                              {measured.length > 1 && <sup>×{measured.length}</sup>}
                            </button>
                          </td>
                        )
                      }
                      const record = recordByDate[date]
                      const value = cellText(row, record)
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
            {live && (
              <>
                <span className="vflag1">
                  <i>!</i>バイタル 注意の目安
                </span>
                <span className="vflag2">
                  <i>!!</i>バイタル 要確認の目安
                </span>
              </>
            )}
          </div>
          {live && <p className="cd-course-flag-note" title={VITAL_FLAG_NOTE}>色付きは一般的な目安の範囲外（体温 37.5℃以上、血圧 140 以上、脈拍 100 以上、SpO₂ 95%以下など）</p>}
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
              value={overlayAll ? "__all" : chartSymptom}
              onChange={(event) => {
                if (event.target.value === "__all") return setOverlayAll(true)
                setOverlayAll(false)
                setChartSymptom(event.target.value)
              }}
              data-symptom-select
            >
              {live && <option value="__all">すべての症状を重ねる</option>}
              {symptomIds.map((id) => (
                <option key={id} value={id}>
                  {symptomLabel(id)}
                </option>
              ))}
            </select>
          </div>
          {live && overlayAll && (
            <div className="cd-overlay-legend" data-overlay-legend>
              {overlaySeries.map((sr, i) => (
                <span key={sr.id}>
                  <i style={{ background: overlayColors[i % overlayColors.length] }} />
                  {symptomLabel(sr.id)}
                </span>
              ))}
            </div>
          )}
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
                {(overlayAll ? overlaySeries : [liveChart]).map((sr, si) => {
                  const color = overlayAll ? overlayColors[si % overlayColors.length] : undefined
                  return (
                    <g key={sr.id} style={color ? { stroke: color } : undefined}>
                      {sr.links.map((l) => (
                        <line key={`${l.a.at}-${l.b.at}`} x1={l.a.x} y1={135 - l.a.value * 27} x2={l.b.x} y2={135 - l.b.value * 27} className={l.gap ? "cd-gap" : "cd-link"} data-chart-segment={l.gap ? "gap" : "solid"} />
                      ))}
                      {sr.points.map((p) => (
                        <circle key={p.at} cx={p.x} cy={135 - p.value * 27} r={overlayAll ? 4 : 5} style={color ? { stroke: color } : undefined}>
                          <title>{`${symptomLabel(sr.id)} ${formatShortDate(p.at)} ${p.value} / 4（${severityLabels[p.value]}）`}</title>
                        </circle>
                      ))}
                    </g>
                  )
                })}
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
              ? "0は「なし」（患者が記録した値）です。記録のある点どうしを線で結び、間に記録のない日があるところは破線です。線の途中は実測値ではなく、記録のない日を「症状なし」とは扱いません。"
              : "記録がある日のみ線で結んでいます。間の日を「症状なし」とは扱いません。"}
          </p>
        </section>
      )}
      <p className="cd-course-safety">
        <CIcon name="shield" />
        0〜4 は患者の自己申告（CTCAE Grade ではありません）。24 時間監視や自動診断は行いません。
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
          <h2>バイタル推移</h2>
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
            // 記録のある点どうしを続けて結ぶ。間にその指標を測らなかった日があるところは別の線（破線）にして、欠測を連続測定のように見せない
            const solidParts: string[] = []
            const gapParts: string[] = []
            let previous: {
              record: HealthRecord
              index: number
              value: number
            } | undefined
            const dayIndex = (iso: string) => Math.floor(new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() / 86400000)
            values.forEach((item) => {
              const x = xFor(item.record.measuredAt)
              const y = yFor(item.value, metric.min, metric.max)
              if (previous) {
                const gap = breakGaps && dayIndex(item.record.measuredAt) - dayIndex(previous.record.measuredAt) > 1
                const px = xFor(previous.record.measuredAt)
                const py = yFor(previous.value, metric.min, metric.max)
                ;(gap ? gapParts : solidParts).push(`M ${px} ${py} L ${x} ${y}`)
              }
              previous = item
            })
            return (
              <g key={metric.key} className={`metric ${metric.key}`}>
                <path
                  d={solidParts.join(" ")}
                  fill="none"
                  stroke={metric.color}
                  strokeDasharray={metric.dash}
                />
                <path d={gapParts.join(" ")} fill="none" stroke={metric.color} strokeDasharray="3 5" opacity={0.6} data-vital-gap />
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
        異なる単位の指標を、変化を比較するため個別スケールで重ねています。各線は記録された測定点同士を結ぶ視覚ガイドで、線上の中間位置は実測値ではありません。間に測定のない日がある区間は細い破線です。
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
  prescription = [],
  onAddToPrescription,
}: {
  scenario: ClinicalScenario
  healthRecords: HealthRecord[]
  record?: ClinicianRecord
  onConcern: (id: number | string) => void
  onPrescribe: () => void
  onOpenCourse?: () => void
  prescription?: (number | string)[]
  onAddToPrescription?: (id: string) => void
}) {
  const [areaDetail, setAreaDetail] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<number | string | null>(null)
  const [expandedCheck, setExpandedCheck] = useState<number | string | null>(null)
  // 本番: サマリーを開くたびに最新の学習記録を読み直す（本番の表示は LiveSummary が自分で読み直す）
  useEffect(() => {
    if (!record?.summary) void record?.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 本番: 2026-11 の見直し（S・O → 質問・確認事項 → 理解度・AI リコメンド）
  if (record?.summary) return <LiveSummary record={record} onConcern={onConcern} onPrescribe={onPrescribe} onOpenCourse={onOpenCourse} prescription={prescription} onAddToPrescription={onAddToPrescription} />
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
      {/* 開発用プロトタイプ（実データなし）: この診察サマリーは Figma 時点の旧レイアウト。最新の画面は実データ（/staff で患者と共有）と公開デモで表示される */}
      {!record?.summary && (
        <p className="cd-studio-env" data-proto-summary-note role="note">
          <CIcon name="alert" size={14} />
          開発用プロトタイプの診察サマリーは旧レイアウトです。最新の診察サマリー（診察の順に 1 体調 → 2 質問 → 3 理解 → 4 処方）は、医療者ログイン（/staff）で患者と共有したときと公開デモで表示されます。
        </p>
      )}
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


/** 日付の短い表示（M/D） */
const mdOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 本番の診察サマリー（2026-11 の見直し）。多忙な外来で「患者の今の状況」と「この患者に今足りていない情報」が一目でわかる並びにする。
 * 1. S・O（自覚症状・バイタルの最新と推移）→ 2. 患者の質問・理解につまずいたこと → 3. 理解度（合計の正答率を大きく、押すと内訳）と AI の情報処方リコメンド。
 * AI 外来間サマリー（要約・根拠・タイムライン）は折りたたみ。観察期間はここで選び、在宅経過表と共有する。
 */
function LiveSummary({
  record,
  onConcern,
  onPrescribe,
  onOpenCourse,
  prescription,
  onAddToPrescription,
}: {
  record: ClinicianRecord
  onConcern: (id: number | string) => void
  onPrescribe: () => void
  onOpenCourse?: () => void
  prescription: (number | string)[]
  onAddToPrescription?: (id: string) => void
}) {
  const { period, setPeriod } = record
  const [periodEdit, setPeriodEdit] = useState(false)
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null)
  const [understandingOpen, setUnderstandingOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [resolvedOpen, setResolvedOpen] = useState(false)
  const [openQuestion, setOpenQuestion] = useState<string | number | null>(null)
  const [openCheck, setOpenCheck] = useState<string | number | null>(null)
  // 本番: サマリーを開くたびに最新の学習記録とリコメンドを読み直す
  useEffect(() => {
    void record.reload()
    void record.loadRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.sessionId])
  useEffect(() => {
    void record.loadIntervisit(period)
    void record.loadAiSummary(period)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.from, period?.to, record.sessionId])
  const periodKey = period ? `?from=${period.from}&to=${period.to}` : ""
  const data = record.intervisitKey === periodKey ? record.intervisit : null
  const iv = data?.intervisit ?? null
  const summary = record.summary!
  const maxDay = record.defaultTo
  const openPeriodEditor = () => {
    const to = record.defaultTo ?? localDate(new Date())
    const from = new Date(`${to}T00:00:00`)
    from.setDate(from.getDate() - 13)
    setDraft(period ?? (iv ? { from: iv.period.from, to: iv.period.to } : { from: localDate(from), to }))
    setPeriodEdit(!periodEdit)
  }
  // S: 症状（記録のあるもの。最大の程度が高い順）
  const symptoms = iv ? [...iv.symptoms].filter((x) => x.count > 0).sort((a, b) => b.max - a.max || b.count - a.count) : []
  const symptomTrend = (sym: (typeof symptoms)[number]) => {
    const e = [...sym.entries].sort((a, b) => a.at.localeCompare(b.at))
    const first = e[0]
    const last = e[e.length - 1]
    return { first, last, peak: e.reduce((m, x) => (x.severity > m.severity ? x : m), e[0]) }
  }
  // O: バイタル（期間内の最新値と範囲、目安の色）
  // バイタルの枠: 体温・血圧（上/下を 1 枠に）・脈拍・SpO₂
  const vitalRows = iv
    ? (["temperature", "systolic", "pulse", "spo2"] as const).map((k) => {
        const m = iv.vitals.metrics[k]
        const last = m?.values[m.values.length - 1] ?? null
        // 最も悪かった記録: 目安の段階が高いもの → 同じなら体温・血圧・脈拍は高い方、SpO₂ は低い方
        const worst = (m?.values ?? []).reduce<{ at: string; value: number } | null>((w, v) => {
          if (!w) return v
          const fw = vitalFlag(k, w.value)
          const fv = vitalFlag(k, v.value)
          if (fv !== fw) return fv > fw ? v : w
          return k === "spo2" ? (v.value < w.value ? v : w) : v.value > w.value ? v : w
        }, null)
        const row = { key: k, label: m?.label ?? k, unit: m?.unit ?? "", last, worst: worst && last && worst.at !== last.at && worst.value !== last.value ? worst : null, count: m?.count ?? 0, flag: last ? vitalFlag(k, last.value) : 0, display: last ? `${last.value}` : "—" }
        if (k !== "systolic") return row
        const d = iv.vitals.metrics.diastolic
        const dLast = d?.values[d.values.length - 1] ?? null
        return {
          ...row,
          label: "血圧",
          display: last ? `${last.value}/${dLast ? dLast.value : "–"}` : "—",
          flag: Math.max(row.flag, dLast ? vitalFlag("diastolic", dLast.value) : 0),
          worst: null,
        }
      })
    : []
  // 質問: 未解決を先に（新しい順）。「聞けた」は折りたたみ
  const questionsOpen = record.questions.filter((q) => !q.resolved)
  const questionsResolved = record.questions.filter((q) => q.resolved)
  // 理解確認: 「説明した」を付けた設問は折りたたみへ（正答率は変わらない）
  const checks = record.checks.filter((c) => !c.resolved)
  const checksExplained = record.checks.filter((c) => c.resolved)
  const [explainedOpen, setExplainedOpen] = useState(false)
  const explainCheck = async (id: string) => {
    setResolving(id)
    await Promise.all([record.setCheckExplained(id, true), new Promise((r) => setTimeout(r, 220))])
    setResolving(null)
  }
  // 理解度: 合計の正答率（回答がなければ出さない）
  const answered = summary.answers.length
  const correct = summary.answers.filter((a) => a.isCorrect).length
  const pct = answered ? Math.round((correct / answered) * 100) : null
  const unknownCount = summary.answers.filter((a) => a.isUnknown).length
  const wrongCount = answered - correct - unknownCount
  const reco = record.recommendations
  // 要点の帯: 1 画面目で「強い・悪化した症状」「未解決の質問」「つまずいた設問」「推薦」の数を示し、押すとその欄へ
  const worsened = symptoms.filter((sym) => {
    const t = symptomTrend(sym)
    return t.last.severity >= 3 || (sym.count > 1 && t.last.severity > t.first.severity)
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const jump = (selector: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(selector)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    // 移動先を 1 秒だけ淡く光らせる（reduced-motion では CSS 側で止まる）
    el.classList.remove("cd-jump-target")
    void el.offsetWidth
    el.classList.add("cd-jump-target")
    window.setTimeout(() => el.classList.remove("cd-jump-target"), 1100)
  }
  // 質問を「解決」に（診察で答えたらその場で消す。数字も減る）。原文は変えない
  const [resolving, setResolving] = useState<string | null>(null)
  const swipeStart = useRef<{ id: string; x: number; y: number } | null>(null)
  // 患者が登録した「がん種 · 今の治療 · 何日目」（登録がなければ出さない）
  const treatmentText = record.treatment ? treatmentLine(record.treatment.profile, record.treatment.events, record.treatment.today) : null
  const resolveQuestion = async (id: string) => {
    setResolving(id)
    // 行が左へ消える動き（220ms）を見せてから一覧から外す。API 呼び出しと並行
    await Promise.all([record.setQuestionStatus(id, "resolved"), new Promise((r) => setTimeout(r, 220))])
    setResolving(null)
  }
  return (
    <div className="cd-content cd-summary cd-summary-v2" data-summary-v2 ref={rootRef}>
      <div className="cd-title-row">
        <div>
          <h1>診察サマリー</h1>
          <p className="cd-period-line" data-period-line>
            <b>観察期間</b>
            {iv ? (
              <>
                <span>
                  {iv.fmt.from}〜{iv.fmt.to}
                </span>
                <small>{iv.period.isDefault ? iv.period.label : `指定期間（${iv.period.days}日間）`}</small>
              </>
            ) : (
              <span>{period ? `${period.from.replaceAll("-", "/")}〜${period.to.replaceAll("-", "/")}（読み込んでいます…）` : "読み込んでいます…"}</span>
            )}
            <button className="cd-text-back" onClick={openPeriodEditor}>
              期間を変更
            </button>
          </p>
          {treatmentText && (
            <p className="cd-treatment-line" data-treatment-line>
              <b>治療</b>
              {treatmentText}
            </p>
          )}
        </div>
        <button
          className="cd-score-main cd-score-hero"
          data-understanding
          aria-expanded={understandingOpen}
          disabled={answered === 0}
          onClick={() => {
            setUnderstandingOpen(!understandingOpen)
            if (!understandingOpen) window.setTimeout(() => jump("[data-checks]"), 50)
          }}
          title={pct === null ? "理解確認の回答なし（0%とは表示しません）" : `${answered}問中 ${correct}問正答 · 不正解 ${wrongCount} · わからない ${unknownCount}。押すと領域別`}
        >
          <small>理解確認の正答率</small>
          <b data-understanding-pct>{pct === null ? "—" : `${pct}%`}</b>
          <span>{pct === null ? "回答なし" : `${answered}問中 ${correct}問正答`}</span>
        </button>
      </div>
      {periodEdit && draft && (
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
            前回外来日が確認できないため、期間は医療者が選択します。{" "}
            <button
              className="cd-text-back"
              onClick={() => {
                setPeriod(draft)
                setPeriodEdit(false)
              }}
            >
              この期間で表示
            </button>
          </p>
        </div>
      )}

      {iv && (
        <nav className="cd-points cd-flow" data-points aria-label="診察の流れ">
          <div className="cd-flow-step">
            <i>1</i>
            <span>体調</span>
            <button className={worsened.length ? "warn" : ""} onClick={() => jump("[data-so]")} data-point="symptoms">
              <b key={worsened.length} className="cd-pop">{worsened.length}</b>
              強い・悪化した症状
            </button>
          </div>
          <div className="cd-flow-step">
            <i>2</i>
            <span>質問</span>
            <button className={questionsOpen.length ? "warn" : ""} onClick={() => jump("[data-questions]")} data-point="questions">
              <b key={questionsOpen.length} className="cd-pop">{questionsOpen.length}</b>
              未解決の質問
            </button>
          </div>
          <div className="cd-flow-step">
            <i>3</i>
            <span>理解</span>
            <button className={wrongCount + unknownCount ? "warn" : ""} onClick={() => jump("[data-checks]")} data-point="checks">
              <b key={wrongCount + unknownCount} className="cd-pop">{wrongCount + unknownCount}</b>
              つまずいた設問
            </button>
          </div>
          <div className="cd-flow-step">
            <i>4</i>
            <span>処方</span>
            <button onClick={() => jump("[data-recommendations]")} data-point="recommendations">
              <b>{reco ? reco.items.length : "…"}</b>
              処方の候補
            </button>
          </div>
        </nav>
      )}

      {/* 1. S・O: 患者の今の状況 */}
      <section className="cd-panel cd-so" data-so>
        <div className="cd-panel-head">
          <div className="cd-head-step">
            <i className="cd-step-no">1</i>
            <h2>在宅での体調</h2>
          </div>
          {onOpenCourse && (
            <button className="cd-so-course" onClick={onOpenCourse}>
              在宅経過表・グラフ
              <CIcon name="arrow" size={14} />
            </button>
          )}
        </div>
        {!iv ? (
          <p className="cd-so-loading">読み込んでいます…</p>
        ) : (
          <div className="cd-so-grid">
            <div className="cd-so-col" data-so-symptoms>
              <h3>
                S　自覚症状 <small>0〜4・本人の評価</small>
              </h3>
              {symptoms.length === 0 ? (
                <p className="cd-so-none">この期間に症状の記録はありません</p>
              ) : (
                <ul className="cd-so-symptoms">
                  {symptoms.slice(0, 6).map((sym) => {
                    const t = symptomTrend(sym)
                    const delta = t.last.severity - t.first.severity
                    return (
                      <li key={sym.key} data-so-symptom={sym.key}>
                        <b>{sym.name}</b>
                        <span className={`cd-sev s${t.last.severity}`} title="直近の記録">
                          {t.last.severity}
                        </span>
                        <small>
                          {mdOf(t.last.at)}
                          {sym.count > 1 && (
                            <em className={`cd-trend ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`} title={delta > 0 ? "初回より強い" : delta < 0 ? "初回より軽い" : "変わらず"}>
                              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}
                            </em>
                          )}
                          {sym.max > t.last.severity ? ` · 最大 ${sym.max}（${mdOf(t.peak.at)}）` : ""}
                          {` · ${sym.count}回`}
                        </small>
                        <span className="cd-so-spark" aria-hidden="true">
                          {[...sym.entries]
                            .sort((a, b) => a.at.localeCompare(b.at))
                            .slice(-8)
                            .map((e) => (
                              <i key={e.sourceId} className={`s${e.severity}`} style={{ height: `${4 + e.severity * 3}px` }} />
                            ))}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {symptoms.length > 6 && <small className="cd-so-more">ほか {symptoms.length - 6} 症状は在宅経過表で</small>}
            </div>
            <div className="cd-so-col" data-so-vitals>
              <h3>
                O　バイタル <small>期間内 {iv.vitals.recordDays}日・{iv.vitals.recordCount}件</small>
              </h3>
              {iv.vitals.recordCount === 0 ? (
                <p className="cd-so-none">この期間にバイタルの記録はありません</p>
              ) : (
                <ul className="cd-so-vitals">
                  {vitalRows.map((v) => (
                    <li key={v.key} className={`flag${v.flag}`} data-so-vital={v.key}>
                      <small>{v.label}</small>
                      <b>{v.display}</b>
                      <em>{v.unit}</em>
                      <span>{v.last ? `${mdOf(v.last.at)}${v.worst ? ` · 最も悪い ${v.worst.value}（${mdOf(v.worst.at)}）` : ""}` : "記録なし"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <small className="cd-so-note" title={VITAL_FLAG_NOTE}>色付きは一般的な目安の範囲外（体温 37.5℃以上、血圧 140 以上、脈拍 100 以上、SpO₂ 95%以下など）</small>
            </div>
          </div>
        )}
      </section>

      <div className="cd-clinical-grid cd-clinical-grid-v2">
        <div className="cd-clinical-main">
          {/* 2. 患者の質問 */}
          <section className="cd-panel cd-question-priority" data-questions>
            <div className="cd-panel-head">
              <div className="cd-head-step">
                <i className="cd-step-no">2</i>
                <h2>患者が診察で聞きたいこと</h2>
              </div>
              <Badge tone={questionsOpen.length ? "purple" : "green"}>{questionsOpen.length ? `${questionsOpen.length}件` : "質問なし"}</Badge>
            </div>
            {questionsOpen.length ? (
              <div className="cd-question-list">
                {questionsOpen.map((item, index) => (
                  <article
                    key={item.id}
                    data-question-id={item.id}
                    className={resolving === item.id ? "resolving" : ""}
                    // 診察で答えたら、左へスワイプ（横 80px 以上・縦 30px 未満）でも「解決」にできる
                    onTouchStart={(event) => {
                      const t = event.touches[0]
                      swipeStart.current = t ? { id: item.id, x: t.clientX, y: t.clientY } : null
                    }}
                    onTouchEnd={(event) => {
                      const st = swipeStart.current
                      swipeStart.current = null
                      const t = event.changedTouches[0]
                      if (!st || st.id !== item.id || !t) return
                      if (st.x - t.clientX >= 80 && Math.abs(t.clientY - st.y) < 30) void resolveQuestion(item.id)
                    }}
                  >
                    <button className="cd-question-toggle" onClick={() => setOpenQuestion(openQuestion === item.id ? null : item.id)} aria-expanded={openQuestion === item.id}>
                      <span className="cd-question-number">{index + 1}</span>
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.source}
                          {item.materialTitle ? ` · 教材「${item.materialTitle}」から` : " · 自由な質問"}
                        </small>
                      </span>
                      <span>{openQuestion === item.id ? "閉じる" : "詳細"}</span>
                    </button>
                    <button className="cd-question-resolve" data-question-resolve onClick={() => void resolveQuestion(item.id)} disabled={resolving === item.id} aria-label="この質問を解決にする" title="診察で答えたら解決に（左スワイプでも）">
                      <CIcon name="check" size={14} />
                      解決
                    </button>
                    {openQuestion === item.id && (
                      <div className="cd-question-expanded">
                        <p>{item.detail}</p>
                        {item.related && (
                          <p>
                            関連する理解確認: 「{item.related.stem}」 · 回答「{item.related.answer}」
                          </p>
                        )}
                        <div>
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
                  <b>未解決の質問はありません</b>
                  <small>対応操作は必要ありません</small>
                </span>
              </div>
            )}
            {questionsResolved.length > 0 && (
              <button className="cd-text-back cd-resolved-toggle" aria-expanded={resolvedOpen} onClick={() => setResolvedOpen(!resolvedOpen)}>
                {resolvedOpen ? "閉じる" : `解決した質問（${questionsResolved.length}件）`}
              </button>
            )}
            {resolvedOpen && (
              <ul className="cd-resolved-list">
                {questionsResolved.map((q) => (
                  <li key={q.id}>
                    「{q.title}」<small>{q.source}</small>
                    {q.id.startsWith("note:") && (
                      <button className="cd-text-back" onClick={() => void record.setQuestionStatus(q.id, "unread")} data-question-reopen>
                        戻す
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {/* 3. 理解につまずいたこと */}
          <section className="cd-panel cd-understanding cd-score cd-score-inline" data-checks>
            <div className="cd-panel-head">
              <div className="cd-head-step">
                <i className="cd-step-no">3</i>
                <h2>理解につまずいたこと</h2>
                <Badge tone={checks.length ? "amber" : "green"}>{answered === 0 ? "未回答" : checks.length ? `${checks.length}件` : "要確認なし"}</Badge>
              </div>
              {answered > 0 && (
                <button type="button" className="cd-text-back" onClick={() => setUnderstandingOpen(!understandingOpen)} aria-expanded={understandingOpen}>
                  {understandingOpen ? "領域別を閉じる" : "領域別を見る"}
                </button>
              )}
            </div>
            {answered === 0 ? (
              <div className="cd-unanswered">
                <CIcon name="help" />
                <div>
                  <b>確認問題は未回答です</b>
                  <p>理解確認への回答はまだありません。理解度0%とは表示しません。</p>
                </div>
              </div>
            ) : checks.length ? (
              <div className="cd-check-list">
                {checks.map((item) => (
                  <article key={item.id} data-check-id={item.id} className={resolving === item.id ? "resolving" : ""}>
                    <button onClick={() => setOpenCheck(openCheck === item.id ? null : item.id)} aria-expanded={openCheck === item.id}>
                      <Badge tone={item.tone}>{item.type}</Badge>
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.materialTitle} · 回答「{item.answer}」
                        </small>
                      </span>
                      <span>{openCheck === item.id ? "閉じる" : "詳細"}</span>
                    </button>
                    <button className="cd-question-resolve cd-check-resolve" data-check-resolve onClick={() => void explainCheck(item.id)} disabled={resolving === item.id} aria-label="この設問を説明済みにする" title="診察で説明したら一覧から外す（正答率は変わりません）">
                      <CIcon name="check" size={14} />
                      説明した
                    </button>
                    {openCheck === item.id && (
                      <div className="cd-check-expanded">
                        <p>
                          <b>正答・解説：</b>「{item.correct}」 {item.explanation ?? ""}
                        </p>
                        <p>
                          <b>回答：</b>
                          {item.source}
                        </p>
                        <div>
                          <span>関連教材：{item.materialTitle}</span>
                          <button onClick={() => onConcern(item.id)}>詳しく確認</button>
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
                  <b>{checksExplained.length ? "残りの設問はすべて説明済みです" : "誤答・「わからない」はありません"}</b>
                  <small>追加の確認操作は必要ありません</small>
                </span>
              </div>
            )}
            {checksExplained.length > 0 && (
              <button className="cd-text-back cd-resolved-toggle" aria-expanded={explainedOpen} onClick={() => setExplainedOpen(!explainedOpen)} data-check-explained-toggle>
                {explainedOpen ? "閉じる" : `説明した設問（${checksExplained.length}件）`}
              </button>
            )}
            {explainedOpen && (
              <ul className="cd-resolved-list" data-check-explained-list>
                {checksExplained.map((c) => (
                  <li key={c.id}>
                    「{c.title}」<small>{c.materialTitle}</small>
                    <button className="cd-text-back" onClick={() => void record.setCheckExplained(c.id, false)} data-check-reopen>
                      戻す
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {understandingOpen && (
              <div className="cd-score-detail" data-understanding-detail>
                <h3>領域別</h3>
                <div className="cd-area-compact">
                  {record.areas.map((area) => (
                    <div key={String(area[0])} className={`cd-area-line ${cdAreaTone(String(area[0]))}`}>
                      <span>
                        <b>{area[0]}</b>
                        <small>学習 {area[1]}</small>
                      </span>
                      <span>
                        <small>確認問題</small>
                        <b>{area[2]}</b>
                      </span>
                      <Badge tone={area[3] === "なし" ? "gray" : "amber"}>{area[3]}</Badge>
                    </div>
                  ))}
                </div>
                <p className="cd-clinical-note">
                  <CIcon name="shield" />
                  学習進捗と確認問題は別の指標です。医学的理解を断定しません。
                </p>
              </div>
            )}
          </section>
        </div>
        <aside className="cd-clinical-side">
          {/* AI 情報処方リコメンド */}
          <section className="cd-panel cd-reco" data-recommendations>
            <div className="cd-panel-head">
              <div className="cd-head-step">
                <i className="cd-step-no">4</i>
                <h2>次の診察までの情報処方</h2>
              </div>
            </div>
            {!reco && record.recommendationsLoading && <p className="cd-so-loading">候補を整理しています…</p>}
            {reco && reco.items.length === 0 && <p className="cd-so-none">{reco.note ?? "候補はありません"}</p>}
            {reco && reco.items.length > 0 && (
              <ol className="cd-reco-list">
                {reco.items.map((item, index) => {
                  const added = prescription.includes(item.materialId)
                  const nowPrescribed = record.library?.find((l) => l.id === item.materialId)?.prescribedNow
                  return (
                    <li key={item.materialId} data-reco-item={item.materialId} className={cdAreaTone(record.library?.find((l) => l.id === item.materialId)?.area)}>
                      <span className="cd-reco-no">{index + 1}</span>
                      <div>
                        <b>{item.title}</b>
                        {item.rePrescribe && <Badge tone="purple">再処方</Badge>}
                        <p>{item.aiReason ?? item.reasons[0]?.text}</p>
                        {!item.aiReason && item.reasons.length > 1 && <small>{item.reasons.slice(1, 3).map((r) => r.text).join(" / ")}</small>}
                        {item.aiReason && <small>根拠: {item.reasons.map((r) => r.text).join(" / ")}</small>}
                      </div>
                      {nowPrescribed ? (
                        <span className="cd-reco-added">処方済み</span>
                      ) : (
                        <button className={added ? "selected" : ""} disabled={added || !onAddToPrescription} onClick={() => onAddToPrescription?.(item.materialId)} data-reco-add>
                          <CIcon name={added ? "check" : "plus"} size={14} />
                          {added ? "追加済み" : "処方に追加"}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
            <div className="cd-reco-actions">
              <button className="cd-primary" onClick={onPrescribe}>
                {prescription.length ? `選択中 ${prescription.length}件を確認` : "教材ライブラリで選ぶ"}
                <CIcon name="arrow" />
              </button>
              <button className="cd-text-back" disabled={record.recommendationsLoading} onClick={() => void record.loadRecommendations({ regenerate: true })}>
                {record.recommendationsLoading ? "更新中…" : "候補を更新"}
              </button>
            </div>
          </section>
          {/* AI 外来間サマリー（折りたたみ） */}
          <section className="cd-panel cd-ai-fold" data-ai-fold>
            <button className="cd-ai-fold-toggle" aria-expanded={aiOpen} onClick={() => setAiOpen(!aiOpen)}>
              <span>
                <CIcon name="studio" size={18} />
                <b>AI外来間サマリー</b>
                <small>要約・根拠・タイムライン</small>
              </span>
              <span>{aiOpen ? "閉じる" : "開く"}</span>
            </button>
            {aiOpen && <LiveIntervisit record={record} onOpenCourse={onOpenCourse} embedded />}
          </section>
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

/** セットの行の表紙（患者側のセット詳細と同じ public/covers の画像。患者向けのセット名で引く。登録がなければ何も出さない） */
function SetCoverThumb({ name }: { name: string }) {
  const cover = setCoverFor(patientSetName(name))
  if (!cover) return null
  return (
    <span className="cd-template-cover" aria-hidden="true">
      <img
        src={cover.src}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden"
        }}
      />
    </span>
  )
}

/** 教材の行のサムネイル（患者側と同じ小さな PNG。なければ原寸の画像、なければ領域色の空枠） */
function MaterialThumb({ item }: { item: LibraryCard }) {
  const src = item.thumbnail?.src
  if (!src) return <span className="cd-material-thumb empty" aria-hidden />
  const small = src.replace(/^\/thumbnails\/([^/]+)\.webp$/, "/thumbnails/small/$1.png")
  return (
    <span className="cd-material-thumb">
      <img
        src={small}
        alt=""
        loading="lazy"
        onError={(event) => {
          if (small !== src && event.currentTarget.src.endsWith(small)) event.currentTarget.src = src
          else event.currentTarget.style.visibility = "hidden"
        }}
      />
    </span>
  )
}

function PrescriptionLibrary({
  selected,
  setSelected,
  onReview,
  onBack,
  standalone = false,
  record,
  onOpenStudio,
}: {
  selected: (number | string)[]
  setSelected: (ids: (number | string)[]) => void
  onReview: () => void
  onBack?: () => void
  standalone?: boolean
  /** 本番: 公開・承認済みの教材（共通＋自施設）と、この診察での処方状況 */
  record?: ClinicianRecord
  /** 見つからないときに教材スタジオへ（本番の作業画面だけ） */
  onOpenStudio?: () => void
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
  // 選択トレイ（画面下に固定）: 何を選んでいるかが常に見え、外すのも確認へ進むのもここから
  const selectedCards = selected.map((id) => items.find((item) => item.id === id)).filter((x): x is LibraryCard => !!x)
  // この患者への候補（診察サマリーの推薦と同じ。開いてすぐ選べるように先頭に置く。処方済みは除く）
  const candidates = (record?.recommendations?.items ?? [])
    .map((r) => ({ reason: (r.aiReason ?? r.reasons[0]?.text ?? null) as string | null, item: items.find((item) => item.id === r.materialId) }))
    .filter((x): x is { reason: string | null; item: LibraryCard } => !!x.item && !x.item.prescribedNow)
  // 候補を先頭に出しているときは、下の領域別一覧には同じ教材を重ねて出さない
  const showCandidates = candidates.length > 0 && !query && area === "すべて"
  const candidateIds = new Set(showCandidates ? candidates.map((c) => c.item.id) : [])
  // 選択中の教材を自分の施設のセットとして保存（本番のみ。名前を付けて 1 回で）
  const [setForm, setSetForm] = useState<"closed" | "open" | "saving">("closed")
  const [setName, setSetName] = useState("")
  const [savedSet, setSavedSet] = useState<string | null>(null)
  const [setHint, setSetHint] = useState(false)
  const [deletingSet, setDeletingSet] = useState<string | null>(null)
  const saveSet = async () => {
    if (!record?.createTemplate) return
    const name = setName.trim()
    if (!name) return
    setSetForm("saving")
    const ok = await record.createTemplate(name, selected.filter((id): id is string => typeof id === "string"))
    setSetForm(ok ? "closed" : "open")
    if (ok) {
      setSavedSet(name)
      setSetName("")
    }
  }
  const rowStatus = (item: LibraryCard) =>
    item.prescribedNow ? (
      <span className="cd-rx-status now" data-rx-status="now">
        <CIcon name="check" size={11} />
        処方済み
      </span>
    ) : item.prescribedBefore ? (
      <span className="cd-rx-status before" data-rx-status="before">
        以前に処方
      </span>
    ) : null
  return (
    <div className={`cd-content cd-library cd-library-v2${selected.length ? " has-tray" : ""}`}>
      <div className="cd-page-head cd-library-head">
        {!standalone && (
          <button className="cd-back" onClick={onBack}>
            ← 戻る
          </button>
        )}
        <div>
          <h1>{standalone ? "教材ライブラリ" : "情報処方を作成"}</h1>
        </div>
        <button className="cd-primary" disabled={selected.length === 0} onClick={onReview}>
          選択中 {selected.length}件
          <CIcon name="arrow" />
        </button>
      </div>

      {showCandidates && (
        <section className="cd-zone cd-zone-candidates cd-library-group cd-library-candidates" data-library-candidates>
          <div className="cd-zone-head">
            <span className="cd-zone-badge" aria-hidden>1</span>
            <div>
              <h2>この患者への候補（AI推奨）</h2>
              <p>在宅の症状・患者の質問・理解確認のつまずきから選んだ{candidates.length}件。この診察で処方済みのものは除いています</p>
            </div>
          </div>
          <div className="cd-library-grid cd-library-rows">
            {candidates.map(({ item, reason }) => (
              <article key={`cand-${item.id}`} className={`cd-material-row ${cdAreaTone(item.area)}${selected.includes(item.id) ? " selected" : ""}`} data-candidate-row>
                <MaterialThumb item={item} />
                <div className="cd-material-text">
                  <b>{item.title}</b>
                  <small>
                    {rowStatus(item)}
                    <span>{item.area}</span>
                    <span>{item.time}分</span>
                    {reason && <span className="cd-material-goal">{reason}</span>}
                  </small>
                </div>
                <button className={selected.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)} aria-pressed={selected.includes(item.id)}>
                  <CIcon name={selected.includes(item.id) ? "check" : "plus"} />
                  {selected.includes(item.id) ? "選択済み" : item.prescribedBefore ? "再処方に追加" : "処方に追加"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {record && (
        <section className="cd-zone cd-zone-sets cd-template-sets" data-template-sets>
          <div className="cd-zone-head">
            <span className="cd-zone-badge" aria-hidden>2</span>
            <div>
              <h2>セット</h2>
              <p>よく一緒に出す教材のまとまり。1 回でまとめて選択に追加できます</p>
            </div>
            <button
              type="button"
              className="cd-new-set"
              data-new-set
              onClick={() => {
                setSavedSet(null)
                if (selected.length > 0) setSetForm("open")
                else setSetHint(true)
              }}
            >
              <CIcon name="plus" size={14} />
              自分のセットを作る
            </button>
          </div>
          {setHint && selected.length === 0 && (
            <p className="cd-set-hint" data-set-hint role="status">
              下の「教材を探す」で教材を選ぶと、画面下に「セットとして保存」が出ます。名前を付けて保存すると、この施設のセットになります。
            </p>
          )}
          {templateSets.length === 0 && (
            <p className="cd-zone-empty" data-sets-empty>
              まだセットはありません。教材を選んで「自分のセットを作る」から作れます。
            </p>
          )}
          <div className="cd-template-rows">
            {templateSets.map(({ t, cards, addable, pending }) => (
              <article key={t.id} data-template={t.id} data-template-name={t.name} className="cd-template-row">
                <SetCoverThumb name={t.name} />
                <div className="cd-template-main">
                  <b>
                    {t.name}
                    <small>（{cards.length}件）</small>
                  </b>
                  <span className="cd-template-badge">{t.scope === "org" ? "施設" : "共通"}</span>
                  {/* 内容はクリックなしで見える 1 行（選択済み・処方済みはチェック付き） */}
                  <ul className="cd-template-titles" title={t.description || undefined}>
                    {cards.map((c) => (
                      <li key={c.id} className={selected.includes(c.id) || c.prescribedNow ? "added" : ""}>
                        {(selected.includes(c.id) || c.prescribedNow) && <CIcon name="check" size={11} />}
                        {c.title}
                      </li>
                    ))}
                  </ul>
                </div>
                <button className={pending.length === 0 ? "selected" : ""} disabled={pending.length === 0} onClick={() => setSelected([...selected, ...pending])}>
                  <CIcon name={pending.length === 0 ? "check" : "plus"} />
                  {pending.length === 0 ? (addable.length === 0 ? "この診察で処方済み" : "選択に追加済み") : `まとめて追加（${pending.length}件）`}
                </button>
                {t.scope === "org" && record && (
                  deletingSet === t.id ? (
                    <span className="cd-set-delete-confirm" data-set-delete-confirm>
                      <button type="button" className="cd-danger-text" onClick={() => void record.deleteTemplate(t.id).then(() => setDeletingSet(null))}>
                        削除する
                      </button>
                      <button type="button" className="cd-text-back" onClick={() => setDeletingSet(null)}>
                        やめる
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="cd-set-delete" aria-label={`セット「${t.name}」を削除`} title="このセットを削除（教材は消えません）" onClick={() => setDeletingSet(t.id)} data-set-delete>
                      ×
                    </button>
                  )
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="cd-zone cd-zone-browse" data-library-browse>
      <div className="cd-zone-head">
        <span className="cd-zone-badge" aria-hidden>{record ? 3 : 1}</span>
        <div>
          <h2>教材を探す</h2>
          <p>領域で絞り込むか、教材名・学習目標で検索します（{items.length}件）</p>
        </div>
        <label className="cd-library-search">
          <CIcon name="search" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="教材名・学習目標で検索" />
        </label>
      </div>
      <div className="cd-area-chips" role="tablist" aria-label="学習領域">
        {["すべて", "検査・診断", "手術", "薬物療法", "放射線療法", "副作用・支持療法", "日常生活・相談支援"].map((name) => {
          const count = name === "すべて" ? items.length : items.filter((item) => item.area === name).length
          return (
            <button key={name} role="tab" aria-selected={area === name} className={`${cdAreaTone(name)}${area === name ? " active" : ""}`} onClick={() => setArea(name)} data-area-chip={name}>
              {name}
              <small>{count}</small>
            </button>
          )
        })}
      </div>
      {record && (
        <p className="cd-library-status-legend" data-library-legend>
          <span className="now">
            <CIcon name="check" size={12} />
            この診察で処方済み
          </span>
          <span className="before">以前に処方</span>
        </p>
      )}

      {(area === "すべて" ? ["検査・診断", "手術", "薬物療法", "放射線療法", "副作用・支持療法", "日常生活・相談支援"] : [area]).map((group) => {
        const list = results.filter((item) => item.area === group && !candidateIds.has(item.id))
        if (list.length === 0) return null
        return (
          <section key={group} className={`cd-library-group ${cdAreaTone(group)}`} data-library-group={group}>
            {area === "すべて" && (
              <h2 className="cd-library-group-title">
                {group}
                <small>{list.length}件</small>
              </h2>
            )}
            <div className="cd-library-grid cd-library-rows">
              {list.map((item) => (
                <article key={item.id} className={`cd-material-row ${cdAreaTone(item.area)}${selected.includes(item.id) ? " selected" : ""}${item.prescribedNow ? " now" : ""}`}>
                  <MaterialThumb item={item} />
                  <div className="cd-material-text">
                    <b>{item.title}</b>
                    <small>
                      {rowStatus(item)}
                      <span>{item.time}分</span>
                      {item.scope === "施設内教材" && <span>施設内教材</span>}
                      {known(item.goal) && <span className="cd-material-goal">{item.goal}</span>}
                    </small>
                  </div>
                  {item.prescribedNow ? (
                    // 同じ診察では同じ教材を重複して処方しない
                    <button className="selected" disabled>
                      <CIcon name="check" />
                      この診察で処方済み
                    </button>
                  ) : (
                    <button className={selected.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)} aria-pressed={selected.includes(item.id)}>
                      <CIcon name={selected.includes(item.id) ? "check" : "plus"} />
                      {selected.includes(item.id) ? "選択済み" : item.prescribedBefore ? "再処方に追加" : "処方に追加"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        )
      })}
      {results.length === 0 && (
        <div className="cd-empty-results">
          <CIcon name="search" size={34} />
          <h2>一致する承認済み教材がありません</h2>
          <p>検索語や領域を変えてください。</p>
          {onOpenStudio && (
            <button className="cd-secondary" onClick={onOpenStudio} data-open-studio>
              教材スタジオで作る
            </button>
          )}
        </div>
      )}
      </section>

      {selected.length > 0 && (
        <div className="cd-select-tray" data-select-tray role="region" aria-label="選択中の教材">
          <div className="cd-select-tray-list">
            <b>選択中 {selected.length}件</b>
            {selectedCards.map((c) => (
              <span key={c.id} className={`cd-select-chip ${cdAreaTone(c.area)}`} title={c.title}>
                <span>{c.title}</span>
                <button aria-label={`${c.title}を外す`} onClick={() => toggle(c.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          {record?.createTemplate && setForm === "closed" && (
            <button className="cd-tray-save-set" onClick={() => { setSavedSet(null); setSetForm("open") }} data-save-set>
              セットとして保存
            </button>
          )}
          {record?.createTemplate && setForm !== "closed" && (
            <form
              className="cd-tray-set-form"
              data-save-set-form
              onSubmit={(event) => {
                event.preventDefault()
                void saveSet()
              }}
            >
              <input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="セット名（例: 術前説明）" maxLength={40} autoFocus disabled={setForm === "saving"} aria-label="セット名" />
              <button type="submit" className="cd-primary" disabled={!setName.trim() || setForm === "saving"}>
                {setForm === "saving" ? "保存中…" : "保存"}
              </button>
              <button type="button" className="cd-text-back" onClick={() => setSetForm("closed")} disabled={setForm === "saving"}>
                やめる
              </button>
            </form>
          )}
          <button className="cd-primary" onClick={onReview} data-tray-review>
            確認へ
            <CIcon name="arrow" />
          </button>
        </div>
      )}
      {savedSet && (
        <p className="cd-set-saved" role="status" data-set-saved>
          <CIcon name="check" size={12} />
          セット「{savedSet}」を保存しました（この施設の医療者が使えます）
        </p>
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
                <div key={item.id} className={cdAreaTone(item.area)}>
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

/** 学習領域の色。患者側（d-area-1..6）と同じ順・同じ色で、医療者側でも領域ごとに箱全体を淡く染める */
const AREA_NAMES = ["検査・診断", "手術", "薬物療法", "放射線療法", "副作用・支持療法", "日常生活・相談支援"]
const cdAreaTone = (name: string | undefined) => {
  const i = name ? AREA_NAMES.indexOf(name) : -1
  return i >= 0 ? `cd-area-${i + 1}` : ""
}

// 手順は 4 つ。方針は原資料と同じ画面、必ず含める内容は構成案と同じ画面、プレビューは編集の中（確認が必要な内容は減らさない）
// 手順は 3 つ。資料を選んで確認したら Claude が教材を 1 つ作り、編集して承認する。
// 構成案の選択と必須事項のチェックは画面としては出さず、Claude が原資料から拾った必須事項はすべて含めて作り、編集画面に一覧で残す
const stepNames = ["原資料", "教材の編集", "承認・公開"]

/**
 * Claude の処理中に、いま何をしていて（原資料の読み取り → 構成の検討 → 本文と確認問題の作成）、
 * どれくらい待つか（経過秒と通常の所要）を見せる。段階は busy（upload / outline / draft）から決める
 */
function StudioProgress({ busy, detail }: { busy: string | null; detail: string | null }) {
  // 段階が変わるたびに親が key で作り直すので、経過秒は 0 から数え直す
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number | null>(null)
  useEffect(() => {
    startedAt.current ??= Date.now()
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [])
  const stages = [
    { key: "upload", label: "原資料を読み取る", hint: "数秒" },
    { key: "outline", label: "構成と必ず含める内容を検討する", hint: "20〜60 秒" },
    { key: "draft", label: "本文と確認問題を書く", hint: "30〜90 秒" },
  ]
  const current = Math.max(0, stages.findIndex((st) => st.key === busy))
  // 進み具合の目安: 現在の段階の中で経過時間に応じて伸び、95% で止める（終わりは本当の完了で埋まる）
  const expected = busy === "upload" ? 6 : busy === "outline" ? 45 : 60
  const within = Math.min(0.95, elapsed / expected)
  const percent = Math.round(((current + within) / stages.length) * 100)
  return (
    <div className="cd-studio-progress" data-studio-busy role="status" aria-live="polite">
      <div className="cd-studio-progress-head">
        <b>
          {stages[current]?.label ?? "処理しています"}
          {detail ? <small>（{detail}）</small> : null}
        </b>
        <span>
          {elapsed}秒 · 通常 {stages[current]?.hint ?? "1〜2 分"}
        </span>
      </div>
      <div className="cd-studio-progress-bar" aria-hidden>
        <i style={{ width: `${percent}%` }} />
      </div>
      <ol className="cd-studio-progress-stages">
        {stages.map((st, i) => (
          <li key={st.key} className={i < current ? "done" : i === current ? "now" : ""}>
            <i>{i < current ? <CIcon name="check" size={11} /> : i + 1}</i>
            {st.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

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
  // 手順 3: 編集の中で患者の見え方を確認する（プレビュー表示中）
  const [previewing, setPreviewing] = useState(false)
  // 公開デモ: 実際に Claude で作るための合言葉（入力欄）
  const [demoCode, setDemoCode] = useState("")
  // 手順が変わったら画面の先頭へ（前の手順のスクロール位置を引きずらない）
  useEffect(() => {
    document.querySelector(".cd-main")?.scrollTo({ top: 0 })
  }, [step, previewing])
  const [srcMeta, setSrcMeta] = useState({ title: "", rightsHolder: "", evidenceNote: "" })
  const [perm, setPerm] = useState({ allowDerive: true, allowPublish: true, allowShare: false })
  const [piiChecked, setPiiChecked] = useState(false)
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
        ? !!d
        : true
    : step === 1
      ? sourceReady && aiAllowed && licenseChecked
      : true
  /** 本番の「次へ」: 各手順で実際の処理を行い、終わったら次の手順へ */
  const nextLive = async () => {
    if (!live) return
    if (step === 1) {
      let sourceId = live.sourceId
      if (!sourceId && file) {
        const id = await live.upload(file, { title: srcMeta.title, rightsHolder: srcMeta.rightsHolder, evidenceNote: srcMeta.evidenceNote, perm: { allowAi: aiAllowed, ...perm }, piiAttestedNone: piiChecked })
        if (!id) return
        sourceId = id
      }
      // 構成案（案 1）と、Claude が原資料から拾った必須事項をすべて「必須」として下書きを作る。画面は編集へ直行
      const outlineJob = await live.requestOutlines(sourceId ?? undefined)
      if (!outlineJob) return
      const payload = outlineJob.outputPayload as { mustCoverCandidates?: { text: string; kind: MustCandidate["kind"]; sourceRef: MustCandidate["sourceRef"] }[] } | null
      const must = (payload?.mustCoverCandidates ?? []).map((c, i) => ({ id: `mc${i + 1}`, text: c.text, kind: c.kind, sourceRef: c.sourceRef, status: "required" as const }))
      if (await live.requestDraft(0, must, outlineJob, sourceId)) setStep(2)
      return
    }
    if (step === 2) {
      setPreviewing(true)
      return
    }
    setStep(step + 1)
  }
  const replayEnv = !!live && (live.outlineJob?.generator === "replay" || live.draftJob?.generator === "replay" || !live.config?.claudeConfigured)
  const missingStep1 = live && step === 1
    ? [
        !(live.sourceId || file) ? "資料を選ぶ" : null,
        !srcMeta.rightsHolder.trim() ? "作成元（許諾元）" : null,
        !srcMeta.evidenceNote.trim() ? "利用許諾の根拠" : null,
        !aiAllowed ? "AI処理の許可" : null,
        !licenseChecked ? "利用許諾の確認" : null,
        !piiChecked ? "個人情報を含まないことの確認" : null,
      ].filter((x): x is string => !!x)
    : []
  return (
    <div className="cd-content cd-studio">
      {live?.config?.demoClaude && live.demoClaude && (live.config.demoClaude.available || live.demoClaude.useSample) && (
        <p className={`cd-studio-env cd-demo-claude${live.config.demoClaude.live ? " live" : ""}`} data-demo-claude role="note">
          <CIcon name="studio" size={14} />
          {live.config.demoClaude.live ? (
            <>
              <b>Claude で実際に生成します</b>（{live.config.model}）。原資料は PDF / Word / PowerPoint / TXT（3.5MB まで）か
              {live.demoClaude.useSample && (
                <button type="button" onClick={live.demoClaude.useSample} data-demo-claude-sample>
                  サンプル原資料を使う
                </button>
              )}
              <button type="button" onClick={live.demoClaude.disable} data-demo-claude-off>
                記録の再生に戻す
              </button>
            </>
          ) : (
            <>
              {live.demoClaude?.useSample && (
                <button type="button" onClick={live.demoClaude.useSample} data-demo-claude-sample>
                  サンプル原資料を使う
                </button>
              )}
              {live.config.demoClaude.available ? (
                <form
                  className="cd-demo-claude-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (demoCode.trim()) void live.demoClaude?.enable(demoCode.trim()).then((ok) => ok && setDemoCode(""))
                  }}
                >
                  公開デモでも実際に Claude で教材を作れます。
                  <input value={demoCode} onChange={(event) => setDemoCode(event.target.value)} placeholder="合言葉" aria-label="合言葉" data-demo-claude-code />
                  <button type="submit" disabled={!demoCode.trim()} data-demo-claude-on>
                    実際に Claude で作る
                  </button>
                </form>
              ) : (
                <span>記録済みの Claude 出力を再生します。</span>
              )}
            </>
          )}
        </p>
      )}
      {replayEnv && !live?.config?.demoClaude?.live && (
        <p className="cd-studio-env" data-studio-env role="note">
          <CIcon name="alert" size={14} />
          {live?.outlineJob?.generator === "replay" || live?.draftJob?.generator === "replay"
            ? `デモ環境: 記録済みのClaude出力を再生します（${live.draftJob?.model ?? live.outlineJob?.model}）`
            : "デモ環境: Claude API 未設定のため、記録済みの出力か開発用の擬似生成を使います"}
        </p>
      )}
      <div className="cd-title-row cd-studio-title">
        <div>
          <h1>教材スタジオ</h1>
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
          <span key={live?.savedAt?.getTime() ?? 0} className={live?.savedAt ? "cd-saved-flash" : ""}>
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
      <div className="cd-stepper cd-stepper-v2" aria-label="作成の手順">
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
            <b>{name}</b>
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
      <div className="cd-studio-body cd-step-enter" key={`${step}-${previewing ? "p" : "e"}`}>
        {live && live.busy && (
          <StudioProgress key={live.busy ?? ""} busy={live.busy} detail={live.busy === "outline" ? live.outlineJob?.progress ?? null : live.busy === "draft" ? live.draftJob?.progress ?? null : null} />
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
        {step === 2 && !previewing && live && d && d.version.mustCover.length > 0 && (
          <details className="cd-must-summary" data-must-summary>
            <summary>
              Claude が原資料から拾った「必ず含める内容」{d.version.mustCover.length}件（すべて含めて作成しました）
            </summary>
            <ul>
              {d.version.mustCover.map((m) => (
                <li key={m.id} className={SAFETY_KINDS.includes(m.kind as (typeof SAFETY_KINDS)[number]) ? "safety" : ""}>
                  {m.text}
                  {m.sourceRef?.section && <small>{m.sourceRef.section}</small>}
                </li>
              ))}
            </ul>
          </details>
        )}
        {step === 2 && !previewing && (
          <EditStep
            editingPage={editingPage}
            setEditingPage={setEditingPage}
            imageState={imageState}
            setImageState={setImageState}
            live={live && d ? { draft: d, save: live.saveDraft } : undefined}
          />
        )}
        {step === 2 && previewing && (
          <PreviewStep
            onClose={() => setPreviewing(false)}
            onComplete={async () => {
              if (live) {
                if (d?.version.status === "draft" && !(await live.submit())) return
                setPreviewing(false)
                setStep(3)
                return
              }
              setPublishState("review")
              setPreviewing(false)
              setStep(3)
            }}
            live={live && d ? { draft: d } : undefined}
          />
        )}
        {step === 3 && (
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
                        setStep(2)
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
      {step < 3 && !(step === 2 && previewing) && (
        <div className="cd-wizard-actions cd-wizard-sticky" data-wizard-actions>
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
            {live && step === 1 && aiAllowed && missingStep1.length > 0 && (
              <span data-studio-missing>次に進むには: {missingStep1.join("・")}</span>
            )}
            <button
              className="cd-primary"
              disabled={!canNext || !!live?.busy || (!!live && live.allowed === false)}
              onClick={() => (live ? void nextLive() : step === 2 ? setPreviewing(true) : setStep(step + 1))}
            >
              {step === 1 ? (live ? "Claudeで教材を作る" : "次へ進む") : step === 2 ? "患者の見え方を確認" : "次へ進む"}
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
  const [protoPerm, setProtoPerm] = useState({ allowDerive: true, allowPublish: true, allowShare: false })
  const perm = live ? live.perm : protoPerm
  const setPerm = live ? live.setPerm : setProtoPerm
  const locked = !!live?.uploaded
  return (
    <div className="cd-studio-step cd-source-v2">
      <div className="cd-step-heading">
        <h2>原資料を登録</h2>
      </div>
      {/* 1 列: 資料 → 利用条件。説明文は置かず、入力と確認だけ */}
      <section className="cd-panel cd-source-panel">
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
              <CIcon name="file" size={24} />
            </span>
            <div>
              <b>{live.uploaded?.filename ?? live.file?.name}</b>
              <small>
                {(((live.uploaded?.size ?? live.file?.size ?? 0) / 1024 / 1024) || 0).toFixed(1)}MB · {live.uploaded ? `${live.uploaded.charCount}文字を読み取り済み` : "登録前"}
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
          <button className="cd-upload cd-upload-compact" onClick={() => fileRef.current?.click()}>
            <CIcon name="upload" size={22} />
            <b>資料を選ぶ</b>
            <small>PDF / Word / PowerPoint / TXT · 15MBまで</small>
          </button>
        ) : !sourceReady ? (
          <button className="cd-upload cd-upload-compact" onClick={() => setSourceReady(true)}>
            <CIcon name="upload" size={22} />
            <b>資料を選ぶ</b>
            <small>PDF / TXT · 20MBまで（開発用: サンプル資料）</small>
          </button>
        ) : (
          <div className="cd-file-ready">
            <span>
              <CIcon name="file" size={24} />
            </span>
            <div>
              <b>乳がん術後リハビリテーション指針.pdf</b>
              <small>2.4MB · 38ページ</small>
            </div>
            <button onClick={() => setSourceReady(false)}>削除</button>
          </div>
        )}
        {live ? (
          <div className="cd-form-grid cd-form-grid-v2">
            <label>
              資料名
              <input value={live.meta.title} disabled={locked} onChange={(event) => live.setMeta({ ...live.meta, title: event.target.value })} />
            </label>
            <label>
              作成元<em className="cd-required">必須</em>
              <input value={live.meta.rightsHolder} placeholder="例: さくら総合病院 乳腺外科" disabled={locked} onChange={(event) => live.setMeta({ ...live.meta, rightsHolder: event.target.value })} />
              {!locked && (
                <span className="cd-quick-fill" data-quick-rights>
                  {["当院の院内資料", "学会・公的機関の資料", "出版社の資料（許諾あり）"].map((t) => (
                    <button key={t} type="button" onClick={() => live.setMeta({ ...live.meta, rightsHolder: t })}>
                      {t}
                    </button>
                  ))}
                </span>
              )}
            </label>
            <label className="wide">
              利用許諾の根拠<em className="cd-required">必須</em>
              <textarea rows={2} value={live.meta.evidenceNote} placeholder="確認した内容を 1 行で（下の候補からも選べます）" disabled={locked} onChange={(event) => live.setMeta({ ...live.meta, evidenceNote: event.target.value })} />
              {!locked && (
                <span className="cd-quick-fill" data-quick-evidence>
                  {["院内作成のため、教材化と患者への公開を部門で確認済み", "著作権者から教材化と患者への公開の許諾を得ている", "公開ライセンス（CC BY など）で二次利用が認められている"].map((t) => (
                    <button key={t} type="button" onClick={() => live.setMeta({ ...live.meta, evidenceNote: t })}>
                      {t}
                    </button>
                  ))}
                </span>
              )}
            </label>
          </div>
        ) : (
          <div className="cd-form-grid cd-form-grid-v2">
            <label>
              資料名
              <input defaultValue="乳がん術後リハビリテーション指針" />
            </label>
            <label>
              作成元
              <input defaultValue="日本乳腺ケア学会" />
            </label>
            <label className="wide">
              利用許諾の根拠
              <textarea rows={2} defaultValue="学会から教材化と患者への公開の許諾を得ている" />
            </label>
          </div>
        )}
      </section>

      <section className="cd-panel cd-terms-panel">
        <div className="cd-terms-row" role="group" aria-label="利用条件">
          <b>利用条件</b>
          {(
            [
              { key: "ai", label: "AI処理", value: aiAllowed, set: setAiAllowed },
              { key: "derive", label: "患者向けに編集", value: perm.allowDerive, set: (v: boolean) => setPerm({ ...perm, allowDerive: v }) },
              { key: "publish", label: "患者へ公開", value: perm.allowPublish, set: (v: boolean) => setPerm({ ...perm, allowPublish: v }) },
              { key: "share", label: "他施設と共有", value: perm.allowShare, set: (v: boolean) => setPerm({ ...perm, allowShare: v }) },
            ] as const
          ).map((t) => (
            <label key={t.key} className={`cd-perm-pill${t.value ? " on" : ""}`} data-perm={t.key}>
              <input type="checkbox" checked={t.value} onChange={(event) => t.set(event.target.checked)} />
              <CIcon name="check" size={12} />
              {t.label}
            </label>
          ))}
        </div>
        {!aiAllowed && (
          <p className="cd-permission-warning">
            <CIcon name="alert" />
            AI処理を許可しない資料からは教材を作れません
          </p>
        )}
        <div className="cd-attest-row">
          <label className="cd-license-check">
            <input type="checkbox" checked={licenseChecked} onChange={(event) => setLicenseChecked(event.target.checked)} />
            <span>
              <b>利用許諾を確認した</b>
            </span>
          </label>
          {live && (
            // 本番: 患者個人情報を含まないことの確認（含む資料は AI 処理しない）
            <label className="cd-license-check">
              <input type="checkbox" checked={live.pii} onChange={(event) => live.setPii(event.target.checked)} />
              <span>
                <b>患者の個人情報を含まない</b>
              </span>
            </label>
          )}
        </div>
      </section>
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
        <h2>教材と確認問題を編集</h2>
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
        <h2>教材と確認問題を編集</h2>
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
          <h2>患者表示をプレビュー</h2>
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
        <h2>患者表示をプレビュー</h2>
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
        <h2>医学的承認と公開</h2>
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
