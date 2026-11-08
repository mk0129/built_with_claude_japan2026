"use client";

/**
 * Figma Make「Concept D」の移植（Phase 1: Figma の架空データで表示と操作を再現）。
 * 状態の持ち方は Figma の App（src/App.tsx の Concept D 部分）をそのまま使う。
 * - PatientDApp / ClinicianDApp: 本番表示。端末枠と検証用の切り替えを外し、画面幅に応じて Figma の表示幅クラスを選ぶ。
 * - ConceptDDev: 開発用。Figma の検証シナリオ・テスト状態・表示幅の切り替えつき（案 A/B/C は含めない）。
 */
import { useState, useSyncExternalStore } from "react"
import ClinicianD, { CIcon, type ClinicianDViewport } from "./ClinicianD"
import { useClinicianLive, usePatientLive, type ClinicianOrg } from "./live"
import { usePatientLearning } from "./learning"
import { useClinicianRecord } from "./record"
import { usePatientHealth, usePatientNotes } from "./health"
import { usePatientVisit } from "./visit"
import { usePatientTreatment } from "./treatment"
import { useStudio } from "./studio"
import { DPrototype, Icon, Logo, type DViewport } from "./PatientD"
import { initialActiveSymptomIds, initialHealthRecords, type HealthRecord } from "./healthData"
import { UrlInitContext, type UrlInit } from "./urlState"

type DMode = "patient" | "clinician"

