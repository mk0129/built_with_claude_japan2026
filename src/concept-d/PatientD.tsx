"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { useUrlState } from "./urlState"
import { ShioriLogo } from "./ShioriLogo"
import { setCoverFor, themeImageFor, toneFor } from "./thumbnails"
import { CostSimulator } from "./CostSimulator"
import { MONEY_THEME, MONEY_TITLES, SIMULATOR_MATERIAL, SIMULATOR_NAME } from "./socialSupport"
import { vitalFlag } from "@/lib/recommend"
import { daysUntil, visitDateLabel, type PatientVisit } from "./visit"
import type { PatientLive } from "./live"
import { toLocalInput, type HealthInput, type PatientHealth, type PatientNotes, type VisitNote } from "./health"
import { DEFAULT_ANCHORS, GRADE_NOTE, SEVERITY_ANCHORS, SYMPTOM_ALIASES, TREATMENTS } from "./symptomGuide"
import { SlideArt, slideArtKey } from "./SlideArt"
import { speakText, stopSpeaking, speechSupported } from "./speech"
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

type DPage = "home" | "set" | "money" | "simulator" | "prescriptions" | "library" | "category" | "search" | "detail" | "learn" | "quiz" | "explanation" | "result" | "history" | "health" | "notes" | "share"
const D_PAGES: readonly DPage[] = ["home", "set", "money", "simulator", "prescriptions", "library", "category", "search", "detail", "learn", "quiz", "explanation", "result", "history", "health", "notes", "share"]
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
    // 学習領域のアイコン（内容に合わせた絵柄。配色は CSS の .d-area-* で領域ごとに変える）
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 2h6v4H9zM8 11h8M8 15h5" />
      </>
    ),
    scalpel: (
      <>
        <path d="M4 20 15 9" />
        <path d="M13 7l4-4 4 4-4 4" />
        <path d="M5 13c3 0 6 3 6 6" />
      </>
    ),
    pill: (
      <>
        <rect x="3" y="9" width="18" height="8" rx="4" transform="rotate(-35 12 13)" />
        <path d="m9.5 8.5 5 7" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
      </>
    ),
    leaf: (
      <>
        <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
        <path d="M5 19c3-4 6-7 10-10" />
      </>
    ),
    chat: (
      <>
        <path d="M4 5h16v11H9l-5 4Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M16 14h2" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </>
    ),
    bell: (
      <>
        <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z" />
        <path d="M10 21h4" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        <path d="M7 15h10" />
      </>
    ),
    x: <path d="M6 6l12 12M18 6 6 18" />,
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
  { name: "検査・診断", count: 5, icon: "clipboard", progress: 50 },
  { name: "手術", count: 6, icon: "scalpel", progress: 40 },
  { name: "薬物療法", count: 8, icon: "pill", progress: 10 },
  { name: "放射線療法", count: 4, icon: "sun", progress: 0 },
  { name: "副作用・支持療法", count: 12, icon: "leaf", progress: 20 },
  { name: "日常生活・相談支援", count: 9, icon: "chat", progress: 35 },
]
/** 学習領域ごとの配色クラス（CSS の .d-area-1〜6） */
export const areaTone = (name: string) => `d-area-${Math.max(0, dCategories.findIndex((c) => c.name === name)) + 1}`

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
  /** 今回の処方に含まれる情報処方セット（テンプレートの教材がすべて処方されたときだけ。なければ空） */
  latestSets: PatientLearning["latestSets"]
  /** これまでの処方に含まれる情報処方セット（新しい順。後日ほかの教材が届いても残す） */
  homeSets: PatientLearning["homeSets"]
  sharingLabel: string | null
  sharingRemainingMin: number
  /** 本番（Step 3）: 聞きたいこと（未解決の質問）の数・最後に体調を記録した日（未記録は null） */
  noteCount: number
  lastHealthDate: string | null
  /** 今日の体調記録があるか（リマインドの表示に使う） */
  recordedToday: boolean
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
  band = false,
  seed,
}: {
  kind: "medical" | "editorial"
  caption: string
  onExpand?: () => void
  compact?: boolean
  /** 本番: 医療者が承認した図解（承認済みの画像だけが API から届く）・登録済みのサムネイル。なければ色面とアイコンの代替表示 */
  image?: { src: string; alt: string }
  /** contain: 画像全体を枠内に表示（医学図解・教材詳細のサムネイル。切り取らない）。cover: 枠いっぱいに表示（教材カード） */
  fit?: "contain" | "cover"
  /** 主題が中央の帯に収まる線画（教材の詳細で、低い横長の枠に切り抜く） */
  band?: boolean
  /** 画像がないときの代替表示の色を決める文字列（教材名など） */
  seed?: string
}) {
  // 画像がないとき: 「画像準備中」の枠ではなく、色面とアイコンだけの落ち着いた代替表示（拡大・説明文は出さない）
  if (!image)
    return (
      <div className={`d-image-slot ${compact ? "compact" : ""}`}>
        <div className={`d-image-placeholder d-image-fallback tone-${toneFor(seed ?? caption)}`} aria-hidden="true">
          <span className="d-art-icon">
            <Icon name={kind === "medical" ? "book" : "user"} size={compact ? 18 : 24} />
          </span>
        </div>
      </div>
    )
  const placeholderContent = (
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
  )
  return (
    <div className={`d-image-slot ${compact ? "compact" : ""}${band ? " band" : ""}`}>
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
        seed={lesson.title}
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
    { page: "notes", label: "聞きたいこと", icon: "note" },
  ]
  return (
    <nav className="d-nav">
      {items.map((item) => (
        <button
          key={item.page}
          className={
            page === item.page ||
            (item.page === "home" && ["set", "money", "simulator"].includes(page)) ||
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
  // 理解確認から「聞きたいこと」へ移ったとき、元の画面へ戻るための行き先
  const [notesReturn, setNotesReturn] = useState<DPage | null>(null)
  // 学習記録からの復習（最新の挑戦の誤答・「わからない」を順に読む。回答は記録しない）
  const [reviewMode, setReviewMode] = useState(false)
  // 本番: 回答の解説を表示している設問（再読み込みで同じ解説に戻る）
  const [quizQuestionId, setQuizQuestionId] = useUrlState<string>("q", "")
  const [selectedCategory, setSelectedCategory] = useUrlState<string>("area", "手術")
  // 本番: 表示中の情報処方セット（今回の処方に含まれるセットの ID）
  const [setId, setSetId] = useUrlState<string>("set", "")
  // 教材の詳細から「前の画面へ」で戻る先（ホーム・セット・今回の情報処方から開いたときはそこへ戻る）
  const [detailBack, setDetailBack] = useState<DPage>("library")
  /** 医療費シミュレーターの「戻る」先（テーマの画面・教材の詳細） */
  const [simulatorBack, setSimulatorBack] = useState<DPage>("money")
  const openSimulator = (from: DPage) => {
    setSimulatorBack(from)
    setPage("simulator")
  }
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
  const unresolvedNotes = notesLive ? notesLive.notes.filter((note) => !note.resolvedAt) : null
  const noteCount = unresolvedNotes ? unresolvedNotes.length : notes.length
  const [quizAnswer, setQuizAnswer] = useState("")
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
      ? [...scenarioLessons, ...dLessons.slice(3, 8).map((lesson) => ({
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

  const openLesson = (lesson: DLesson, from: DPage = "library") => {
    setDetailBack(from)
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
    if (learning && ["home", "set", "money", "prescriptions", "library", "category", "search", "detail", "history"].includes(page)) {
      void learning.reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])
  // 一覧の画面に戻ったら、学習記録からの復習は終わり
  const listPage = ["home", "set", "money", "prescriptions", "library", "category", "search", "detail", "history"].includes(page)
  if (reviewMode && listPage) setReviewMode(false)
  // 一時共有中は、医療者が処方した教材をすぐ反映する（10 秒ごと・画面に戻ったとき）
  useEffect(() => {
    if (!learning) return
    const onFocus = () => void learning.reload({ silent: true })
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    const timer = live?.sharing ? window.setInterval(onFocus, 10000) : null
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
      if (timer) window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning?.loaded, live?.sharing])
  const attempt = quiz.attempt
  // 結果の画面: 理解確認の完了はサーバーで記録済み（最後の回答で学習を完了にする）。一覧を読み直して件数を DB と合わせる。
  // 読み直しの間は「確認中」、失敗したら成功の表示を出さない
  // 確認の単位（教材・再試行の回数）。保存済みの確認結果がこの単位のものでなければ「確認中」
  const [resultTry, setResultTry] = useState(0)
  const resultKey = page === "result" ? `${versionId}:${resultTry}` : null
  const [resultChecked, setResultChecked] = useState<{ key: string; ok: boolean } | null>(null)
  const resultSync: "loading" | "ok" | "error" =
    resultKey && resultChecked?.key === resultKey ? (resultChecked.ok ? "ok" : "error") : "loading"
  useEffect(() => {
    if (!learning || !resultKey) return
    let stop = false
    void learning.reload({ silent: true }).then((ok) => {
      if (!stop) setResultChecked({ key: resultKey, ok })
    })
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey])
  const syncResult = () => setResultTry((n) => n + 1)
  const nextQuestion = attempt?.questions.find((question) => !question.answer) ?? null
  const reviewQuestions = (attempt?.questions ?? []).filter((question) => question.answer && !question.answer.isCorrect)
  const shownQuestion =
    attempt?.questions.find((question) => question.questionId === quizQuestionId && question.answer) ??
    (reviewMode ? reviewQuestions[0] : null) ??
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
          onOpen={(lesson) => openLesson(lesson, "home")}
          onOpenSet={(id) => {
            setSetId(id)
            setPage("set")
          }}
          setPage={setPage}
          visit={visit}
          recentNotes={
            unresolvedNotes
              ? [...unresolvedNotes].reverse().map((note) => ({ id: note.id, body: note.body }))
              : [...notes].reverse().map((body, index) => ({ id: `${index}-${body}`, body }))
          }
          onAddNote={async (body) => {
            if (notesLive) {
              const ok = await notesLive.create(body)
              if (ok) notify("聞きたいことに保存しました")
              return ok
            }
            setNotes([...notes, body])
            notify("質問を保存しました")
            return true
          }}
        />
      )
    if (page === "set") {
      const sets = learning?.homeSets ?? []
      const shownSet = sets.find((item) => item.id === setId) ?? sets[0]
      if (!shownSet || shownSet.lessons.length === 0)
        return learning?.loaded ? (
          <div className="d-empty-search">
            <Icon name="book" size={32} />
            <h2>このセットは表示できません</h2>
            <p>ホームから選び直してください。</p>
            <button className="secondary-button" onClick={() => setPage("home")}>
              ホームへ戻る
            </button>
          </div>
        ) : null
      return (
        <DSetDetail
          set={shownSet}
          onBack={() => {
            setSetId("")
            setPage("home")
          }}
          onOpen={(lesson) => openLesson(lesson, "set")}
        />
      )
    }
    if (page === "money")
      return (
        <DMoneyTheme
          lessons={MONEY_TITLES.map((title) => visibleLessons.find((lesson) => lesson.title === title)).filter((x): x is DLesson => !!x)}
          prescribedAs={learning?.setPrescribedAs(MONEY_THEME) ?? null}
          onBack={() => setPage("home")}
          onOpen={(lesson) => openLesson(lesson, "money")}
          onSimulator={() => openSimulator("money")}
        />
      )
    if (page === "simulator") {
      const material = visibleLessons.find((lesson) => lesson.title === SIMULATOR_MATERIAL)
      return (
        <CostSimulator
          onBack={() => setPage(simulatorBack)}
          onOpenMaterial={material ? () => openLesson(material, "simulator") : undefined}
        />
      )
    }
    if (page === "prescriptions")
      return (
        <DPrescriptions
          lessons={prescriptions}
          onOpen={(lesson) => openLesson(lesson, "prescriptions")}
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
          onOpenMoney={() => setPage("money")}
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
          onBack={() => setPage(detailBack)}
          onSimulator={selected?.title === SIMULATOR_MATERIAL ? () => openSimulator("detail") : undefined}
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
                  remaining: reviewMode
                    ? Math.max(0, reviewQuestions.length - 1 - reviewQuestions.findIndex((q) => q.questionId === shownQuestion?.questionId))
                    : (attempt?.questions.filter((q) => !q.answer).length ?? 0),
                  review: reviewMode ? { index: reviewQuestions.findIndex((q) => q.questionId === shownQuestion?.questionId) + 1, total: reviewQuestions.length } : null,
                }
              : undefined
          }
          onBackToLesson={() => {
            if (learning && learnView && shownQuestion?.relatedSlideSeq)
              setSlideAt({ versionId: learnView.versionId, seq: shownQuestion.relatedSlideSeq })
            setPage("learn")
          }}
          onNext={() => {
            if (learning && reviewMode) {
              const idx = reviewQuestions.findIndex((q) => q.questionId === shownQuestion?.questionId)
              const next = reviewQuestions[idx + 1]
              if (next) {
                setQuizQuestionId(next.questionId)
                return
              }
              setReviewMode(false)
              setQuizQuestionId("")
              setPage("history")
              return
            }
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
              notify("質問候補を入力欄に入れました。確認して保存してください")
              setNotesReturn("explanation")
              setPage("notes")
              return
            }
            const candidate = learning && shownQuestion
              ? `「${shownQuestion.stem}」について、私の場合を教えてください`
              : "腕を動かす範囲について、私の場合の目安を教えてください"
            if (!notes.includes(candidate)) setNotes([...notes, candidate])
            notify("質問候補を「聞きたいこと」に追加しました")
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
                  // 記録の状態: 挑戦が完了（サーバーの記録）し、一覧の読み直しも済んだときだけ「記録しました」
                  state: !attempt || resultSync === "loading" ? "saving" : !attempt.completedAt || resultSync === "error" ? "error" : "saved",
                  onRetry: () => {
                    void quiz.load(false)
                    void syncResult()
                  },
                }
              : undefined
          }
          healthDays={
            new Set(
              records.map((record) => record.measuredAt.slice(0, 10)),
            ).size
          }
          questionCount={noteCount}
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
          onReview={
            learning
              ? (lesson) => {
                  // 復習: 教材を選び、最新の挑戦の解説（最初の誤答・「わからない」）を開く
                  setDetailBack("history")
                  setSelectedId(String(lesson.id))
                  setQuizQuestionId("")
                  setReviewMode(true)
                  setPage("explanation")
                }
              : undefined
          }
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
          visitDate={visit?.date ?? null}
          returnTo={notesReturn ? { label: "理解確認に戻る", go: () => { const to = notesReturn; setNotesReturn(null); setPage(to) } } : null}
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
        latestSets: learning.latestSets,
        homeSets: learning.homeSets,
        sharingLabel: live?.clinicianName ?? null,
        sharingRemainingMin: live?.remainingMin ?? 0,
        noteCount,
        recordedToday: records.some((record) => record.measuredAt.slice(0, 10) === toLocalInput(now).slice(0, 10)),
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

/** 体調記録の入力欄で受け付ける範囲（UI の上限。サーバーの VITAL_LIMITS より狭く、生理的にあり得る範囲だけ入力できる） */
const VITAL_UI: Record<string, { min: number; max: number; intDigits: number; decimals: number }> = {
  temperature: { min: 34, max: 42, intDigits: 2, decimals: 1 },
  systolic: { min: 60, max: 250, intDigits: 3, decimals: 0 },
  diastolic: { min: 30, max: 150, intDigits: 3, decimals: 0 },
  pulse: { min: 30, max: 200, intDigits: 3, decimals: 0 },
  spo2: { min: 70, max: 100, intDigits: 3, decimals: 0 },
  oxygenFlow: { min: 0, max: 15, intDigits: 2, decimals: 1 },
}
/** 入力途中の文字列を受け付けるか（桁数と上限だけ見る。下限は保存時に確認） */
function acceptVital(key: string, raw: string): boolean {
  if (raw === "") return true
  const rule = VITAL_UI[key]
  if (!rule) return true
  const re = rule.decimals > 0 ? new RegExp(`^\\d{0,${rule.intDigits}}(\\.\\d{0,${rule.decimals}})?$`) : new RegExp(`^\\d{0,${rule.intDigits}}$`)
  if (!re.test(raw)) return false
  const n = Number(raw)
  return Number.isNaN(n) || n <= rule.max
}
const vitalRange = (key: string) => {
  const r = VITAL_UI[key]
  return r.decimals > 0 ? `${r.min.toFixed(1)}〜${r.max.toFixed(1)}` : `${r.min}〜${r.max}`
}

type VitalForm = { temperature: string; systolic: string; diastolic: string; pulse: string; spo2: string; oxygenFlow: string }
type SymptomDetailForm = Record<string, { count?: string; location?: string; interference?: string }>
type HealthForm = {
  /** 前回値を入れた元の記録（この記録が最新である間はこのフォームを使う。新しい記録が増えたら前回値を入れ直す） */
  base: string | null
  /** 「空欄から記録」を選んだ */
  cleared?: boolean
  vitals: VitalForm
  symptoms: Record<string, number | undefined>
  details: SymptomDetailForm
}
const emptyVitals: VitalForm = { temperature: "", systolic: "", diastolic: "", pulse: "", spo2: "", oxygenFlow: "" }
const vitalsToForm = (v: HealthRecord["vitals"]): VitalForm => ({
  temperature: String(v.temperature ?? ""),
  systolic: String(v.systolic ?? ""),
  diastolic: String(v.diastolic ?? ""),
  pulse: String(v.pulse ?? ""),
  spo2: String(v.spo2 ?? ""),
  oxygenFlow: String(v.oxygenFlow ?? ""),
})

function DHealthTracker({
  records,
  setRecords,
  activeSymptomIds,
  setActiveSymptomIds,
  customNames,
  setCustomNames,
  notify,
  health,
}: {
  /** 本番（Step 3）: 体調記録の実 API。1 回の測定 = 1 記録（同じ日でも別の記録） */
  health?: PatientHealth
  records: HealthRecord[]
  setRecords: (records: HealthRecord[]) => void
  activeSymptomIds: string[]
  setActiveSymptomIds: (ids: string[]) => void
  customNames: Record<string, string>
  setCustomNames: (names: Record<string, string>) => void
  notify: (message?: string) => void
}) {
  const latest =
    [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] ||
    initialHealthRecords[initialHealthRecords.length - 1]
  const latestLive = health ? [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0] : undefined
  const [view, setView] = useState<"record" | "history" | "manage">("record")
  const [measuredAt, setMeasuredAt] = useState(() => (health ? toLocalInput(new Date()) : latest.measuredAt))
  // 酸素投与量の欄は、酸素を吸入している患者だけが開く（一度値を入れたら開いたまま）
  const [oxygenOpen, setOxygenOpen] = useState(() => records.some((record) => record.vitals.oxygenFlow !== undefined))
  const [anchorsOpen, setAnchorsOpen] = useState<string | null>(null)
  /**
   * 入力フォーム。毎回すべて入れ直さなくて済むよう、前回（最新）の記録の値を入れておき、変わったところだけ直して保存する。
   * 最新の記録が変わったら（保存した・読み込んだ）、その値を入れ直す（base で判定。効果（useEffect）での setState は使わない）
   */
  const prefill = (record?: HealthRecord): HealthForm => ({
    base: record?.id ?? null,
    vitals: record ? vitalsToForm(record.vitals) : emptyVitals,
    symptoms: record ? Object.fromEntries(activeSymptomIds.filter((id) => record.symptoms[id]).map((id) => [id, record.symptoms[id].severity])) : {},
    details: {},
  })
  const [form, setFormState] = useState<HealthForm>(() => prefill(health ? undefined : latest))
  // 本番: 履歴から編集している記録（なければ新しい記録）
  const [editingId, setEditingId] = useState<string | null>(null)
  const baseId = health ? (latestLive?.id ?? null) : latest.id
  const current: HealthForm = editingId || !health || form.base === baseId ? form : prefill(latestLive)
  const { vitals, symptoms, details } = current
  const setVitals = (next: VitalForm) => setFormState({ ...current, base: editingId ? current.base : baseId, vitals: next })
  const setSymptoms = (next: Record<string, number | undefined>) => setFormState({ ...current, base: editingId ? current.base : baseId, symptoms: next })
  const setDetails = (next: SymptomDetailForm) => setFormState({ ...current, base: editingId ? current.base : baseId, details: next })
  const prefilled = !!health && !editingId && !!latestLive && !current.cleared
  const [saving, setSaving] = useState(false)
  const [detailOpen, setDetailOpen] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("すべて")
  const [customName, setCustomName] = useState("")
  const [chartSymptom, setChartSymptom] = useState("__all")
  const [savedCount, setSavedCount] = useState<number | null>(null)

  const invalidFields = Object.entries(vitals)
    .filter(([, value]) => value !== "")
    .filter(([key, value]) => {
      const number = Number(value)
      return Number.isNaN(number) || number < VITAL_UI[key].min || number > VITAL_UI[key].max
    })
    .map(([key]) => key)
  // 血圧は上が下より大きい
  const bpOrder = vitals.systolic !== "" && vitals.diastolic !== "" && Number(vitals.systolic) <= Number(vitals.diastolic)
  const canSave = invalidFields.length === 0 && !bpOrder && !saving
  const displayName = (id: string) => customNames[id] || symptomName(id)
  const selectedDateRecord = records.find(
    (record) => record.measuredAt.slice(0, 10) === measuredAt.slice(0, 10),
  )
  const recordedDayCount = new Set(records.map((record) => record.measuredAt.slice(0, 10))).size

  const loadRecordForDate = (value: string) => {
    setMeasuredAt(value)
    // 本番: 同じ日に何回でも記録できるため、日時を変えても既存の記録を読み込まない
    if (health) return
    const found = records.find((record) => record.measuredAt.slice(0, 10) === value.slice(0, 10))
    setFormState(found ? { ...prefill(found), base: latest.id } : { base: latest.id, vitals: emptyVitals, symptoms: {}, details: {} })
  }

  /** 本番: 履歴の記録を編集のために読み込む */
  const editRecord = (record: HealthRecord) => {
    setEditingId(record.id)
    setMeasuredAt(record.measuredAt)
    if (record.vitals.oxygenFlow !== undefined) setOxygenOpen(true)
    setFormState({
      base: record.id,
      vitals: vitalsToForm(record.vitals),
      symptoms: Object.fromEntries(Object.entries(record.symptoms).map(([id, entry]) => [id, entry.severity])),
      details: Object.fromEntries(
        Object.entries(record.symptoms).map(([id, entry]) => [
          id,
          { count: entry.count == null ? undefined : String(entry.count), location: entry.location, interference: entry.interference },
        ]),
      ),
    })
    setSavedCount(null)
    setView("record")
  }
  const resetForm = () => {
    setEditingId(null)
    setMeasuredAt(toLocalInput(new Date()))
    setFormState(prefill(latestLive))
    setDetailOpen(null)
  }
  const clearForm = () => {
    setFormState({ base: baseId, cleared: true, vitals: emptyVitals, symptoms: {}, details: {} })
    setDetailOpen(null)
  }
  const saveLive = async () => {
    if (!health || !canSave) return
    const n = (v: string) => (v === "" ? null : Number(v))
    const input: HealthInput = {
      measuredAt,
      vitals: { temperature: n(vitals.temperature), systolic: n(vitals.systolic), diastolic: n(vitals.diastolic), pulse: n(vitals.pulse), spo2: n(vitals.spo2), oxygenFlow: n(vitals.oxygenFlow) },
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
    setEditingId(null)
    setMeasuredAt(toLocalInput(new Date()))
    setDetailOpen(null)
    setSavedCount(new Set([...records.map((record) => record.measuredAt.slice(0, 10)), measuredAt.slice(0, 10)]).size)
    notify(wasEditing ? "記録を更新しました" : "体調を記録しました")
  }

  const saveRecord = () => {
    if (health) return void saveLive()
    if (!canSave) return
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
        temperature: vitals.temperature ? Number(vitals.temperature) : undefined,
        systolic: vitals.systolic ? Number(vitals.systolic) : undefined,
        diastolic: vitals.diastolic ? Number(vitals.diastolic) : undefined,
        pulse: vitals.pulse ? Number(vitals.pulse) : undefined,
        spo2: vitals.spo2 ? Number(vitals.spo2) : undefined,
        oxygenFlow: vitals.oxygenFlow ? Number(vitals.oxygenFlow) : undefined,
      },
      symptoms: symptomEntries,
    }
    setRecords(
      selectedDateRecord ? records.map((record) => (record.id === selectedDateRecord.id ? nextRecord : record)) : [...records, nextRecord],
    )
    setSavedCount(selectedDateRecord ? recordedDayCount : recordedDayCount + 1)
    notify(selectedDateRecord ? "この日の記録を更新しました" : "体調を記録しました")
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
        onApplyTreatment={(ids: string[]) => {
          const next = [...activeSymptomIds, ...ids.filter((id) => !activeSymptomIds.includes(id))]
          setActiveSymptomIds(next)
          notify(`治療に合わせて症状を${ids.filter((id) => !activeSymptomIds.includes(id)).length}件追加しました`)
        }}
      />
    )

  const symptomIds = health
    ? [...activeSymptomIds, ...Object.keys(symptoms).filter((id) => symptoms[id] !== undefined && !activeSymptomIds.includes(id))]
    : activeSymptomIds
  const prefilledAt = latestLive
    ? `${formatShortDate(latestLive.measuredAt)} ${new Date(latestLive.measuredAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : ""

  return (
    <div className="d-health d-health-v2">
      <div className="d-health-head">
        <h1>体調記録</h1>
        <div className="d-health-tabs">
          <button aria-pressed={view === "record"} className={view === "record" ? "active" : ""} onClick={() => setView("record")}>
            {editingId ? "記録を編集" : "今日の記録"}
          </button>
          <button aria-pressed={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            履歴
          </button>
        </div>
      </div>
      {view === "record" ? (
        <>
          <label className="d-measured-at">
            <span>
              <Icon name="calendar" size={16} />
              日時
            </span>
            <input
              type="datetime-local"
              value={measuredAt}
              max={health ? toLocalInput(new Date()) : `${currentVisitDate}T23:59`}
              onChange={(event) => loadRecordForDate(event.target.value)}
            />
          </label>
          {prefilled && (
            <p className="d-prefill-note" data-prefill-note>
              前回（{prefilledAt}）の値です。変わったところだけ直してください。
              <button className="d-text-action" data-prefill-clear onClick={clearForm}>
                空欄から記録
              </button>
            </p>
          )}
          {editingId && (
            <p className="d-prefill-note editing" data-editing-note>
              {formatShortDate(measuredAt)} の記録を編集しています。
              <button className="d-text-action" onClick={resetForm}>
                やめて新しい記録へ
              </button>
            </p>
          )}

          <section className="d-health-section">
            <h2>バイタルサイン <small>測ったものだけ</small></h2>
            <div className="d-vital-grid">
              <DVitalField
                label="体温"
                unit="℃"
                fieldKey="temperature"
                value={vitals.temperature}
                step="0.1"
                invalid={invalidFields.includes("temperature")}
                onChange={(value) => setVitals({ ...vitals, temperature: value })}
              />
              <div className={`d-vital-card blood-pressure${invalidFields.includes("systolic") || invalidFields.includes("diastolic") || bpOrder ? " invalid" : ""}`}>
                <label>血圧 <span>mmHg</span></label>
                <div>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={VITAL_UI.systolic.min}
                    max={VITAL_UI.systolic.max}
                    value={vitals.systolic}
                    onChange={(event) => acceptVital("systolic", event.target.value) && setVitals({ ...vitals, systolic: event.target.value })}
                    placeholder="上"
                    aria-label="収縮期血圧"
                  />
                  <span>/</span>
                  <input
                    inputMode="numeric"
                    type="number"
                    min={VITAL_UI.diastolic.min}
                    max={VITAL_UI.diastolic.max}
                    value={vitals.diastolic}
                    onChange={(event) => acceptVital("diastolic", event.target.value) && setVitals({ ...vitals, diastolic: event.target.value })}
                    placeholder="下"
                    aria-label="拡張期血圧"
                  />
                </div>
                {(invalidFields.includes("systolic") || invalidFields.includes("diastolic")) && <p>上 {vitalRange("systolic")}・下 {vitalRange("diastolic")}</p>}
                {bpOrder && <p>上の値は下より大きくしてください</p>}
              </div>
              <DVitalField
                label="脈拍"
                unit="回/分"
                fieldKey="pulse"
                value={vitals.pulse}
                invalid={invalidFields.includes("pulse")}
                onChange={(value) => setVitals({ ...vitals, pulse: value })}
              />
              <DVitalField
                label="SpO₂"
                unit="%"
                fieldKey="spo2"
                value={vitals.spo2}
                invalid={invalidFields.includes("spo2")}
                onChange={(value) => setVitals({ ...vitals, spo2: value })}
              />
              {oxygenOpen && (
                <DVitalField
                  label="酸素投与量"
                  unit="L/分"
                  fieldKey="oxygenFlow"
                  value={vitals.oxygenFlow}
                  step="0.5"
                  invalid={invalidFields.includes("oxygenFlow")}
                  onChange={(value) => setVitals({ ...vitals, oxygenFlow: value })}
                />
              )}
            </div>
            {!oxygenOpen && (
              <button className="d-text-action d-oxygen-toggle" data-oxygen-toggle onClick={() => setOxygenOpen(true)}>
                酸素を吸入している方: 酸素投与量も記録
              </button>
            )}
          </section>

          <section className="d-health-section symptoms">
            <h2>
              自覚症状 <small>程度を 1 回タップ</small>
              <button className="d-link-button" onClick={() => setView("manage")} data-manage-symptoms>
                <Icon name="plus" size={14} />
                症状を追加・変更
              </button>
            </h2>
            {symptomIds.length === 0 && (
              <p className="d-symptom-setup-hint">
                記録する症状がまだありません。「症状を追加・変更」から、受けている治療に合わせてまとめて選べます。
              </p>
            )}
            <div className="d-symptom-records">
              {symptomIds.map((id) => {
                const definition = symptomLibrary.find((item) => item.id === id)
                const anchors = SEVERITY_ANCHORS[id] ?? DEFAULT_ANCHORS
                const chosen = symptoms[id]
                return (
                  <article key={id} data-symptom-row={id}>
                    <div className="d-symptom-title">
                      <b>{displayName(id)}</b>
                      {chosen === undefined && <small className="d-missing-label">未回答</small>}
                      <button data-symptom-anchors onClick={() => setAnchorsOpen(anchorsOpen === id ? null : id)} aria-expanded={anchorsOpen === id}>
                        目安
                      </button>
                      <button data-symptom-memo onClick={() => setDetailOpen(detailOpen === id ? null : id)} aria-expanded={detailOpen === id}>
                        メモ{details[id]?.interference || details[id]?.count || details[id]?.location ? " ●" : ""}
                      </button>
                    </div>
                    <div className="d-severity-scale">
                      {severityLabels.map((label, value) => (
                        <button
                          key={label}
                          className={symptoms[id] === value ? `active s${value}` : ""}
                          onClick={() => setSymptoms({ ...symptoms, [id]: value })}
                          aria-pressed={symptoms[id] === value}
                          title={value === 0 ? "症状なし" : anchors[value - 1]}
                        >
                          <span>{value}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                    {chosen !== undefined && chosen > 0 && anchorsOpen !== id && (
                      <p className="d-anchor-line" data-anchor-line>
                        {anchors[chosen - 1]}
                      </p>
                    )}
                    {anchorsOpen === id && (
                      <ol className="d-anchor-list" data-anchor-list>
                        <li>
                          <b>0</b>
                          <span>症状はない</span>
                        </li>
                        {anchors.map((text, index) => (
                          <li key={index} className={chosen === index + 1 ? "active" : ""}>
                            <b>{index + 1}</b>
                            <span>{text}</span>
                          </li>
                        ))}
                        <li className="d-anchor-note">{GRADE_NOTE}</li>
                      </ol>
                    )}
                    {detailOpen === id && (
                      <div className="d-symptom-detail">
                        {(definition?.detailType === "count" || id === "vomiting" || id === "diarrhea") && (
                          <label>
                            回数
                            <input
                              inputMode="numeric"
                              value={details[id]?.count || ""}
                              onChange={(event) => setDetails({ ...details, [id]: { ...details[id], count: event.target.value } })}
                              placeholder="任意"
                            />
                          </label>
                        )}
                        {(definition?.detailType === "location" || ["numbness", "jointPain"].includes(id)) && (
                          <label>
                            部位
                            <input
                              value={details[id]?.location || ""}
                              onChange={(event) => setDetails({ ...details, [id]: { ...details[id], location: event.target.value } })}
                              placeholder="例：両手の指"
                            />
                          </label>
                        )}
                        <label className="d-symptom-comment">
                          メモ
                          <textarea
                            data-symptom-comment
                            value={details[id]?.interference || ""}
                            maxLength={200}
                            onChange={(event) => setDetails({ ...details, [id]: { ...details[id], interference: event.target.value } })}
                            placeholder="例：夕方に強くなる。ボタンが留めにくい"
                          />
                        </label>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <div className="d-save-bar">
            <button className="primary-button d-save-health" disabled={!canSave} onClick={saveRecord}>
              <Icon name="check" />
              {health ? (editingId ? "この記録を更新" : "この記録を保存") : "この日の記録を保存"}
            </button>
          </div>
          {savedCount !== null && (
            <div className="d-gentle-feedback" role="status">
              <Icon name="check" size={18} />
              <span>
                保存しました · 記録した日 <b>{savedCount}</b>日
              </span>
              <button className="d-text-action" onClick={() => setView("history")}>
                一覧で見る
              </button>
              <button className="d-feedback-close" onClick={() => setSavedCount(null)} aria-label="閉じる">
                ×
              </button>
            </div>
          )}
          <p className="d-health-footnote">
            記録は医療者に自動では届きません（QR 共有を承認したときだけ閲覧できます）。急な症状や強い苦痛は、病院から案内された連絡先へ。
          </p>
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
                  today: health.today,
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

function DVitalField({
  label,
  unit,
  fieldKey,
  value,
  onChange,
  invalid,
  step,
}: {
  label: string
  unit: string
  fieldKey: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  step?: string
}) {
  const rule = VITAL_UI[fieldKey]
  return (
    <div className={`d-vital-card ${invalid ? "invalid" : ""}`}>
      <label>
        {label} <span>{unit}</span>
      </label>
      <div>
        <input
          inputMode="decimal"
          type="number"
          step={step}
          min={rule.min}
          max={rule.max}
          value={value}
          onChange={(event) => acceptVital(fieldKey, event.target.value) && onChange(event.target.value)}
          placeholder="—"
        />
      </div>
      {invalid && <p>{vitalRange(fieldKey)} の範囲で</p>}
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
  onApplyTreatment,
}: {
  /** 本番: 独自の症状の追加（表示の並びと症状名を 1 回で保存） */
  onAddCustom?: (name: string) => void
  /** 受けている治療・薬から、起こりやすい症状をまとめて記録項目に追加する */
  onApplyTreatment?: (ids: string[]) => void
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
  const [treatmentOpen, setTreatmentOpen] = useState(activeIds.length === 0)
  const [pickedTreatments, setPickedTreatments] = useState<string[]>([])
  const q = search.trim().toLowerCase()
  // 検索: 症状名・CTCAE 用語に加えて、言い換え（眠い → だるさ・眠気 など）でも探せる
  const matches = (item: (typeof symptomLibrary)[number]) =>
    !q || `${item.name}${item.ctcaeReference}`.toLowerCase().includes(q) || (SYMPTOM_ALIASES[item.id] ?? []).some((alias) => alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase()))
  const filtered = symptomLibrary.filter((item) => (category === "すべて" || item.category === category) && matches(item))
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= activeIds.length) return
    const next = [...activeIds]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setActiveIds(next)
  }
  const pickedIds = [...new Set(TREATMENTS.filter((t) => pickedTreatments.includes(t.id)).flatMap((t) => t.symptomIds))]
  const newIds = pickedIds.filter((id) => !activeIds.includes(id))
  const groups = ["化学療法", "分子標的薬", "ホルモン療法", "放射線", "その他"] as const
  return (
    <div className="d-symptom-manager">
      <DPageHeader title="記録する症状" onBack={onBack} />
      <section className="d-treatment-setup" data-treatment-setup>
        <button className="d-treatment-toggle" aria-expanded={treatmentOpen} onClick={() => setTreatmentOpen(!treatmentOpen)}>
          <span className="d-treatment-icon">
            <Icon name="pill" size={18} />
          </span>
          <span>
            <b>治療・薬からまとめて選ぶ</b>
            <small>起こりやすい症状を一度に追加</small>
          </span>
          <span className="d-treatment-arrow">{treatmentOpen ? "−" : "＋"}</span>
        </button>
        {treatmentOpen && (
          <div className="d-treatment-body">
            {groups.map((group) => (
              <div key={group} className="d-treatment-group">
                <small>{group}</small>
                <div className="d-treatment-chips">
                  {TREATMENTS.filter((t) => t.group === group).map((t) => {
                    const on = pickedTreatments.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        className={on ? "active" : ""}
                        aria-pressed={on}
                        data-treatment={t.id}
                        onClick={() => setPickedTreatments(on ? pickedTreatments.filter((x) => x !== t.id) : [...pickedTreatments, t.id])}
                      >
                        {on && <Icon name="check" size={12} />}
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {pickedIds.length > 0 && (
              <div className="d-treatment-preview" data-treatment-preview>
                <p>
                  起こりやすい症状 {pickedIds.length}件：
                  {pickedIds.map((id) => (
                    <span key={id} className={activeIds.includes(id) ? "have" : ""}>
                      {symptomName(id)}
                    </span>
                  ))}
                </p>
                <button
                  className="primary-button"
                  data-treatment-apply
                  disabled={newIds.length === 0}
                  onClick={() => {
                    if (onApplyTreatment) onApplyTreatment(newIds)
                    else {
                      setActiveIds([...activeIds, ...newIds])
                      notify(`症状を${newIds.length}件追加しました`)
                    }
                    setPickedTreatments([])
                  }}
                >
                  {newIds.length === 0 ? "すべて追加済みです" : `${newIds.length}件を記録項目に追加`}
                </button>
                <small>治療や薬の名前は保存しません（症状の並びだけ）。</small>
              </div>
            )}
          </div>
        )}
      </section>
      <section>
        <div className="d-section-head">
          <h2>記録している症状</h2>
          <span>{activeIds.length}項目</span>
        </div>
        {activeIds.length === 0 && <p className="d-notes-empty">まだありません。治療から選ぶか、下の一覧から追加してください。</p>}
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
                  notify("非表示にしました（過去の記録は残ります）")
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
            placeholder="症状名や言葉で検索（例：眠い、しびれ）"
            data-symptom-search
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
          {filtered.length === 0 && (
            <p className="d-notes-empty">一致する症状がありません。下の「その他の症状」に自由に入力できます。</p>
          )}
          {filtered.map((item) => {
            const active = activeIds.includes(item.id)
            const aliases = (SYMPTOM_ALIASES[item.id] ?? []).slice(0, 3)
            return (
              <div key={item.id} data-symptom-option={item.id}>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.category}
                    {aliases.length ? ` · ${aliases.join("・")}` : ""}
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
          <h3>その他（自由に入力）</h3>
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
        <p className="d-health-footnote">候補名と程度の目安は CTCAE v5.0 を参考にした患者向けの言い換えで、正式な Grade 判定ではありません。</p>
      </section>
    </div>
  )
}

/** 患者側の経過グラフで使うバイタルの指標（在宅経過表と同じ固定の表示範囲） */
const patientVitalMetrics: { key: keyof HealthRecord["vitals"]; label: string; unit: string; min: number; max: number; step?: number }[] = [
  { key: "temperature", label: "体温", unit: "℃", min: 35, max: 40 },
  { key: "systolic", label: "血圧（上）", unit: "mmHg", min: 70, max: 200 },
  { key: "diastolic", label: "血圧（下）", unit: "mmHg", min: 40, max: 130 },
  { key: "pulse", label: "脈拍", unit: "回/分", min: 40, max: 160 },
  { key: "spo2", label: "SpO₂", unit: "%", min: 80, max: 100 },
  { key: "oxygenFlow", label: "酸素投与量", unit: "L/分", min: 0, max: 15 },
]

/**
 * 1 日 1 枠の折れ線（記録のある点どうしを続けて結ぶ。間に記録のない日があるときは破線で結び、その日は線の上に点を置かない）。
 * 「記録がない＝症状なし」とは扱わず、点のない日は軸の下の短い印で欠測を示す。
 */
function DDayLineChart({
  days,
  values,
  yMin,
  yMax,
  yTicks,
  tickLabel,
  ariaLabel,
  pointClass,
}: {
  days: Date[]
  values: (number | null)[]
  yMin: number
  yMax: number
  yTicks: number[]
  tickLabel: (value: number) => string
  ariaLabel: string
  pointClass?: (value: number) => string
}) {
  const n = days.length
  const plotLeft = 56
  const plotRight = 330
  const top = 14
  const bottom = 108
  const xOf = (i: number) => plotLeft + (i / Math.max(n - 1, 1)) * (plotRight - plotLeft)
  const yOf = (value: number) => bottom - ((Math.min(yMax, Math.max(yMin, value)) - yMin) / (yMax - yMin)) * (bottom - top)
  const points = values.map((value, i) => (value === null ? null : { i, value })).filter((p): p is { i: number; value: number } => !!p)
  // 記録のある点を順に結ぶ。隣の日なら実線、間に記録のない日があれば破線
  const segments: { from: { i: number; value: number }; to: { i: number; value: number }; gap: boolean }[] = []
  for (let k = 1; k < points.length; k++) segments.push({ from: points[k - 1], to: points[k], gap: points[k].i - points[k - 1].i > 1 })
  const shortDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return (
    <>
      <svg viewBox="0 0 340 130" role="img" aria-label={ariaLabel} data-health-chart>
        {yTicks.map((value) => (
          <g key={value}>
            <line x1={plotLeft} y1={yOf(value)} x2={plotRight} y2={yOf(value)} />
            <text x="0" y={yOf(value) + 3}>
              {tickLabel(value)}
            </text>
          </g>
        ))}
        {segments.map((seg) => (
          <line
            key={`seg-${seg.from.i}`}
            className={seg.gap ? "d-chart-gap" : "d-chart-line"}
            x1={xOf(seg.from.i)}
            y1={yOf(seg.from.value)}
            x2={xOf(seg.to.i)}
            y2={yOf(seg.to.value)}
            data-chart-segment={seg.gap ? "gap" : "solid"}
          />
        ))}
        {values.map((value, i) =>
          value === null ? (
            <line key={i} className="d-chart-missing" x1={xOf(i) - 2.5} y1="124" x2={xOf(i) + 2.5} y2="124" data-chart-missing />
          ) : (
            <circle key={i} cx={xOf(i)} cy={yOf(value)} r="4" className={pointClass?.(value) ?? ""} data-chart-point={value}>
              <title>{`${shortDay(days[i])} ${tickLabel(value)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <div className="d-chart-dates" style={{ paddingLeft: `${(plotLeft / 340) * 100}%` }}>
        <span>{shortDay(days[0])}</span>
        <span>{shortDay(days[Math.floor((n - 1) / 2)])}</span>
        <span>{shortDay(days[n - 1])}</span>
      </div>
    </>
  )
}

/** 症状の重ね描きで使う色（最大 8 系列。それ以上は繰り返す） */
const SERIES_COLORS = ["#315e68", "#c27a5d", "#8a76a6", "#d0a04c", "#5f9a70", "#5f7fa8", "#b5607a", "#6f8082"]

/**
 * 複数の系列を 1 枚に重ねる折れ線（症状の推移）。各系列は記録のある点どうしを結び、間に記録のない日があれば破線。
 * 1 件も記録のない日は軸の下の短い印で欠測を示す。
 */
function DMultiLineChart({
  days,
  series,
  focus,
  yTicks,
  tickLabel,
  ariaLabel,
}: {
  days: Date[]
  series: { id: string; name: string; color: string; values: (number | null)[] }[]
  /** 強調する系列（null なら全部同じ強さ） */
  focus: string | null
  yTicks: number[]
  tickLabel: (value: number) => string
  ariaLabel: string
}) {
  const n = days.length
  const plotLeft = 52
  const plotRight = 330
  const top = 12
  const bottom = 108
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]
  const xOf = (i: number) => plotLeft + (i / Math.max(n - 1, 1)) * (plotRight - plotLeft)
  const yOf = (value: number) => bottom - ((Math.min(yMax, Math.max(yMin, value)) - yMin) / (yMax - yMin)) * (bottom - top)
  const shortDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const anyRecord = days.map((_, i) => series.some((s) => s.values[i] !== null))
  return (
    <>
      <svg viewBox="0 0 340 130" role="img" aria-label={ariaLabel} data-health-chart>
        {yTicks.map((value) => (
          <g key={value}>
            <line x1={plotLeft} y1={yOf(value)} x2={plotRight} y2={yOf(value)} />
            <text x="0" y={yOf(value) + 3}>
              {tickLabel(value)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const points = s.values.map((value, i) => (value === null ? null : { i, value })).filter((p): p is { i: number; value: number } => !!p)
          const dim = focus !== null && focus !== s.id
          return (
            <g key={s.id} data-series={s.id} style={{ opacity: dim ? 0.18 : 1 }}>
              {points.slice(1).map((p, k) => {
                const prev = points[k]
                return (
                  <line
                    key={`seg-${p.i}`}
                    className={p.i - prev.i > 1 ? "d-chart-gap" : "d-chart-line"}
                    style={{ stroke: s.color }}
                    x1={xOf(prev.i)}
                    y1={yOf(prev.value)}
                    x2={xOf(p.i)}
                    y2={yOf(p.value)}
                    data-chart-segment={p.i - prev.i > 1 ? "gap" : "solid"}
                  />
                )
              })}
              {points.map((p) => (
                <circle key={p.i} cx={xOf(p.i)} cy={yOf(p.value)} r={p.value === 0 ? 3 : 4} style={{ fill: p.value === 0 ? "#fff" : s.color, stroke: s.color }} data-chart-point={p.value}>
                  <title>{`${shortDay(days[p.i])} ${s.name} ${tickLabel(p.value)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        {anyRecord.map((has, i) => (has ? null : <line key={i} className="d-chart-missing" x1={xOf(i) - 2.5} y1="124" x2={xOf(i) + 2.5} y2="124" data-chart-missing />))}
      </svg>
      <div className="d-chart-dates" style={{ paddingLeft: `${(plotLeft / 340) * 100}%` }}>
        <span>{shortDay(days[0])}</span>
        <span>{shortDay(days[Math.floor((n - 1) / 2)])}</span>
        <span>{shortDay(days[n - 1])}</span>
      </div>
    </>
  )
}

function DHealthHistory({
  records,
  chartSymptom,
  setChartSymptom,
  live,
}: {
  records: HealthRecord[]
  /** グラフで強調する症状（"__all" なら全部を同じ強さで重ねる） */
  chartSymptom: string
  setChartSymptom: (id: string) => void
  /** 本番: 推移を見る症状の候補（表示中＋記録のある症状）、症状名、記録の編集・削除 */
  live?: {
    symptomIds: string[]
    nameOf: (id: string) => string
    /** 期間の終わり（YYYY-MM-DD・サーバーの今日。撮影用デモ環境では基準日） */
    today?: string | null
    onEdit: (record: HealthRecord) => void
    onDelete: (id: string) => void
  }
}) {
  const nameOf = (id: string) => live?.nameOf(id) ?? symptomName(id)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [mode, setMode] = useState<"table" | "chart">("table")
  const [vitalKey, setVitalKey] = useState<keyof HealthRecord["vitals"]>("temperature")
  const [openWeeks, setOpenWeeks] = useState<string[]>([])
  const [pickedDay, setPickedDay] = useState("")
  const [periodDays, setPeriodDays] = useState<7 | 14 | 28>(14)
  const tableRef = useRef<HTMLDivElement>(null)
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  const latestRecord = [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]
  // 本番はサーバーの今日まで（撮影用デモ環境では基準日。医療者の在宅経過表・外来間サマリーと同じ期間）。Figma の架空データ（開発用）は最後の記録の日まで
  const endDay = live?.today ? new Date(`${live.today}T00:00:00`) : live || !latestRecord ? new Date() : new Date(latestRecord.measuredAt)
  const days = Array.from({ length: periodDays }, (_, i) => new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - (periodDays - 1 - i)))
  const recordsOn = (d: Date) => records.filter((record) => dayKey(new Date(record.measuredAt)) === dayKey(d)).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
  // 症状: 同じ日に複数の記録があれば、その症状を回答した最後の記録を使う
  const symptomValuesOf = (id: string) =>
    days.map((d) => {
      const answered = recordsOn(d).find((record) => record.symptoms[id] !== undefined)
      return answered ? Number(answered.symptoms[id]!.severity) : null
    })
  // バイタル: 同じ日に複数の測定があれば最後の値
  const vitalValuesOf = (key: keyof HealthRecord["vitals"]) =>
    days.map((d) => {
      const measured = recordsOn(d).find((record) => record.vitals[key] !== undefined)
      return measured ? Number(measured.vitals[key]) : null
    })
  const allSymptomIds = live ? live.symptomIds : initialActiveSymptomIds
  const symptomRows = allSymptomIds.map((id) => ({ id, values: symptomValuesOf(id) })).filter((row) => row.values.some((v) => v !== null))
  const vitalRows = patientVitalMetrics
    .filter((m) => m.key !== "diastolic")
    .map((m) => ({ metric: m, values: vitalValuesOf(m.key), diastolic: m.key === "systolic" ? vitalValuesOf("diastolic") : null }))
    .filter((row) => row.values.some((v) => v !== null))
  const recordedDays = days.filter((d) => recordsOn(d).length > 0).length
  const metric = patientVitalMetrics.find((m) => m.key === vitalKey) ?? patientVitalMetrics[0]
  const vitalValues = vitalValuesOf(vitalKey)
  const vitalsRecorded = vitalValues.filter((v) => v !== null).length
  const vitalTicks = (() => {
    const span = metric.max - metric.min
    const step = span >= 100 ? 40 : span >= 60 ? 20 : span >= 20 ? 5 : 1
    const ticks: number[] = []
    for (let v = metric.min; v <= metric.max; v += step) ticks.push(v)
    return ticks
  })()
  const series = symptomRows.map((row, index) => ({ id: row.id, name: nameOf(row.id), color: SERIES_COLORS[index % SERIES_COLORS.length], values: row.values }))
  const focus = chartSymptom !== "__all" && series.some((s) => s.id === chartSymptom) ? chartSymptom : null
  // 表は最新の日が見えるよう右端から（スクロール位置だけを動かす。状態は変えない）
  useEffect(() => {
    const el = tableRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [mode, periodDays, records.length])
  const todayKey = dayKey(endDay)
  const flag = (key: keyof HealthRecord["vitals"], v: number | null) => (v === null ? "" : key === "oxygenFlow" ? "" : vitalFlag(key, v) > 0 ? ` vflag${vitalFlag(key, v)}` : "")
  // 過去の記録: 週ごとにまとめ、最新の週だけ開く。日付を選ぶとその日の記録だけを開く
  const sorted = [...records].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
  const weekKey = (iso: string) => {
    const d = new Date(iso)
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`
  }
  const weeks: { key: string; label: string; items: HealthRecord[] }[] = []
  for (const record of sorted) {
    const key = weekKey(record.measuredAt)
    let w = weeks.find((x) => x.key === key)
    if (!w) {
      const start = new Date(`${key}T00:00:00`)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      w = { key, label: `${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}`, items: [] }
      weeks.push(w)
    }
    w.items.push(record)
  }
  const pickedRecords = pickedDay ? sorted.filter((record) => record.measuredAt.slice(0, 10) === pickedDay) : null
  const weekOpen = (key: string, index: number) => (openWeeks.includes(key) ? !openWeeks.includes(`!${key}`) : index === 0)
  const toggleWeek = (key: string, index: number) => {
    const open = weekOpen(key, index)
    setOpenWeeks([...openWeeks.filter((x) => x !== key && x !== `!${key}`), open ? `!${key}` : key])
  }
  const recordRow = (record: HealthRecord) => (
    <details key={record.id} data-record-id={record.id}>
      <summary>
        <span>
          <b>{formatShortDate(record.measuredAt)}</b>
          <small>{new Date(record.measuredAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</small>
        </span>
        <span>
          {record.vitals.temperature !== undefined ? `体温 ${record.vitals.temperature}℃ · ` : ""}
          症状 {Object.keys(record.symptoms).length}項目
          {Object.values(record.symptoms).some((e) => e.severity >= 3) ? " · 強い症状あり" : ""}
        </span>
        <Icon name="arrow" />
      </summary>
      <div>
        <p>
          血圧 {record.vitals.systolic && record.vitals.diastolic ? `${record.vitals.systolic}/${record.vitals.diastolic}` : "—"} · 脈拍 {record.vitals.pulse ?? "—"} · SpO₂ {record.vitals.spo2 ?? "—"}
          {record.vitals.oxygenFlow !== undefined ? ` · 酸素 ${record.vitals.oxygenFlow} L/分` : ""}
        </p>
        {Object.entries(record.symptoms).map(([id, entry]) => (
          <span key={id} className={`s${entry.severity}`}>
            {entry.customName || nameOf(id)}
            {entry.interference ? <small className="d-record-memo">「{entry.interference}」</small> : null}
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
  )
  const cell = (v: number | null, format: (n: number) => string) => (v === null ? <span className="d-hc-missing">·</span> : format(v))
  return (
    <div className="d-health-history d-health-history-v2">
      <div className="d-history-controls">
        <div className="d-chart-period" role="group" aria-label="表示する期間">
          {([7, 14, 28] as const).map((n) => (
            <button key={n} className={periodDays === n ? "active" : ""} aria-pressed={periodDays === n} onClick={() => setPeriodDays(n)}>
              {n}日
            </button>
          ))}
        </div>
        <div className="d-chart-period d-view-mode" role="group" aria-label="表示の形式">
          <button className={mode === "table" ? "active" : ""} aria-pressed={mode === "table"} onClick={() => setMode("table")} data-history-mode="table">
            表
          </button>
          <button className={mode === "chart" ? "active" : ""} aria-pressed={mode === "chart"} onClick={() => setMode("chart")} data-history-mode="chart">
            グラフ
          </button>
        </div>
      </div>
      <p className="d-history-meta">
        直近{periodDays}日のうち{recordedDays}日に記録
      </p>

      {mode === "table" ? (
        recordedDays === 0 ? (
          <p className="d-chart-empty">この期間の記録はありません。</p>
        ) : (
          <div className="d-course-wrap" ref={tableRef} data-health-table>
            <table className="d-course-table">
              <thead>
                <tr>
                  <th />
                  {days.map((d) => (
                    <th key={dayKey(d)} className={dayKey(d) === todayKey ? "today" : ""}>
                      <span>{`${d.getMonth() + 1}/${d.getDate()}`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vitalRows.map((row) => (
                  <tr key={row.metric.key} className="vital">
                    <th>
                      {row.metric.key === "systolic" ? "血圧" : row.metric.label}
                      <small>{row.metric.unit}</small>
                    </th>
                    {row.values.map((v, i) => (
                      <td key={i} className={flag(row.metric.key, v)}>
                        {row.metric.key === "systolic"
                          ? v === null
                            ? cell(null, String)
                            : `${v}/${row.diastolic?.[i] ?? "–"}`
                          : cell(v, (n) => (row.metric.key === "temperature" ? n.toFixed(1) : String(n)))}
                      </td>
                    ))}
                  </tr>
                ))}
                {symptomRows.map((row) => (
                  <tr key={row.id} className="symptom" data-table-symptom={row.id}>
                    <th>{nameOf(row.id)}</th>
                    {row.values.map((v, i) => (
                      <td key={i} className={v === null ? "" : `s${v}`}>
                        {cell(v, String)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="d-table-note">症状は 0（なし）〜4（非常に強い）の自己評価。「·」は記録なし。</p>
          </div>
        )
      ) : (
        <>
          <section className="d-health-chart" data-symptom-chart>
            <div className="d-chart-head">
              <h2>症状</h2>
              <span>0 なし〜4 非常に強い</span>
            </div>
            {series.length === 0 ? (
              <p className="d-chart-empty">この期間に症状の記録はありません。</p>
            ) : (
              <>
                <DMultiLineChart
                  days={days}
                  series={series}
                  focus={focus}
                  yTicks={[0, 1, 2, 3, 4]}
                  tickLabel={(v) => String(v)}
                  ariaLabel={`症状の推移（直近${periodDays}日・${series.length}項目）`}
                />
                <div className="d-series-legend" role="group" aria-label="表示する症状">
                  <button className={focus === null ? "active" : ""} aria-pressed={focus === null} onClick={() => setChartSymptom("__all")} data-symptom-select="__all">
                    すべて
                  </button>
                  {series.map((s) => (
                    <button
                      key={s.id}
                      className={focus === s.id ? "active" : ""}
                      aria-pressed={focus === s.id}
                      onClick={() => setChartSymptom(focus === s.id ? "__all" : s.id)}
                      data-symptom-select={s.id}
                    >
                      <i style={{ background: s.color }} />
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p>記録のある日どうしを線で結んでいます（間に記録のない日があるところは破線）。記録がない日を「症状なし」とは扱いません。</p>
          </section>
          <section className="d-health-chart" data-vitals-chart>
            <div className="d-chart-head">
              <h2>バイタルサイン</h2>
              <select value={vitalKey} onChange={(event) => setVitalKey(event.target.value as keyof HealthRecord["vitals"])} aria-label="推移を見る項目">
                {patientVitalMetrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {vitalsRecorded === 0 ? (
              <p className="d-chart-empty">この期間に{metric.label}の記録はありません。</p>
            ) : (
              <DDayLineChart
                days={days}
                values={vitalValues}
                yMin={metric.min}
                yMax={metric.max}
                yTicks={vitalTicks}
                tickLabel={(v) => `${v}${metric.unit}`}
                ariaLabel={`${metric.label}の推移（直近${periodDays}日のうち${vitalsRecorded}日に記録）`}
              />
            )}
          </section>
        </>
      )}

      <section className="d-health-list">
        <div className="d-section-head">
          <h2>記録の一覧</h2>
          <span>
            {live ? `${new Set(records.map((record) => record.measuredAt.slice(0, 10))).size}日分・${records.length}件` : `${records.length}日分`}
          </span>
        </div>
        <label className="d-record-picker">
          <Icon name="calendar" size={16} />
          <input type="date" value={pickedDay} max={live?.today ?? undefined} onChange={(event) => setPickedDay(event.target.value)} data-record-picker aria-label="日付で探す" />
          {pickedDay && (
            <button className="d-text-action" onClick={() => setPickedDay("")}>
              解除
            </button>
          )}
        </label>
        {pickedRecords ? (
          pickedRecords.length ? (
            pickedRecords.map(recordRow)
          ) : (
            <p className="d-chart-empty">この日の記録はありません。</p>
          )
        ) : (
          weeks.map((week, index) => (
            <div key={week.key} className="d-record-week" data-record-week={week.key}>
              <button className="d-record-week-toggle" aria-expanded={weekOpen(week.key, index)} onClick={() => toggleWeek(week.key, index)}>
                <b>{week.label}の週</b>
                <small>{week.items.length}件</small>
                <span>{weekOpen(week.key, index) ? "閉じる" : "開く"}</span>
              </button>
              {weekOpen(week.key, index) && week.items.map(recordRow)}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

/** ホームの「次に学ぶ教材」: 学習途中 → 未学習の順で最初の 1 件（残りは「今回の教材をすべて見る」） */
const homeLessonOrder = { doing: 0, new: 1, done: 2 } as const

function DHome({
  scenario,
  prescriptions,
  active,
  sharing,
  onOpen,
  onOpenSet,
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
  /** 本番: 情報処方セットの内容を開く */
  onOpenSet: (setId: string) => void
  setPage: (page: DPage) => void
  /** 本番: 次回の診察日（患者が登録した日付のみ）。Figma の架空データ表示では undefined */
  visit?: PatientVisit
  /** 未解決の質問（新しい順）。ホームでは件数だけ出す */
  recentNotes: { id: string; body: string }[]
  /** ホームから質問を保存。保存できたときだけ true（入力欄を空にする） */
  onAddNote: (body: string) => Promise<boolean>
}) {
  const live = useContext(LiveInfoContext)
  const completed = prescriptions.filter((lesson) => lesson.status === "done")
  // 本番: 今回の処方をすべて学習済み（Figma の検証シナリオ 4 と同じ表示）
  const allDone = live
    ? prescriptions.length > 0 && completed.length === prescriptions.length
    : scenario === 4
  const ordered = [...prescriptions].sort((a, b) => homeLessonOrder[a.status] - homeLessonOrder[b.status])
  // 今日取り組む 1 件（学習途中 → 未学習）。残りは見出しと所要時間だけで並べ、先にやりたければ選べる
  const next = active && active.status !== "done" ? active : ordered.find((lesson) => lesson.status !== "done")
  const remaining = ordered.filter((lesson) => lesson.status !== "done" && lesson !== next)
  const remainingMin = (lesson: DLesson) =>
    live ? Math.max(1, Math.round((lesson.time * (100 - lesson.progress)) / 100)) : 4
  // 本番: これまでの処方に情報処方セット（例: 診断時セット）が含まれるときは、歩みの起点にセットを置く。
  // 後日ほかの教材が処方されても、セットはホームに残し、新しく届いた教材は別に案内する
  const homeSet = live?.homeSets.find((item) => item.lessons.length > 0)
  const setIds = new Set(homeSet?.lessons.map((lesson) => lesson.id) ?? [])
  const newOutsideSet = homeSet ? prescriptions.filter((lesson) => !setIds.has(String(lesson.id))) : []
  // 前回の診察 = 教材が届いた日（処方の記録）。Figma の架空データでは 6月12日
  const since = live ? live.latest : { sender: "さくら総合病院 山田 医師", clinician: "山田 医師", org: "さくら総合病院", date: "6月12日" }
  const recordedToday = live ? live.recordedToday : false
  const total = prescriptions.length
  // 初回表示: 学習済みが多くて「今」のカードが画面の下に隠れるときだけ、歩みをその位置まで送る（過去は上にスクロールすると見える）
  const journeyRef = useRef<HTMLDivElement>(null)
  const nowRef = useRef<HTMLLIElement>(null)
  const loaded = !live || live.loaded
  const nextId = next ? String(next.id) : null
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!loaded || scrolledFor.current === nextId) return
    scrolledFor.current = nextId
    const box = journeyRef.current
    const now = nowRef.current
    if (!box || !now) return
    const over = now.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom
    if (over > 0) box.scrollTop += over + 8
  }, [loaded, nextId])
  return (
    <div className="d-home d-home-v3" data-home-v3>
      {/* 上: 次の診察と今日の体調（固定） */}
      <div className="d-home-top" data-home-top>
        <div className="d-home-greet">
          <h1>こんにちは、{live ? live.familyName : "佐藤"}さん</h1>
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
        <button className={`d-home-health-card d-home-health-top${recordedToday ? " done" : ""}`} data-home-health onClick={() => setPage("health")}>
          <span className="d-health-mark">
            <Icon name={recordedToday ? "check" : "pulse"} size={18} />
          </span>
          <span>
            <b>{recordedToday ? "今日の体調は記録済み" : "今日の体調を記録する"}</b>
            <small>
              {recordedToday
                ? "見る・追加する"
                : live
                  ? live.lastHealthDate
                    ? `前回 ${live.lastHealthDate}`
                    : "まだ記録はありません"
                  : "前回 6月19日"}
            </small>
          </span>
          <Icon name="arrow" />
        </button>
      </div>

      {/* 中: 前回の診察から次の診察までの歩み（スクロール。線は下の「聞きたいこと」まで続く） */}
      <div className="d-journey" data-home-journey ref={journeyRef}>
        <div className="d-journey-head">
          <h2>次の診察までの歩み</h2>
          {total > 0 && (
            <span className="d-journey-count" aria-label={`教材 ${total}件のうち ${completed.length}件が完了`}>
              <i style={{ width: `${Math.round((completed.length / total) * 100)}%` }} />
              <b>
                {completed.length} / {total}
              </b>
            </span>
          )}
        </div>
        {live && !live.loaded ? (
          <div className="d-journey-loading" aria-hidden />
        ) : (
          <ol className="d-journey-list">
            {/* 起点: 前回の診察（届いた教材・セット） */}
            {homeSet ? (
              <DJourneyNode state="done" icon="clipboard" label={`${homeSet.date ?? since?.date ?? ""} · 前回の診察`}>
                <div data-set-card data-set-in-latest={homeSet.inLatest}>
                  <button className="d-jn-row" data-set-open onClick={() => onOpenSet(homeSet.id)} aria-label={`${homeSet.name}の内容を見る`}>
                    <span>
                      <b>{homeSet.name}</b>
                      <small>
                        <span className="d-set-sender">{homeSet.sender ?? since?.sender ?? "医療者"}から</span> · 教材 {homeSet.lessons.length}件
                      </small>
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              </DJourneyNode>
            ) : total > 0 ? (
              <DJourneyNode state="done" icon="clipboard" label={`${since?.date ?? ""} · 前回の診察`}>
                <button className="d-jn-row" onClick={() => setPage("prescriptions")}>
                  <span>
                    <b>教材 {total}件が届きました</b>
                    {since && <small>{since.sender}から</small>}
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </DJourneyNode>
            ) : (
              <DJourneyNode state="todo" icon="clipboard" label="前回の診察">
                <div className="d-jn-row static">
                  <span>
                    <b>教材はまだ届いていません</b>
                  </span>
                </div>
              </DJourneyNode>
            )}
            {homeSet && !homeSet.inLatest && newOutsideSet.length > 0 && (
              <DJourneyNode state="todo" icon="book" label={since ? `${since.date} · 新しく届いた教材` : "新しく届いた教材"}>
                <button className="d-jn-row" data-new-rx onClick={() => setPage("prescriptions")}>
                  <span>
                    <b>新しく届いた教材 {newOutsideSet.length}件</b>
                    {since && <small>{since.sender}から</small>}
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </DJourneyNode>
            )}

            {/* 学習済み */}
            {completed.map((lesson) => (
              <DJourneyNode key={lesson.id} state="done" label={`${lesson.completedAt ? `${lesson.completedAt} · ` : ""}完了`}>
                <button className="d-jn-row" onClick={() => onOpen(lesson)}>
                  <span>
                    <b>{lesson.title}</b>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </DJourneyNode>
            ))}

            {/* 今日 */}
            <DJourneyNode state="now" nodeRef={nowRef}>
              {next ? (
                <section className="d-jn-now-card" data-home-lesson aria-label="今日のおすすめ">
                  <Pill>{next.status === "doing" ? "続きから" : "今日のおすすめ"}</Pill>
                  <h3>{next.title}</h3>
                  <small>{next.status === "doing" ? `前回の続き · あと約${remainingMin(next)}分` : `約${next.time}分`}</small>
                  <button className="primary-button" onClick={() => onOpen(next)}>
                    {next.status === "doing" ? "続きを学ぶ" : "学び始める"}
                    <Icon name="arrow" size={18} />
                  </button>
                </section>
              ) : allDone ? (
                <section className="d-jn-now-card done" aria-label="今回の教材はすべて完了">
                  <Pill tone="soft">今回の教材</Pill>
                  <h3>すべて確認しました</h3>
                  <small>読み直すときは、学習記録から開けます。</small>
                  <button className="secondary-button" onClick={() => setPage("history")}>
                    学習記録を見る
                  </button>
                </section>
              ) : (
                <section className="d-jn-now-card" aria-label="自分で学ぶ">
                  <h3>今届いている教材はありません</h3>
                  <small>医療者から届くと、ここに表示されます。</small>
                  <button className="secondary-button" onClick={() => setPage("library")}>
                    教材を探す
                    <Icon name="arrow" size={16} />
                  </button>
                </section>
              )}
            </DJourneyNode>

            {/* これから */}
            {remaining.map((lesson, index) => (
              <DJourneyNode key={lesson.id} state="todo" label={index === 0 ? "診察までに" : undefined}>
                <button className="d-jn-row" data-journey-todo onClick={() => onOpen(lesson)}>
                  <span>
                    <b>{lesson.title}</b>
                    <small>{lesson.status === "doing" ? `あと約${remainingMin(lesson)}分` : `約${lesson.time}分`}</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </DJourneyNode>
            ))}
          </ol>
        )}
      </div>

      {/* 下: 次の診察で聞きたいこと（固定。歩みの線の終点） */}
      <DHomeAsk recentNotes={recentNotes} onAddNote={onAddNote} setPage={setPage} />
    </div>
  )
}

/** ホームの歩み: 1 つの節目（済 = チェック、今 = 「今」、これから = 白丸）。icon があればそれを優先 */
function DJourneyNode({
  state,
  icon,
  label,
  children,
  nodeRef,
}: {
  state: "done" | "now" | "todo"
  icon?: string
  /** 節目の見出し（日付や「診察までに」）。なければ出さない */
  label?: string
  children: ReactNode
  nodeRef?: RefObject<HTMLLIElement | null>
}) {
  return (
    <li className={`d-jn d-jn-${state}`} data-journey-node={state} ref={nodeRef}>
      <span className="d-jn-mark" aria-hidden="true">
        {state === "now" ? "今" : icon ? <Icon name={icon} size={15} /> : state === "done" ? <Icon name="check" size={14} /> : null}
      </span>
      <div className="d-jn-body">
        {label && <small className="d-jn-label">{label}</small>}
        {children}
      </div>
    </li>
  )
}

type DHomeSet = PatientLearning["homeSets"][number]

/** 情報処方セットのカバー（public/covers/ に登録した画像。なければ色面と線の装飾だけの代替カバー） */
function DSetCover({ name, size = "small" }: { name: string; size?: "small" | "large" }) {
  const cover = setCoverFor(name)
  return (
    <span className={`d-set-cover ${size} tone-${toneFor(name)}`} aria-hidden={cover ? undefined : true}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.src} alt={cover.alt} />
      ) : (
        <span className="d-set-cover-mark">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  )
}

/** セットの教材から、次に学ぶ 1 件（学習途中 → 未学習） */
const nextInSet = (lessons: DLesson[]) =>
  [...lessons].sort((a, b) => homeLessonOrder[a.status] - homeLessonOrder[b.status]).find((lesson) => lesson.status !== "done")

/** 情報処方セットの内容（Figma Production UX の SetDetail）。今回処方された教材を 1 件ずつカードで表示する */
function DSetDetail({
  set,
  onBack,
  onOpen,
}: {
  set: DHomeSet
  onBack: () => void
  onOpen: (lesson: DLesson) => void
}) {
  const live = useContext(LiveInfoContext)
  const total = set.lessons.length
  const done = set.lessons.filter((lesson) => lesson.status === "done").length
  const next = nextInSet(set.lessons)
  return (
    <div className="d-set-detail" data-set-detail>
      <DPageHeader title={set.name} onBack={onBack} />
      <section className="d-set-hero">
        <DSetCover name={set.name} size="large" />
        <div>
          <Pill tone="soft">情報処方セット</Pill>
          {set.sender && set.date ? (
            <p className="d-set-sender">
              {set.sender}から届きました
              <br />
              {set.date}
            </p>
          ) : live?.latest ? (
            <p className="d-set-sender">
              {live.latest.sender}から届きました
              <br />
              {live.latest.date}
            </p>
          ) : null}
          <p className="d-set-hero-count">
            {total}件のうち <b>{done}件</b> を学習済み
          </p>
          <div className="d-set-progress" aria-hidden="true">
            <i style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
        </div>
      </section>
      {set.description && <p className="d-set-detail-desc">{set.description}</p>}
      <div className="d-set-lessons">
        {set.lessons.map((lesson, index) => (
          <button
            key={lesson.id}
            className={`d-set-lesson ${next && lesson.id === next.id ? "next" : ""}`}
            data-set-lesson
            onClick={() => onOpen(lesson)}
          >
            <DImageSlot
              compact
              kind="medical"
              caption=""
              image={lesson.thumbnail ?? undefined}
              fit="cover"
              seed={lesson.title}
            />
            <span className="d-set-lesson-body">
              <span className="d-set-lesson-top">
                <span className="d-set-lesson-no">{String(index + 1).padStart(2, "0")}</span>
                <DStatus lesson={lesson} short />
              </span>
              <b>{lesson.title}</b>
              <span className="d-set-lesson-meta">
                {lesson.category}
                <span>
                  <Icon name="clock" size={13} />約{lesson.time}分
                </span>
              </span>
              {lesson.status === "doing" && (
                <span className="d-progress-line">
                  <i style={{ width: `${lesson.progress}%` }} />
                </span>
              )}
              <span className="d-set-lesson-action">
                {lesson.status === "doing" ? "続きから学ぶ" : lesson.status === "done" ? "もう一度読む" : "読む"}
                <Icon name="arrow" size={15} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** テーマ・ツールの画像枠（public/covers/ に登録した画像。なければ色面と線の装飾だけの代替表示） */
function DThemeImage({ name, size = "small" }: { name: string; size?: "small" | "large" }) {
  const image = themeImageFor(name)
  return (
    <span className={`d-set-cover d-theme-image ${size} tone-${toneFor(name)}`} aria-hidden={image ? undefined : true} data-image-slot={name}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.src} alt={image.alt} />
      ) : (
        <span className="d-set-cover-mark">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  )
}

/**
 * 「仕事とお金のこと」: 社会制度の教材（公開済みのものを題名で束ねる）と医療費シミュレーター。
 * 医療者が「仕事とお金のこと」のセットで処方していれば（教材の一致で判定）、送り元と日付を出す。
 */
function DMoneyTheme({
  lessons,
  prescribedAs,
  onBack,
  onOpen,
  onSimulator,
}: {
  lessons: DLesson[]
  prescribedAs: { sender: string; date: string } | null
  onBack: () => void
  onOpen: (lesson: DLesson) => void
  onSimulator: () => void
}) {
  const done = lessons.filter((lesson) => lesson.status === "done").length
  return (
    <div className="d-set-detail d-money" data-money-theme>
      <DPageHeader title={MONEY_THEME} onBack={onBack} />
      <section className="d-set-hero">
        <DThemeImage name={MONEY_THEME} size="large" />
        <div>
          <Pill tone="soft">{prescribedAs ? "情報処方セット" : "社会制度の情報"}</Pill>
          {prescribedAs && (
            <p className="d-set-sender" data-money-prescribed>
              {prescribedAs.sender}から届きました
              <br />
              {prescribedAs.date}
            </p>
          )}
          <p className="d-set-hero-count">
            治療と仕事の両立、休んだときの給付、医療費の制度、相談先を知る
          </p>
          {lessons.length > 0 && (
            <p className="d-set-hero-count">
              {lessons.length}件のうち <b>{done}件</b> を学習済み
            </p>
          )}
        </div>
      </section>
      <p className="d-set-note">使えるかどうかは、加入している健康保険・勤務先で異なります。最終的な判定は保険者に確認してください。</p>
      <div className="d-set-lessons">
        {lessons.map((lesson, index) => (
          <button key={lesson.id} className="d-set-lesson" data-money-lesson onClick={() => onOpen(lesson)}>
            <DImageSlot compact kind="medical" caption="" image={lesson.thumbnail ?? undefined} fit="cover" seed={lesson.title} />
            <span className="d-set-lesson-body">
              <span className="d-set-lesson-top">
                <span className="d-set-lesson-no">{String(index + 1).padStart(2, "0")}</span>
                <DStatus lesson={lesson} short />
              </span>
              <b>{lesson.title}</b>
              <span className="d-set-lesson-meta">
                <span>
                  <Icon name="clock" size={13} />約{lesson.time}分
                </span>
              </span>
              <span className="d-set-lesson-action">
                {lesson.status === "doing" ? "続きから学ぶ" : lesson.status === "done" ? "もう一度読む" : "読む"}
                <Icon name="arrow" size={15} />
              </span>
            </span>
          </button>
        ))}
        {lessons.length === 0 && (
          <p className="d-money-pending" data-money-pending>
            社会制度の教材（治療と仕事を両立するために・傷病手当金を知る・高額療養費制度を知る・困ったときの相談先）は準備中です。医療者による内容の確認後に公開します。
          </p>
        )}
      </div>
      <button className="d-money-sim-card" data-simulator-open onClick={onSimulator}>
        <DThemeImage name={SIMULATOR_NAME} />
        <span>
          <b>{SIMULATOR_NAME}</b>
          <small>年齢・保険・年収の目安・治療内容から、1か月の自己負担の目安</small>
        </span>
        <Icon name="arrow" />
      </button>
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
  // Figma の架空データ表示（visit なし）: 画面例と同じ固定の日付
  if (!visit)
    return (
      <section className="d-visit-card d-visit-top" aria-label="次回の診察日">
        <span className="d-visit-text">
          <span className="d-visit-days">
            <small>次の診察まで</small> <b>あと6日</b>
          </span>
          <small className="d-visit-when">6月20日（木）</small>
        </span>
      </section>
    )
  if (!visit.loaded) return <div className="d-visit-card d-visit-top loading" aria-hidden />
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
      <section className="d-visit-card d-visit-top editing" aria-label="次回の診察日">
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
      <section className="d-visit-card d-visit-top empty" aria-label="次回の診察日">
        <span className="d-visit-text">
          <small>次の診察</small>
          <b>診察日は未登録です</b>
        </span>
        <button className="d-visit-register" data-visit-edit onClick={startEdit}>
          <Icon name="calendar" size={16} />
          日付を登録
        </button>
      </section>
    )
  const days = daysUntil(visit.date)
  return (
    <section className={`d-visit-card d-visit-top${days === 0 ? " today" : days < 0 ? " past" : ""}`} aria-label="次回の診察日">
      <span className="d-visit-text">
        <span className="d-visit-days" data-visit-days>
          {days > 0 ? (
            <>
              <small>次の診察まで</small> <b>あと{days}日</b>
            </>
          ) : days === 0 ? (
            <b>今日が診察日です</b>
          ) : (
            <>登録した診察日を過ぎました。次の日付を登録してください</>
          )}
        </span>
        <small className="d-visit-when">{visitDateLabel(visit.date)}</small>
      </span>
      <button className="d-visit-change" data-visit-edit onClick={startEdit} aria-label="次回の診察日を変更">
        <Icon name="calendar" size={20} />
        <small>変更</small>
      </button>
    </section>
  )
}

/** ホーム下部（固定）: 歩みの終点。「次の診察で聞きたいこと」を直接追加（既存の診察ノート API。保存に成功したときだけ件数に反映） */
function DHomeAsk({
  recentNotes,
  onAddNote,
  setPage,
}: {
  recentNotes: { id: string; body: string }[]
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
    <section className="d-home-ask d-home-bottom" data-home-block="ask">
      <span className="d-bottom-rail" aria-hidden="true">
        <span className="d-jn-mark d-bottom-mark">
          <Icon name="calendar" size={15} />
        </span>
      </span>
      <div className="d-home-ask-body">
        <div className="d-home-ask-head">
          <h2>次の診察で聞きたいこと</h2>
          <button className="d-home-ask-count" data-home-note-count onClick={() => setPage("notes")} aria-label={`聞きたいこと ${recentNotes.length}件の一覧を開く`}>
            {recentNotes.length}件
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <form
          className="d-home-ask-form"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <label htmlFor="d-home-note" className="sr-only">
            次の診察で聞きたいこと
          </label>
          <input
            id="d-home-note"
            data-home-note-input
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="例：腕のつっぱりはいつまで続く？"
          />
          <button type="submit" className="primary-button" data-home-note-add disabled={!draft.trim() || busy}>
            <Icon name="plus" size={18} />
            追加
          </button>
        </form>
      </div>
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
        eyebrow="医療者から届いた教材"
        onBack={onBack}
      />
      <div className="d-prescription-info">
        <Icon name="user" />
        <span>
          <b>{live?.latest ? `${live.latest.sender}から` : "乳腺外科 山田医師から"}</b>
          <small>{live?.latest ? `${live.latest.date}に届きました · ${lessons.length}件` : "6月12日に届きました · 3件"}</small>
        </span>
      </div>
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
  onOpenMoney,
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
  /** 「仕事とお金のこと」（制度と医療費の目安）。ホームには置かず、探す画面から開く */
  onOpenMoney?: () => void
}) {
  const categories = useContext(CategoriesContext)
  return (
    <div className="d-library">
      <h1>教材を探す</h1>
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
          <h2>領域から探す</h2>
        </div>
        <div className="d-category-cards">
          {categories.map((category) => (
            <button
              key={category.name}
              className={areaTone(category.name)}
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
        {onOpenMoney && (
          <button className="d-theme-card" data-money-card onClick={onOpenMoney}>
            <span className="d-category-icon">
              <Icon name="wallet" />
            </span>
            <span>
              <b>{MONEY_THEME}</b>
              <small>制度と医療費の目安</small>
            </span>
            <Icon name="arrow" />
          </button>
        )}
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
              {filter === "自主" ? "自分で選んだ教材" : filter === "処方" ? "処方された教材" : filter}
            </button>
          ))}
        </div>
        <p className="d-filter-help">処方された教材 = 医療者が届けた教材 ／ 自分で選んだ教材 = 自分で開いて学んだ教材</p>
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
      <DPageHeader title={category} onBack={onBack} />
      <div className={`d-area-overview ${areaTone(category)}`}>
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
  onSimulator,
}: {
  lesson: DLesson
  onBack: () => void
  onStart: () => void
  /** 医療費シミュレーターを開ける教材（高額療養費制度を知る）だけ */
  onSimulator?: () => void
}) {
  return (
    <div className="d-detail">
      <DPageHeader title="教材" onBack={onBack} />
      <DImageSlot
        kind={imageKind(lesson)}
        // 装飾用サムネイルの下には説明を出さない（監修済みの医学図解と区別する）。画像がないときは小さな代替表示だけ
        caption=""
        image={lesson.thumbnail ?? undefined}
        // 主題が中央の帯に収まる線画は、横長の枠に合わせて切り抜く（枠を低くして「学習を始める」を画面内に保つ）
        fit={lesson.thumbnail?.band ? "cover" : "contain"}
        band={!!lesson.thumbnail?.band}
        seed={lesson.title}
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
      <div className="d-content-list d-content-list-compact">
        <span>短い説明 {lesson.slideCount ?? 3}ページ</span>
        {(lesson.questionCount ?? 1) > 0 && <span>理解確認 {lesson.questionCount ?? 1}問</span>}
        <span>読み上げ可</span>
      </div>
      {onSimulator && (
        <button className="d-sim-open" data-open-simulator onClick={onSimulator}>
          <span>
            <b>{SIMULATOR_NAME}で目安を計算する</b>
            <small>高額療養費制度を考えた、保険診療1か月分の自己負担の目安</small>
          </span>
          <Icon name="arrow" />
        </button>
      )}
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
  const [audioNotice, setAudioNotice] = useState<string | null>(null)
  // 本番の音声: 端末の読み上げ機能でスライドの読み上げ用テキストを読む（ページを移ったら止める）
  useEffect(() => {
    if (!live) return
    // ページを移ったら読み上げを止める（表示の状態は、読み上げの終了コールバックと下のキーの切り替えで戻る）
    return () => stopSpeaking()
  }, [live?.seq, live])
  // ページが変わったら「もう少し詳しく」を閉じ、読み上げ中の表示を戻す（key で状態を作り直す）
  const [shownSeq, setShownSeq] = useState(live?.seq ?? 0)
  if (live && live.seq !== shownSeq) {
    setShownSeq(live.seq)
    setAudioPlaying(false)
    setDetailOpen(false)
  }
  if (live) {
    const slide = live.slide
    const figure = slide?.figures[0]
    const toggleAudio = () => {
      if (!slide) return
      if (audioPlaying) {
        stopSpeaking()
        setAudioPlaying(false)
        return
      }
      if (!speechSupported()) {
        setAudioNotice("この端末のブラウザでは読み上げを使えません。文章をそのままお読みください。")
        return
      }
      // 読み上げる文: 見出し → 要点 → 本文（「もう少し詳しく」は開いているときだけ）
      const text = [slide.title, slide.proposition, slide.voiceText !== slide.proposition ? slide.voiceText : null, detailOpen ? slide.detailMd : null].filter(Boolean).join("。")
      const started = speakText(text, () => setAudioPlaying(false))
      if (!started) {
        setAudioNotice("読み上げを開始できませんでした。端末の音量をご確認ください。")
        return
      }
      setAudioNotice(null)
      setAudioPlaying(true)
    }
    const isLast = live.seq >= live.total
    const art = slide ? slideArtKey(slide.title, slide.bodyMd) : "book"
    return (
      <div className="d-learning">
        <div className="d-learning-head">
          <button onClick={onClose}>閉じる</button>
          <span>
            {live.seq} / {live.total || "—"}
          </span>
          <button className={audioPlaying ? "active" : ""} onClick={toggleAudio} aria-pressed={audioPlaying} data-audio-toggle>
            <Icon name="audio" />
            {audioPlaying ? "停止" : "読み上げ"}
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
              <div className="d-audio-state" role="status">
                <span className="live-dot" />
                読み上げ中
                <span className="d-audio-wave">〰 〰 〰</span>
              </div>
            )}
            {audioNotice && !audioPlaying && (
              <p className="d-audio-notice" role="status">
                {audioNotice}
              </p>
            )}
            {/* 図解がないページ: 主題に合った挿絵（装飾）と本文。医学図解は医療者の承認後にだけ届く */}
            {!figure ? (
              <div className="d-learning-plain">
                <SlideArt art={art} tone={live.seq} />
                {slide.proposition && slide.bodyMd && slide.bodyMd !== slide.proposition ? (
                  <p className="d-learning-body">{slide.bodyMd}</p>
                ) : null}
              </div>
            ) : (
            <>
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
                caption={figure.caption ?? (slide.proposition ? slide.bodyMd : "")}
                image={{ src: figure.src, alt: figure.altText ?? figure.caption ?? slide.title }}
                onExpand={onZoom}
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
            </>
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
            {/* 読み込み中は最後のページ用の文言（学習を終える）を出さない */}
            {!slide ? "次へ" : !isLast ? "次へ" : live.hasQuiz ? "理解を確認する" : "学習を終える"}
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
        理解の確認{live && live.total > 1 ? ` · ${live.index + 1} / ${live.total}` : ""}
      </p>
      <h1>{live ? (live.question?.stem ?? "読み込んでいます…") : "腕を動かすとき、適切なのはどれですか？"}</h1>
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
      <div className="d-selection-note">{answer ? `「${answer}」を選択しています` : "迷ったときは「わからない」を選べます"}</div>
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
  live?: { question: AttemptQuestion | null; relatedTitle: string | null; remaining: number; review?: { index: number; total: number } | null }
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
  const verdict: "correct" | "wrong" | "unsure" = correct ? "correct" : unsure ? "unsure" : "wrong"
  return (
    <div className="d-explanation">
      <div className={`d-answer-result ${verdict === "correct" ? "correct" : verdict === "wrong" ? "wrong" : "review"}`} data-answer-verdict={verdict}>
        <span>
          <Icon name={verdict === "correct" ? "check" : verdict === "wrong" ? "x" : "help"} size={28} />
        </span>
        <div>
          <p className="eyebrow">{preview ? "プレビュー · 回答は記録されません" : live?.review ? `復習 ${live.review.index} / ${live.review.total} · 前回の回答` : "回答を記録しました"}</p>
          <span className={`d-verdict-badge ${verdict}`}>{verdict === "correct" ? "正解" : verdict === "wrong" ? "不正解" : "わからない"}</span>
          <h1>
            {verdict === "correct"
              ? "この内容で確認できています"
              : verdict === "unsure"
                ? preview
                  ? "「わからない」を選びました"
                  : <span className="d-keep">「わからない」を<wbr />記録しました</span>
                : "正しい答えをいっしょに確認しましょう"}
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
          この内容を「聞きたいこと」に入れる
        </button>
      )}
      <button className="primary-button d-bottom-action" onClick={onNext}>
        {live?.review ? (live.remaining > 0 ? "次の問題へ" : "学習記録に戻る") : live && live.remaining > 0 ? "次の問題へ" : "振り返りへ"}
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
  onNotes,
  onHome,
}: {
  answer: string
  /** 本番: この教材の学習と理解確認の記録 */
  live?: {
    title: string
    slideCount: number
    answered: number
    needsReview: number
    learnedCount: number
    /** saving: 記録を確認中／saved: DB に記録済みで件数も最新／error: 確認できない（成功の表示を出さない） */
    state: "saving" | "saved" | "error"
    onRetry: () => void
  }
  healthDays: number
  questionCount: number
  onNotes: () => void
  onHome: () => void
}) {
  const needsReview = live ? live.needsReview > 0 : answer !== "無理のない範囲でゆっくり動かす"
  const state = live?.state ?? "saved"
  if (state === "error")
    return (
      <div className="d-result-page no-motion" data-result-state="error">
        <h1>学習の記録を確認できませんでした</h1>
        <p role="alert">通信の状態を確かめて、もう一度お試しください。回答はこの画面を閉じても失われません。</p>
        <button className="primary-button" onClick={live?.onRetry}>
          もう一度確認する
        </button>
        <button className="secondary-button d-bottom-action" onClick={onHome}>
          ホームへ戻る
        </button>
      </div>
    )
  return (
    <div className="d-result-page" data-result-state={state} aria-busy={state === "saving"}>
      <span className="d-result-mark">
        <Icon name="check" size={34} />
      </span>
      <p className="eyebrow" role="status">
        {state === "saving" ? "学習の記録を確認しています" : "学習を記録しました"}
      </p>
      <h1>今日もひとつ、知ることが増えました</h1>
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
        <h2>これまで</h2>
        <div>
          <span>
            <b data-learned-count>{!live ? 4 : state === "saving" ? "…" : live.learnedCount}</b>
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
      </div>
      {needsReview && (
        <button className="d-next-note" onClick={onNotes}>
          <span className="stat-icon purple">
            <Icon name="note" />
          </span>
          <span>
            <b>聞きたいことを確認する</b>
            <small>質問の候補を編集できます</small>
          </span>
          <Icon name="arrow" />
        </button>
      )}
      <button className="primary-button d-bottom-action" onClick={onHome}>
        ホームへ戻る
      </button>
    </div>
  )
}

function DHistory({
  lessons,
  onOpen,
  onCategory,
  onReview,
}: {
  lessons: DLesson[]
  onOpen: (lesson: DLesson) => void
  onCategory: (category: string) => void
  /** 本番: 理解確認で誤答・「わからない」だった教材の復習（該当の設問の解説を開く） */
  onReview?: (lesson: DLesson) => void
}) {
  const categories = useContext(CategoriesContext)
  const toReview = lessons.filter((lesson) => (lesson.nWrong ?? 0) + (lesson.nUnknown ?? 0) > 0)
  return (
    <div className="d-history">
      <h1>これまでの学び</h1>
      {toReview.length > 0 && (
        <section className="d-review-section" data-review-section>
          <div className="d-section-head">
            <div>
              <h2>もう一度確認したいこと</h2>
            </div>
            <span>{toReview.length}教材</span>
          </div>
          <div className="d-review-list">
            {toReview.map((lesson) => (
              <button key={lesson.id} className="d-review-item" data-review-item onClick={() => (onReview ? onReview(lesson) : onOpen(lesson))}>
                <span className="d-review-badge">
                  {(lesson.nWrong ?? 0) > 0 ? `不正解 ${lesson.nWrong}` : ""}
                  {(lesson.nWrong ?? 0) > 0 && (lesson.nUnknown ?? 0) > 0 ? " · " : ""}
                  {(lesson.nUnknown ?? 0) > 0 ? `わからない ${lesson.nUnknown}` : ""}
                </span>
                <b>{lesson.title}</b>
                <small>{lesson.category}</small>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="d-history-summary">
        <div>
          <b>{lessons.filter((item) => item.status === "done").length}</b>
          <span>学習済み</span>
        </div>
        <div>
          <b>{lessons.filter((item) => item.status === "doing").length}</b>
          <span>学習途中</span>
        </div>
      </div>
      <section>
        <div className="d-section-head">
          <h2>領域ごと</h2>
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
                className={areaTone(category.name)}
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
      <p className="d-health-footnote">学習の進み具合と、医学的な理解の度合いは別のものです。</p>
    </div>
  )
}

function DNotes({
  notes: figmaNotes,
  setNotes,
  notify,
  live,
  draftFrom,
  clearDraft,
  visitDate = null,
  returnTo = null,
}: {
  notes: string[]
  setNotes: (notes: string[]) => void
  notify: (message?: string) => void
  /** 本番（Step 3）: 聞きたいことの実 API（作成・編集・削除・「聞けた」の印） */
  live?: PatientNotes
  /** 本番: 理解確認から作った質問候補（保存するまで記録しない） */
  draftFrom?: { text: string; versionId: string; questionId: string; title: string } | null
  clearDraft?: () => void
  /** 本番: 患者が登録した次回の診察日（未登録は null） */
  visitDate?: string | null
  /** 理解確認から来たときの戻り先 */
  returnTo?: { label: string; go: () => void } | null
}) {
  const [draft, setDraft] = useState(draftFrom?.text ?? "")
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [resolvedOpen, setResolvedOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  // 本番: 未解決（新しい順）と「聞けた」（新しい順）に分ける。Figma の架空データは未解決だけ
  const liveNotes: VisitNote[] = live ? live.notes : figmaNotes.map((body, index) => ({ id: `f-${index}`, body, source: "free", materialId: null, materialTitle: null, createdAt: "", updatedAt: "", resolvedAt: null }))
  const open = [...liveNotes].filter((note) => !note.resolvedAt).reverse()
  const done = [...liveNotes].filter((note) => !!note.resolvedAt).reverse()
  const addNote = async () => {
    if (!draft.trim() || busy) return
    if (live) {
      setBusy(true)
      const ok = await live.create(draft.trim(), draftFrom ? { versionId: draftFrom.versionId, questionId: draftFrom.questionId } : null)
      setBusy(false)
      if (!ok) return
      setDraft("")
      clearDraft?.()
      setSaved(true)
      notify("質問を保存しました")
      return
    }
    setNotes([...figmaNotes, draft.trim()])
    setDraft("")
    notify("質問を保存しました")
  }
  const dateOf = (iso: string) => {
    if (!iso) return ""
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  const noteRow = (note: VisitNote, index: number, resolved: boolean) => (
    <div key={note.id} className={`d-note-row${resolved ? " resolved" : ""}`} data-note-id={note.id} data-note-resolved={resolved}>
      <span className="d-note-number">{resolved ? <Icon name="check" size={13} /> : index + 1}</span>
      {editing === note.id ? (
        <textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} />
      ) : (
        <p>
          {note.body}
          {live && (
            <small className="d-note-meta">
              {note.materialTitle ? `教材「${note.materialTitle}」から · ` : ""}
              {resolved && note.resolvedAt ? `${dateOf(note.resolvedAt)}に聞けた` : `${dateOf(note.updatedAt)}${note.updatedAt !== note.createdAt ? "に更新" : "に保存"}`}
            </small>
          )}
        </p>
      )}
      <div>
        {editing === note.id ? (
          <>
            <button
              disabled={!editValue.trim()}
              onClick={async () => {
                if (live) {
                  if (!(await live.update(note.id, editValue))) return
                  setEditing(null)
                  notify("質問を更新しました")
                  return
                }
                setNotes(figmaNotes.map((item) => (item === note.body ? editValue : item)))
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
            {live && (
              <button
                className={resolved ? "" : "d-note-resolve"}
                data-note-resolve
                onClick={async () => {
                  if (await live.resolve(note.id, !resolved)) notify(resolved ? "未解決に戻しました" : "「聞けた」に移しました")
                }}
              >
                {resolved ? "未解決に戻す" : "聞けた"}
              </button>
            )}
            <button
              onClick={() => {
                setEditing(note.id)
                setEditValue(note.body)
              }}
            >
              編集
            </button>
            <button
              onClick={async () => {
                if (live) {
                  if (await live.remove(note.id)) notify("質問を削除しました")
                  return
                }
                setNotes(figmaNotes.filter((item) => item !== note.body))
              }}
            >
              削除
            </button>
          </>
        )}
      </div>
    </div>
  )
  return (
    <div className="d-notes">
      <h1>聞きたいこと</h1>
      <div className="d-visit-date">
        <Icon name="calendar" />
        {live ? (
          // 本番: 患者が登録した次回診察日だけを表示する（架空の日時を出さない）
          <span>
            <b>{visitDate ? `次回診察日：${visitDateLabel(visitDate)}` : "次回診察日：未登録"}</b>
          </span>
        ) : (
        <span>
          <b>次回診察 6月20日（木）10:30</b>
          <small>乳腺外科 · 山田医師</small>
        </span>
        )}
      </div>
      {returnTo && (
        <button className="d-link-card d-notes-return" data-notes-return onClick={returnTo.go}>
          <Icon name="arrow" />
          <span>
            <b>{returnTo.label}</b>
            <small>{saved ? "保存しました。学習の続きに戻れます" : "保存してもしなくても、ここから学習の続きに戻れます"}</small>
          </span>
        </button>
      )}
      <section className="d-add-question">
        {live && draftFrom && (
          <p className="d-support-copy">「{draftFrom.title}」の理解確認から作った候補です。確認して保存してください。</p>
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
          <h2>まだ聞いていないこと</h2>
          <span>{open.length}件</span>
        </div>
        {open.length === 0 && <p className="d-notes-empty">まだありません。</p>}
        <div className="d-saved-notes">{open.map((note, index) => noteRow(note, index, false))}</div>
      </section>
      {done.length > 0 && (
        <section className="d-notes-resolved">
          <button className="d-notes-resolved-toggle" aria-expanded={resolvedOpen} onClick={() => setResolvedOpen(!resolvedOpen)}>
            <span>
              <Icon name="check" size={16} />
              聞けた質問（{done.length}件）
            </span>
            <span>{resolvedOpen ? "閉じる" : "開く"}</span>
          </button>
          {resolvedOpen && <div className="d-saved-notes">{done.map((note, index) => noteRow(note, index, true))}</div>}
        </section>
      )}
      <p className="d-health-footnote">
        共有を承認したときだけ、医療者がこの質問を見られます。急な症状や強い痛みは、病院から案内された連絡先へ。
      </p>
    </div>
  )
}

/** 本番の共有画面: 申請者（医療機関・医療者）と有効期間。申請がなければ読み取り方の案内 */
function DShareLiveIntro({ live }: { live: PatientLive }) {
  const p = live.pending
  if (!p && live.code)
    return (
      <p className="d-share-intro">
        医療者にQRコードを読み取ってもらうか、6桁コードを入力してもらってください。
      </p>
    )
  if (!p)
    return (
      <>
        <p className="d-share-intro">
          診察のときに、あなたのQRコードと6桁コードを表示して、医療者に読み取ってもらってください。
        </p>
        <ol className="d-share-steps" data-share-steps>
          <li>「QRコードと6桁コードを表示する」を押す</li>
          <li>医療者がQRコードを読み取るか、6桁コードを入力する</li>
          <li>表示された医療機関・医療者を確認して承認すると、60分間だけ共有されます</li>
        </ol>
      </>
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

/**
 * 本番の共有画面: 患者が自分の QR コードと 6 桁コードを表示する（既存の患者発行コード。1 回の発行で同じグラント、5 分・1 回限り）。
 * ログイン済みの医療者が QR を読み取るか 6 桁コードを入力した後、この画面に申請者が表示され、患者が確認して承認するまで共有は始まらない。
 */
function DShareCode({ live }: { live: PatientLive }) {
  if (!live.code)
    return (
      <div className="d-share-issue">
        <button className="primary-button" data-share-issue onClick={() => void live.issueCode()}>
          <Icon name="qr" />
          QRコードと6桁コードを表示する
        </button>
        <small>5分間・1回限り有効です。読み取り・入力されただけでは共有されません。</small>
      </div>
    )
  return (
    <div className="d-share-session d-share-code" data-share-code>
      {live.code.qrDataUrl && (
        <span className="wide d-share-qr" data-share-qr>
          {/* eslint-disable-next-line @next/next/no-img-element -- 端末内で作った QR 画像（data URL） */}
          <img src={live.code.qrDataUrl} alt="医療者に読み取ってもらう共有用QRコード" width={184} height={184} />
          <small>医療者に読み取ってもらってください</small>
        </span>
      )}
      <span>
        <small>6桁の共有コード</small>
        <b>{live.code.value}</b>
      </span>
      <span>
        <small>有効期限</small>
        <b>あと{live.code.remainingMin}分・1回限り</b>
      </span>
      <span className="wide">
        <small>カメラがなければ 6 桁コードを入力してもらいます。表示された共有先をあなたが承認したときに共有が始まります。コードは電話やメールで送らないでください。</small>
        <button className="d-text-action" onClick={() => void live.cancelCode()}>
          QRとコードを取り消す
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
          <h2>あなたの承認後に、医療者が閲覧できます</h2>
          {live ? (
            <DShareLiveIntro live={live} />
          ) : (
          <p className="d-share-intro">
            医療者の画面に表示されたQRコードを読み取り、共有する内容を確認してください。
          </p>
          )}
          {/* 本番: 申請がないときは、あなたの QR コードと 6 桁コードを表示できる */}
          {live && !live.pending && <DShareCode live={live} />}
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
              聞きたいこと（質問）
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
          <p className="d-privacy-caption">
            患者情報はあなたが管理します。医療者側に患者一覧として保存されません。
          </p>
        </>
      ) : (
        <div className="d-sharing-active">
          <span className="d-sharing-shield">
            <Icon name="shield" size={42} />
          </span>
          <p className="eyebrow">一時共有中</p>
          <h2>
            {live?.clinicianName
              ? `${live.clinicianName}と一時共有中です`
              : "山田医師と一時共有中です"}
          </h2>
          <p>共有を終了すると、医療者はこの情報を閲覧できなくなります。</p>
          <div className="d-share-session">
            <span>
              <small>共有先</small>
              <b>
                {live?.clinicianOrg && live.clinicianName ? (
                  <>
                    {live.clinicianOrg} <span className="d-nowrap">{live.clinicianName}</span>
                  </>
                ) : (live?.clinicianLabel ?? "乳腺外科 山田医師")}
              </b>
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

