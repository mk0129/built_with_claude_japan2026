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
  visitNotes: { id: string; body: string; source: "free" | "quiz"; materialId: string | null; materialTitle: string | null; primaryDomain: string | null; createdAt: string; updatedAt: string }[];
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
};

export type ClinicianRecord = ReturnType<typeof useClinicianRecord>;

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
      notifyRef.current(errorText(e));
    }
  }, [sid]);
  useEffect(() => {
    // 共有が始まったら読み込む。共有が終わったら（sid なし）画面に保持した患者情報を消す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!sid) setData(null);
    else void reload();
  }, [sid, reload]);

  const current = sid && data?.sid === sid ? data : null;
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
        return ids.length;
      } catch (e) {
        notifyRef.current(errorText(e));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sid, reload, view],
  );

  /** 質問の確認状態（任意。診療記録ではない） */
  const setQuestionStatus = useCallback(
    async (feedbackId: string, status: "reviewed" | "resolved") => {
      if (!sid) return false;
      try {
        await api(`/api/v1/consultations/${sid}/questions/${feedbackId}`, { json: { status } });
        void reload();
        return true;
      } catch (e) {
        notifyRef.current(errorText(e));
        return false;
      }
    },
    [sid, reload],
  );

  return {
    loaded: !!view,
    sessionId: current?.sid ?? null,
    /** 在宅経過表（Step 4）: 患者の体調記録（Figma の HealthRecord と同じ形）と症状の表示設定 */
    healthRecords: current ? current.health.records.map(toFigma) : [],
    symptomSettings: current?.health.symptoms ?? { active: [], hidden: [], customNames: {} },
    summary: view,
    questions: concerns?.questions ?? [],
    checks: concerns?.checks ?? [],
    areas: view ? toAreas(view) : [],
    library,
    reload,
    prescribe,
    setQuestionStatus,
  };
}
