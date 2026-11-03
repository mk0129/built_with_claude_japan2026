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

/** 患者: 700px 以下はスマートフォン表示（Figma の 390/430 は幅以外同一）、それより広い画面はタブレット表示 */
export function PatientDApp({ initial = {}, userName }: { initial?: UrlInit; userName?: string }) {
  const s = useConceptDState()
  const tablet = useMedia("(min-width: 701px)", false)
  const connect = typeof initial.connect === "string" ? initial.connect : null
  const live = usePatientLive(connect, s.notify)
  const learning = usePatientLearning(s.notify)
  return (
    <UrlInitContext.Provider value={initial}>
    <div className="d-app-stage">
      <ProtoFlag long="体調記録・診察ノートは架空データ（未接続）" short="体調・ノートは架空" />
      <DPrototype
        variant="app"
        live={live}
        learning={learning}
        userName={userName}
        viewport={tablet ? "tablet" : "390"}
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
export function ClinicianDApp({ sessionId = null, orgs = [] }: { sessionId?: string | null; orgs?: ClinicianOrg[] }) {
  const s = useConceptDState()
  const wide = useMedia("(min-width: 1180px)", true)
  // 一時共有の通知は Figma の医療者用トースト（.cd-toast）で出す
  const [notice, setNotice] = useState("")
  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(""), 2600)
  }
  const live = useClinicianLive(sessionId, orgs, showNotice)
  // 患者が承認した有効な一時共有の間だけ、診察サマリーと処方の実データを読む（Step 2）
  const record = useClinicianRecord(live.sessionId, live.state === "active", showNotice)
  return (
    <div className="cd-app-stage">
      <ProtoFlag long="在宅経過・教材スタジオは架空データ（未接続）" short="在宅経過・スタジオは架空" />
      <ClinicianD
        variant="app"
        live={live}
        record={record}
        viewport={wide ? "1180" : "820"}
        healthRecords={s.healthRecords}
        activeSymptomIds={s.activeSymptomIds}
        customSymptomNames={s.customSymptomNames}
      />
      {notice && (
        <div className="cd-toast">
          <CIcon name="check" />
          {notice}
        </div>
      )}
    </div>
  )
}

/** 実データ未接続の範囲の明示（Phase 2 の各 Step で API に接続するまで表示する） */
function ProtoFlag({ long, short }: { long: string; short: string }) {
  return (
    <div className="proto-flag" role="note" data-proto-flag>
      <span className="long">{long}</span>
      <span className="short">{short}</span>
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
