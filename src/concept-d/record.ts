"use client";

/**
 * Figma Concept D の医療者画面を、診察サマリー・情報処方の実 API に接続するフック（Phase 2 Step 2）。
 * 患者が承認した有効な一時共有（Step 1）の間だけ読み込む。終了・期限切れで API は 403 になり、表示も消す。
 * 画面（DOM・CSS）は Figma のまま。Figma の架空の質問・理解確認・領域別の表・教材一覧の代わりに、DB の値を同じ形で渡す。
 * 確認問題の点数で医学的な理解を断定しない（回答そのもの・誤答と「わからない」の別・回答日時と教材を示す）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import { SELECTION_LABEL } from "@/lib/labels";
import { areaOf, estimateMinutes, FIGMA_AREA, shortDate } from "./learning";
import { toFigma, type ApiRecord } from "./health";
import { thumbnailFor } from "./thumbnails";
import type { Recommendation } from "@/lib/recommend";

type Phase = "not_started" | "reading" | "quiz" | "completed";
export type SummaryApi = {
  patientName: string;
  consultationCount: number;
  previousConsultations: { id: string; orgName: string; startedAt: string }[];
  questions: {
    feedbackId: string;
    materialId: string;
    materialTitle: string;
    primaryDomain: string;
    selection: string;
    freeText: string | null;
    createdAt: string;
    status: "unread" | "reviewed" | "resolved";
  }[];
  /** Step 3: 診察ノートの質問（教材に紐づかないものを含む。新しい順） */
  visitNotes: { id: string; body: string; source: "free" | "quiz"; materialId: string | null; materialTitle: string | null; primaryDomain: string | null; resolvedAt?: string | null; createdAt: string; updatedAt: string }[];
  currentSet: null | { setId: string; createdAt: string; items: { materialId: string; title: string; prescribedAt: string }[] };
  learning: {
    materialId: string;
    versionId: string;
    title: string;
    primaryDomain: string;
    objective: string | null;
    slideCount: number;
    questionCount: number;
    phase: Phase;
    lastSlideSeq: number;
    prescribed: boolean;
    prescribedAt: string | null;
    prescribedOrgName: string | null;
    selfLearning: boolean;
    nWrong: number;
    nUnknown: number;
    completedAt: string | null;
  }[];
  answers: {
    attemptId: string;
    attemptCompleted: boolean;
    materialId: string;
    materialTitle: string;
    primaryDomain: string;
    questionId: string;
    stem: string;
    isUnknown: boolean;
    isCorrect: boolean;
    selectedText: string | null;
    correctText: string;
    explanation: string;
    answeredAt: string;
  }[];
};

export type MaterialApi = {
  materialId: string;
  versionId: string;
  title: string;
  summary: string | null;
  objectives: string[];
  primaryDomain: string;
  scope: "common" | "org";
  slideCount: number;
  questionCount: number;
};

const dateTime = (d: string) => {
  const x = new Date(d);
  return `${x.getMonth() + 1}月${x.getDate()}日 ${x.getHours()}:${String(x.getMinutes()).padStart(2, "0")}`;
};

const phaseLabel = (l: SummaryApi["learning"][number]) =>
  l.phase === "completed"
    ? `学習済み${l.completedAt ? ` · ${shortDate(l.completedAt)}` : ""}`
    : l.phase === "not_started"
      ? "未学習"
      : `学習途中 · ${l.lastSlideSeq} / ${l.slideCount}ページ`;

/** Figma の concerns と同じ形（質問・誤答・「わからない」） */
export type LiveConcern = {
  id: string;
  kind: "question" | "check";
  type: string;
  tone: "purple" | "red" | "amber" | "blue";
  title: string;
  area: string;
  detail: string;
  answer: string;
  source: string;
  correct?: string;
  explanation?: string;
  materialId: string | null;
  materialTitle: string | null;
  materialStatus: string;
  feedbackId?: string;
  status?: "unread" | "reviewed" | "resolved";
  /** 質問と同じ教材の誤答・「わからない」（関連する可能性がある項目として表示） */
  related?: { stem: string; answer: string } | null;
  /** 患者が「聞けた・解決した」と印を付けた質問（診察ノート） */
  resolved?: boolean;
  createdAt?: string;
};

