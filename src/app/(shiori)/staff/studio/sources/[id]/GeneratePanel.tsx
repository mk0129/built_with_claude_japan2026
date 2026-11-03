"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/api";
import { DOMAIN_LABEL, MUST_COVER_KIND_LABEL, MUST_COVER_STATUS_LABEL } from "@/lib/labels";
import { GeneratorBadge } from "../../GeneratorBadge";
import { Icon } from "@/components/reset/Icons";
import { Stepper } from "../../Stepper";
import { JOB_MODE_LABEL, modelLabel } from "../../shared";

export type OutlineView = { title: string; primaryDomain?: string; targetReader: string; learningObjectives: string[]; slideTitles: string[]; rationale: string };
export type CandidateView = { text: string; kind: string; sourceRef: { sourceId: string; section?: string; quote?: string } };
export type JobView = {
  id: string;
  mode: string;
  status: string;
  progress: string | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: string;
  model: string;
  generator: string;
  errorCode: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  outputVersionId: string | null;
  outlines: OutlineView[];
  mustCoverCandidates: CandidateView[];
  notCovered: string[];
  warnings: string[];
};
type MustCoverDraft = { id: string; text: string; kind: string; sourceRef: { sourceId: string; section?: string; quote?: string }; status: "required" | "other_material" | "needs_review" };
type Step3 = { from: { fromJobId: string; outlineIndex: number } | { theme: string; audience?: string; objectives: string[] }; title: string; items: MustCoverDraft[] };

const STATUS: Record<string, string> = { queued: "待機中", running: "作成中", succeeded: "完了", failed: "失敗" };
const KINDS = ["emergency", "visit", "prohibition", "caution", "fact"] as const;
const SAFETY = new Set<string>(["emergency", "visit", "prohibition"]);
const isActive = (j: JobView | null | undefined) => !!j && (j.status === "queued" || j.status === "running");
const newId = () => `mc-${Math.random().toString(36).slice(2, 10)}`;

/**
 * 原資料から Claude に下書きを作らせるパネル（6 ステップのうち 2〜4）。
 * 情報階層: 1) 作り方を選ぶ → 2) 最新の結果（進行中・構成案・下書き）を操作の直下に大きく表示 → 3) 過去の作成履歴は折りたたみ。
 * 構成案を選ぶ（または C でテーマを指定する）と、生成の前に「必須事項の確認」（ステップ 3）を挟む。
 */
