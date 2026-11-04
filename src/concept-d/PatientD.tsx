"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useUrlState } from "./urlState"
import { ShioriLogo } from "./ShioriLogo"
import { daysUntil, visitDateLabel, type PatientVisit } from "./visit"
import type { PatientLive } from "./live"
import { toLocalInput, type HealthInput, type PatientHealth, type PatientNotes } from "./health"
import {
  saveProgress,
  useAttempt,
  useLearnView,
  type LiveLesson,
  type PatientLearning,
  type Slide,
} from "./learning"
import {
  currentVisitDate,
  formatShortDate,
  initialActiveSymptomIds,
  initialHealthRecords,
  severityLabels,
  symptomLibrary,
  symptomName,
  type HealthRecord,
} from "./healthData"

type DPage = "home" | "prescriptions" | "library" | "category" | "search" | "detail" | "learn" | "quiz" | "explanation" | "result" | "history" | "health" | "notes" | "share"
const D_PAGES: readonly DPage[] = ["home", "prescriptions", "library", "category", "search", "detail", "learn", "quiz", "explanation", "result", "history", "health", "notes", "share"]
export type DViewport = "390" | "430" | "tablet"

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z" />
        <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5a3.5 3.5 0 0 1 3.5 3Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    play: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    note: (
      <>
        <path d="M5 3h14v18H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-1 .6-1.4 1.1-1.4 2.3M12 17h.01" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.5 20h19Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    audio: (
      <>
        <path d="M4 10v4h4l5 4V6L8 10Z" />
        <path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    qr: (
      <>
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v3h-3M14 19h3v1h-3z" />
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
      className="icon"
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

export function Logo() {
  return <ShioriLogo />
}

function Pill({
  children,
  tone = "blue",
}: {
  children: ReactNode
  tone?: string
}) {
  return <span className={`pill ${tone}`}>{children}</span>
}

type DLesson = {
  /** Figma の架空データは番号、本番（Step 2）は教材 ID */
  id: number | string
  title: string
  category: string
  time: number
  status: "new" | "doing" | "done"
  prescribed: boolean
  sender?: string
  date?: string
  progress: number
  summary: string
  goal: string
} & Partial<Omit<LiveLesson, "id" | "title" | "category" | "time" | "status" | "prescribed" | "sender" | "date" | "progress" | "summary" | "goal">>

const dLessons: DLesson[] = [
  {
    id: 1,
    title: "手術後の腕と傷のケア",
    category: "手術",
    time: 8,
    status: "doing",
    prescribed: true,
    sender: "乳腺外科 山田医師",
    date: "6月12日",
    progress: 50,
    summary: "退院後の腕の動かし方と、傷を守るための注意点を確認します。",
    goal: "無理のない腕の動かし方と、相談が必要な変化を説明できる",
  },
  {
    id: 2,
    title: "ホルモン療法を始める前に",
    category: "薬物療法",
    time: 7,
    status: "new",
    prescribed: true,
    sender: "乳腺外科 山田医師",
    date: "6月12日",
    progress: 0,
    summary: "治療の目的、服用方法、気をつけたい体調の変化を学びます。",
    goal: "治療の目的と、困ったときの相談先を確認できる",
  },
  {
    id: 3,
    title: "病理結果の見かた",
    category: "検査・診断",
    time: 10,
    status: "done",
    prescribed: true,
    sender: "乳腺外科 山田医師",
    date: "6月12日",
    progress: 100,
    summary: "病理結果に書かれる主な項目を、ひとつずつ読み解きます。",
    goal: "結果票の主な用語と、医師に確認したい点がわかる",
  },
  {
    id: 4,
    title: "リンパ浮腫の初期サイン",
    category: "副作用・支持療法",
    time: 6,
    status: "new",
    prescribed: false,
    progress: 0,
    summary: "腕や手の変化に気づくための観察ポイントを紹介します。",
    goal: "日常で確認できる変化と相談の目安を知る",
  },
  {
    id: 5,
    title: "治療中の食事と栄養",
    category: "日常生活・相談支援",
    time: 8,
    status: "doing",
    prescribed: false,
    progress: 35,
    summary: "食欲や体調に合わせて食べるための現実的な工夫を紹介します。",
    goal: "体調に合わせた食事の選び方を知る",
  },
  {
    id: 6,
    title: "放射線治療と皮膚のケア",
    category: "放射線療法",
    time: 9,
    status: "new",
    prescribed: false,
    progress: 0,
    summary: "治療中の皮膚の変化と、毎日のケアを説明します。",
    goal: "皮膚を守る方法と相談の目安を知る",
  },
  {
    id: 7,
    title: "仕事と治療を両立するために",
    category: "日常生活・相談支援",
    time: 12,
    status: "done",
    prescribed: false,
    progress: 100,
    summary: "職場への伝え方や、利用できる相談窓口を整理します。",
    goal: "自分に合う働き方と相談先を検討できる",
  },
  {
    id: 8,
    title: "抗がん薬治療中の感染予防",
    category: "副作用・支持療法",
    time: 7,
    status: "new",
    prescribed: false,
    progress: 0,
    summary: "日常でできる感染予防と、受診を相談する症状を確認します。",
    goal: "感染予防の基本と医療者へ連絡する目安を知る",
  },
  {
    id: 9,
    title: "画像検査を受けるとき",
    category: "検査・診断",
    time: 5,
    status: "new",
    prescribed: false,
    progress: 0,
    summary: "主な画像検査の目的と、当日の流れを説明します。",
    goal: "検査の違いと事前に伝えることを確認できる",
  },
  {
    id: 10,
    title: "術後の下着の選び方",
    category: "手術",
    time: 5,
    status: "new",
    prescribed: false,
    progress: 0,
    summary: "傷の状態や生活に合わせた下着選びの考え方を紹介します。",
    goal: "身体の変化に合わせた選択肢を知る",
  },
]

const dCategories = [
  { name: "検査・診断", count: 5, icon: "search", progress: 50 },
  { name: "手術", count: 6, icon: "plus", progress: 40 },
  { name: "薬物療法", count: 8, icon: "book", progress: 10 },
  { name: "放射線療法", count: 4, icon: "shield", progress: 0 },
  { name: "副作用・支持療法", count: 12, icon: "help", progress: 20 },
  { name: "日常生活・相談支援", count: 9, icon: "home", progress: 35 },
]

/** 学習領域の一覧。本番は DB の教材数・学習状況から作ったものを Provider で渡す（なければ Figma の架空の値） */
type DCategoryInfo = { name: string; count: number; icon: string; progress: number }
const CategoriesContext = createContext<DCategoryInfo[]>(dCategories)

/** 本番の患者情報（呼び名・今回の処方元など）。Figma の架空データ表示（開発用）では null */
type DLiveInfo = {
  /** 教材一覧を読み込み済み（読み込み前に「届いている教材はありません」を出さない） */
  loaded: boolean
  familyName: string
  today: string
  latest: PatientLearning["latest"]
  sharingLabel: string | null
  sharingRemainingMin: number
  /** 本番（Step 3）: 診察ノートの質問数・最後に体調を記録した日（未記録は null） */
  noteCount: number
  lastHealthDate: string | null
}
const LiveInfoContext = createContext<DLiveInfo | null>(null)

const imageKind = (lesson: DLesson): "medical" | "editorial" =>
  typeof lesson.id === "number" && lesson.id % 3 === 0 ? "editorial" : "medical"

const dScenarios = [
  "初回・処方0件",
  "今回処方3件",
  "学習途中あり",
  "処方をすべて完了",
  "自主学習を利用",
  "公開教材が多数",
  "一時共有中",
]

function DImageSlot({
  kind,
  caption,
  onExpand,
  compact = false,
  image,
  fit = "contain",
}: {
  kind: "medical" | "editorial"
  caption: string
  onExpand?: () => void
  compact?: boolean
  /** 本番: 医療者が承認した図解（承認済みの画像だけが API から届く）。なければ Figma の「画像準備中」 */
  image?: { src: string; alt: string }
  /** contain: 画像全体を枠内に表示（医学図解・教材詳細のサムネイル。切り取らない）。cover: 枠いっぱいに表示（教材カード） */
  fit?: "contain" | "cover"
}) {
  const placeholderContent = image ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} style={{ width: "100%", height: "100%", objectFit: fit, background: "#fff" }} />
      {onExpand && (
        <span className="d-expand">
          <Icon name="search" size={16} />
          拡大
        </span>
      )}
    </>
  ) : (
    <>
      <span className="d-image-type">
        {kind === "medical" ? "MEDICAL ILLUSTRATION" : "EDITORIAL ILLUSTRATION"}
      </span>
      <span className="d-image-frame">
        <Icon name={kind === "medical" ? "search" : "user"} size={28} />
        <b>画像準備中</b>
        <small>
          {kind === "medical"
            ? "医療者監修済みの図解を配置"
            : "成人患者向け水彩イラストを配置"}
        </small>
      </span>
      {onExpand && (
        <span className="d-expand">
          <Icon name="search" size={16} />
          拡大
        </span>
      )}
    </>
  )
  return (
    <div className={`d-image-slot ${compact ? "compact" : ""}`}>
      {onExpand ? (
        <button
          className="d-image-placeholder"
          onClick={onExpand}
          aria-label={`${caption}を拡大`}
        >
          {placeholderContent}
        </button>
      ) : (
        <div className="d-image-placeholder" aria-hidden="true">
          {placeholderContent}
        </div>
      )}
      <p>{caption}</p>
    </div>
  )
}

function DStatus({
  lesson,
  short = false,
}: {
  lesson: DLesson
  short?: boolean
}) {
  const statusText =
    lesson.status === "doing"
      ? "学習途中"
      : lesson.status === "done"
        ? "学習済み"
        : "未学習"
  return (
    <span className={`d-status ${lesson.status}`}>
      <Icon
        name={
          lesson.status === "doing"
            ? "play"
            : lesson.status === "done"
              ? "check"
              : "book"
        }
        size={15}
      />
      {short
        ? statusText
        : `${lesson.prescribed ? "処方" : "自主"}・${statusText}`}
    </span>
  )
}

function DLessonCard({
  lesson,
  onOpen,
  horizontal = false,
}: {
  lesson: DLesson
  onOpen: () => void
  horizontal?: boolean
}) {
  return (
    <button
      className={`d-lesson-card ${horizontal ? "horizontal" : ""}`}
      onClick={onOpen}
    >
      <DImageSlot
        compact
        kind={imageKind(lesson)}
        caption=""
        image={lesson.thumbnail ?? undefined}
        fit="cover"
      />
      <span className="d-lesson-card-body">
        <span className="d-card-top">
          <DStatus lesson={lesson} />
          <span className="d-time">
            <Icon name="clock" size={14} />
            {lesson.time}分
          </span>
        </span>
        <b>{lesson.title}</b>
        <span className="d-category">{lesson.category}</span>
        {lesson.status === "doing" && (
          <span className="d-progress-line">
            <i style={{ width: `${lesson.progress}%` }} />
            <small>{lesson.progress}%</small>
          </span>
        )}
      </span>
      <Icon name="arrow" size={18} />
    </button>
  )
}

function DHeader({
  sharing,
  onShare,
}: {
  sharing: boolean
  onShare: () => void
}) {
  return (
    <header className="d-header">
      <Logo />
      <button
        className={`d-share-chip ${sharing ? "active" : ""}`}
        onClick={onShare}
      >
        <span className="live-dot" />
        {sharing ? "共有中" : "共有する"}
        <Icon name="qr" size={17} />
      </button>
    </header>
  )
}

function DNav({
  page,
  setPage,
  noteCount,
}: {
  page: DPage
  setPage: (page: DPage) => void
  noteCount: number
}) {
  const items: { page: DPage; label: string; icon: string }[] = [
    { page: "home", label: "ホーム", icon: "home" },
    { page: "library", label: "教材を探す", icon: "book" },
    { page: "history", label: "学習記録", icon: "grid" },
    { page: "health", label: "体調記録", icon: "pulse" },
    { page: "notes", label: "診察ノート", icon: "note" },
  ]
  return (
    <nav className="d-nav">
      {items.map((item) => (
        <button
          key={item.page}
          className={
            page === item.page ||
            (item.page === "library" &&
              ["category", "search", "detail"].includes(page))
              ? "active"
              : ""
          }
          onClick={() => setPage(item.page)}
        >
          <span>
            <Icon name={item.icon} />
            {item.page === "notes" && noteCount > 0 && <i>{noteCount}</i>}
          </span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}

function DPageHeader({
  title,
  eyebrow,
  onBack,
}: {
  title: string
  eyebrow?: string
  onBack: () => void
}) {
  return (
    <div className="d-page-title">
      <button className="back" onClick={onBack} aria-label="前の画面へ">
        ←
      </button>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
    </div>
  )
}

export function DPrototype({
  variant = "prototype",
  live,
  learning,
  userName,
  health,
  notesLive,
  visit,
  viewport,
  notify,
  healthRecords,
  setHealthRecords,
  activeSymptomIds,
  setActiveSymptomIds,
  customSymptomNames,
  setCustomSymptomNames,
}: {
  /** prototype: Figma の検証シナリオと端末枠つき（開発用）。app: 端末枠なしの実アプリ表示 */
  variant?: "app" | "prototype"
  /** 本番: 一時共有の実 API（共有中かどうか・申請者・残り時間・承認・終了）。なければ Figma の架空の状態 */
  live?: PatientLive
  /** 本番（Step 2）: 情報処方・教材・学習記録の実 API。なければ Figma の架空の教材 */
  learning?: PatientLearning
  /** 本番: 患者の表示名（ホームの呼びかけ） */
  userName?: string
  /** 本番（Step 3）: 体調記録・症状の設定の実 API。なければ Figma の架空の記録 */
  health?: PatientHealth
  /** 本番（Step 3）: 診察ノートの実 API。なければ Figma の架空の質問メモ */
  notesLive?: PatientNotes
  /** 本番: 次回の診察日（患者が登録した日付）。なければ表示しない */
  visit?: PatientVisit
  viewport: DViewport
  notify: (message?: string) => void
  healthRecords: HealthRecord[]
  setHealthRecords: (records: HealthRecord[]) => void
  activeSymptomIds: string[]
  setActiveSymptomIds: (ids: string[]) => void
  customSymptomNames: Record<string, string>
  setCustomSymptomNames: (names: Record<string, string>) => void
}) {
  // 画面・教材・領域は URL に持つ（再読み込みで同じ画面に戻る）
  const [page, setPage] = useUrlState<DPage>("view", "home", D_PAGES)
  const [scenario, setScenario] = useState(2)
  // 教材は URL に持つ（Figma の架空データは番号、本番は教材 ID）
  const [selectedId, setSelectedId] = useUrlState<string>("lesson", "1")
  // 本番: 理解確認から作った質問候補（診察ノートの入力欄に入れ、患者が確認して保存したときだけ DB に記録）
  const [noteDraft, setNoteDraft] = useState<{ text: string; versionId: string; questionId: string; title: string } | null>(null)
  // 本番: 回答の解説を表示している設問（再読み込みで同じ解説に戻る）
  const [quizQuestionId, setQuizQuestionId] = useUrlState<string>("q", "")
  const [selectedCategory, setSelectedCategory] = useUrlState<string>("area", "手術")
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("すべて")
  const [statusFilter, setStatusFilter] = useState("すべて")
  const [sharingLocal, setSharing] = useState(false)
  const sharing = live ? live.sharing : sharingLocal
  const [zoomed, setZoomed] = useState(false)
  const [notes, setNotes] = useState([
    "腕のつっぱりはいつまで続きますか？",
    "薬を飲み忘れたときはどうすればよいですか？",
  ])
  // 本番: 体調記録・症状の設定（Figma の架空の記録の代わり）
  const records = health ? health.records : healthRecords
  const noteCount = notesLive ? notesLive.notes.length : notes.length
  const [quizAnswer, setQuizAnswer] = useState("")
  const [motionEnabled, setMotionEnabled] = useState(true)
  const [lessonStates, setLessonStates] = useState<Record<string, {
    status: DLesson["status"]
    progress: number
  }>>({})
  const [learningPanel, setLearningPanel] = useState<"figure" | "points">(
    "figure",
  )

  const scenarioLessons = dLessons.map((lesson) => {
    let scenarioLesson = lesson
    if (scenario === 1 && lesson.prescribed)
      scenarioLesson = {
        ...lesson,
        prescribed: false,
        sender: undefined,
        date: undefined,
      }
    if (scenario === 2 && lesson.id === 1)
      scenarioLesson = { ...lesson, status: "new" as const, progress: 0 }
    if (scenario === 4 && lesson.prescribed)
      scenarioLesson = { ...lesson, status: "done" as const, progress: 100 }
    if (scenario === 5 && lesson.id === 5)
      scenarioLesson = { ...lesson, status: "doing" as const, progress: 60 }
    return lessonStates[lesson.id]
      ? { ...scenarioLesson, ...lessonStates[lesson.id] }
      : scenarioLesson
  })
  const figmaLessons =
    scenario === 6
      ? [...scenarioLessons, ...dLessons.slice(3, 8).map((lesson, index) => ({
            ...lesson,
            id: Number(lesson.id) + 20,
            title: `${lesson.title}：詳しく知る`,
          }))]
      : scenarioLessons
  const visibleLessons: DLesson[] = learning ? learning.lessons : figmaLessons
  const selected: DLesson | undefined =
    visibleLessons.find((lesson) => String(lesson.id) === selectedId) ||
    (learning ? undefined : visibleLessons[0])
  // 本番: ホームの「今回の情報処方」は最新の処方だけ（以前の処方は「教材を探す」「学習記録」に残る）
  const prescriptions = visibleLessons.filter((lesson) =>
    learning ? lesson.latest : lesson.prescribed,
  )
  const activePrescription =
    prescriptions.find((lesson) => lesson.status === "doing") ||
    prescriptions.find((lesson) => lesson.status === "new")
  const filteredLessons = visibleLessons.filter((lesson) => {
    const sourceMatch =
      sourceFilter === "すべて" ||
      (sourceFilter === "処方" ? lesson.prescribed : !lesson.prescribed)
    const statusMatch =
      statusFilter === "すべて" ||
      (statusFilter === "未学習" && lesson.status === "new") ||
      (statusFilter === "途中" && lesson.status === "doing") ||
      (statusFilter === "学習済み" && lesson.status === "done")
    return sourceMatch && statusMatch
  })

  const openLesson = (lesson: DLesson) => {
    setSelectedId(String(lesson.id))
    setPage("detail")
  }

  // ---- 本番（Step 2）: 学習・理解確認の実データ ----
  const versionId = learning ? (selected?.versionId ?? null) : null
  const learnView = useLearnView(
    learning && ["learn", "explanation"].includes(page) ? versionId : null,
    notify,
  )
  // 学習画面でも有効にする（最後のページの「理解を確認する」で、完了済みなら新しい挑戦を作るため）
  const quiz = useAttempt(
    learning && ["learn", "quiz", "explanation", "result"].includes(page) ? versionId : null,
    notify,
  )
  // 学習中のページ（未操作なら保存済みの位置から再開）
  const [slideAt, setSlideAt] = useState<{ versionId: string; seq: number } | null>(null)
  const totalSlides = learnView?.slides.length ?? 0
  const currentSeq =
    learnView && slideAt?.versionId === learnView.versionId
      ? slideAt.seq
      : Math.min(Math.max(1, learnView?.progress.lastSlideSeq ?? 1), Math.max(1, totalSlides))
  const currentSlide = learnView?.slides.find((slide) => slide.seq === currentSeq) ?? null
  const goSlide = (seq: number) => {
    if (!learnView) return
    setSlideAt({ versionId: learnView.versionId, seq })
    // 学習済みの教材を読み直すときは、学習済みの状態を「途中」に戻さない
    if (selected?.status !== "done") void saveProgress(learnView.versionId, seq, "reading").catch(() => {})
  }
  // 理解確認の画面を再読み込みしたとき: 進行中（なければ最新）の挑戦を読み込む
  useEffect(() => {
    if (learning && versionId && !quiz.attempt && ["quiz", "explanation", "result"].includes(page)) {
      void quiz.load(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning, versionId, page, quiz.attempt])
  // 一覧の画面へ戻ったら、学習状態を読み直す（学習・回答の結果を反映）
  useEffect(() => {
    if (learning && ["home", "prescriptions", "library", "category", "search", "detail", "history"].includes(page)) void learning.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])
  const attempt = quiz.attempt
  const nextQuestion = attempt?.questions.find((question) => !question.answer) ?? null
  const shownQuestion =
    attempt?.questions.find((question) => question.questionId === quizQuestionId && question.answer) ??
    [...(attempt?.questions ?? [])].reverse().find((question) => question.answer) ??
    null
  const startQuiz = async () => {
    if (!learnView) return
    await saveProgress(learnView.versionId, currentSeq, "quiz").catch(() => {})
    const a = await quiz.load(false)
    // 前回の挑戦が完了していれば、新しい挑戦として始める（前回の回答は記録に残る）
    if (a?.completedAt) await quiz.load(true)
    setQuizAnswer("")
    setPage("quiz")
  }
  const finishWithoutQuiz = async () => {
    if (!learnView) return
    await saveProgress(learnView.versionId, currentSeq, "completed").catch(() => {})
    notify("学習を記録しました")
    setPage("home")
  }
  const changeScenario = (value: number) => {
    setScenario(value)
    setSharing(value === 7)
    setLessonStates({})
    setQuizAnswer("")
    setPage("home")
  }

  const renderPage = () => {
    // 本番: 教材を開く画面で、教材がまだ読み込まれていない（または見つからない）とき
    if (["detail", "learn", "quiz", "explanation", "result"].includes(page) && !selected) {
      return learning?.loaded ? (
        <div className="d-empty-search">
          <Icon name="search" size={32} />
          <h2>この教材は表示できません</h2>
          <p>ホームから教材を選び直してください。</p>
        </div>
      ) : null
    }
    if (page === "home")
      return (
        <DHome
          scenario={scenario}
          prescriptions={prescriptions}
          active={activePrescription}
          sharing={sharing}
          onOpen={openLesson}
          setPage={setPage}
          visit={visit}
          recentNotes={notesLive ? notesLive.notes.map((note) => note.body) : notes}
          onAddNote={async (body) => {
            if (notesLive) {
              const ok = await notesLive.create(body)
              if (ok) notify("診察ノートに保存しました")
              return ok
            }
            setNotes([...notes, body])
            notify("質問を保存しました")
            return true
          }}
        />
      )
    if (page === "prescriptions")
      return (
        <DPrescriptions
          lessons={prescriptions}
          onOpen={openLesson}
          onBack={() => setPage("home")}
        />
      )
    if (page === "library")
      return (
        <DLibrary
          lessons={filteredLessons}
          sourceFilter={sourceFilter}
          statusFilter={statusFilter}
          setSourceFilter={setSourceFilter}
          setStatusFilter={setStatusFilter}
          setQuery={setQuery}
          query={query}
          onSearch={() => setPage("search")}
          onCategory={(category) => {
            setSelectedCategory(category)
            setPage("category")
          }}
          onOpen={openLesson}
        />
      )
    if (page === "category")
      return (
        <DCategory
          category={selectedCategory}
          fallback={!learning}
          lessons={visibleLessons.filter(
            (lesson) => lesson.category === selectedCategory,
          )}
          onOpen={openLesson}
          onBack={() => setPage("library")}
        />
      )
    if (page === "search")
      return (
        <DSearch
          query={query}
          setQuery={setQuery}
          lessons={visibleLessons}
          onOpen={openLesson}
          onBack={() => setPage("library")}
        />
      )
    if (page === "detail")
      return (
        <DDetail
          lesson={selected!}
          onBack={() => setPage("library")}
          onStart={() => {
            if (learning && selected) {
              if (selected.status === "new" && selected.versionId)
                void saveProgress(selected.versionId, 1, "reading").catch(() => {})
              setPage("learn")
              return
            }
            if (selected!.status === "new") {
              setLessonStates({
                ...lessonStates,
                [selected!.id]: { status: "doing" as const, progress: 10 },
              })
            }
            setPage("learn")
          }}
          onZoom={() => setZoomed(true)}
        />
      )
    if (page === "learn")
      return (
        <DLearning
          lesson={selected!}
          panel={learningPanel}
          setPanel={setLearningPanel}
          live={
            learning
              ? {
                  slide: currentSlide,
                  seq: currentSeq,
                  total: totalSlides,
                  hasQuiz: (learnView?.questionCount ?? 0) > 0,
                  onPrev: () =>
                    currentSeq > 1 ? goSlide(currentSeq - 1) : setPage("detail"),
                  onNext: () =>
                    currentSeq < totalSlides
                      ? goSlide(currentSeq + 1)
                      : (learnView?.questionCount ?? 0) > 0
                        ? void startQuiz()
                        : void finishWithoutQuiz(),
                }
              : undefined
          }
          onClose={() => {
            if (learning) {
              notify("学習位置を保存しました")
              setPage("home")
              return
            }
            setLessonStates({
              ...lessonStates,
              [selected!.id]: {
                status: "doing" as const,
                progress: Math.max(selected!.progress, 66),
              },
            })
            notify("学習位置を保存しました")
            setPage("home")
          }}
          onNext={() => setPage("quiz")}
          onZoom={() => setZoomed(true)}
        />
      )
    if (page === "quiz")
      return (
        <DQuiz
          answer={quizAnswer}
          setAnswer={setQuizAnswer}
          live={
            learning
              ? {
                  question: nextQuestion,
                  index: attempt ? attempt.questions.findIndex((q) => q === nextQuestion) : 0,
                  total: attempt?.nQuestions ?? 0,
                  busy: quiz.busy,
                }
              : undefined
          }
          onBack={() => setPage("learn")}
          onConfirm={async () => {
            if (!learning) return setPage("explanation")
            if (!nextQuestion) return
            const index = nextQuestion.options.indexOf(quizAnswer)
            const ok = await quiz.answer(nextQuestion.questionId, index >= 0 ? index : null)
            if (!ok) return
            setQuizQuestionId(nextQuestion.questionId)
            setPage("explanation")
          }}
        />
      )
    if (page === "explanation")
      return (
        <DExplanation
          answer={quizAnswer}
          live={
            learning
              ? {
                  question: shownQuestion,
                  relatedTitle:
                    learnView?.slides.find((slide) => slide.seq === shownQuestion?.relatedSlideSeq)?.title ?? null,
                  remaining: attempt?.questions.filter((q) => !q.answer).length ?? 0,
                }
              : undefined
          }
          onBackToLesson={() => {
            if (learning && learnView && shownQuestion?.relatedSlideSeq)
              setSlideAt({ versionId: learnView.versionId, seq: shownQuestion.relatedSlideSeq })
            setPage("learn")
          }}
          onNext={() => {
            if (learning) {
              setQuizAnswer("")
              setPage(attempt?.questions.some((q) => !q.answer) ? "quiz" : "result")
              return
            }
            setLessonStates({
              ...lessonStates,
              [selected!.id]: { status: "done" as const, progress: 100 },
            })
            setPage("result")
          }}
          onAddQuestion={() => {
            // 本番: 候補を診察ノートの入力欄に入れるだけ（患者が確認して「質問を保存」を押したときに記録）
            if (notesLive && shownQuestion && selected?.versionId) {
              setNoteDraft({
                text: `「${shownQuestion.stem}」について、私の場合を教えてください`,
                versionId: selected.versionId,
                questionId: shownQuestion.questionId,
                title: selected.title,
              })
              notify("質問候補を診察ノートの入力欄に入れました。確認して保存してください")
              setPage("notes")
              return
            }
            const candidate = learning && shownQuestion
              ? `「${shownQuestion.stem}」について、私の場合を教えてください`
              : "腕を動かす範囲について、私の場合の目安を教えてください"
            if (!notes.includes(candidate)) setNotes([...notes, candidate])
            notify("質問候補を診察ノートに追加しました")
          }}
        />
      )
    if (page === "result")
      return (
        <DResult
          answer={quizAnswer}
          live={
            learning && selected
              ? {
                  title: selected.title,
                  slideCount: selected.slideCount ?? 0,
                  answered: attempt ? attempt.nCorrect + attempt.nWrong + attempt.nUnknown : 0,
                  needsReview: attempt ? attempt.nWrong + attempt.nUnknown : 0,
                  learnedCount: visibleLessons.filter((lesson) => lesson.status !== "new").length,
                }
              : undefined
          }
          healthDays={
            new Set(
              records.map((record) => record.measuredAt.slice(0, 10)),
            ).size
          }
          questionCount={noteCount}
          motionEnabled={motionEnabled}
          setMotionEnabled={setMotionEnabled}
          onNotes={() => setPage("notes")}
          onHome={() => setPage("home")}
        />
      )
    if (page === "history")
      return (
        <DHistory
          lessons={visibleLessons}
          onOpen={openLesson}
          onCategory={(category) => {
            setSelectedCategory(category)
            setPage("category")
          }}
        />
      )
    if (page === "health")
      return (
        <DHealthTracker
          records={records}
          setRecords={setHealthRecords}
          activeSymptomIds={health ? health.activeIds : activeSymptomIds}
          setActiveSymptomIds={
            health
              ? (ids: string[]) => void health.saveSettings(ids, health.customNames)
              : setActiveSymptomIds
          }
          customNames={health ? health.customNames : customSymptomNames}
          setCustomNames={setCustomSymptomNames}
          health={health}
          learnedCount={visibleLessons.filter((lesson) => lesson.status !== "new").length}
          noteCount={noteCount}
          motionEnabled={motionEnabled}
          setMotionEnabled={setMotionEnabled}
          notify={notify}
        />
      )
    if (page === "notes")
      return (
        <DNotes
          notes={notes}
          setNotes={setNotes}
          live={notesLive}
          draftFrom={noteDraft}
          clearDraft={() => setNoteDraft(null)}
          notify={notify}
          onShare={() => setPage("share")}
          visitDate={visit?.date ?? null}
        />
      )
    return (
      <DShare
        // 延長の再承認は、承認前と同じ確認画面で行う
        sharing={live ? live.sharing && !live.extensionPending : sharing}
        setSharing={setSharing}
        live={live}
        onBack={() => setPage("home")}
      />
    )
  }

  const fullScreen = ["learn", "quiz", "explanation", "result"].includes(page)
  // 本番: 学習領域ごとの公開教材数と学習状況（学習済みの割合）
  const categories: DCategoryInfo[] = learning
    ? dCategories.map((category) => {
        const inArea = visibleLessons.filter((lesson) => lesson.category === category.name)
        const done = inArea.filter((lesson) => lesson.status === "done").length
        return { ...category, count: inArea.length, progress: inArea.length ? Math.round((done / inArea.length) * 100) : 0 }
      })
    : dCategories
  const now = new Date()
  const liveInfo: DLiveInfo | null = learning
    ? {
        loaded: learning.loaded,
        familyName: (userName ?? "").split(/[\s　]/)[0] || (userName ?? ""),
        today: `${now.getMonth() + 1}月${now.getDate()}日 ${"日月火水木金土"[now.getDay()]}曜日`,
        latest: learning.latest,
        sharingLabel: live?.clinicianName ?? null,
        sharingRemainingMin: live?.remainingMin ?? 0,
        noteCount,
        lastHealthDate: records.length
          ? (() => {
              const d = new Date([...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0].measuredAt)
              return `${d.getMonth() + 1}月${d.getDate()}日`
            })()
          : null,
      }
    : null
  return (
    <CategoriesContext.Provider value={categories}>
    <LiveInfoContext.Provider value={liveInfo}>
    <div className="d-prototype-wrap">
      {variant === "prototype" && (
      <div className="d-scenario-bar">
        <label htmlFor="scenario">検証シナリオ</label>
        <select
          id="scenario"
          value={scenario}
          onChange={(event) => changeScenario(Number(event.target.value))}
        >
          {dScenarios.map((label, index) => (
            <option key={label} value={index + 1}>
              {index + 1}. {label}
            </option>
          ))}
        </select>
        <span>画面内のデータ状態が切り替わります</span>
      </div>
      )}
      <div
        className={`d-device viewport-${viewport}${variant === "app" ? " d-device-app" : ""}`}
      >
        {!fullScreen && (
          <DHeader sharing={sharing} onShare={() => setPage("share")} />
        )}
        <main className={`d-main ${fullScreen ? "full" : ""}`}>
          {renderPage()}
        </main>
        {!fullScreen && (
          <DNav page={page} setPage={setPage} noteCount={noteCount} />
        )}
      </div>
      {zoomed && (
        <div className="d-image-modal" onClick={() => setZoomed(false)}>
          <div onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setZoomed(false)}>閉じる</button>
            {learning ? (
              // 本番: 表示中のページの承認済み図解と、その代替説明
              <>
                <DImageSlot
                  kind="medical"
                  caption={currentSlide?.figures[0]?.caption ?? ""}
                  image={
                    currentSlide?.figures[0]
                      ? { src: currentSlide.figures[0].src, alt: currentSlide.figures[0].altText ?? currentSlide.title }
                      : undefined
                  }
                />
                {(currentSlide?.figures[0]?.longDescription || currentSlide?.figures[0]?.altText) && (
                  <div className="d-alt-copy">
                    <b>画像の代替説明</b>
                    <p>{currentSlide.figures[0].longDescription ?? currentSlide.figures[0].altText}</p>
                  </div>
                )}
              </>
            ) : (
            <>
            <DImageSlot
              kind="medical"
              caption="腕の動かし方を説明する医学図解。画像・ラベル・説明文は独立して管理します。"
            />
            <div className="d-alt-copy">
              <b>画像の代替説明</b>
              <p>
                手術後の腕を無理なく動かす方法を、段階ごとに示す監修済み図解を掲載する領域です。
              </p>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </div>
    </LiveInfoContext.Provider>
    </CategoriesContext.Provider>
  )
}

function DHealthTracker({
  records,
  setRecords,
  activeSymptomIds,
  setActiveSymptomIds,
  customNames,
  setCustomNames,
  motionEnabled,
  setMotionEnabled,
  notify,
  health,
  learnedCount,
  noteCount,
}: {
  /** 本番（Step 3）: 体調記録の実 API。1 回の測定 = 1 記録（同じ日でも別の記録）。新しい記録は空欄から始める */
  health?: PatientHealth
  learnedCount?: number
  noteCount?: number
  records: HealthRecord[]
  setRecords: (records: HealthRecord[]) => void
  activeSymptomIds: string[]
  setActiveSymptomIds: (ids: string[]) => void
  customNames: Record<string, string>
  setCustomNames: (names: Record<string, string>) => void
  motionEnabled: boolean
  setMotionEnabled: (value: boolean) => void
  notify: (message?: string) => void
}) {
  const latest =
    [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ||
    initialHealthRecords[initialHealthRecords.length - 1]
  const [view, setView] = useState<"record" | "history" | "manage">("record")
  // 本番: 新しい記録は今の日時・すべて空欄（前回の値を今回の値として入れない）
  const [measuredAt, setMeasuredAt] = useState(() => (health ? toLocalInput(new Date()) : latest.measuredAt))
  const emptyVitals = { temperature: "", systolic: "", diastolic: "", pulse: "", spo2: "" }
  const [vitals, setVitals] = useState(() =>
    health
      ? emptyVitals
      : {
          temperature: String(latest.vitals.temperature ?? ""),
          systolic: String(latest.vitals.systolic ?? ""),
          diastolic: String(latest.vitals.diastolic ?? ""),
          pulse: String(latest.vitals.pulse ?? ""),
          spo2: String(latest.vitals.spo2 ?? ""),
        },
  )
  const [symptoms, setSymptoms] = useState<Record<string, number | undefined>>(() =>
    health
      ? {}
      : Object.fromEntries(
          activeSymptomIds.map((id) => [id, latest.symptoms[id]?.severity]),
        ),
  )
  // 本番: 履歴から編集している記録（なければ新しい記録）
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailOpen, setDetailOpen] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, {
    count?: string
    location?: string
    interference?: string
  }>>({})
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("すべて")
  const [customName, setCustomName] = useState("")
  const [chartSymptom, setChartSymptom] = useState("numbness")
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const limits: Record<string, [number, number]> = {
    temperature: [30, 45],
    systolic: [50, 260],
    diastolic: [30, 160],
    pulse: [20, 250],
    spo2: [50, 100],
  }
  const invalidFields = Object.entries(vitals)
    .filter(([, value]) => value !== "")
    .filter(([key, value]) => {
      const number = Number(value)
      return (
        Number.isNaN(number) ||
        number < limits[key][0] ||
        number > limits[key][1]
      )
    })
    .map(([key]) => key)
  const displayName = (id: string) => customNames[id] || symptomName(id)
  const selectedDateRecord = records.find(
    (record) => record.measuredAt.slice(0, 10) === measuredAt.slice(0, 10),
  )
  const recordedDayCount = new Set(
    records.map((record) => record.measuredAt.slice(0, 10)),
  ).size

  const loadRecordForDate = (value: string) => {
    setMeasuredAt(value)
    // 本番: 同じ日に何回でも記録できるため、日時を変えても既存の記録を読み込まない
    if (health) return
    const found = records.find(
      (record) => record.measuredAt.slice(0, 10) === value.slice(0, 10),
    )
    if (!found) {
      setVitals({
        temperature: "",
        systolic: "",
        diastolic: "",
        pulse: "",
        spo2: "",
      })
      setSymptoms({})
      return
    }
    setVitals({
      temperature: String(found.vitals.temperature ?? ""),
      systolic: String(found.vitals.systolic ?? ""),
      diastolic: String(found.vitals.diastolic ?? ""),
      pulse: String(found.vitals.pulse ?? ""),
      spo2: String(found.vitals.spo2 ?? ""),
    })
    setSymptoms(
      Object.fromEntries(
        activeSymptomIds.map((id) => [id, found.symptoms[id]?.severity]),
      ),
    )
  }

  /** 本番: 履歴の記録を編集のために読み込む */
  const editRecord = (record: HealthRecord) => {
    setEditingId(record.id)
    setMeasuredAt(record.measuredAt)
    setVitals({
      temperature: String(record.vitals.temperature ?? ""),
      systolic: String(record.vitals.systolic ?? ""),
      diastolic: String(record.vitals.diastolic ?? ""),
      pulse: String(record.vitals.pulse ?? ""),
      spo2: String(record.vitals.spo2 ?? ""),
    })
    setSymptoms(Object.fromEntries(Object.entries(record.symptoms).map(([id, entry]) => [id, entry.severity])))
    setDetails(
      Object.fromEntries(
        Object.entries(record.symptoms).map(([id, entry]) => [
          id,
          { count: entry.count == null ? undefined : String(entry.count), location: entry.location, interference: entry.interference },
        ]),
      ),
    )
    setFeedbackOpen(false)
    setView("record")
  }
  const resetForm = () => {
    setEditingId(null)
    setMeasuredAt(toLocalInput(new Date()))
    setVitals(emptyVitals)
    setSymptoms({})
    setDetails({})
    setDetailOpen(null)
  }
  const saveLive = async () => {
    if (!health || invalidFields.length || saving) return
    const n = (v: string) => (v === "" ? null : Number(v))
    const input: HealthInput = {
      measuredAt,
      vitals: { temperature: n(vitals.temperature), systolic: n(vitals.systolic), diastolic: n(vitals.diastolic), pulse: n(vitals.pulse), spo2: n(vitals.spo2) },
      // 回答した症状だけ（未回答は欠測として送らない）。非表示にした症状も、編集中の記録に回答があれば残す
      symptoms: Object.entries(symptoms)
        .filter(([, severity]) => severity !== undefined)
        .map(([key, severity]) => ({
          key,
          severity: severity!,
          count: details[key]?.count ? Number(details[key]?.count) : null,
          location: details[key]?.location || null,
          interference: details[key]?.interference || null,
        })),
    }
    setSaving(true)
    const wasEditing = !!editingId
    const ok = await health.save(input, editingId)
    setSaving(false)
    if (!ok) return
    resetForm()
    setFeedbackOpen(true)
    notify(wasEditing ? "記録を更新しました" : "体調を記録しました")
  }

  const saveRecord = () => {
    if (health) return void saveLive()
    if (invalidFields.length) return
    const symptomEntries: HealthRecord["symptoms"] = {}
    Object.entries(symptoms).forEach(([id, severity]) => {
      if (severity === undefined) return
      symptomEntries[id] = {
        severity: severity as 0 | 1 | 2 | 3 | 4,
        count: details[id]?.count ? Number(details[id]?.count) : undefined,
        location: details[id]?.location || undefined,
        interference: details[id]?.interference || undefined,
        customName: customNames[id],
      }
    })
    const nextRecord: HealthRecord = {
      id: selectedDateRecord?.id || `r-${Date.now()}`,
      measuredAt,
      vitals: {
        temperature: vitals.temperature
          ? Number(vitals.temperature)
          : undefined,
        systolic: vitals.systolic ? Number(vitals.systolic) : undefined,
        diastolic: vitals.diastolic ? Number(vitals.diastolic) : undefined,
        pulse: vitals.pulse ? Number(vitals.pulse) : undefined,
        spo2: vitals.spo2 ? Number(vitals.spo2) : undefined,
      },
      symptoms: symptomEntries,
    }
    setRecords(
      selectedDateRecord
        ? records.map((record) =>
            record.id === selectedDateRecord.id ? nextRecord : record,
          )
        : [...records, nextRecord],
    )
    setFeedbackOpen(true)
    notify(
      selectedDateRecord ? "この日の記録を更新しました" : "体調を記録しました",
    )
  }

  if (view === "manage")
    return (
      <DSymptomManager
        activeIds={activeSymptomIds}
        setActiveIds={setActiveSymptomIds}
        search={search}
        setSearch={setSearch}
        category={category}
        setCategory={setCategory}
        customName={customName}
        setCustomName={setCustomName}
        customNames={customNames}
        setCustomNames={setCustomNames}
        onAddCustom={
          health
            ? (name: string) => {
                const id = `custom-${crypto.randomUUID()}`
                void health.saveSettings([...activeSymptomIds, id], { ...customNames, [id]: name }).then((ok) => {
                  if (ok) notify("その他の症状を追加しました")
                })
              }
            : undefined
        }
        onBack={() => setView("record")}
        notify={notify}
      />
    )

  return (
    <div className="d-health">
      <p className="eyebrow">AT-HOME LOG</p>
      <h1>体調記録</h1>
      <p className="d-health-intro">
        測ったもの、気になる症状だけを記録できます。毎日すべて入力する必要はありません。
      </p>
      <div className="d-health-tabs">
        <button
          className={view === "record" ? "active" : ""}
          onClick={() => setView("record")}
        >
          今日の記録
        </button>
        <button
          className={view === "history" ? "active" : ""}
          onClick={() => setView("history")}
        >
          履歴・グラフ
        </button>
      </div>
      {view === "record" ? (
        <>
          <label className="d-measured-at">
            <span>
              <Icon name="calendar" />
              測定日時
            </span>
            <input
              type="datetime-local"
              value={measuredAt}
              max={health ? toLocalInput(new Date()) : `${currentVisitDate}T23:59`}
              onChange={(event) => loadRecordForDate(event.target.value)}
            />
          </label>
          <section className="d-health-section">
            <div className="d-health-section-head">
              <div>
                <span className="d-health-step">1</span>
                <div>
                  <h2>バイタルサイン</h2>
                  <p>測定していない項目は空欄で保存できます</p>
                </div>
              </div>
              <BadgeLike>すべて任意</BadgeLike>
            </div>
            <div className="d-vital-grid">
              <DVitalField
                label="体温"
                unit="℃"
                value={vitals.temperature}
                step="0.1"
                invalid={invalidFields.includes("temperature")}
                hint="30.0〜45.0"
                onChange={(value) =>
                  setVitals({ ...vitals, temperature: value })
                }
              />
              <div className="d-vital-card blood-pressure">
                <label>血圧</label>
                <div>
                  <input
                    inputMode="numeric"
                    value={vitals.systolic}
                    onChange={(event) =>
                      setVitals({ ...vitals, systolic: event.target.value })
                    }
                    placeholder="上"
                    aria-label="収縮期血圧"
                  />
                  <span>/</span>
                  <input
                    inputMode="numeric"
                    value={vitals.diastolic}
                    onChange={(event) =>
                      setVitals({ ...vitals, diastolic: event.target.value })
                    }
                    placeholder="下"
                    aria-label="拡張期血圧"
                  />
                </div>
                <small>mmHg</small>
                {(invalidFields.includes("systolic") ||
                  invalidFields.includes("diastolic")) && (
                  <p>桁数・単位を確認してください</p>
                )}
              </div>
              <DVitalField
                label="脈拍"
                unit="回/分"
                value={vitals.pulse}
                invalid={invalidFields.includes("pulse")}
                hint="20〜250"
                onChange={(value) => setVitals({ ...vitals, pulse: value })}
              />
              <DVitalField
                label="SpO₂"
                unit="%"
                value={vitals.spo2}
                invalid={invalidFields.includes("spo2")}
                hint="50〜100"
                onChange={(value) => setVitals({ ...vitals, spo2: value })}
              />
            </div>
            <p className="d-value-policy">
              入力値は自動補正しません。表示された単位と桁数を確認してください。
            </p>
          </section>
          <section className="d-health-section symptoms">
            <div className="d-health-section-head">
              <div>
                <span className="d-health-step">2</span>
                <div>
                  <h2>自覚症状</h2>
                  <p>該当する程度を1回タップします</p>
                </div>
              </div>
              <button onClick={() => setView("manage")}>
                <Icon name="plus" />
                症状を追加
              </button>
            </div>
            <div className="d-symptom-records">
              {(health
                ? [...activeSymptomIds, ...Object.keys(symptoms).filter((id) => symptoms[id] !== undefined && !activeSymptomIds.includes(id))]
                : activeSymptomIds
              ).map((id) => {
                const definition = symptomLibrary.find((item) => item.id === id)
                return (
                  <article key={id}>
                    <div className="d-symptom-title">
                      <div>
                        <b>{displayName(id)}</b>
                        <small>{definition?.category || "その他"}</small>
                      </div>
                      <button
                        onClick={() =>
                          setDetailOpen(detailOpen === id ? null : id)
                        }
                      >
                        {detailOpen === id ? "詳細を閉じる" : "詳細（任意）"}
                      </button>
                    </div>
                    <div className="d-severity-scale">
                      {severityLabels.map((label, value) => (
                        <button
                          key={label}
                          className={
                            symptoms[id] === value ? `active s${value}` : ""
                          }
                          onClick={() =>
                            setSymptoms({ ...symptoms, [id]: value })
                          }
                          aria-pressed={symptoms[id] === value}
                        >
                          <span>{value}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                    {symptoms[id] === undefined && (
                      <p className="d-missing-label">
                        未回答（欠測として保存）
                      </p>
                    )}
                    {detailOpen === id && (
                      <div className="d-symptom-detail">
                        {(definition?.detailType === "count" ||
                          id === "vomiting" ||
                          id === "diarrhea") && (
                          <label>
                            回数
                            <input
                              inputMode="numeric"
                              value={details[id]?.count || ""}
                              onChange={(event) =>
                                setDetails({
                                  ...details,
                                  [id]: {
                                    ...details[id],
                                    count: event.target.value,
                                  },
                                })
                              }
                              placeholder="任意"
                            />
                          </label>
                        )}
                        {(definition?.detailType === "location" ||
                          ["numbness", "jointPain"].includes(id)) && (
                          <label>
                            部位
                            <input
                              value={details[id]?.location || ""}
                              onChange={(event) =>
                                setDetails({
                                  ...details,
                                  [id]: {
                                    ...details[id],
                                    location: event.target.value,
                                  },
                                })
                              }
                              placeholder="例：両手の指"
                            />
                          </label>
                        )}
                        <label>
                          日常生活への支障
                          <input
                            value={details[id]?.interference || ""}
                            onChange={(event) =>
                              setDetails({
                                ...details,
                                [id]: {
                                  ...details[id],
                                  interference: event.target.value,
                                },
                              })
                            }
                            placeholder="任意"
                          />
                        </label>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
            <div className="d-scale-note">
              <Icon name="help" />
              <p>
                0〜4は患者本人による症状の程度です。CTCAE
                Gradeや正式なPRO-CTCAE回答ではありません。
              </p>
            </div>
          </section>
          <div className="d-monitoring-note">
            <Icon name="alert" />
            <p>
              <b>この記録は緊急連絡ではありません</b>
              記録しただけでは医療者へ通知されません。急な症状や強い苦痛がある場合は、医療機関から案内された連絡先へご相談ください。
            </p>
          </div>
          <button
            className="primary-button d-save-health"
            disabled={invalidFields.length > 0 || saving}
            onClick={saveRecord}
          >
            <Icon name="check" />
            {health ? (editingId ? "この記録を更新" : "この記録を保存") : "この日の記録を保存"}
          </button>
          {health && editingId && (
            <button className="d-text-action" onClick={resetForm}>
              編集をやめて新しい記録にする
            </button>
          )}
          <p className="d-share-health">
            <Icon name="shield" />
            QR一時共有を承認したときだけ、医療者がこの記録を閲覧できます。
          </p>
          {feedbackOpen && (
            <div
              className={`d-gentle-feedback ${
                motionEnabled ? "" : "no-motion"
              }`}
              role="status"
            >
              <button
                className="d-feedback-close"
                onClick={() => setFeedbackOpen(false)}
                aria-label="閉じる"
              >
                ×
              </button>
              <span className="d-feedback-mark">
                <Icon name="check" size={26} />
              </span>
              <div>
                <p className="eyebrow">SAVED TO YOUR SHIORI</p>
                <h2>今日の体調を残せました</h2>
                <p>小さな変化も、大切な記録です。</p>
              </div>
              <div className="d-feedback-totals">
                <span>
                  <b>
                    {health || selectedDateRecord
                      ? recordedDayCount
                      : recordedDayCount + 1}
                  </b>
                  体調を記録した日
                </span>
                <span>
                  <b>{health ? (learnedCount ?? 0) : 4}</b>
                  これまでに学んだ教材
                </span>
                <span>
                  <b>{health ? (noteCount ?? 0) : 2}</b>
                  診察につなげた質問
                </span>
              </div>
              <button
                className="d-motion-toggle"
                onClick={() => setMotionEnabled(!motionEnabled)}
              >
                動きの効果：{motionEnabled ? "オン" : "オフ"}
              </button>
            </div>
          )}
        </>
      ) : (
        <DHealthHistory
          records={records}
          chartSymptom={chartSymptom}
          setChartSymptom={setChartSymptom}
          live={
            health
              ? {
                  symptomIds: [...new Set([...activeSymptomIds, ...records.flatMap((record) => Object.keys(record.symptoms))])],
                  nameOf: displayName,
                  onEdit: editRecord,
                  onDelete: async (id: string) => {
                    if (await health.remove(id)) {
                      if (editingId === id) resetForm()
                      notify("記録を削除しました")
                    }
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function BadgeLike({ children }: { children: ReactNode }) {
  return <span className="d-badge-like">{children}</span>
}

function DVitalField({
  label,
  unit,
  value,
  onChange,
  invalid,
  hint,
  step,
}: {
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  hint: string
  step?: string
}) {
  return (
    <div className={`d-vital-card ${invalid ? "invalid" : ""}`}>
      <label>{label}</label>
      <div>
        <input
          inputMode="decimal"
          type="number"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="—"
        />
        <span>{unit}</span>
      </div>
      {invalid && <p>{hint}の範囲で確認</p>}
    </div>
  )
}

function DSymptomManager({
  activeIds,
  setActiveIds,
  search,
  setSearch,
  category,
  setCategory,
  customName,
  setCustomName,
  customNames,
  setCustomNames,
  onBack,
  notify,
  onAddCustom,
}: {
  /** 本番: 独自の症状の追加（表示の並びと症状名を 1 回で保存） */
  onAddCustom?: (name: string) => void
  activeIds: string[]
  setActiveIds: (ids: string[]) => void
  search: string
  setSearch: (value: string) => void
  category: string
  setCategory: (value: string) => void
  customName: string
  setCustomName: (value: string) => void
  customNames: Record<string, string>
  setCustomNames: (names: Record<string, string>) => void
  onBack: () => void
  notify: (message?: string) => void
}) {
  const categories = [
    "すべて",
    ...Array.from(new Set(symptomLibrary.map((item) => item.category))),
  ]
  const filtered = symptomLibrary.filter(
    (item) =>
      (category === "すべて" || item.category === category) &&
      `${item.name}${item.ctcaeReference}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= activeIds.length) return
    const next = [...activeIds]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setActiveIds(next)
  }
  return (
    <div className="d-symptom-manager">
      <DPageHeader title="記録する症状" eyebrow="CUSTOMIZE" onBack={onBack} />
      <p className="d-support-copy">
        非表示にしても過去の記録は削除されません。毎日すべてに回答する必要はありません。
      </p>
      <p className="d-terminology-note">
        候補名はCTCAE
        v6.0の症候性有害事象名を参考にしたUI用表現です。正式な用語対応は医療者による確認を前提とします。
      </p>
      <section>
        <div className="d-section-head">
          <h2>日々の入力に表示中</h2>
          <span>{activeIds.length}項目</span>
        </div>
        <div className="d-active-symptoms">
          {activeIds.map((id, index) => (
            <div key={id}>
              <span>{index + 1}</span>
              <b>{customNames[id] || symptomName(id)}</b>
              <button disabled={index === 0} onClick={() => move(index, -1)}>
                上へ
              </button>
              <button
                disabled={index === activeIds.length - 1}
                onClick={() => move(index, 1)}
              >
                下へ
              </button>
              <button
                onClick={() => {
                  setActiveIds(activeIds.filter((item) => item !== id))
                  notify("日々の入力から非表示にしました。過去の記録は残ります")
                }}
              >
                非表示
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="d-add-symptoms">
        <div className="d-section-head">
          <h2>症状を追加</h2>
        </div>
        <label className="d-search">
          <Icon name="search" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="症状名を検索"
          />
        </label>
        <div className="d-category-chips">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="d-symptom-library">
          {filtered.map((item) => {
            const active = activeIds.includes(item.id)
            return (
              <div key={item.id}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.category} · CTCAE用語参照：{item.ctcaeReference}
                  </small>
                </span>
                <button
                  disabled={active}
                  onClick={() => {
                    setActiveIds([...activeIds, item.id])
                    notify("記録項目に追加しました")
                  }}
                >
                  {active ? "追加済み" : "記録項目に追加"}
                </button>
              </div>
            )
          })}
        </div>
        <div className="d-custom-symptom">
          <h3>その他の症状を自由に追加</h3>
          <div>
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="症状名を入力"
            />
            <button
              disabled={!customName.trim()}
              onClick={() => {
                if (onAddCustom) {
                  onAddCustom(customName.trim())
                  setCustomName("")
                  return
                }
                const id = `custom-${Date.now()}`
                setCustomNames({ ...customNames, [id]: customName.trim() })
                setActiveIds([...activeIds, id])
                setCustomName("")
                notify("その他の症状を追加しました")
              }}
            >
              追加
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function DHealthHistory({
  records,
  chartSymptom,
  setChartSymptom,
  live,
}: {
  records: HealthRecord[]
  chartSymptom: string
  setChartSymptom: (id: string) => void
  /** 本番: 推移を見る症状の候補（表示中＋記録のある症状）、症状名、記録の編集・削除 */
  live?: {
    symptomIds: string[]
    nameOf: (id: string) => string
    onEdit: (record: HealthRecord) => void
    onDelete: (id: string) => void
  }
}) {
  const nameOf = (id: string) => live?.nameOf(id) ?? symptomName(id)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // 本番: 選んだ症状に記録がなければ、記録のある最初の症状の推移を表示する
  const has = (id: string) => records.some((record) => record.symptoms[id])
  const chart = live && !has(chartSymptom) ? (live.symptomIds.find(has) ?? chartSymptom) : chartSymptom
  const sorted = [...records].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  )
  const points = sorted
    .map((record, index) => ({
      index,
      value: record.symptoms[chart]?.severity,
      date: record.measuredAt,
    }))
    .filter((item) => item.value !== undefined)
  const polyline = points
    .map((item) => {
      const x = 20 + (item.index / Math.max(sorted.length - 1, 1)) * 300
      const y = 105 - Number(item.value) * 22
      return `${x},${y}`
    })
    .join(" ")
  return (
    <div className="d-health-history">
      <section className="d-health-chart">
        <div className="d-health-section-head">
          <div>
            <span className="d-health-step">
              <Icon name="pulse" size={16} />
            </span>
            <div>
              <h2>症状の推移</h2>
              <p>自己申告の程度 0〜4</p>
            </div>
          </div>
          <select
            value={chart}
            onChange={(event) => setChartSymptom(event.target.value)}
          >
            {(live ? live.symptomIds : initialActiveSymptomIds).map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
        </div>
        <svg
          viewBox="0 0 340 130"
          role="img"
          aria-label={`${nameOf(chart)}の推移`}
        >
          {[0, 1, 2, 3, 4].map((value) => (
            <g key={value}>
              <line
                x1="20"
                y1={105 - value * 22}
                x2="320"
                y2={105 - value * 22}
              />
              <text x="4" y={109 - value * 22}>
                {value}
              </text>
            </g>
          ))}
          <polyline points={polyline} />
          {points.map((item) => {
            const x = 20 + (item.index / Math.max(sorted.length - 1, 1)) * 300
            const y = 105 - Number(item.value) * 22
            return <circle key={item.date} cx={x} cy={y} r="4" />
          })}
        </svg>
        <div className="d-chart-dates">
          <span>{formatShortDate(sorted[0]?.measuredAt || "")}</span>
          <span>
            {formatShortDate(sorted[sorted.length - 1]?.measuredAt || "")}
          </span>
        </div>
        <p>
          空白の日は未記録です。記録がないことを「症状なし」とは扱いません。
        </p>
      </section>
      <section className="d-health-list">
        <div className="d-section-head">
          <h2>過去の記録</h2>
          <span>
            {live
              ? `${new Set(records.map((record) => record.measuredAt.slice(0, 10))).size}日分・${records.length}件`
              : `${records.length}日分`}
          </span>
        </div>
        {[...records]
          .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
          .map((record) => (
            <details key={record.id}>
              <summary>
                <span>
                  <b>{formatShortDate(record.measuredAt)}</b>
                  <small>
                    {new Date(record.measuredAt).toLocaleTimeString("ja-JP", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                <span>
                  体温 {record.vitals.temperature ?? "—"}℃ · 症状{" "}
                  {Object.keys(record.symptoms).length}項目
                </span>
                <Icon name="arrow" />
              </summary>
              <div>
                <p>
                  血圧{" "}
                  {record.vitals.systolic && record.vitals.diastolic
                    ? `${record.vitals.systolic}/${record.vitals.diastolic} mmHg`
                    : "未記録"}{" "}
                  · 脈拍 {record.vitals.pulse ?? "未記録"} · SpO₂{" "}
                  {record.vitals.spo2 ?? "未記録"}
                </p>
                {Object.entries(record.symptoms).map(([id, entry]) => (
                  <span key={id}>
                    {entry.customName || nameOf(id)}
                    <b>
                      {entry.severity} · {severityLabels[entry.severity]}
                    </b>
                  </span>
                ))}
                {live && Object.keys(record.symptoms).length === 0 && <p>自覚症状：回答なし（欠測）</p>}
                {live && (
                  // 本番: 過去の記録の編集・削除（本人だけ。削除は確認してから）
                  <p className="d-record-actions">
                    <button className="d-text-action" onClick={() => live.onEdit(record)}>
                      この記録を編集
                    </button>
                    {confirmDelete === record.id ? (
                      <>
                        <button className="d-text-action" onClick={() => live.onDelete(record.id)}>
                          削除する
                        </button>
                        <button className="d-text-action" onClick={() => setConfirmDelete(null)}>
                          やめる
                        </button>
                      </>
                    ) : (
                      <button className="d-text-action" onClick={() => setConfirmDelete(record.id)}>
                        この記録を削除
                      </button>
                    )}
                  </p>
                )}
              </div>
            </details>
          ))}
      </section>
    </div>
  )
}

/** ホームの「次の診察までに」: 学習途中 → 未学習 → 学習済みの順に、最大 2 件 */
const homeLessonOrder = { doing: 0, new: 1, done: 2 } as const

function DHome({
  scenario,
  prescriptions,
  active,
  sharing,
  onOpen,
  setPage,
  visit,
  recentNotes,
  onAddNote,
}: {
  scenario: number
  prescriptions: DLesson[]
  active?: DLesson
  sharing: boolean
  onOpen: (lesson: DLesson) => void
  setPage: (page: DPage) => void
  /** 本番: 次回の診察日（患者が登録した日付のみ）。Figma の架空データ表示では undefined */
  visit?: PatientVisit
  /** 保存済みの質問（新しい順に最大 2 件を表示） */
  recentNotes: string[]
  /** ホームから質問を保存。保存できたときだけ true（入力欄を空にする） */
  onAddNote: (body: string) => Promise<boolean>
}) {
  const categories = useContext(CategoriesContext)
  const completed = prescriptions.filter((lesson) => lesson.status === "done")
  const live = useContext(LiveInfoContext)
  // 本番: 今回の処方をすべて学習済み（Figma の検証シナリオ 4 と同じ表示）
  const allDone = live
    ? prescriptions.length > 0 && completed.length === prescriptions.length
    : scenario === 4
  const homeLessons = [...prescriptions]
    .sort((a, b) => homeLessonOrder[a.status] - homeLessonOrder[b.status])
    .filter((lesson) => lesson.status !== "done")
    .slice(0, 2)
  const remainingMin = (lesson: DLesson) =>
    live ? Math.max(1, Math.round((lesson.time * (100 - lesson.progress)) / 100)) : 4
  return (
    <div className="d-home">
      <div className="d-welcome">
        <div>
          <p>こんにちは、{live ? live.familyName : "佐藤"}さん</p>
          <h1>今日、確認すること</h1>
        </div>
        <span>{live ? live.today : "6月14日 金曜日"}</span>
      </div>
      {sharing && (
        <button className="d-sharing-banner" onClick={() => setPage("share")}>
          <Icon name="shield" />
          <span>
            <b>{live ? `${live.sharingLabel ?? "医療者"}と一時共有中` : "山田医師と一時共有中"}</b>
            <small>{live ? `残り${live.sharingRemainingMin}分` : "残り24分"} · タップして管理</small>
          </span>
          <Icon name="arrow" />
        </button>
      )}
      <DVisitCard visit={visit} />
      <section className="d-home-section d-home-first">
        <div className="d-section-head">
          <div>
            <p className="eyebrow">BEFORE YOUR VISIT</p>
            <h2>次の診察までに</h2>
          </div>
        </div>
        {live && !live.loaded ? null : prescriptions.length === 0 ? (
          <div className="d-home-empty">
            <h3>今届いている教材はありません</h3>
            <p>公開教材はいつでも探せます。気になることから、無理のないペースでご覧ください。</p>
            <button className="secondary-button" onClick={() => setPage("library")}>
              教材を探す
              <Icon name="arrow" size={16} />
            </button>
          </div>
        ) : allDone ? (
          <section className="d-complete-hero">
            <span className="d-complete-icon">
              <Icon name="check" size={28} />
            </span>
            <div>
              <Pill tone="soft">今回の情報処方</Pill>
              <h2>{live ? prescriptions.length : 3}件すべて確認しました</h2>
              <p>必要なときは、いつでも読み直せます。</p>
            </div>
            <button onClick={() => setPage("prescriptions")}>
              学習済みを見る
            </button>
          </section>
        ) : (
          <section className="d-next-card">
            <div className="d-next-meta">
              <Pill>今回の情報処方</Pill>
              <span>{live?.latest ? `${live.latest.date} · ${live.latest.clinician}から` : "6月12日 · 山田医師から"}</span>
            </div>
            <h2>
              {active?.status === "doing"
                ? "続きから再開できます"
                : "新しい教材が届いています"}
            </h2>
            {homeLessons.map((lesson, index) => (
              <div key={lesson.id} className="d-home-lesson" data-home-lesson>
                <div className="d-next-lesson">
                  <span className="d-next-icon">
                    <Icon
                      name={lesson.status === "doing" ? "play" : "book"}
                      size={24}
                    />
                  </span>
                  <span>
                    <DStatus lesson={lesson} short />
                    <b>{lesson.title}</b>
                    <small>
                      {lesson.status === "doing"
                        ? `${lesson.progress}%まで学習 · あと約${remainingMin(lesson)}分`
                        : `約${lesson.time}分`}
                    </small>
                  </span>
                </div>
                <button
                  className={index === 0 ? "primary-button" : "secondary-button d-home-lesson-action"}
                  onClick={() => onOpen(lesson)}
                >
                  {lesson.status === "doing" ? "続きから学ぶ" : "教材を確認する"}
                  <Icon name="arrow" size={index === 0 ? 20 : 16} />
                </button>
              </div>
            ))}
            <button
              className="d-text-action"
              onClick={() => setPage("prescriptions")}
            >
              今回の教材をすべて見る（{prescriptions.length}件）
            </button>
          </section>
        )}
      </section>
      <DHomeAsk recentNotes={recentNotes} onAddNote={onAddNote} setPage={setPage} />
      <section className="d-home-section">
        <button className="d-note-summary d-home-health" onClick={() => setPage("health")}>
          <span className="stat-icon blue">
            <Icon name="pulse" />
          </span>
          <span>
            <b>今日の体調を記録</b>
            <small>
              任意 · 気になることだけでも ·{" "}
              {live ? (live.lastHealthDate ? `前回 ${live.lastHealthDate}` : "まだ記録はありません") : "前回 6月19日"}
            </small>
          </span>
          <Icon name="arrow" />
        </button>
      </section>
      <section className="d-home-section">
        <div className="d-section-head">
          <div>
            <p className="eyebrow">EXPLORE</p>
            <h2>自分で教材を探す</h2>
          </div>
          <button onClick={() => setPage("library")}>すべて見る</button>
        </div>
        <div className="d-quick-categories">
          {categories.slice(0, 3).map((category) => (
            <button key={category.name} onClick={() => setPage("library")}>
              <Icon name={category.icon} />
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </section>
      {completed.length > 0 && (
        <p className="d-home-footnote">
          <Icon name="check" size={16} />
          学習済みの教材は「学習記録」から読み直せます
        </p>
      )}
    </div>
  )
}

/**
 * ホーム最上部: 次回の診察日と残り日数。患者が登録した日付だけを表示し、未登録なら「次回診察日を登録」。
 * 共有した日や処方日を診察日として扱わない。日数は Asia/Tokyo の暦日で数える（当日・過ぎた日も区別）。
 */
function DVisitCard({ visit }: { visit?: PatientVisit }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  if (!visit) return null
  if (!visit.loaded) return <div className="d-visit-card loading" aria-hidden />
  const startEdit = () => {
    setValue(visit.date ?? "")
    setEditing(true)
  }
  const save = async (date: string | null) => {
    setBusy(true)
    const ok = await visit.save(date)
    setBusy(false)
    if (ok) setEditing(false)
  }
  if (editing)
    return (
      <section className="d-visit-card editing" aria-label="次回の診察日">
        <label htmlFor="d-visit-input">
          <Icon name="calendar" />
          次回の診察日
        </label>
        <input
          id="d-visit-input"
          data-visit-input
          type="date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <small>病院から案内された日付を入力してください。あなただけが変更できます。</small>
        <div className="d-visit-actions">
          <button className="primary-button" data-visit-save disabled={!value || busy} onClick={() => void save(value)}>
            保存する
          </button>
          <button className="d-visit-cancel" disabled={busy} onClick={() => setEditing(false)}>
            やめる
          </button>
        </div>
        {visit.date && (
          <button className="d-visit-clear" disabled={busy} onClick={() => void save(null)}>
            登録した日付を削除する
          </button>
        )}
      </section>
    )
  if (!visit.date)
    return (
      <section className="d-visit-card empty" aria-label="次回の診察日">
        <span className="d-visit-icon">
          <Icon name="calendar" />
        </span>
        <span>
          <b>次回の診察日は未登録です</b>
          <small>登録すると、診察までの日数と準備をここに表示します</small>
        </span>
        <button className="secondary-button" data-visit-edit onClick={startEdit}>
          次回診察日を登録
        </button>
      </section>
    )
  const days = daysUntil(visit.date)
  return (
    <section className="d-visit-card" aria-label="次回の診察日">
      <div className="d-visit-head">
        <span>
          <Icon name="calendar" size={18} />
          次の診察
        </span>
        <button data-visit-edit onClick={startEdit}>
          変更
        </button>
      </div>
      <p className="d-visit-date-label">{visitDateLabel(visit.date)}</p>
      <p className="d-visit-days" data-visit-days>
        {days > 0 ? (
          <>
            次の診察まで <b>あと{days}日</b>
          </>
        ) : days === 0 ? (
          <b>今日が診察日です</b>
        ) : (
          <>登録した診察日を過ぎました。次の診察日が決まったら登録してください</>
        )}
      </p>
    </section>
  )
}

/** ホームから「診察で聞きたいこと」を直接追加（既存の診察ノート API。保存に成功したときだけ表示に反映） */
function DHomeAsk({
  recentNotes,
  onAddNote,
  setPage,
}: {
  recentNotes: string[]
  onAddNote: (body: string) => Promise<boolean>
  setPage: (page: DPage) => void
}) {
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    const ok = await onAddNote(draft.trim())
    setBusy(false)
    if (ok) setDraft("")
  }
  return (
    <section className="d-home-section d-home-ask">
      <div className="d-section-head">
        <div>
          <p className="eyebrow">ASK AT YOUR VISIT</p>
          <h2>診察で聞きたいこと</h2>
        </div>
        <span data-home-note-count>{recentNotes.length}件 保存済み</span>
      </div>
      <form
        className="d-home-ask-form"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label htmlFor="d-home-note" className="sr-only">
          診察で聞きたいこと
        </label>
        <input
          id="d-home-note"
          data-home-note-input
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="例：副作用が出たときの連絡先は？"
        />
        <button type="submit" className="primary-button" data-home-note-add disabled={!draft.trim() || busy}>
          <Icon name="plus" size={18} />
          追加
        </button>
      </form>
      {recentNotes.length > 0 && (
        <ul className="d-home-ask-list">
          {recentNotes
            .slice(-2)
            .reverse()
            .map((note, index) => (
              <li key={`${index}-${note}`}>{note}</li>
            ))}
        </ul>
      )}
      <button className="d-text-action" onClick={() => setPage("notes")}>
        診察ノートを開く
      </button>
    </section>
  )
}

function DPrescriptions({
  lessons,
  onOpen,
  onBack,
}: {
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onBack: () => void
}) {
  const live = useContext(LiveInfoContext)
  return (
    <div>
      <DPageHeader
        title="今回の情報処方"
        eyebrow="FROM YOUR CARE TEAM"
        onBack={onBack}
      />
      <div className="d-prescription-info">
        <Icon name="user" />
        <span>
          <b>{live?.latest ? `${live.latest.sender}から` : "乳腺外科 山田医師から"}</b>
          <small>{live?.latest ? `${live.latest.date}に届きました · ${lessons.length}件` : "6月12日に届きました · 3件"}</small>
        </span>
      </div>
      <p className="d-gentle-copy">
        次の診察までの目安です。体調や時間に合わせて進めてください。
      </p>
      <div className="d-card-list">
        {lessons.map((lesson) => (
          <DLessonCard
            key={lesson.id}
            lesson={lesson}
            onOpen={() => onOpen(lesson)}
            horizontal
          />
        ))}
      </div>
    </div>
  )
}

function DLibrary({
  lessons,
  sourceFilter,
  statusFilter,
  setSourceFilter,
  setStatusFilter,
  query,
  setQuery,
  onSearch,
  onCategory,
  onOpen,
}: {
  lessons: DLesson[]
  sourceFilter: string
  statusFilter: string
  setSourceFilter: (value: string) => void
  setStatusFilter: (value: string) => void
  query: string
  setQuery: (value: string) => void
  onSearch: () => void
  onCategory: (category: string) => void
  onOpen: (lesson: DLesson) => void
}) {
  const categories = useContext(CategoriesContext)
  return (
    <div className="d-library">
      <p className="eyebrow">LIBRARY</p>
      <h1>知りたいことを探す</h1>
      <form
        className="d-search"
        onSubmit={(event) => {
          event.preventDefault()
          onSearch()
        }}
      >
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="教材名やキーワード"
        />
        <button type="submit">検索</button>
      </form>
      <section>
        <div className="d-section-head">
          <h2>学習領域から探す</h2>
          <span>順番はありません</span>
        </div>
        <p className="d-support-copy">
          今の治療や関心に合わせて、どの領域からでも選べます。
        </p>
        <div className="d-category-cards">
          {categories.map((category) => (
            <button
              key={category.name}
              onClick={() => onCategory(category.name)}
            >
              <span className="d-category-icon">
                <Icon name={category.icon} />
              </span>
              <span>
                <b>{category.name}</b>
                <small>公開教材 {category.count}件</small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>
      <section className="d-all-lessons">
        <div className="d-section-head">
          <h2>すべての公開教材</h2>
          <span>{lessons.length}件</span>
        </div>
        <div className="d-filter-group" aria-label="教材の種類">
          {["すべて", "処方", "自主"].map((filter) => (
            <button
              key={filter}
              className={sourceFilter === filter ? "active" : ""}
              onClick={() => setSourceFilter(filter)}
            >
              {filter === "自主" ? "自主学習" : filter}
            </button>
          ))}
        </div>
        <label className="d-select-filter">
          学習状態
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {["すべて", "未学習", "途中", "学習済み"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="d-card-list">
          {lessons.map((lesson) => (
            <DLessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={() => onOpen(lesson)}
              horizontal
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function DCategory({
  category,
  lessons,
  onOpen,
  onBack,
  fallback = true,
}: {
  /** Figma: 該当がなければ架空の一覧を出す。本番は出さない */
  fallback?: boolean
  category: string
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onBack: () => void
}) {
  const categories = useContext(CategoriesContext)
  const figmaFallback = dLessons.filter((lesson) => lesson.category === category)
  const shown = lessons.length || !fallback ? lessons : figmaFallback
  return (
    <div>
      <DPageHeader title={category} eyebrow="LEARNING AREA" onBack={onBack} />
      <div className="d-area-overview">
        <span className="d-category-icon">
          <Icon
            name={
              categories.find((item) => item.name === category)?.icon || "book"
            }
            size={26}
          />
        </span>
        <div>
          <b>
            公開教材{" "}
            {categories.find((item) => item.name === category)?.count ??
              shown.length}
            件
          </b>
          <p>
            教材を読む順番は決まっていません。必要な内容から選んでください。
          </p>
        </div>
      </div>
      <div className="d-card-list">
        {shown.map((lesson) => (
          <DLessonCard
            key={lesson.id}
            lesson={lesson}
            onOpen={() => onOpen(lesson)}
            horizontal
          />
        ))}
      </div>
    </div>
  )
}

function DSearch({
  query,
  setQuery,
  lessons,
  onOpen,
  onBack,
}: {
  query: string
  setQuery: (value: string) => void
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onBack: () => void
}) {
  const normalized = query.trim()
  const results = lessons.filter(
    (lesson) =>
      !normalized ||
      `${lesson.title}${lesson.category}${lesson.summary}`.includes(normalized),
  )
  return (
    <div>
      <DPageHeader title="検索結果" onBack={onBack} />
      <label className="d-search d-search-results">
        <Icon name="search" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例：腕、食事、仕事"
        />
        {query && <button onClick={() => setQuery("")}>消去</button>}
      </label>
      <div className="d-section-head">
        <h2>{normalized ? `「${normalized}」` : "すべて"}の教材</h2>
        <span>{results.length}件</span>
      </div>
      {results.length ? (
        <div className="d-card-list">
          {results.map((lesson) => (
            <DLessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={() => onOpen(lesson)}
              horizontal
            />
          ))}
        </div>
      ) : (
        <div className="d-empty-search">
          <Icon name="search" size={32} />
          <h2>一致する教材がありません</h2>
          <p>短い言葉に変えるか、学習領域から探してみてください。</p>
        </div>
      )}
    </div>
  )
}

function DDetail({
  lesson,
  onBack,
  onStart,
  onZoom,
}: {
  lesson: DLesson
  onBack: () => void
  onStart: () => void
  onZoom: () => void
}) {
  return (
    <div className="d-detail">
      <DPageHeader title="教材の詳細" onBack={onBack} />
      <DImageSlot
        kind={imageKind(lesson)}
        // 装飾用サムネイルの下には説明を出さない（監修済みの医学図解と区別する）。画像がないときは Figma の枠と説明のまま
        caption={lesson.thumbnail ? "" : "教材内容を補助する監修済み画像を配置する領域"}
        onExpand={lesson.thumbnail ? undefined : onZoom}
        image={lesson.thumbnail ?? undefined}
        fit="contain"
      />
      <div className="d-detail-meta">
        <DStatus lesson={lesson} />
        <span>
          <Icon name="clock" size={16} />約{lesson.time}分
        </span>
      </div>
      <h1>{lesson.title}</h1>
      <p className="d-detail-lead">{lesson.summary}</p>
      {lesson.prescribed && (
        <div className="d-from-doctor">
          <Icon name="user" />
          <span>
            <b>{lesson.sender}から届きました</b>
            <small>
              {lesson.date} · {lesson.latest === false ? "以前の情報処方" : "今回の情報処方"}
              {lesson.note ? ` · 「${lesson.note}」` : ""}
            </small>
          </span>
        </div>
      )}
      {lesson.goal && (
      <section className="d-goal">
        <p className="eyebrow">この教材で確認すること</p>
        <p>{lesson.goal}</p>
      </section>
      )}
      <div className="d-content-list">
        <span>
          <Icon name="book" />
          短い説明 {lesson.slideCount ?? 3}ページ
        </span>
        <span>
          <Icon name="audio" />
          音声読み上げあり
        </span>
        {(lesson.questionCount ?? 1) > 0 && (
        <span>
          <Icon name="help" />
          理解確認 {lesson.questionCount ?? 1}問
        </span>
        )}
      </div>
      <button className="primary-button d-bottom-action" onClick={onStart}>
        <Icon name={lesson.status === "doing" ? "play" : "book"} />
        {lesson.status === "doing"
          ? `${lesson.progress}%から再開する`
          : lesson.status === "done"
            ? "もう一度読む"
            : "学習を始める"}
      </button>
    </div>
  )
}

type DLearningLive = {
  slide: Slide | null
  seq: number
  total: number
  hasQuiz: boolean
  onPrev: () => void
  onNext: () => void
}

/** 本番: スライド本文を「要点だけ読む」用に文ごとに分ける（最大 3 つ） */
const keyPoints = (slide: Slide) =>
  (slide.bodyMd.match(/[^。！？]+[。！？]?/g) ?? [slide.bodyMd]).map((t) => t.trim()).filter(Boolean).slice(0, 3)

function DLearning({
  lesson,
  panel,
  setPanel,
  onClose,
  onNext,
  onZoom,
  live,
}: {
  lesson: DLesson
  panel: "figure" | "points"
  setPanel: (value: "figure" | "points") => void
  onClose: () => void
  onNext: () => void
  onZoom: () => void
  /** 本番: 実際の教材のスライド（ページ送り・位置の保存）。なければ Figma の架空の 1 ページ */
  live?: DLearningLive
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  // 本番の音声: 端末の読み上げ機能でスライドの読み上げ用テキストを読む（ページを移ったら止める）
  useEffect(() => {
    if (!live) return
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [live?.seq, live])
  if (live) {
    const slide = live.slide
    const figure = slide?.figures[0]
    const toggleAudio = () => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
      if (!synth || !slide) return
      if (audioPlaying) {
        synth.cancel()
        setAudioPlaying(false)
        return
      }
      const u = new SpeechSynthesisUtterance(slide.voiceText)
      u.lang = "ja-JP"
      u.onend = () => setAudioPlaying(false)
      synth.cancel()
      synth.speak(u)
      setAudioPlaying(true)
    }
    const isLast = live.seq >= live.total
    return (
      <div className="d-learning">
        <div className="d-learning-head">
          <button onClick={onClose}>閉じる</button>
          <span>
            {live.seq} / {live.total || "—"}
          </span>
          <button className={audioPlaying ? "active" : ""} onClick={toggleAudio}>
            <Icon name="audio" />
            {audioPlaying ? "停止" : "音声"}
          </button>
        </div>
        <div className="d-learning-progress">
          <i style={{ width: `${live.total ? Math.round((live.seq / live.total) * 100) : 0}%` }} />
        </div>
        <p className="eyebrow">{lesson.title}</p>
        {slide ? (
          <>
            <h1>{slide.title}</h1>
            <p className="d-learning-lead">{slide.proposition ?? slide.bodyMd}</p>
            {audioPlaying && (
              <div className="d-audio-state">
                <span className="live-dot" />
                読み上げ中
                <span className="d-audio-wave">〰 〰 〰</span>
              </div>
            )}
            <div className="d-learning-tabs">
              <button className={panel === "figure" ? "active" : ""} onClick={() => setPanel("figure")}>
                医学図解
              </button>
              <button className={panel === "points" ? "active" : ""} onClick={() => setPanel("points")}>
                要点だけ読む
              </button>
            </div>
            {panel === "figure" ? (
              <DImageSlot
                kind="medical"
                caption={figure?.caption ?? (slide.proposition ? slide.bodyMd : "このページの図解は準備中です。")}
                image={figure ? { src: figure.src, alt: figure.altText ?? figure.caption ?? slide.title } : undefined}
                onExpand={figure ? onZoom : undefined}
              />
            ) : (
              <div className="d-key-list">
                {keyPoints(slide).map((point, index) => (
                  <div key={index}>
                    <span>{index + 1}</span>
                    <p>{point}</p>
                  </div>
                ))}
              </div>
            )}
            {slide.detailMd && (
              <>
                <button className="d-disclosure" onClick={() => setDetailOpen(!detailOpen)}>
                  <span>
                    <b>もう少し詳しく</b>
                    <small>{slide.title}</small>
                  </span>
                  <span>{detailOpen ? "−" : "＋"}</span>
                </button>
                {detailOpen && <div className="d-detail-copy">{slide.detailMd}</div>}
              </>
            )}
          </>
        ) : (
          <h1>読み込んでいます…</h1>
        )}
        <div className="d-learning-actions">
          <button onClick={live.onPrev}>前へ</button>
          <button className="primary-button" onClick={live.onNext} disabled={!slide}>
            {!isLast ? "次へ" : live.hasQuiz ? "理解を確認する" : "学習を終える"}
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="d-learning">
      <div className="d-learning-head">
        <button onClick={onClose}>閉じる</button>
        <span>2 / 3</span>
        <button
          className={audioPlaying ? "active" : ""}
          onClick={() => setAudioPlaying(!audioPlaying)}
        >
          <Icon name="audio" />
          {audioPlaying ? "停止" : "音声"}
        </button>
      </div>
      <div className="d-learning-progress">
        <i style={{ width: "66%" }} />
      </div>
      <p className="eyebrow">{lesson.title}</p>
      <h1>腕は、無理のない範囲でゆっくり動かします</h1>
      <p className="d-learning-lead">
        手術後は、痛みや傷の状態を見ながら、少しずつ腕を動かします。強い痛みを我慢して動かす必要はありません。
      </p>
      {audioPlaying && (
        <div className="d-audio-state">
          <span className="live-dot" />
          読み上げ中 0:18 / 1:24
          <span className="d-audio-wave">〰 〰 〰</span>
        </div>
      )}
      <div className="d-learning-tabs">
        <button
          className={panel === "figure" ? "active" : ""}
          onClick={() => setPanel("figure")}
        >
          医学図解
        </button>
        <button
          className={panel === "points" ? "active" : ""}
          onClick={() => setPanel("points")}
        >
          要点だけ読む
        </button>
      </div>
      {panel === "figure" ? (
        <DImageSlot
          kind="medical"
          caption="腕を動かす範囲の目安。実装時は医療者監修済み画像を原寸比で表示します。"
          onExpand={onZoom}
        />
      ) : (
        <div className="d-key-list">
          <div>
            <span>1</span>
            <p>痛みが強くならない範囲から始めます。</p>
          </div>
          <div>
            <span>2</span>
            <p>反動をつけず、ゆっくり動かします。</p>
          </div>
          <div>
            <span>3</span>
            <p>気になる変化は、次の診察を待たず医療機関へ連絡します。</p>
          </div>
        </div>
      )}
      <button
        className="d-disclosure"
        onClick={() => setDetailOpen(!detailOpen)}
      >
        <span>
          <b>もう少し詳しく</b>
          <small>動かす回数と相談の目安</small>
        </span>
        <span>{detailOpen ? "−" : "＋"}</span>
      </button>
      {detailOpen && (
        <div className="d-detail-copy">
          回数は一律ではありません。手術方法や傷の状態によって異なるため、担当の医療者から伝えられた範囲を優先してください。
        </div>
      )}
      <div className="d-important">
        <b>医療機関へ相談する目安</b>
        <p>
          急な腫れ、赤み、熱をもった痛みなどがある場合は、教材ではなく医療機関へ連絡してください。
        </p>
      </div>
      <div className="d-learning-actions">
        <button onClick={onClose}>前へ</button>
        <button className="primary-button" onClick={onNext}>
          理解を確認する
          <Icon name="arrow" />
        </button>
      </div>
    </div>
  )
}

type AttemptQuestion = NonNullable<ReturnType<typeof useAttempt>["attempt"]>["questions"][number]

function DQuiz({
  answer,
  setAnswer,
  onBack,
  onConfirm,
  live,
}: {
  answer: string
  setAnswer: (value: string) => void
  onBack: () => void
  onConfirm: () => void
  /** 本番: 実際の設問（未回答の最初の 1 問）。「この回答で確定する」で 1 問ずつ記録する */
  live?: { question: AttemptQuestion | null; index: number; total: number; busy: boolean }
}) {
  const answers = live?.question
    ? [...live.question.options, "わからない"]
    : [
        "痛みを我慢して大きく動かす",
        "無理のない範囲でゆっくり動かす",
        "診察まで腕をまったく動かさない",
        "わからない",
      ]
  return (
    <div className="d-quiz">
      <div className="d-learning-head">
        <button onClick={onBack}>← 戻る</button>
        <span>理解確認</span>
        <span />
      </div>
      <div className="d-learning-progress">
        <i style={{ width: live ? `${live.total ? Math.round(((live.index + 1) / live.total) * 100) : 0}%` : "82%" }} />
      </div>
      <p className="eyebrow">
        CHECK YOUR UNDERSTANDING{live && live.total > 1 ? ` · ${live.index + 1} / ${live.total}` : ""}
      </p>
      <h1>{live ? (live.question?.stem ?? "読み込んでいます…") : "腕を動かすとき、適切なのはどれですか？"}</h1>
      <p className="d-quiz-support">
        今の理解を振り返るための確認です。迷ったときは「わからない」を選べます。
      </p>
      <div className="d-answer-list">
        {answers.map((item, index) => (
          <button
            key={item}
            className={answer === item ? "selected" : ""}
            onClick={() => setAnswer(item)}
          >
            <span>{index < 3 ? ["A", "B", "C"][index] : "?"}</span>
            <b>{item}</b>
            <i>{answer === item && <Icon name="check" />}</i>
          </button>
        ))}
      </div>
      <div className="d-selection-note">
        {answer
          ? `「${answer}」を選択しています`
          : "選択しただけでは回答は記録されません"}
      </div>
      <button
        className="primary-button d-bottom-action"
        disabled={!answer || !!live?.busy || (!!live && !live.question)}
        onClick={onConfirm}
      >
        {live?.busy ? "記録しています…" : "この回答で確定する"}
      </button>
    </div>
  )
}

function DExplanation({
  answer,
  onBackToLesson,
  onNext,
  onAddQuestion,
  live,
  preview = false,
}: {
  answer: string
  onBackToLesson: () => void
  onNext: () => void
  onAddQuestion: () => void
  /** 本番: 記録した回答（サーバーの採点結果）と解説 */
  live?: { question: AttemptQuestion | null; relatedTitle: string | null; remaining: number }
  /** 医療者の下書きプレビュー: 回答は記録しない（文言だけ変え、質問候補の作成は出さない） */
  preview?: boolean
}) {
  const a = live?.question?.answer ?? null
  const unsure = live ? !!a?.isUnknown : answer === "わからない"
  const correct = live ? !!a?.isCorrect : answer === "無理のない範囲でゆっくり動かす"
  const yourAnswer = live
    ? a
      ? a.isUnknown
        ? "わからない"
        : live.question!.options[a.selectedIndex ?? 0]
      : "未選択"
    : answer || "未選択"
  return (
    <div className="d-explanation">
      <div className={`d-answer-result ${correct ? "correct" : "review"}`}>
        <span>
          <Icon name={correct ? "check" : "help"} size={28} />
        </span>
        <div>
          <p className="eyebrow">{preview ? "プレビュー · 回答は記録されません" : "回答を記録しました"}</p>
          <h1>
            {correct
              ? "この内容で確認できています"
              : unsure
                ? preview
                  ? "「わからない」を選びました"
                  : "「わからない」を記録しました"
                : "いっしょに確認しましょう"}
          </h1>
        </div>
      </div>
      <div className="d-your-answer">
        <span>あなたの回答</span>
        <b>{yourAnswer}</b>
      </div>
      {live ? (
        <section className="d-explanation-copy">
          <h2>解説</h2>
          <p>{a?.explanation ?? ""}</p>
          {a && !a.isCorrect && (
            <div className="d-key-answer">
              <Icon name="check" />
              <span>
                <b>確認したいポイント</b>
                <p>正解は「{live.question!.options[a.correctIndex]}」です。</p>
              </span>
            </div>
          )}
        </section>
      ) : (
      <section className="d-explanation-copy">
        <h2>解説</h2>
        <p>
          手術後の腕は、<b>無理のない範囲でゆっくり動かす</b>
          ことが基本です。痛みや傷の状態、手術方法によって適切な範囲は異なります。
        </p>
        <div className="d-key-answer">
          <Icon name="check" />
          <span>
            <b>確認したいポイント</b>
            <p>
              強い痛みを我慢せず、担当の医療者から伝えられた範囲を優先します。
            </p>
          </span>
        </div>
      </section>
      )}
      {(!live || live.relatedTitle) && (
      <button className="d-link-card" onClick={onBackToLesson}>
        <Icon name="book" />
        <span>
          <b>関連する説明を読み直す</b>
          <small>「{live ? live.relatedTitle : "腕の動かし方"}」のページへ戻る</small>
        </span>
        <Icon name="arrow" />
      </button>
      )}
      {!correct && !preview && (
        <button
          className="secondary-button d-question-candidate"
          onClick={onAddQuestion}
        >
          <Icon name="note" />
          この内容から質問候補を作る
        </button>
      )}
      <p className="d-understanding-note">
        この回答だけで、医学的な理解を判断するものではありません。
      </p>
      <button className="primary-button d-bottom-action" onClick={onNext}>
        {live && live.remaining > 0 ? "次の問題へ" : "振り返りへ"}
        <Icon name="arrow" />
      </button>
    </div>
  )
}

/** 医療者の下書きプレビューに渡す教材（教材スタジオの下書きそのもの。未公開・未監修でもよい） */
export type DraftPreviewMaterial = {
  title: string
  slides: { seq: number; title: string; proposition: string | null; bodyMd: string; detailMd: string | null }[]
  questions: { seq: number; stem: string; options: [string, string, string]; correctIndex: number; explanation: string; relatedSlideSeq: number | null }[]
}

/**
 * 医療者・編集者向けの下書きプレビュー（教材スタジオ Step 6）。患者の学習画面・理解確認・解説と同じ部品で表示する。
 * 学習 API・回答 API は呼ばない（進捗・回答はこの画面の中だけで持ち、閉じると消える）。正誤は下書きの正答で表示する。
 * 患者向けの経路は作らない（未公開の教材は患者の一覧・学習 API には出ない）。
 */
export function DDraftPreview({
  material,
  stateLabel,
  onClose,
}: {
  material: DraftPreviewMaterial
  /** 上部に常に出す状態（例: 未監修・公開不可） */
  stateLabel: string
  onClose: () => void
}) {
  const [view, setView] = useState<"learn" | "quiz" | "explanation" | "result">("learn")
  const [seq, setSeq] = useState(1)
  const [panel, setPanel] = useState<"figure" | "points">("figure")
  const [qi, setQi] = useState(0)
  const [selected, setSelected] = useState("")
  const [answers, setAnswers] = useState<NonNullable<AttemptQuestion["answer"]>[]>([])
  const mainRef = useRef<HTMLElement>(null)
  // ページ・問題が変わったら先頭から表示する
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [view, seq, qi])
  // 読み上げ用テキストは保存時に本文と同じになる（教材スタジオの既存の仕様）。図解は監修・承認後にだけ付くため、下書きでは常に「準備中」
  const slides: Slide[] = material.slides.map((sl) => ({ ...sl, voiceText: sl.bodyMd, figures: [] }))
  const total = slides.length
  const lesson = { title: material.title } as DLesson
  const questions: AttemptQuestion[] = material.questions.map((q, i) => ({
    questionId: `preview-${q.seq}`,
    seq: q.seq,
    stem: q.stem,
    options: q.options,
    relatedSlideSeq: q.relatedSlideSeq,
    answer: answers[i] ?? null,
  }))
  const restart = () => {
    setView("learn")
    setSeq(1)
    setQi(0)
    setSelected("")
    setAnswers([])
  }
  const startQuiz = () => {
    setQi(0)
    setSelected("")
    setAnswers([])
    setView("quiz")
  }
  let content: ReactNode
  if (view === "learn") {
    content = (
      <DLearning
        lesson={lesson}
        panel={panel}
        setPanel={setPanel}
        onClose={onClose}
        onNext={() => {}}
        onZoom={() => {}}
        live={{
          slide: slides[seq - 1] ?? null,
          seq,
          total,
          hasQuiz: questions.length > 0,
          onPrev: () => setSeq(Math.max(1, seq - 1)),
          onNext: () => (seq < total ? setSeq(seq + 1) : questions.length ? startQuiz() : setView("result")),
        }}
      />
    )
  } else if (view === "quiz") {
    content = (
      <DQuiz
        answer={selected}
        setAnswer={setSelected}
        live={{ question: questions[qi] ?? null, index: qi, total: questions.length, busy: false }}
        onBack={() => setView("learn")}
        onConfirm={() => {
          const q = material.questions[qi]
          if (!q) return
          const index = q.options.indexOf(selected)
          const selectedIndex = index >= 0 ? index : null
          const next = [...answers]
          next[qi] = {
            selectedIndex,
            isUnknown: selectedIndex === null,
            isCorrect: selectedIndex === q.correctIndex,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          }
          setAnswers(next)
          setView("explanation")
        }}
      />
    )
  } else if (view === "explanation") {
    const shown = questions[qi] ?? null
    content = (
      <DExplanation
        answer={selected}
        preview
        live={{
          question: shown,
          relatedTitle: slides.find((sl) => sl.seq === shown?.relatedSlideSeq)?.title ?? null,
          remaining: questions.length - qi - 1,
        }}
        onBackToLesson={() => {
          if (shown?.relatedSlideSeq) setSeq(shown.relatedSlideSeq)
          setView("learn")
        }}
        onAddQuestion={() => {}}
        onNext={() => {
          setSelected("")
          if (qi + 1 < questions.length) {
            setQi(qi + 1)
            setView("quiz")
          } else setView("result")
        }}
      />
    )
  } else {
    content = (
      <div className="d-explanation">
        <div className="d-answer-result correct">
          <span>
            <Icon name="check" size={28} />
          </span>
          <div>
            <p className="eyebrow">プレビュー · 記録されません</p>
            <h1>プレビューを最後まで確認しました</h1>
          </div>
        </div>
        {material.questions.map((q, i) => {
          const a = answers[i]
          return (
            <section className="d-explanation-copy" key={q.seq}>
              <h2>
                {i + 1}. {q.stem}
              </h2>
              <div className="d-your-answer">
                <span>選んだ回答</span>
                <b>{!a ? "未回答" : a.isUnknown ? "わからない" : q.options[a.selectedIndex ?? 0]}</b>
              </div>
              <p>正解: {q.options[q.correctIndex]}</p>
            </section>
          )
        })}
        <button className="primary-button d-bottom-action" onClick={restart}>
          最初から確認する
        </button>
      </div>
    )
  }
  return (
    <div className="d-device viewport-390 d-device-preview" data-studio-preview data-preview-view={view}>
      <div className="d-preview-banner" role="status">
        <b>プレビュー</b>
        <span>{stateLabel}</span>
        <small>学習・回答は記録されません</small>
      </div>
      <main className="d-main full" ref={mainRef}>
        {content}
      </main>
    </div>
  )
}

function DResult({
  answer,
  live,
  healthDays,
  questionCount,
  motionEnabled,
  setMotionEnabled,
  onNotes,
  onHome,
}: {
  answer: string
  /** 本番: この教材の学習と理解確認の記録 */
  live?: { title: string; slideCount: number; answered: number; needsReview: number; learnedCount: number }
  healthDays: number
  questionCount: number
  motionEnabled: boolean
  setMotionEnabled: (value: boolean) => void
  onNotes: () => void
  onHome: () => void
}) {
  const needsReview = live ? live.needsReview > 0 : answer !== "無理のない範囲でゆっくり動かす"
  return (
    <div className={`d-result-page ${motionEnabled ? "" : "no-motion"}`}>
      <span className="d-result-mark">
        <Icon name="check" size={34} />
      </span>
      <p className="eyebrow">LEARNING SAVED</p>
      <h1>今日もひとつ、知ることが増えました</h1>
      <p>
        学んだ内容は、いつでも振り返れます。正答率ではなく、確認した内容を残しています。
      </p>
      <div className="d-result-summary">
        <div>
          <span>教材</span>
          <b>{live ? live.title : "手術後の腕と傷のケア"}</b>
        </div>
        <div>
          <span>学習</span>
          <b>{live ? live.slideCount : 3}ページを確認</b>
        </div>
        <div>
          <span>理解確認</span>
          <b>
            {needsReview
              ? `振り返りたい内容 ${live ? live.needsReview : 1}件`
              : `回答済み ${live ? live.answered : 1}件`}
          </b>
        </div>
      </div>
      <div className="d-growth-summary">
        <p className="eyebrow">YOUR SHIORI</p>
        <h2>これまでの積み重なり</h2>
        <div>
          <span>
            <b>{live ? live.learnedCount : 4}</b>
            学んだ教材
          </span>
          <span>
            <b>{healthDays}</b>
            体調を記録した日
          </span>
          <span>
            <b>{questionCount}</b>
            診察につなげた質問
          </span>
        </div>
        <p>
          記録しなかった日や迷った回答も、失敗ではありません。必要なときに、自分のペースで続けられます。
        </p>
      </div>
      {needsReview && (
        <button className="d-next-note" onClick={onNotes}>
          <span className="stat-icon purple">
            <Icon name="note" />
          </span>
          <span>
            <b>診察ノートを確認する</b>
            <small>質問候補を編集できます</small>
          </span>
          <Icon name="arrow" />
        </button>
      )}
      <button className="primary-button d-bottom-action" onClick={onHome}>
        ホームへ戻る
      </button>
      <button
        className="d-motion-toggle"
        onClick={() => setMotionEnabled(!motionEnabled)}
      >
        動きの効果：{motionEnabled ? "オン" : "オフ"}
      </button>
    </div>
  )
}

function DHistory({
  lessons,
  onOpen,
  onCategory,
}: {
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onCategory: (category: string) => void
}) {
  const categories = useContext(CategoriesContext)
  return (
    <div className="d-history">
      <p className="eyebrow">MY LEARNING</p>
      <h1>これまでの学び</h1>
      <div className="d-history-summary">
        <div>
          <b>{lessons.filter((item) => item.status === "done").length}</b>
          <span>学習済み</span>
        </div>
        <div>
          <b>{lessons.filter((item) => item.status === "doing").length}</b>
          <span>学習途中</span>
        </div>
        <p>
          <Icon name="help" />
          学習進捗と医学的な理解は別のものです
        </p>
      </div>
      <section>
        <div className="d-section-head">
          <div>
            <p className="eyebrow">BY AREA</p>
            <h2>領域別の学習状況</h2>
          </div>
        </div>
        <div className="d-area-list">
          {categories.map((category) => {
            const areaLessons = lessons.filter(
              (lesson) => lesson.category === category.name,
            )
            const done = areaLessons.filter(
              (lesson) => lesson.status === "done",
            ).length
            const doing = areaLessons.filter(
              (lesson) => lesson.status === "doing",
            ).length
            return (
              <button
                key={category.name}
                onClick={() => onCategory(category.name)}
              >
                <span className="d-category-icon">
                  <Icon name={category.icon} />
                </span>
                <span>
                  <b>{category.name}</b>
                  <small>
                    学習済み {done}件
                    {doing > 0 ? ` · 途中 ${doing}件` : " · 途中なし"}
                  </small>
                  <span className="d-area-progress">
                    <i style={{ width: `${category.progress}%` }} />
                  </span>
                </span>
                <Icon name="arrow" />
              </button>
            )
          })}
        </div>
      </section>
      <section className="d-recent">
        <div className="d-section-head">
          <h2>最近学んだ教材</h2>
        </div>
        {lessons
          .filter((lesson) => lesson.status !== "new")
          .map((lesson) => (
            <DLessonCard
              key={lesson.id}
              lesson={lesson}
              onOpen={() => onOpen(lesson)}
              horizontal
            />
          ))}
      </section>
    </div>
  )
}

function DNotes({
  notes: figmaNotes,
  setNotes,
  notify,
  onShare,
  live,
  draftFrom,
  clearDraft,
  visitDate = null,
}: {
  notes: string[]
  setNotes: (notes: string[]) => void
  notify: (message?: string) => void
  onShare: () => void
  /** 本番（Step 3）: 診察ノートの実 API（作成・編集・削除・作成日時・更新日時） */
  live?: PatientNotes
  /** 本番: 理解確認から作った質問候補（保存するまで記録しない） */
  draftFrom?: { text: string; versionId: string; questionId: string; title: string } | null
  clearDraft?: () => void
  /** 本番: 患者が登録した次回の診察日（未登録は null） */
  visitDate?: string | null
}) {
  const [draft, setDraft] = useState(draftFrom?.text ?? "")
  const [editing, setEditing] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [busy, setBusy] = useState(false)
  const notes = live ? live.notes.map((note) => note.body) : figmaNotes
  const addNote = async () => {
    if (live) {
      if (!draft.trim() || busy) return
      setBusy(true)
      const ok = await live.create(draft.trim(), draftFrom ? { versionId: draftFrom.versionId, questionId: draftFrom.questionId } : null)
      setBusy(false)
      if (!ok) return
      setDraft("")
      clearDraft?.()
      notify("質問を保存しました")
      return
    }
    if (!draft.trim()) return
    setNotes([...notes, draft.trim()])
    setDraft("")
    notify("質問を保存しました")
  }
  return (
    <div className="d-notes">
      <p className="eyebrow">NEXT VISIT</p>
      <h1>診察ノート</h1>
      <div className="d-visit-date">
        <Icon name="calendar" />
        {live ? (
          // 本番: 患者が登録した次回診察日だけを表示する（架空の日時を出さない）
          <span>
            <b>{visitDate ? `次回診察日：${visitDateLabel(visitDate)}` : "次回診察日：未登録"}</b>
            <small>QR一時共有を承認したときだけ、医療者がこの質問を閲覧できます</small>
          </span>
        ) : (
        <span>
          <b>次回診察 6月20日（木）10:30</b>
          <small>乳腺外科 · 山田医師</small>
        </span>
        )}
      </div>
      <div className="d-not-emergency">
        <Icon name="alert" />
        <p>
          <b>このノートは緊急相談ではありません</b>
          急な症状や強い痛みなどは、医療機関から案内された連絡先へご相談ください。
        </p>
      </div>
      <section className="d-add-question">
        <h2>聞きたいことを追加</h2>
        {live && draftFrom && (
          <p className="d-support-copy">
            「{draftFrom.title}」の理解確認から作った候補です。確認・編集して保存してください（保存するまで記録されません）。
          </p>
        )}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="例：腕のつっぱりはいつまで続きますか？"
        />
        <button
          className="primary-button"
          disabled={!draft.trim() || busy}
          onClick={() => void addNote()}
        >
          <Icon name="plus" />
          質問を保存
        </button>
      </section>
      <section>
        <div className="d-section-head">
          <h2>保存した質問</h2>
          <span>{notes.length}件</span>
        </div>
        <div className="d-saved-notes">
          {notes.map((note, index) => (
            <div key={live ? live.notes[index].id : `${note}-${index}`}>
              <span className="d-note-number">{index + 1}</span>
              {editing === index ? (
                <textarea
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                />
              ) : (
                <p>
                  {note}
                  {live && (
                    <small className="d-note-meta">
                      {live.notes[index].materialTitle ? `教材「${live.notes[index].materialTitle}」から · ` : ""}
                      {(() => {
                        const n = live.notes[index]
                        const d = new Date(n.updatedAt)
                        return `${d.getMonth() + 1}月${d.getDate()}日${n.updatedAt !== n.createdAt ? "に更新" : "に保存"}`
                      })()}
                    </small>
                  )}
                </p>
              )}
              <div>
                {editing === index ? (
                  <>
                    <button
                      disabled={!editValue.trim()}
                      onClick={async () => {
                        if (live) {
                          if (!(await live.update(live.notes[index].id, editValue))) return
                          setEditing(null)
                          notify("質問を更新しました")
                          return
                        }
                        setNotes(
                          notes.map((item, itemIndex) =>
                            itemIndex === index ? editValue : item,
                          ),
                        )
                        setEditing(null)
                        notify("質問を更新しました")
                      }}
                    >
                      保存
                    </button>
                    <button onClick={() => setEditing(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditing(index)
                        setEditValue(note)
                      }}
                    >
                      編集
                    </button>
                    <button
                      onClick={async () => {
                        if (live) {
                          if (await live.remove(live.notes[index].id)) notify("質問を削除しました")
                          return
                        }
                        setNotes(
                          notes.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      <button className="secondary-button d-share-notes" onClick={onShare}>
        <Icon name="qr" />
        医療者へ一時共有する
      </button>
    </div>
  )
}

/** 本番の共有画面: 申請者（医療機関・医療者）と有効期間。申請がなければ読み取り方の案内 */
function DShareLiveIntro({ live }: { live: PatientLive }) {
  const p = live.pending
  if (!p)
    return (
      <p className="d-share-intro">
        医療者の画面に表示されたQRコードを、スマートフォンのカメラで読み取ってください。
      </p>
    )
  return (
    <>
      <p className="d-share-intro">
        {p.kind === "extension"
          ? "共有中の医療者が、共有時間の延長を申請しています。"
          : "次の医療者が閲覧を申請しています。共有する内容を確認してください。"}
      </p>
      <div className="d-share-session d-share-request" data-share-request>
        <span>
          <small>医療機関</small>
          <b>{p.orgName}</b>
        </span>
        <span>
          <small>医療者</small>
          <b>{p.clinicianName}</b>
        </span>
        <span className="wide">
          <small>{p.kind === "extension" ? "延長後の有効期間" : "有効期間"}</small>
          <b>
            {p.kind === "extension"
              ? `承認した時点から60分（現在の残り ${live.remainingMin}分）`
              : "承認した時点から60分。いつでも終了できます"}
          </b>
        </span>
      </div>
    </>
  )
}

/** 本番の共有画面: QR を読み取れないときの 6 桁コード（既存の患者発行コード。5 分・1 回限り・医療者の入力後に患者が承認） */
function DShareCode({ live }: { live: PatientLive }) {
  if (!live.code)
    return (
      <button className="d-text-action" onClick={() => void live.issueCode()}>
        QRを読み取れないときは、6桁コードで共有する
      </button>
    )
  return (
    <div className="d-share-session d-share-code" data-share-code>
      <span>
        <small>6桁の共有コード</small>
        <b>{live.code.value}</b>
      </span>
      <span>
        <small>有効期限</small>
        <b>あと{live.code.remainingMin}分・1回限り</b>
      </span>
      <span className="wide">
        <small>医療者の画面の「6桁コード」に入力してもらってください。入力後、あなたの承認で共有が始まります。電話やメールでは送らないでください。</small>
        <button className="d-text-action" onClick={() => void live.cancelCode()}>
          コードを取り消す
        </button>
      </span>
    </div>
  )
}

function DShare({
  sharing,
  setSharing,
  onBack,
  live,
}: {
  sharing: boolean
  setSharing: (value: boolean) => void
  onBack: () => void
  live?: PatientLive
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <div className="d-share-page">
      <DPageHeader title="医療者との一時共有" onBack={onBack} />
      {!sharing ? (
        <>
          <div className="d-share-visual">
            <span>
              <Icon name="qr" size={46} />
            </span>
            <i />
            <span>
              <Icon name="user" size={40} />
            </span>
          </div>
          <h2>あなたの承認後に、医療者が閲覧できます</h2>
          {live ? (
            <DShareLiveIntro live={live} />
          ) : (
          <p className="d-share-intro">
            医療者の画面に表示されたQRコードを読み取り、共有する内容を確認してください。
          </p>
          )}
          <div className="d-share-scope">
            <h3>共有される内容</h3>
            <span>
              <Icon name="check" />
              教材の学習状況
            </span>
            <span>
              <Icon name="check" />
              理解確認の回答と「わからない」
            </span>
            <span>
              <Icon name="check" />
              診察ノートの質問
            </span>
            <span>
              <Icon name="check" />
              体調記録（バイタル・自覚症状）
            </span>
          </div>
          {/* 本番: 承認する申請があるときだけ確認と承認ボタンを出す（申請がないのに押せるボタンは置かない） */}
          {(!live || live.pending) && (
          <>
          <label className="d-consent">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              <b>一時共有の内容を確認しました</b>
              <small>共有はいつでも終了できます</small>
            </span>
          </label>
          <button
            className="primary-button"
            disabled={!confirmed}
            onClick={() => (live ? void live.approve() : setSharing(true))}
          >
            <Icon name={live ? "shield" : "qr"} />
            {!live
              ? "QRを読み取って共有を開始"
              : live.pending?.kind === "extension"
                ? "共有時間の延長を承認する"
                : "この医療者に共有を許可する"}
          </button>
          {live?.pending && (
            <button className="d-text-action" onClick={() => void live.deny()}>
              {live.pending.kind === "extension" ? "延長しない" : "共有しない"}
            </button>
          )}
          </>
          )}
          {live && !live.pending && <DShareCode live={live} />}
          <p className="d-privacy-caption">
            患者情報はあなたが管理します。医療者側に患者一覧として保存されません。
          </p>
        </>
      ) : (
        <div className="d-sharing-active">
          <span className="d-sharing-shield">
            <Icon name="shield" size={42} />
          </span>
          <p className="eyebrow">TEMPORARY SHARE ACTIVE</p>
          <h2>
            {live?.clinicianName
              ? `${live.clinicianName}と一時共有中です`
              : "山田医師と一時共有中です"}
          </h2>
          <p>共有を終了すると、医療者はこの情報を閲覧できなくなります。</p>
          <div className="d-share-session">
            <span>
              <small>共有先</small>
              <b>{live?.clinicianLabel ?? "乳腺外科 山田医師"}</b>
            </span>
            <span>
              <small>残り時間</small>
              <b>{live ? `${live.remainingMin}分` : "24分"}</b>
            </span>
          </div>
          <button
            className="d-end-sharing"
            onClick={() => (live ? void live.end() : setSharing(false))}
          >
            <Icon name="lock" />
            一時共有を終了する
          </button>
          <button className="d-text-action" onClick={onBack}>
            共有したままホームへ戻る
          </button>
        </div>
      )}
    </div>
  )
}