/** Figma App と同じ体調記録・トーストの状態 */
function useConceptDState() {
  const [healthRecords, setHealthRecords] =
    useState<HealthRecord[]>(initialHealthRecords)
  const [activeSymptomIds, setActiveSymptomIds] = useState(
    initialActiveSymptomIds,
  )
  const [customSymptomNames, setCustomSymptomNames] =
    useState<Record<string, string>>({})
  const [toast, setToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("質問メモに追加しました")
  const notify = (message = "質問メモに追加しました") => {
    setToastMessage(message)
    setToast(true)
    window.setTimeout(() => setToast(false), 2200)
  }
  return {
    healthRecords,
    setHealthRecords,
    activeSymptomIds,
    setActiveSymptomIds,
    customSymptomNames,
    setCustomSymptomNames,
    notify,
    toastNode: toast ? (
      <div className="toast">
        <Icon name="check" />
        {toastMessage}
      </div>
    ) : null,
  }
}

function useMedia(query: string, serverValue: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", onChange)
      return () => m.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}

/** 患者: 患者はスマートフォンで使う。700px 以下は画面いっぱい、それより広い画面（PC で開いたとき）は 430px のスマートフォン枠を中央に置く */
export function PatientDApp({ initial = {}, userName }: { initial?: UrlInit; userName?: string }) {
  const s = useConceptDState()
  const wide = useMedia("(min-width: 701px)", false)
  const connect = typeof initial.connect === "string" ? initial.connect : null
  const live = usePatientLive(connect, s.notify)
  const learning = usePatientLearning(s.notify)
  const health = usePatientHealth(s.notify)
  const notesLive = usePatientNotes(s.notify)
  const visit = usePatientVisit(s.notify)
  const treatment = usePatientTreatment(s.notify)
  // Step 3 で患者画面の表示はすべて実データになったため、「架空データ」の表示は出さない
  // （全画面の学習・解説・振り返りで見出しに重なっていた問題もこれで解消）
  return (
    <UrlInitContext.Provider value={initial}>
    <div className="d-app-stage">
      <DPrototype
        variant="app"
        live={live}
        learning={learning}
        userName={userName}
        health={health}
        notesLive={notesLive}
        visit={visit}
        treatment={treatment}
        viewport={wide ? "430" : "390"}
        notify={s.notify}
        healthRecords={s.healthRecords}
        setHealthRecords={s.setHealthRecords}
        activeSymptomIds={s.activeSymptomIds}
        setActiveSymptomIds={s.setActiveSymptomIds}
        customSymptomNames={s.customSymptomNames}
        setCustomSymptomNames={s.setCustomSymptomNames}
      />
      {s.toastNode}
    </div>
    </UrlInitContext.Provider>
  )
}

/** 医療者: 1180px 以上は Figma の 1180 表示、それ未満は 820 表示（どちらも幅は Figma の設計幅のまま） */
export function ClinicianDApp({ sessionId = null, orgs = [], grantId = null }: { sessionId?: string | null; orgs?: ClinicianOrg[]; grantId?: string | null }) {
  const s = useConceptDState()
  const wide = useMedia("(min-width: 1180px)", true)
  // 一時共有の通知は Figma の医療者用トースト（.cd-toast）で出す
  // tone: error のときは成功の印（チェック）を出さない
  const [notice, setNotice] = useState<{ message: string; tone: "info" | "error"; at: number } | null>(null)
  const showNotice = (message: string, tone: "info" | "error" = "info") => {
    setNotice({ message, tone, at: Date.now() })
    window.setTimeout(() => setNotice(null), tone === "error" ? 6000 : 2600)
  }
  const showError = (message: string) => showNotice(message, "error")
  const live = useClinicianLive(sessionId, orgs, showNotice, grantId)
  // 患者が承認した有効な一時共有の間だけ、診察サマリーと処方の実データを読む（Step 2）。共有の終了を送信中は読まない
  const sharing = live.state === "active" && !live.ending
  const record = useClinicianRecord(live.sessionId, sharing, showError)
  // 教材スタジオ（Step 5）: 申請先の医療機関で、教材編集・承認の権限があるときだけ使える（権限はサーバーで検証）
  const studio = useStudio(live.org?.orgId ?? null, sharing, showError)
  return (
    <div className="cd-app-stage">
      {/* Step 5 で医療者画面もすべて実データになったため、「架空データ」の表示は出さない */}
      <ClinicianD
        variant="app"
        live={live}
        record={record}
        studio={studio}
        viewport={wide ? "1180" : "820"}
        healthRecords={s.healthRecords}
        activeSymptomIds={s.activeSymptomIds}
        customSymptomNames={s.customSymptomNames}
      />
      {/* 終了に失敗したあと、やり直して終了できたときは、前の失敗の通知を残さない */}
      {notice && !(notice.tone === "error" && live.endedInfo && notice.at <= Date.parse(live.endedInfo.at)) && (
        <div className={`cd-toast${notice.tone === "error" ? " cd-toast-error" : ""}`} role={notice.tone === "error" ? "alert" : "status"} data-toast-tone={notice.tone}>
          <CIcon name={notice.tone === "error" ? "alert" : "check"} />
          {notice.message}
        </div>
      )}
    </div>
  )
}


/** 開発用: Figma の Concept D プロトタイプ（検証シナリオ・テスト状態・表示幅切り替え）。患者の体調記録は医療者画面と共有 */
export function ConceptDDev() {
  const s = useConceptDState()
  const [dMode, setDMode] = useState<DMode>("patient")
  const [dViewport, setDViewport] = useState<DViewport>("390")
  const [dClinicianViewport, setDClinicianViewport] =
    useState<ClinicianDViewport>("1180")
  return (
    <div className="app">
      <header className="prototype-bar">
        <div className="prototype-title">
          <Logo />
          <span>Concept D 開発用（検証シナリオ）</span>
        </div>
        <div className="view-switch" style={{ marginLeft: "auto" }}>
          <button
            className={dMode === "patient" ? "active" : ""}
            onClick={() => setDMode("patient")}
          >
            <Icon name="user" />
            患者
          </button>
          <button
            className={dMode === "clinician" ? "active" : ""}
            onClick={() => setDMode("clinician")}
          >
            <Icon name="grid" />
            医療者
          </button>
        </div>
        <div className="view-switch d-viewport-switch">
          {dMode === "patient"
            ? (["390", "430", "tablet"] as DViewport[]).map((viewport) => (
                <button
                  key={viewport}
                  className={dViewport === viewport ? "active" : ""}
                  onClick={() => setDViewport(viewport)}
                >
                  <Icon name={viewport === "tablet" ? "grid" : "user"} />
                  {viewport === "tablet" ? "タブレット" : `${viewport}px`}
                </button>
              ))
            : (["1180", "820"] as ClinicianDViewport[]).map((viewport) => (
                <button
                  key={viewport}
                  className={dClinicianViewport === viewport ? "active" : ""}
                  onClick={() => setDClinicianViewport(viewport)}
                >
                  <Icon name="grid" />
                  {viewport}px
                </button>
              ))}
        </div>
      </header>
      <div
        className={`prototype-stage ${
          dMode === "patient" ? "concept-d-stage" : "concept-d-clinician-stage"
        }`}
      >
        {dMode === "patient" ? (
          <DPrototype
            viewport={dViewport}
            notify={s.notify}
            healthRecords={s.healthRecords}
            setHealthRecords={s.setHealthRecords}
            activeSymptomIds={s.activeSymptomIds}
            setActiveSymptomIds={s.setActiveSymptomIds}
            customSymptomNames={s.customSymptomNames}
            setCustomSymptomNames={s.setCustomSymptomNames}
          />
        ) : (
          <ClinicianD
            viewport={dClinicianViewport}
            healthRecords={s.healthRecords}
            activeSymptomIds={s.activeSymptomIds}
            customSymptomNames={s.customSymptomNames}
          />
        )}
      </div>
      {s.toastNode}
    </div>
  )
}