export function toConcerns(s: SummaryApi) {
  const status = new Map(s.learning.map((l) => [l.materialId, phaseLabel(l)]));
  const checks: LiveConcern[] = s.answers
    .filter((a) => !a.isCorrect)
    .map((a) => ({
      id: `${a.attemptId}:${a.questionId}`,
      kind: "check",
      type: a.isUnknown ? "「わからない」" : "誤答",
      tone: a.isUnknown ? "red" : "amber",
      title: a.stem,
      area: areaOf(a.primaryDomain),
      detail: a.stem,
      answer: a.isUnknown ? "わからない" : (a.selectedText ?? ""),
      source: `${a.materialTitle} · ${dateTime(a.answeredAt)}回答`,
      correct: a.correctText,
      explanation: a.explanation,
      materialId: a.materialId,
      materialTitle: a.materialTitle,
      materialStatus: status.get(a.materialId) ?? "",
    }));
  // 診察ノートの質問（患者原文。教材から作った候補は教材を表示、自由な質問は教材なし）
  const notes: LiveConcern[] = s.visitNotes.map((n) => {
    const rel = n.materialId ? s.answers.find((a) => a.materialId === n.materialId && !a.isCorrect) : undefined;
    return {
      id: `note:${n.id}`,
      kind: "question",
      type: "患者の質問",
      tone: "purple",
      title: n.body,
      area: n.primaryDomain ? areaOf(n.primaryDomain) : "診察ノート",
      detail: n.body,
      answer: "患者記載の質問",
      source: `診察ノート · ${dateTime(n.updatedAt)}${n.updatedAt !== n.createdAt ? " 更新" : ""}`,
      materialId: n.materialId,
      materialTitle: n.materialTitle,
      materialStatus: n.materialId ? (status.get(n.materialId) ?? "") : "",
      related: rel ? { stem: rel.stem, answer: rel.isUnknown ? "わからない" : (rel.selectedText ?? "") } : null,
      resolved: !!n.resolvedAt,
      createdAt: n.createdAt,
    };
  });
  const feedback: LiveConcern[] = s.questions.map((q) => {
    const rel = s.answers.find((a) => a.materialId === q.materialId && !a.isCorrect);
    return {
      id: q.feedbackId,
      kind: "question",
      type: "患者の質問",
      tone: "purple",
      title: q.freeText ?? SELECTION_LABEL[q.selection] ?? q.selection,
      area: areaOf(q.primaryDomain),
      detail: q.freeText ?? `（自由記述なし）「${SELECTION_LABEL[q.selection] ?? q.selection}」を選択`,
      answer: "患者記載の質問",
      source: `${q.materialTitle} · ${dateTime(q.createdAt)}`,
      materialId: q.materialId,
      materialTitle: q.materialTitle,
      materialStatus: status.get(q.materialId) ?? "",
      feedbackId: q.feedbackId,
      status: q.status,
      related: rel ? { stem: rel.stem, answer: rel.isUnknown ? "わからない" : (rel.selectedText ?? "") } : null,
      resolved: q.status === "resolved",
      createdAt: q.createdAt,
    };
  });
  // 診察ノートの質問 → 学習後の質問（既存）の順に統合
  return { questions: [...notes, ...feedback], checks };
}

/** Figma の「領域別の学習・理解確認」と同じ形 [領域, 学習, 確認問題, 要確認, 学習済みの割合] */
export function toAreas(s: SummaryApi): [string, string, string, string, number, { unknown: number; incomplete: boolean }][] {
  return Object.entries(FIGMA_AREA).map(([domain, name]) => {
    const items = s.learning.filter((l) => l.primaryDomain === domain);
    const done = items.filter((l) => l.phase === "completed").length;
    const doing = items.filter((l) => l.phase === "reading" || l.phase === "quiz").length;
    const notStarted = items.filter((l) => l.phase === "not_started").length;
    const answers = s.answers.filter((a) => a.primaryDomain === domain);
    const correct = answers.filter((a) => a.isCorrect).length;
    const wrong = answers.filter((a) => !a.isCorrect && !a.isUnknown).length;
    const unknown = answers.filter((a) => a.isUnknown).length;
    const flag = wrong ? `誤答 ${wrong}` : unknown ? `不明 ${unknown}` : notStarted ? `未学習 ${notStarted}` : "なし";
    return [
      name,
      `${done} / ${items.length}${doing ? `・途中${doing}` : ""}`,
      answers.length ? `${correct} / ${answers.length}` : items.length ? "未回答" : "—",
      flag,
      items.length ? Math.round((done / items.length) * 100) : 0,
      { unknown, incomplete: doing + notStarted > 0 },
    ];
  });
}

