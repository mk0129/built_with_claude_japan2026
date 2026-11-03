"use client";

import { useState, type ReactNode } from "react"
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
  return (
    <div className="logo">
      <span className="logo-mark">
        <span />
      </span>
      <b>shiori</b>
    </div>
  )
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
  id: number
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
}

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
}: {
  kind: "medical" | "editorial"
  caption: string
  onExpand?: () => void
  compact?: boolean
}) {
  const placeholderContent = (
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
        kind={lesson.id % 3 === 0 ? "editorial" : "medical"}
        caption=""
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
  viewport: DViewport
  notify: (message?: string) => void
  healthRecords: HealthRecord[]
  setHealthRecords: (records: HealthRecord[]) => void
  activeSymptomIds: string[]
  setActiveSymptomIds: (ids: string[]) => void
  customSymptomNames: Record<string, string>
  setCustomSymptomNames: (names: Record<string, string>) => void
}) {
  const [page, setPage] = useState<DPage>("home")
  const [scenario, setScenario] = useState(2)
  const [selectedId, setSelectedId] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState("手術")
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("すべて")
  const [statusFilter, setStatusFilter] = useState("すべて")
  const [sharing, setSharing] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [notes, setNotes] = useState([
    "腕のつっぱりはいつまで続きますか？",
    "薬を飲み忘れたときはどうすればよいですか？",
  ])
  const [quizAnswer, setQuizAnswer] = useState("")
  const [motionEnabled, setMotionEnabled] = useState(true)
  const [lessonStates, setLessonStates] = useState<Record<number, {
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
  const visibleLessons =
    scenario === 6
      ? [...scenarioLessons, ...dLessons.slice(3, 8).map((lesson, index) => ({
            ...lesson,
            id: lesson.id + 20,
            title: `${lesson.title}：詳しく知る`,
          }))]
      : scenarioLessons
  const selected =
    visibleLessons.find((lesson) => lesson.id === selectedId) ||
    visibleLessons[0]
  const prescriptions = visibleLessons.filter((lesson) => lesson.prescribed)
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
    setSelectedId(lesson.id)
    setPage("detail")
  }
  const changeScenario = (value: number) => {
    setScenario(value)
    setSharing(value === 7)
    setLessonStates({})
    setQuizAnswer("")
    setPage("home")
  }

  const renderPage = () => {
    if (page === "home")
      return (
        <DHome
          scenario={scenario}
          prescriptions={prescriptions}
          active={activePrescription}
          sharing={sharing}
          onOpen={openLesson}
          setPage={setPage}
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
          lesson={selected}
          onBack={() => setPage("library")}
          onStart={() => {
            if (selected.status === "new") {
              setLessonStates({
                ...lessonStates,
                [selected.id]: { status: "doing", progress: 10 },
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
          lesson={selected}
          panel={learningPanel}
          setPanel={setLearningPanel}
          onClose={() => {
            setLessonStates({
              ...lessonStates,
              [selected.id]: {
                status: "doing",
                progress: Math.max(selected.progress, 66),
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
          onBack={() => setPage("learn")}
          onConfirm={() => setPage("explanation")}
        />
      )
    if (page === "explanation")
      return (
        <DExplanation
          answer={quizAnswer}
          onBackToLesson={() => setPage("learn")}
          onNext={() => {
            setLessonStates({
              ...lessonStates,
              [selected.id]: { status: "done", progress: 100 },
            })
            setPage("result")
          }}
          onAddQuestion={() => {
            const candidate =
              "腕を動かす範囲について、私の場合の目安を教えてください"
            if (!notes.includes(candidate)) setNotes([...notes, candidate])
            notify("質問候補を診察ノートに追加しました")
          }}
        />
      )
    if (page === "result")
      return (
        <DResult
          answer={quizAnswer}
          healthDays={
            new Set(
              healthRecords.map((record) => record.measuredAt.slice(0, 10)),
            ).size
          }
          questionCount={notes.length}
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
          records={healthRecords}
          setRecords={setHealthRecords}
          activeSymptomIds={activeSymptomIds}
          setActiveSymptomIds={setActiveSymptomIds}
          customNames={customSymptomNames}
          setCustomNames={setCustomSymptomNames}
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
          notify={notify}
          onShare={() => setPage("share")}
        />
      )
    return (
      <DShare
        sharing={sharing}
        setSharing={setSharing}
        onBack={() => setPage("home")}
      />
    )
  }

  const fullScreen = ["learn", "quiz", "explanation", "result"].includes(page)
  return (
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
          <DNav page={page} setPage={setPage} noteCount={notes.length} />
        )}
      </div>
      {zoomed && (
        <div className="d-image-modal" onClick={() => setZoomed(false)}>
          <div onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setZoomed(false)}>閉じる</button>
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
          </div>
        </div>
      )}
    </div>
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
}: {
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
  const [measuredAt, setMeasuredAt] = useState(latest.measuredAt)
  const [vitals, setVitals] = useState({
    temperature: String(latest.vitals.temperature ?? ""),
    systolic: String(latest.vitals.systolic ?? ""),
    diastolic: String(latest.vitals.diastolic ?? ""),
    pulse: String(latest.vitals.pulse ?? ""),
    spo2: String(latest.vitals.spo2 ?? ""),
  })
  const [symptoms, setSymptoms] = useState<Record<string, number | undefined>>(
    Object.fromEntries(
      activeSymptomIds.map((id) => [id, latest.symptoms[id]?.severity]),
    ),
  )
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

  const saveRecord = () => {
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
              max={`${currentVisitDate}T23:59`}
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
              {activeSymptomIds.map((id) => {
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
            disabled={invalidFields.length > 0}
            onClick={saveRecord}
          >
            <Icon name="check" />
            この日の記録を保存
          </button>
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
                    {selectedDateRecord
                      ? recordedDayCount
                      : recordedDayCount + 1}
                  </b>
                  体調を記録した日
                </span>
                <span>
                  <b>4</b>
                  これまでに学んだ教材
                </span>
                <span>
                  <b>2</b>
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
}: {
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
}: {
  records: HealthRecord[]
  chartSymptom: string
  setChartSymptom: (id: string) => void
}) {
  const sorted = [...records].sort((a, b) =>
    a.measuredAt.localeCompare(b.measuredAt),
  )
  const points = sorted
    .map((record, index) => ({
      index,
      value: record.symptoms[chartSymptom]?.severity,
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
            value={chartSymptom}
            onChange={(event) => setChartSymptom(event.target.value)}
          >
            {initialActiveSymptomIds.map((id) => (
              <option key={id} value={id}>
                {symptomName(id)}
              </option>
            ))}
          </select>
        </div>
        <svg
          viewBox="0 0 340 130"
          role="img"
          aria-label={`${symptomName(chartSymptom)}の推移`}
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
          <span>{records.length}日分</span>
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
                    {entry.customName || symptomName(id)}
                    <b>
                      {entry.severity} · {severityLabels[entry.severity]}
                    </b>
                  </span>
                ))}
              </div>
            </details>
          ))}
      </section>
    </div>
  )
}

function DHome({
  scenario,
  prescriptions,
  active,
  sharing,
  onOpen,
  setPage,
}: {
  scenario: number
  prescriptions: DLesson[]
  active?: DLesson
  sharing: boolean
  onOpen: (lesson: DLesson) => void
  setPage: (page: DPage) => void
}) {
  const completed = prescriptions.filter((lesson) => lesson.status === "done")
  return (
    <div className="d-home">
      <div className="d-welcome">
        <div>
          <p>こんにちは、佐藤さん</p>
          <h1>今日、確認すること</h1>
        </div>
        <span>6月14日 金曜日</span>
      </div>
      {sharing && (
        <button className="d-sharing-banner" onClick={() => setPage("share")}>
          <Icon name="shield" />
          <span>
            <b>山田医師と一時共有中</b>
            <small>残り24分 · タップして管理</small>
          </span>
          <Icon name="arrow" />
        </button>
      )}
      {prescriptions.length === 0 ? (
        <section className="d-empty-hero">
          <DImageSlot
            kind="editorial"
            caption="自宅で自分のペースで学ぶ場面のイラスト配置領域"
          />
          <h2>今届いている教材はありません</h2>
          <p>
            公開教材はいつでも探せます。気になることから、無理のないペースでご覧ください。
          </p>
          <button className="primary-button" onClick={() => setPage("library")}>
            教材を探す
            <Icon name="arrow" />
          </button>
        </section>
      ) : scenario === 4 ? (
        <section className="d-complete-hero">
          <span className="d-complete-icon">
            <Icon name="check" size={28} />
          </span>
          <div>
            <Pill tone="soft">今回の情報処方</Pill>
            <h2>3件すべて確認しました</h2>
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
            <span>6月12日 · 山田医師から</span>
          </div>
          <h2>
            {active?.status === "doing"
              ? "続きから再開できます"
              : "新しい教材が届いています"}
          </h2>
          {active && (
            <>
              <div className="d-next-lesson">
                <span className="d-next-icon">
                  <Icon
                    name={active.status === "doing" ? "play" : "book"}
                    size={24}
                  />
                </span>
                <span>
                  <DStatus lesson={active} short />
                  <b>{active.title}</b>
                  <small>
                    {active.status === "doing"
                      ? `${active.progress}%まで学習 · あと約4分`
                      : `約${active.time}分`}
                  </small>
                </span>
              </div>
              <button className="primary-button" onClick={() => onOpen(active)}>
                {active.status === "doing" ? "続きから学ぶ" : "教材を確認する"}
                <Icon name="arrow" />
              </button>
            </>
          )}
          <button
            className="d-text-action"
            onClick={() => setPage("prescriptions")}
          >
            今回の教材をすべて見る（{prescriptions.length}件）
          </button>
        </section>
      )}
      <section className="d-home-section">
        <div className="d-section-head">
          <div>
            <p className="eyebrow">NEXT VISIT</p>
            <h2>次の診察につなげる</h2>
          </div>
          <span>6月20日</span>
        </div>
        <button className="d-note-summary" onClick={() => setPage("notes")}>
          <span className="stat-icon purple">
            <Icon name="note" />
          </span>
          <span>
            <b>質問メモ 2件</b>
            <small>診察で聞きたいことを確認・追加</small>
          </span>
          <Icon name="arrow" />
        </button>
      </section>
      <section className="d-home-section">
        <div className="d-section-head">
          <div>
            <p className="eyebrow">AT-HOME LOG</p>
            <h2>自宅での体調記録</h2>
          </div>
          <span>任意</span>
        </div>
        <button className="d-note-summary" onClick={() => setPage("health")}>
          <span className="stat-icon blue">
            <Icon name="pulse" />
          </span>
          <span>
            <b>今日の体調を記録する</b>
            <small>バイタルと気になる症状だけ · 前回 6月19日</small>
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
          {dCategories.slice(0, 3).map((category) => (
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

function DPrescriptions({
  lessons,
  onOpen,
  onBack,
}: {
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onBack: () => void
}) {
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
          <b>乳腺外科 山田医師から</b>
          <small>6月12日に届きました · 3件</small>
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
          {dCategories.map((category) => (
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
}: {
  category: string
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onBack: () => void
}) {
  const fallback = dLessons.filter((lesson) => lesson.category === category)
  const shown = lessons.length ? lessons : fallback
  return (
    <div>
      <DPageHeader title={category} eyebrow="LEARNING AREA" onBack={onBack} />
      <div className="d-area-overview">
        <span className="d-category-icon">
          <Icon
            name={
              dCategories.find((item) => item.name === category)?.icon || "book"
            }
            size={26}
          />
        </span>
        <div>
          <b>
            公開教材{" "}
            {dCategories.find((item) => item.name === category)?.count ||
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
        kind={lesson.id % 3 === 0 ? "editorial" : "medical"}
        caption="教材内容を補助する監修済み画像を配置する領域"
        onExpand={onZoom}
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
            <small>{lesson.date} · 今回の情報処方</small>
          </span>
        </div>
      )}
      <section className="d-goal">
        <p className="eyebrow">この教材で確認すること</p>
        <p>{lesson.goal}</p>
      </section>
      <div className="d-content-list">
        <span>
          <Icon name="book" />
          短い説明 3ページ
        </span>
        <span>
          <Icon name="audio" />
          音声読み上げあり
        </span>
        <span>
          <Icon name="help" />
          理解確認 1問
        </span>
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

function DLearning({
  lesson,
  panel,
  setPanel,
  onClose,
  onNext,
  onZoom,
}: {
  lesson: DLesson
  panel: "figure" | "points"
  setPanel: (value: "figure" | "points") => void
  onClose: () => void
  onNext: () => void
  onZoom: () => void
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
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

function DQuiz({
  answer,
  setAnswer,
  onBack,
  onConfirm,
}: {
  answer: string
  setAnswer: (value: string) => void
  onBack: () => void
  onConfirm: () => void
}) {
  const answers = [
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
        <i style={{ width: "82%" }} />
      </div>
      <p className="eyebrow">CHECK YOUR UNDERSTANDING</p>
      <h1>腕を動かすとき、適切なのはどれですか？</h1>
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
        disabled={!answer}
        onClick={onConfirm}
      >
        この回答で確定する
      </button>
    </div>
  )
}

function DExplanation({
  answer,
  onBackToLesson,
  onNext,
  onAddQuestion,
}: {
  answer: string
  onBackToLesson: () => void
  onNext: () => void
  onAddQuestion: () => void
}) {
  const unsure = answer === "わからない"
  const correct = answer === "無理のない範囲でゆっくり動かす"
  return (
    <div className="d-explanation">
      <div className={`d-answer-result ${correct ? "correct" : "review"}`}>
        <span>
          <Icon name={correct ? "check" : "help"} size={28} />
        </span>
        <div>
          <p className="eyebrow">回答を記録しました</p>
          <h1>
            {correct
              ? "この内容で確認できています"
              : unsure
                ? "「わからない」を記録しました"
                : "いっしょに確認しましょう"}
          </h1>
        </div>
      </div>
      <div className="d-your-answer">
        <span>あなたの回答</span>
        <b>{answer || "未選択"}</b>
      </div>
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
      <button className="d-link-card" onClick={onBackToLesson}>
        <Icon name="book" />
        <span>
          <b>関連する説明を読み直す</b>
          <small>「腕の動かし方」のページへ戻る</small>
        </span>
        <Icon name="arrow" />
      </button>
      {!correct && (
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
        振り返りへ
        <Icon name="arrow" />
      </button>
    </div>
  )
}

function DResult({
  answer,
  healthDays,
  questionCount,
  motionEnabled,
  setMotionEnabled,
  onNotes,
  onHome,
}: {
  answer: string
  healthDays: number
  questionCount: number
  motionEnabled: boolean
  setMotionEnabled: (value: boolean) => void
  onNotes: () => void
  onHome: () => void
}) {
  const needsReview = answer !== "無理のない範囲でゆっくり動かす"
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
          <b>手術後の腕と傷のケア</b>
        </div>
        <div>
          <span>学習</span>
          <b>3ページを確認</b>
        </div>
        <div>
          <span>理解確認</span>
          <b>{needsReview ? "振り返りたい内容 1件" : "回答済み 1件"}</b>
        </div>
      </div>
      <div className="d-growth-summary">
        <p className="eyebrow">YOUR SHIORI</p>
        <h2>これまでの積み重なり</h2>
        <div>
          <span>
            <b>4</b>
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
          {dCategories.map((category) => {
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
  notes,
  setNotes,
  notify,
  onShare,
}: {
  notes: string[]
  setNotes: (notes: string[]) => void
  notify: (message?: string) => void
  onShare: () => void
}) {
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const addNote = () => {
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
        <span>
          <b>次回診察 6月20日（木）10:30</b>
          <small>乳腺外科 · 山田医師</small>
        </span>
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
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="例：腕のつっぱりはいつまで続きますか？"
        />
        <button
          className="primary-button"
          disabled={!draft.trim()}
          onClick={addNote}
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
            <div key={`${note}-${index}`}>
              <span className="d-note-number">{index + 1}</span>
              {editing === index ? (
                <textarea
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                />
              ) : (
                <p>{note}</p>
              )}
              <div>
                {editing === index ? (
                  <>
                    <button
                      onClick={() => {
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
                      onClick={() =>
                        setNotes(
                          notes.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
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

function DShare({
  sharing,
  setSharing,
  onBack,
}: {
  sharing: boolean
  setSharing: (value: boolean) => void
  onBack: () => void
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
          <p className="d-share-intro">
            医療者の画面に表示されたQRコードを読み取り、共有する内容を確認してください。
          </p>
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
            onClick={() => setSharing(true)}
          >
            <Icon name="qr" />
            QRを読み取って共有を開始
          </button>
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
          <h2>山田医師と一時共有中です</h2>
          <p>共有を終了すると、医療者はこの情報を閲覧できなくなります。</p>
          <div className="d-share-session">
            <span>
              <small>共有先</small>
              <b>乳腺外科 山田医師</b>
            </span>
            <span>
              <small>残り時間</small>
              <b>24分</b>
            </span>
          </div>
          <button className="d-end-sharing" onClick={() => setSharing(false)}>
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