export function GeneratePanel({ sourceId, orgId, canGenerate, aiConfigured, jobs }: { sourceId: string; orgId: string; canGenerate: boolean; aiConfigured: boolean; jobs: JobView[] }) {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [audience, setAudience] = useState("");
  const [objectives, setObjectives] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [step3, setStep3] = useState<Step3 | null>(null);
  const [picked, setPicked] = useState<number>(0);
  const resultRef = useRef<HTMLDivElement>(null);

  async function post(path: string, json: unknown, mode?: string) {
    setBusy(true);
    setMsg(null);
    if (mode) setPendingMode(mode);
    try {
      await api(path, { json, headers: { "idempotency-key": crypto.randomUUID() } });
      setStep3(null);
      router.refresh();
    } catch (e) {
      setMsg(errorText(e));
      setPendingMode(null);
    } finally {
      setBusy(false);
    }
  }
  const create = (body: { mode: string; [k: string]: unknown }) => post(`/api/v1/studio/jobs?orgId=${orgId}`, body, body.mode);

  const latest = jobs[0] ?? null;
  const latestOutline = jobs.find((j) => j.mode === "outline" && j.status === "succeeded" && j.outlines.length > 0) ?? null;
  const active = isActive(latest) ? latest : null;
  const showPending = pendingMode !== null && !active;

  // 新しいジョブの開始・完了で結果領域へスクロール（初回描画では動かさない）
  const key = `${latest?.id ?? ""}:${latest?.status ?? ""}`;
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevKey.current === null) {
      prevKey.current = key;
      return;
    }
    if (prevKey.current !== key) {
      prevKey.current = key;
      setPendingMode(null);
      if (latest) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [key, latest]);
  useEffect(() => {
    if (step3) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step3]);

  /**
   * 候補の初期分類。実 API 検証（2026-11-03 run 2）で、全候補を「この教材で必須」にすると案の範囲外の章が
   * 本文に押し込まれ 1 画面 1 主題（GEN-02）が崩れたため、案の根拠に含まれる章（sourceRef.section）の候補だけを
   * 「この教材で必須」、範囲外は「別教材で扱う」を初期値にする。安全上の種別（緊急連絡・受診・禁止）は範囲外でも
   * 「医療者の確認が必要」にして、承認前に判断を求める。章情報が無い候補は「この教材で必須」のまま（医療者が変更する）。
   */
  const candidatesToDraft = (c: CandidateView[], scope?: { text: string }): MustCoverDraft[] =>
    c.map((x) => {
      const kind = (KINDS as readonly string[]).includes(x.kind) ? x.kind : "caution";
      const section = (x.sourceRef.section ?? "").trim();
      let status: MustCoverDraft["status"] = "required";
      if (scope && section) {
        const inScope = scope.text.includes(section) || scope.text.includes(section.replace(/^[0-9０-９]+[.．、]\s*/, ""));
        if (!inScope) status = SAFETY.has(kind) ? "needs_review" : "other_material";
      }
      return { id: newId(), text: x.text, kind, sourceRef: x.sourceRef, status };
    });
  const openStep3FromOutline = (j: JobView, i: number) => {
    const o = j.outlines[i];
    setStep3({ from: { fromJobId: j.id, outlineIndex: i }, title: o.title, items: candidatesToDraft(j.mustCoverCandidates, { text: [o.rationale, ...o.slideTitles, ...o.learningObjectives].join("\n") }) });
  };
  const openStep3Freeform = () =>
    setStep3({
      from: { theme, audience: audience || undefined, objectives: objectives.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3) },
      title: theme,
      // テーマ指定では範囲を章で判定できないため、安全上の種別だけ「この教材で必須」、それ以外は「別教材で扱う」を初期値にする
      items: candidatesToDraft(latestOutline?.mustCoverCandidates ?? []).map((i) => ({ ...i, status: SAFETY.has(i.kind) ? "required" : "other_material" })),
    });
  const generate = (s: Step3) => {
    const mustCover = s.items.filter((i) => i.text.trim()).map((i) => ({ id: i.id, text: i.text.trim(), kind: i.kind, sourceRef: i.sourceRef, status: i.status }));
    if ("fromJobId" in s.from) create({ mode: "generate", sourceIds: [sourceId], fromJobId: s.from.fromJobId, outlineIndex: s.from.outlineIndex, mustCover });
    else create({ mode: "freeform", sourceIds: [sourceId], theme: s.from.theme, audience: s.from.audience, objectives: s.from.objectives, mustCover });
  };

  // ステッパーの現在位置
  const currentStep = step3 ? 3 : active || showPending ? ((active?.mode ?? pendingMode) === "outline" ? 2 : 4) : latest?.status === "succeeded" && latest.mode !== "outline" ? 5 : 2;
  const historyJobs = jobs.filter((j) => j.id !== latest?.id);
  const hasResult = !!step3 || !!active || showPending || !!latest;
  /** 最新の結果 / ステップ 3。結果があるときはステッパー直下に出す（参照: 構成案が主役） */
  const resultBlock = (
    <div ref={resultRef} className="scroll-mt-4 space-y-4" data-testid="generation-result" aria-live="polite">
        {step3 && <MustCoverStep step={step3} onChange={setStep3} onCancel={() => setStep3(null)} onGenerate={() => generate(step3)} busy={busy || !!active} canGenerate={canGenerate} />}
        {(active || showPending) && <ProgressCard job={active} mode={active?.mode ?? pendingMode ?? "outline"} />}
        {latest && latest.status === "failed" && (
          <div className="rsd-card space-y-2" style={{ borderColor: "var(--danger)" }} role="alert">
            <p className="font-bold text-danger">作成に失敗しました（{JOB_MODE_LABEL[latest.mode] ?? latest.mode}）</p>
            <p className="text-sm text-danger">
              {latest.errorMessage}
              {latest.errorCode ? `（${latest.errorCode}）` : ""}
            </p>
            <button className="btn min-h-11 text-sm" disabled={busy} onClick={() => post(`/api/v1/studio/jobs/${latest.id}/retry`, {}, latest.mode)}>
              再試行する
            </button>
          </div>
        )}
        {!step3 && latest && latest.status === "succeeded" && latest.mode === "outline" && <OutlineResult job={latest} busy={busy || !!active} canGenerate={canGenerate} picked={picked} onPick={setPicked} onNext={() => openStep3FromOutline(latest, picked)} />}
        {!step3 && latest && latest.status === "succeeded" && latest.mode !== "outline" && (
          <DraftReady job={latest}>
            {latestOutline && (
              <details className="text-sm">
                <summary className="cursor-pointer min-h-11 flex items-center text-ink-soft">別の構成案から作る（前回の提案 {latestOutline.outlines.length} 案）</summary>
                <div className="mt-2">
                  <OutlineResult job={latestOutline} busy={busy || !!active} canGenerate={canGenerate} compact picked={picked} onPick={setPicked} onNext={() => openStep3FromOutline(latestOutline, picked)} />
                </div>
              </details>
            )}
          </DraftReady>
        )}
    </div>
  );

  return (
    <section className="space-y-4">
      <Stepper current={currentStep} done={[1]} />
      {!aiConfigured && <p className="rounded-xl bg-suna text-[#8a5a0a] text-sm px-4 py-3">Claude API が未設定のため、AI 下書きは作成できません（ANTHROPIC_API_KEY）。</p>}
      {hasResult && resultBlock}
      <details className={hasResult ? "rsd-card" : "contents"} open={!hasResult}>
        {hasResult && <summary className="cursor-pointer min-h-11 flex items-center font-bold">別の方法で作る・もう一度提案してもらう</summary>}
      <div className="grid lg:grid-cols-2 gap-4 items-start" style={hasResult ? { marginTop: 12 } : undefined}>
        <div className="rsd-card space-y-3 min-w-0">
          <h3 className="font-bold" style={{ fontSize: 16 }}>Claude に構成案を提案してもらう</h3>
          <p className="text-sm text-ink-soft">原資料の章立てから 1〜3 案の教材構成と、必須事項の候補を提案します。案を選ぶと、必須事項を確認してから 3〜5 画面と確認問題の下書きを作ります。</p>
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy || !!active} onClick={() => create({ mode: "outline", sourceIds: [sourceId] })}>
            構成案を作る
          </button>
          <p className="text-xs text-ink-soft">通常 15〜20 秒ほど。結果はこの下に表示されます。</p>
        </div>
        <form
          className="rsd-card space-y-3 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            openStep3Freeform();
          }}
        >
          <h3 className="font-bold" style={{ fontSize: 16 }}>テーマと学習目標を指定して作る</h3>
          <label className="block text-sm font-bold">
            テーマ
            <input className="input min-h-11 mt-1" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={200} required placeholder="例: ホルモン療法を自己判断でやめないために" />
          </label>
          <label className="block text-sm font-bold">
            対象（任意）
            <input className="input min-h-11 mt-1" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="例: 術後ホルモン療法を始める方" />
          </label>
          <label className="block text-sm font-bold">
            学習目標（1 行に 1 つ、3 つまで）
            <textarea className="input mt-1" rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </label>
          <button className="btn btn-primary min-h-11 w-full" disabled={!canGenerate || busy || !!active || !theme.trim()}>
            この内容で下書きを作る
          </button>
          <p className="text-xs text-ink-soft">次に必須事項を確認してから生成します。</p>
        </form>
      </div>
      <p className="rsd-muted">原資料に書かれていない医学情報は追加しない指示で生成します。生成物は下書きで、医療者が確認・承認するまで患者さんには届きません。</p>
      </details>
      {msg && <p className="text-sm text-danger">{msg}</p>}
      {!hasResult && resultBlock}

      {historyJobs.length > 0 && (
        <details className="rsd-card">
          <summary className="cursor-pointer min-h-11 flex items-center font-bold">これまでの作成履歴（{historyJobs.length}）</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {historyJobs.map((j) => (
              <li key={j.id} className="py-2 space-y-1" aria-label={`履歴 ${JOB_MODE_LABEL[j.mode] ?? j.mode}`}>
                <p className="flex flex-wrap gap-x-3 gap-y-1 items-center">
                  <span className="pill">{STATUS[j.status] ?? j.status}</span>
                  <GeneratorBadge generator={j.generator} />
                  <b>{JOB_MODE_LABEL[j.mode] ?? j.mode}</b>
                  <JobMeta job={j} />
                </p>
                {j.status === "failed" && <p className="text-xs text-danger">{j.errorMessage}</p>}
                {j.outlines.length > 0 && <p className="text-xs text-ink-soft">構成案: {j.outlines.map((o, i) => `案 ${i + 1} ${o.title}`).join(" ／ ")}</p>}
                {j.outputVersionId && (
                  <Link href={`/staff/studio/materials/${j.outputVersionId}`} className="tap-link underline">
                    この下書きを開く
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function JobMeta({ job: j }: { job: JobView }) {
  const model = modelLabel(j.generator, j.model);
  return (
    <span className="text-ink-muted">
      {j.createdAt}
      {model ? ` ・ ${model}` : ""}
      {j.attempt > 1 ? ` ・ ${j.attempt} 回目` : ""}
      {j.durationMs != null ? ` ・ ${(j.durationMs / 1000).toFixed(1)} 秒` : ""}
      {j.inputTokens != null && j.generator === "claude" ? ` ・ 入力 ${j.inputTokens.toLocaleString()} / 出力 ${(j.outputTokens ?? 0).toLocaleString()} トークン` : ""}
    </span>
  );
}

function ProgressCard({ job, mode }: { job: JobView | null; mode: string }) {
  const outline = mode === "outline";
  return (
    <div className="rsd-card space-y-2" role="status" aria-label="作成中">
      <p className="font-bold text-lg">{outline ? "Claude が構成案を考えています…" : "Claude が教材の下書きを作っています…"}</p>
      <p className="text-sm text-ink-soft">{job?.progress ?? "送信しました"} ・ 通常 {outline ? "15〜20 秒" : "20〜40 秒"}ほどかかります。この画面を開いたままお待ちください。</p>
      {job?.status === "queued" && job.errorMessage && <p className="text-xs text-[#8a5a0a]">前回の失敗: {job.errorMessage}（自動で再試行します）</p>}
      <div className="h-2 rounded-full bg-line overflow-hidden">
        <div className="h-full w-1/3 bg-accent animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Claude の構成案（参照 .outlinegrid / .outline）。タイトル・対象者・学習目標・選択ボタンを優先し、
 * 画面構成と根拠は展開式。カードを選んでから「この構成で次へ」で必須事項の確認へ進む。「おすすめ」は付けない。
 */
function OutlineResult({ job, busy, canGenerate, picked, onPick, onNext, compact = false }: { job: JobView; busy: boolean; canGenerate: boolean; picked: number; onPick: (i: number) => void; onNext: () => void; compact?: boolean }) {
  const n = job.outlines.length;
  const sel = Math.min(picked, n - 1);
  return (
    <section className={compact ? "space-y-3" : "space-y-3"} aria-label="Claude の構成案">
      {!compact && (
        <div className="rsd-row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h2 className="font-bold" style={{ fontSize: 22, letterSpacing: "-0.045em", margin: "0 0 5px" }}>
              Claudeから{n}つの構成案が届きました
            </h2>
            <div className="rsd-desc">学習目標を比べて、患者に届けたいテーマを選択してください。</div>
          </div>
          <div className="rsd-row">
            <GeneratorBadge generator={job.generator} />
            <span className="rsd-muted">編集・再生成は選択後に可能</span>
          </div>
        </div>
      )}
      <ol className="rsd-outlinegrid">
        {job.outlines.map((o, i) => {
          const active = i === sel;
          return (
            <li key={i} className={`rsd-outline ${active ? "active" : ""}`} aria-label={`案 ${i + 1}`}>
              <div className="rsd-row" style={{ justifyContent: "space-between" }}>
                <span className="index">{String(i + 1).padStart(2, "0")}</span>
                <span className="rsd-tag">{o.slideTitles.length}画面 ・ 約{Math.max(2, Math.round(o.slideTitles.length * 1.2 + 2))}分</span>
              </div>
              <h3>{o.title}</h3>
              {/* 初期表示: 対象者は 1 行に省略（全文は「詳細を開く」に。データは省略・削除しない） */}
              <div className="target" title={o.targetReader}>
                <Icon name="person" size="sm" />
                <span className="rsd-clamp1">{o.targetReader}</span>
              </div>
              <div className="font-bold" style={{ fontSize: 13, margin: "2px 0 3px" }}>
                この教材で学ぶこと
              </div>
              {o.learningObjectives.slice(0, 3).map((g) => (
                <div key={g} className="rsd-goal">
                  <Icon name="checkcircle" size="sm" /> <span className="rsd-clamp2">{g}</span>
                </div>
              ))}
              {o.learningObjectives.length > 3 && <div className="rsd-muted">ほか {o.learningObjectives.length - 3} 件（詳細を開く）</div>}
              <details>
                <summary>詳細を開く</summary>
                <p className="font-bold" style={{ margin: "6px 0 2px" }}>対象者</p>
                <p>
                  {o.targetReader}
                  {o.primaryDomain ? ` ・ 領域: ${DOMAIN_LABEL[o.primaryDomain] ?? o.primaryDomain}` : ""}
                </p>
                {o.learningObjectives.length > 3 && (
                  <>
                    <p className="font-bold" style={{ margin: "6px 0 2px" }}>学習目標（{o.learningObjectives.length}）</p>
                    <ul className="list-disc pl-5">
                      {o.learningObjectives.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="font-bold" style={{ margin: "6px 0 2px" }}>画面構成（{o.slideTitles.length}）</p>
                <ol className="list-decimal pl-5">
                  {o.slideTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <p className="font-bold" style={{ margin: "8px 0 2px" }}>根拠（原資料のどこに基づくか）</p>
                <p>{o.rationale}</p>
              </details>
              <div className="action">
                <button className={`btn ${active ? "btn-primary" : ""}`} disabled={!canGenerate || busy} aria-pressed={active} onClick={() => onPick(i)}>
                  {active ? (
                    <>
                      <Icon name="check" size="sm" /> 選択中
                    </>
                  ) : (
                    "この案を選ぶ"
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="rsd-row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <div className="rsd-muted">※ 患者向けに公開する前に、必須事項の確認と医療者の承認が必要です。{job.mustCoverCandidates.length > 0 ? `必須事項の候補 ${job.mustCoverCandidates.length} 件を抽出済み。` : ""}</div>
        <button className="btn btn-primary" disabled={!canGenerate || busy} onClick={onNext}>
          この構成で次へ <Icon name="arrow" size="sm" />
        </button>
      </div>
      {job.notCovered.length > 0 && <p className="rsd-muted">原資料に記載がなく扱わない内容: {job.notCovered.join("、")}</p>}
      {job.warnings.map((w) => (
        <p key={w} className="text-xs text-[#8a5a0a]">⚠ {w}</p>
      ))}
    </section>
  );
}

/** ステップ 3: 必須事項の確認。Claude の候補を医療者が「この教材で必須 / 別教材で扱う / 医療者の確認が必要」に分類し、文を修正・追加する */
function MustCoverStep({ step, onChange, onCancel, onGenerate, busy, canGenerate }: { step: Step3; onChange: (s: Step3) => void; onCancel: () => void; onGenerate: () => void; busy: boolean; canGenerate: boolean }) {
  const [newText, setNewText] = useState("");
  const [newKind, setNewKind] = useState<string>("visit");
  const [newQuote, setNewQuote] = useState("");
  const setItem = (id: string, patch: Partial<MustCoverDraft>) => onChange({ ...step, items: step.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const required = step.items.filter((i) => i.status === "required" && i.text.trim()).length;
  const needsReview = step.items.filter((i) => i.status === "needs_review").length;
  return (
    <section className="rsd-card space-y-3" aria-label="必須事項の確認">
      <header className="space-y-1">
        <p className="pill bg-wakakusa text-ink font-bold">ステップ 3: 必須事項を確認</p>
        <h3 className="font-bold text-xl">{step.title}</h3>
        <p className="text-sm text-ink-soft">
          Claude が原資料から抽出した「患者さんの行動に関わる事項」の候補です。<b>医療者が分類・修正してください。</b>「この教材で必須」にした項目は生成時に必ず含めるよう指示し、生成後に本文との対応を表示します。
          分類に迷う項目は「医療者の確認が必要」にしておくと、承認前に確認を求めます。
          初期値は、この案の範囲（根拠の章）に入る候補を「この教材で必須」、範囲外を「別教材で扱う」（安全上の事項は「医療者の確認が必要」）にしています。
        </p>
      </header>
      {step.items.length === 0 && <p className="text-sm text-ink-muted">候補はありません。必要な項目を下から追加するか、そのまま生成に進めます。</p>}
      <ul className="space-y-2">
        {step.items.map((i, idx) => (
          <li key={i.id} className="rounded-xl border border-line p-3 space-y-2" aria-label={`必須事項 ${idx + 1}`}>
            <div className="flex flex-wrap gap-2 items-center">
              <select className="input min-h-11 w-auto text-sm" value={i.kind} onChange={(e) => setItem(i.id, { kind: e.target.value })} aria-label={`必須事項 ${idx + 1} の種別`}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MUST_COVER_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost min-h-11 text-xs ml-auto" onClick={() => onChange({ ...step, items: step.items.filter((x) => x.id !== i.id) })}>
                候補から外す
              </button>
            </div>
            <input className="input min-h-11" value={i.text} onChange={(e) => setItem(i.id, { text: e.target.value })} maxLength={300} aria-label={`必須事項 ${idx + 1} の文`} />
            {i.sourceRef.quote && <p className="text-xs text-ink-soft">原資料: 「{i.sourceRef.quote}」</p>}
            <div role="radiogroup" aria-label={`必須事項 ${idx + 1} の分類`} className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {(["required", "other_material", "needs_review"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={i.status === s} className={`btn min-h-11 text-sm px-2 ${i.status === s ? (s === "required" ? "btn-primary" : "btn-soft") : ""}`} onClick={() => setItem(i.id, { status: s })}>
                  {MUST_COVER_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer min-h-11 flex items-center font-bold">必須事項を追加する</summary>
        <div className="mt-2 space-y-2">
          <input className="input min-h-11" placeholder="患者向けの 1 文（例: 片足の急な腫れや息苦しさがあれば、次の診察を待たずに連絡する）" value={newText} onChange={(e) => setNewText(e.target.value)} maxLength={300} aria-label="追加する必須事項の文" />
          <div className="flex flex-wrap gap-2">
            <select className="input min-h-11 w-auto text-sm" value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="追加する必須事項の種別">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {MUST_COVER_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input className="input min-h-11 flex-1 min-w-[12rem]" placeholder="原資料の該当文（そのまま貼り付け。照合に使います）" value={newQuote} onChange={(e) => setNewQuote(e.target.value)} maxLength={300} aria-label="追加する必須事項の原資料引用" />
            <button
              type="button"
              className="btn min-h-11 text-sm"
              disabled={!newText.trim()}
              onClick={() => {
                onChange({ ...step, items: [...step.items, { id: newId(), text: newText.trim(), kind: newKind, sourceRef: { sourceId: step.items[0]?.sourceRef.sourceId ?? "", quote: newQuote.trim() || undefined }, status: "required" }] });
                setNewText("");
                setNewQuote("");
              }}
            >
              追加
            </button>
          </div>
        </div>
      </details>
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn btn-primary min-h-11" disabled={!canGenerate || busy} onClick={onGenerate}>
          必須事項 {required} 件を含めて教材・クイズを生成する
        </button>
        <button className="btn btn-ghost min-h-11" disabled={busy} onClick={onCancel}>
          戻る
        </button>
        <span className="text-xs text-ink-soft">{needsReview > 0 ? `医療者の確認が必要: ${needsReview} 件（承認前に確認を求めます）・` : ""}通常 20〜40 秒</span>
      </div>
    </section>
  );
}

function DraftReady({ job, children }: { job: JobView; children?: React.ReactNode }) {
  return (
    <section className="rsd-card space-y-3" aria-label="下書きができました">
      <p className="flex flex-wrap items-center gap-2">
        <span className="pill bg-wakakusa text-ink font-bold">下書きができました</span>
        <GeneratorBadge generator={job.generator} />
        <span className="text-ink-soft text-sm">{JOB_MODE_LABEL[job.mode] ?? job.mode}</span>
        <JobMeta job={job} />
      </p>
      <p className="text-sm text-ink-soft">
        <b>次のステップ:</b> 患者画面で確認し（ステップ 5）、各画面と確認問題を原資料と見比べて保存・承認依頼を行います（ステップ 6）。必須事項と本文の対応は編集画面の上部に表示されます。
      </p>
      {job.outputVersionId && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/staff/materials/${job.outputVersionId}/preview`} className="btn min-h-11 inline-flex items-center justify-center">
            患者画面で確認する
          </Link>
          <Link href={`/staff/studio/materials/${job.outputVersionId}`} className="btn btn-primary min-h-11 inline-flex items-center justify-center">
            下書きを確認・編集する →
          </Link>
        </div>
      )}
      {job.notCovered.length > 0 && <p className="text-xs text-ink-soft">原資料に記載がなく扱わなかった内容: {job.notCovered.join("、")}</p>}
      {job.warnings.map((w) => (
        <p key={w} className="text-xs text-[#8a5a0a]">⚠ {w}</p>
      ))}
      {children}
    </section>
  );
}