/** Figma の libraryItems と同じ形 */
export type LiveLibraryItem = {
  id: string;
  title: string;
  area: string;
  time: number;
  target: string;
  goal: string;
  scope: string;
  /** この診察ですでに処方済み（同じ診察で重複処方しない） */
  prescribedNow: boolean;
  /** 以前の診察で処方済み（再処方できる） */
  prescribedBefore: boolean;
  thumbnail: { src: string; alt: string } | null;
};

export type ClinicianRecord = ReturnType<typeof useClinicianRecord>;

/** 外来間の構造化データ（Step 4-B）。表示に使う項目だけ */
export type SummaryItem = { section: "体調の変化" | "学習の状況" | "患者からの質問" | "時系列の経過"; text: string; sourceIds: string[] };
export type IntervisitApi = {
  intervisit: {
    period: { from: string; to: string; days: number; isDefault: boolean; label: string };
    previousShareAt: string | null;
    fmt: { from: string; to: string };
    vitals: {
      recordCount: number;
      recordDays: number;
      totalDays: number;
      missingDays: string[];
      metrics: Record<string, { label: string; unit: string; count: number; min: { at: string; value: number } | null; max: { at: string; value: number } | null; values: { at: string; value: number; sourceId: string }[] }>;
    };
    symptoms: { key: string; name: string; count: number; min: number; max: number; changed: boolean; newInPeriod: boolean; stoppedRecording: boolean; entries: { at: string; severity: number; sourceId: string }[] }[];
    learning: { versionId: string; title: string; versionNo: number; status: string; answersInPeriod: { sourceId: string; result: string; stem: string; at: string }[] }[];
    questions: {
      sourceId: string;
      kind: string;
      body: string;
      createdAt: string;
      materialTitle: string | null;
      /** 自由記述 / 患者が選んだ回答（選択のみ）。表示はこの値で区別する（body の文字列では判断しない） */
      input?: "free_text" | "selection";
      selection?: "have_question" | "explain_again" | null;
    }[];
    events: { id: string; kind: string; at: string; day: string; label: string }[];
  };
  ruleSummary: SummaryItem[];
  sources: Record<string, { label: string; at?: string }>;
};

/** Claude の外来間要約（Step 4-C）。status = fallback のときはルールベースの要約 */
export type AiSummaryApi = {
  status: "ai" | "fallback";
  generator: "claude" | "fake" | "mock" | "rule" | "replay";
  /** 記録済みの Claude 出力を再生した場合の生成日（撮影用デモ環境のみ） */
  replayOf?: string | null;
  model: string | null;
  items: SummaryItem[];
  rejected: { index: number; reason: string }[];
  fallbackReason: string | null;
  dataHash: string;
  generatedAt: string;
  cached: boolean;
  sources: Record<string, { label: string; at?: string }>;
};

/** 情報処方のリコメンド。GET /api/v1/consultations/:id/recommendations */
export type RecommendationApi = {
  generator: "claude" | "fake" | "mock" | "rule";
  model: string | null;
  items: (Recommendation & { aiReason?: string })[];
  note: string | null;
};

/** 処方テンプレート（セット）。GET /api/v1/consultations/:id/templates。教材はこの施設から見える公開中のものだけ */
export type TemplateApi = {
  id: string;
  name: string;
  description: string | null;
  scope: "common" | "org";
  materials: { id: string; title: string; primaryDomain: string }[];
};

import type { TreatmentEvent, TreatmentProfile } from "@/lib/treatment";
export type TreatmentApi = { profile: TreatmentProfile; events: TreatmentEvent[]; today: string };

type SymptomSettings = { active: string[]; hidden: string[]; customNames: Record<string, string> };

export function useClinicianRecord(sessionId: string | null, active: boolean, notify: (message: string) => void) {
  // 読み込んだ共有（セッション ID）と一緒に持ち、別の共有・共有終了後には使わない
  const [data, setData] = useState<{
    sid: string;
    summary: SummaryApi;
    materials: MaterialApi[];
    health: { records: ApiRecord[]; symptoms: SymptomSettings };
  } | null>(null);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const sid = active ? sessionId : null;
  // 今の共有（sid）。共有の終了中・終了後に返った応答（予期した 403 など）は、エラーとして通知しない
  const sidRef = useRef(sid);
  useEffect(() => {
    sidRef.current = sid;
  }, [sid]);
  const fail = useCallback((forSid: string | null, e: unknown) => {
    if (sidRef.current === forSid) notifyRef.current(errorText(e));
  }, []);

  const reload = useCallback(async () => {
    if (!sid) return;
    try {
      const [s, m, h] = await Promise.all([
        api<SummaryApi>(`/api/v1/consultations/${sid}/patient`),
        api<{ items: MaterialApi[] }>(`/api/v1/consultations/${sid}/materials`),
        api<{ records: ApiRecord[]; symptoms: SymptomSettings }>(`/api/v1/consultations/${sid}/health`),
      ]);
      setData({ sid, summary: s, materials: m.items, health: h });
    } catch (e) {
      fail(sid, e);
    }
  }, [sid, fail]);
  useEffect(() => {
    // 共有が始まったら読み込む。共有が終わったら（sid なし）画面に保持した患者情報を消す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!sid) setData(null);
    else void reload();
  }, [sid, reload]);

  const current = sid && data?.sid === sid ? data : null;

  /*
   * 医療者が選んだ観察期間（null は既定の直近 14 日）。診察サマリーと在宅経過表で共有し、共有が変わったら（終了・別の患者）消す。
   * 期間を素早く変えたときは、最後に選んだ共有・期間の要求だけが表示・読み込み中・エラーを更新する（遅れて返った古い応答は捨てる）。
   */
  const [periodState, setPeriodState] = useState<{ sid: string; period: { from: string; to: string } } | null>(null);
  const period = sid && periodState?.sid === sid ? periodState.period : null;
  const setPeriod = useCallback((p: { from: string; to: string } | null) => setPeriodState(p && sid ? { sid, period: p } : null), [sid]);
  // サーバーの既定期間の終了日（撮影用デモ環境ではデモの基準日、通常は今日）
  const [defaultTo, setDefaultTo] = useState<{ sid: string; to: string } | null>(null);

  // 外来間の構造化データ（期間ごと）
  const [iv, setIv] = useState<{ sid: string; key: string; data: IntervisitApi } | null>(null);
  const [ivLoading, setIvLoading] = useState(false);
  const ivLatest = useRef<string | null>(null);
  const loadIntervisit = useCallback(
    async (period?: { from: string; to: string } | null) => {
      if (!sid) return;
      const q = period ? `?from=${period.from}&to=${period.to}` : "";
      const req = `${sid}${q}`;
      ivLatest.current = req;
      setIvLoading(true);
      try {
        const d = await api<IntervisitApi>(`/api/v1/consultations/${sid}/intervisit${q}`);
        if (d.intervisit.period.isDefault) setDefaultTo({ sid, to: d.intervisit.period.to });
        if (ivLatest.current === req) setIv({ sid, key: q, data: d });
      } catch (e) {
        if (ivLatest.current === req) fail(sid, e);
      } finally {
        if (ivLatest.current === req) setIvLoading(false);
      }
    },
    [sid, fail],
  );
  // Claude の外来間要約（期間ごと。サーバー側で同じデータなら再利用）
  const [ai, setAi] = useState<{ sid: string; key: string; data: AiSummaryApi } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  // 同じ期間の要求が進行中なら新しく送らない（開発時の二重マウントなどで Claude を二重に呼ばない）
  const aiInflight = useRef<string | null>(null);
  // 最後に要求した共有・期間（遅れて返った古い期間の要約は表示しない）
  const aiLatest = useRef<string | null>(null);
  const loadAiSummary = useCallback(
    async (period: { from: string; to: string } | null, opts: { regenerate?: boolean } = {}) => {
      if (!sid) return;
      const key = period ? `?from=${period.from}&to=${period.to}` : "";
      const flightKey = `${sid}${key}${opts.regenerate ? "|re" : ""}`;
      aiLatest.current = `${sid}${key}`;
      if (aiInflight.current === flightKey) return;
      aiInflight.current = flightKey;
      // 開発用: URL の aisim=invalid|error で AI の失敗を再現（擬似生成のときだけサーバーが受け付ける）
      const sim = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aisim") : null;
      setAiLoading(true);
      try {
        const d = await api<AiSummaryApi>(`/api/v1/consultations/${sid}/intervisit/summary`, {
          json: { ...(period ?? {}), regenerate: !!opts.regenerate, ...(sim === "invalid" || sim === "error" ? { simulate: sim } : {}) },
        });
        if (aiLatest.current === `${sid}${key}`) setAi({ sid, key, data: d });
      } catch (e) {
        if (aiLatest.current === `${sid}${key}`) fail(sid, e);
      } finally {
        if (aiInflight.current === flightKey) aiInflight.current = null;
        if (aiLatest.current === `${sid}${key}`) setAiLoading(false);
      }
    },
    [sid, fail],
  );
  // 情報処方のリコメンド（ルールベース → Claude が使えるときは絞り込み）。共有ごとに 1 回読み、処方後に読み直す
  const [reco, setReco] = useState<{ sid: string; data: RecommendationApi } | null>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const loadRecommendations = useCallback(
    async (opts: { regenerate?: boolean } = {}) => {
      if (!sid) return;
      setRecoLoading(true);
      try {
        const d = await api<RecommendationApi>(`/api/v1/consultations/${sid}/recommendations${opts.regenerate ? "?regenerate=1" : ""}`);
        setReco({ sid, data: d });
      } catch (e) {
        fail(sid, e);
      } finally {
        setRecoLoading(false);
      }
    },
    [sid, fail],
  );
  // 治療の記録（患者が登録したがん種・現在の治療・外来の日の出来事）。読み取りのみ。共有が変わるたびに読み直す
  const [treat, setTreat] = useState<{ sid: string; data: TreatmentApi } | null>(null);
  const loadTreatment = useCallback(async () => {
    if (!sid) return;
    try {
      const d = await api<TreatmentApi>(`/api/v1/consultations/${sid}/treatment`);
      setTreat({ sid, data: d });
    } catch (e) {
      fail(sid, e);
    }
  }, [sid, fail]);
  useEffect(() => {
    // 共有が変わったら読み直す（別の共有の値は treatment の getter で sid を照合して出さない）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sid) void loadTreatment();
  }, [sid, loadTreatment]);
  // 処方テンプレート（セット）の読み取り（既存 API。読み取りのみ）
  const [tpl, setTpl] = useState<{ sid: string; items: TemplateApi[] } | null>(null);
  const loadTemplates = useCallback(async () => {
    if (!sid) return;
    try {
      const d = await api<{ templates: TemplateApi[] }>(`/api/v1/consultations/${sid}/templates`);
      setTpl({ sid, items: d.templates });
    } catch (e) {
      fail(sid, e);
    }
  }, [sid, fail]);
  // 施設のセットを作る（選択中の教材から）。成功したら一覧を差し替える
  const createTemplate = useCallback(
    async (name: string, materialIds: string[]) => {
      if (!sid) return false;
      try {
        const d = await api<{ id: string; templates: TemplateApi[] }>(`/api/v1/consultations/${sid}/templates`, { json: { name, materialIds } });
        setTpl({ sid, items: d.templates });
        return true;
      } catch (e) {
        fail(sid, e);
        return false;
      }
    },
    [sid, fail],
  );
  useEffect(() => {
    // 共有が終わったら外来間のデータ・要約も消す
    if (!sid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIv(null);
      setAi(null);
    }
  }, [sid]);
  const summary = current?.summary ?? null;
  const materials = current?.materials ?? null;
  const view = summary;
  const concerns = view ? toConcerns(view) : null;
  const nowIds = new Set(view?.currentSet?.items.map((i) => i.materialId) ?? []);
  const beforeIds = new Set(view?.learning.filter((l) => l.prescribed).map((l) => l.materialId) ?? []);
  const library: LiveLibraryItem[] | null =
    sid && materials
      ? materials.map((m) => ({
          id: m.materialId,
          title: m.title,
          area: areaOf(m.primaryDomain),
          time: estimateMinutes(m.slideCount, m.questionCount),
          // 教材に「対象者」の項目はないため未登録と表示（架空の対象者を出さない）
          target: "未登録",
          goal: m.objectives[0] ?? m.summary ?? "未登録",
          scope: m.scope === "org" ? "施設内教材" : "共通教材",
          prescribedNow: nowIds.has(m.materialId),
          prescribedBefore: !nowIds.has(m.materialId) && beforeIds.has(m.materialId),
          thumbnail: thumbnailFor(m.title),
        }))
      : null;

  /** 情報処方の確定。同じ診察で処方済みの教材は送らない（サーバーでも重複しない） */
  const prescribe = useCallback(
    async (materialIds: string[], note: string) => {
      if (!sid) return null;
      const ids = materialIds.filter((id) => !nowIds.has(id));
      if (ids.length === 0) {
        notifyRef.current("選択した教材は、この診察で処方済みです");
        return null;
      }
      try {
        await api(`/api/v1/consultations/${sid}/prescriptions`, { json: { materialIds: ids, ...(note.trim() ? { note: note.trim() } : {}) } });
        await reload();
        void loadRecommendations();
        return ids.length;
      } catch (e) {
        fail(sid, e);
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sid, reload, view, loadRecommendations],
  );

  /** 質問の確認状態（任意。診療記録ではない） */
  const setQuestionStatus = useCallback(
    async (questionId: string, status: "reviewed" | "resolved" | "unread") => {
      if (!sid) return false;
      try {
        if (questionId.startsWith("note:")) {
          // 診察ノートの質問: 医療者が診察で答えたら「解決」に（戻すこともできる）。原文は変えない
          await api(`/api/v1/consultations/${sid}/notes/${questionId.slice(5)}`, { json: { resolved: status === "resolved" } });
        } else {
          await api(`/api/v1/consultations/${sid}/questions/${questionId}`, { json: { status } });
        }
        void reload();
        return true;
      } catch (e) {
        fail(sid, e);
        return false;
      }
    },
    [sid, fail, reload],
  );

  return {
    loaded: !!view,
    sessionId: current?.sid ?? null,
    /** 外来間の構造化データとルールベースの要約（Step 4-B） */
    intervisit: sid && iv?.sid === sid ? iv.data : null,
    /** 表示中の構造化データの期間（クエリ。既定は ""）。選んだ期間と違えば読み込み中として扱う */
    intervisitKey: sid && iv?.sid === sid ? iv.key : null,
    intervisitLoading: ivLoading,
    /** 医療者が選んだ観察期間（サマリーと在宅経過表で共有。null は既定の直近 14 日） */
    period,
    setPeriod,
    /** サーバーの既定期間の終了日 */
    defaultTo: sid && defaultTo?.sid === sid ? defaultTo.to : null,
    loadIntervisit,
    /** Claude の外来間要約（Step 4-C） */
    aiSummary: sid && ai?.sid === sid ? ai : null,
    aiLoading,
    loadAiSummary,
    /** 在宅経過表（Step 4）: 患者の体調記録（Figma の HealthRecord と同じ形）と症状の表示設定 */
    healthRecords: current ? current.health.records.map(toFigma) : [],
    symptomSettings: current?.health.symptoms ?? { active: [], hidden: [], customNames: {} },
    summary: view,
    questions: concerns?.questions ?? [],
    checks: concerns?.checks ?? [],
    areas: view ? toAreas(view) : [],
    library,
    /** 情報処方のリコメンド（未読み込みは null） */
    recommendations: sid && reco?.sid === sid ? reco.data : null,
    recommendationsLoading: recoLoading,
    loadRecommendations,
    /** 処方テンプレート（セット）。未読み込みは null */
    templates: sid && tpl?.sid === sid ? tpl.items : null,
    treatment: sid && treat?.sid === sid ? treat.data : null,
    createTemplate,
    loadTemplates,
    reload,
    prescribe,
    setQuestionStatus,
  };
}
