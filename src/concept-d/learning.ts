"use client";

/**
 * Figma Concept D の患者画面を、情報処方・学習・理解確認の実 API に接続するフック（Phase 2 Step 2）。
 * 画面（DOM・CSS）は Figma のまま。Figma の架空の教材一覧（dLessons）・学習画面・クイズの代わりに、DB の値を同じ形で渡す。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import { thumbnailFor } from "./thumbnails";

/** DB の学習領域 → Figma の学習領域名（表示名だけの対応。並びは Figma のまま） */
export const FIGMA_AREA: Record<string, string> = {
  diagnosis_staging: "検査・診断",
  surgery: "手術",
  drug_therapy: "薬物療法",
  radiation: "放射線療法",
  side_effects_daily_life: "副作用・支持療法",
  mental_care_support: "日常生活・相談支援",
};
export const areaOf = (domain: string) => FIGMA_AREA[domain] ?? domain;

/** 所要時間の目安（教材に所要時間の項目がないため、ページ数と設問数から算出。1 ページ約 1.5 分・1 問約 0.5 分） */
export const estimateMinutes = (slideCount: number, questionCount: number) => Math.max(1, Math.round(slideCount * 1.5 + questionCount * 0.5));

export const shortDate = (d: string | Date) => {
  const x = new Date(d);
  return `${x.getMonth() + 1}月${x.getDate()}日`;
};

export type LibraryApiItem = {
  materialId: string;
  versionId: string;
  title: string;
  summary: string | null;
  primaryDomain: string;
  scope: "common" | "org";
  slideCount: number;
  questionCount: number;
  prescribed: null | { setId: string; createdAt: string; orgName: string; clinicianName: string; latest: boolean; note: string | null };
  selfLearning: boolean;
  phase: "not_started" | "reading" | "quiz" | "completed";
  lastSlideSeq: number;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  completedAt: string | null;
  objective: string | null;
};

/** 最新の処方に含まれる情報処方テンプレート（サーバーが教材の一致で判定） */
export type LatestSetTemplate = { id: string; name: string; description: string | null; materialIds: string[] };

/** 処方（診察ごと）と、その処方に教材がすべて含まれるテンプレート（新しい順） */
export type PrescribedSetApi = { setId: string; createdAt: string; orgName: string; clinicianName: string; templates: LatestSetTemplate[] };

/** 医療者向けのテンプレート名 → 患者に見せるセット名（対応がなければそのまま） */
const PATIENT_SET_NAME: Record<string, string> = { 初回診断時セット: "診断時セット" };
export const patientSetName = (name: string) => PATIENT_SET_NAME[name] ?? name;

/** Figma の DLesson と同じ形（id は教材 ID） */
export type LiveLesson = {
  id: string
  title: string
  category: string
  time: number
  status: "new" | "doing" | "done"
  /** 処方された（今回・以前を問わない） */
  prescribed: boolean
  /** 今回（最新）の情報処方に含まれる */
  latest: boolean
  sender?: string
  date?: string
  progress: number
  summary: string
  goal: string
  versionId: string
  slideCount: number
  questionCount: number
  lastSlideSeq: number
  note: string | null
  /** 前回までに処方された（今回の処方ではない） */
  previouslyPrescribed: boolean
  selfLearning: boolean
  /** 登録済みの完成サムネイル（なければ Figma の「画像準備中」） */
  thumbnail: { src: string; alt: string; band?: true } | null
};

export function toLesson(i: LibraryApiItem): LiveLesson {
  const status = i.phase === "completed" ? "done" : i.phase === "not_started" ? "new" : "doing";
  const progress = status === "done" ? 100 : status === "new" ? 0 : i.phase === "quiz" ? 90 : Math.min(90, Math.round((i.lastSlideSeq / Math.max(1, i.slideCount)) * 100));
  return {
    id: i.materialId,
    title: i.title,
    category: areaOf(i.primaryDomain),
    time: estimateMinutes(i.slideCount, i.questionCount),
    status,
    prescribed: !!i.prescribed,
    latest: !!i.prescribed?.latest,
    sender: i.prescribed ? `${i.prescribed.orgName} ${i.prescribed.clinicianName}` : undefined,
    date: i.prescribed ? shortDate(i.prescribed.createdAt) : undefined,
    progress,
    summary: i.summary ?? "",
    goal: i.objective ?? "",
    versionId: i.versionId,
    slideCount: i.slideCount,
    questionCount: i.questionCount,
    lastSlideSeq: i.lastSlideSeq,
    note: i.prescribed?.note ?? null,
    previouslyPrescribed: !!i.prescribed && !i.prescribed.latest,
    selfLearning: i.selfLearning,
    thumbnail: thumbnailFor(i.title),
  };
}

/** 今回（最新）の処方を区別する鍵。処方の記録 ID・最も新しい処方日時・教材 ID（並べ替え済み）から作る */
export function rxKey(latestItems: Pick<LibraryApiItem, "materialId" | "prescribed">[]): string {
  if (!latestItems.length) return "";
  const setId = latestItems[0].prescribed?.setId ?? "";
  const dates = latestItems.map((i) => String(i.prescribed?.createdAt ?? "")).sort();
  const at = dates[dates.length - 1] ?? "";
  const ids = latestItems.map((i) => i.materialId).sort().join(",");
  return `${setId}|${at}|${ids}`;
}

export type PatientLearning = ReturnType<typeof usePatientLearning>;

/** 患者の教材一覧（処方・公開教材・学習状態）。画面を移るたびに読み直す */
export function usePatientLearning(notify: (message: string) => void) {
  const [items, setItems] = useState<LibraryApiItem[] | null>(null);
  const [templates, setTemplates] = useState<LatestSetTemplate[]>([]);
  const [prescribedSets, setPrescribedSets] = useState<PrescribedSetApi[]>([]);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  /** 読み直す。成功したら true（失敗は通知し false。呼び出し側で「保存の確認に失敗」を出すため） */
  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const r = await api<{ items: LibraryApiItem[]; latestSetTemplates?: LatestSetTemplate[]; prescribedSets?: PrescribedSetApi[] }>("/api/v1/library");
      setItems(r.items);
      setTemplates(r.latestSetTemplates ?? []);
      setPrescribedSets(r.prescribedSets ?? []);
      return true;
    } catch (e) {
      if (!opts?.silent) notifyRef.current(errorText(e));
      return false;
    }
  }, []);
  useEffect(() => {
    // 初回の読み込み（外部 API との同期）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  const lessons = (items ?? []).map(toLesson);
  const latestItems = (items ?? []).filter((i) => i.prescribed?.latest);
  const latest = latestItems[0]?.prescribed ?? null;
  return {
    loaded: items !== null,
    lessons,
    /** 今回（最新）の情報処方 */
    latest: latest
      ? {
          sender: `${latest.orgName} ${latest.clinicianName}`,
          clinician: latest.clinicianName,
          org: latest.orgName,
          date: shortDate(latest.createdAt),
          /** 医療者のメッセージが付いた教材がある */
          hasNote: latestItems.some((i) => !!i.prescribed?.note),
          /**
           * 今回の処方を区別する鍵（処方の記録 ID・処方日時・教材）。同じ教材や既存セット内の教材を再処方しても、
           * 処方の記録が新しくなれば鍵が変わる（ホームの「新着」の表示に使う。サーバーには送らない）
           */
          key: rxKey(latestItems),
          /** 今回の処方の日時（ISO。最も新しいもの） */
          createdAt: latestItems.map((i) => String(i.prescribed?.createdAt ?? "")).sort().reverse()[0] ?? "",
        }
      : null,
    /**
     * 今回（最新）の処方に含まれるセット（例: 診断時セット）。患者向けの名前と、セットに含まれる教材（処方された実際の教材）。
     * 処方の記録にセットの ID はないため、テンプレートの教材がすべて処方されているときだけ出す。
     */
    latestSets: templates.map((t) => ({
      id: t.id,
      name: patientSetName(t.name),
      description: t.description,
      lessons: lessons.filter((l) => l.latest && t.materialIds.includes(l.id)),
      sender: latest ? `${latest.orgName} ${latest.clinicianName}` : null,
      date: latest ? shortDate(latest.createdAt) : null,
      inLatest: true,
    })),
    /**
     * これまでの処方に含まれるセット（テンプレートごとに、その教材がすべて含まれていた最新の処方）。新しい順。
     * 後日ほかの教材が処方されても、ホームから続きを読めるようにする。送り元・日付はその処方の記録。
     * 処方の記録にセットの ID はないため、「セットを使って処方した」とは断定しない（教材の一致で判定）
     */
    homeSets: (() => {
      const latestSetId = latest?.setId ?? null;
      const seen = new Set<string>();
      const out: { id: string; name: string; description: string | null; lessons: LiveLesson[]; sender: string | null; date: string | null; inLatest: boolean }[] = [];
      for (const rx of prescribedSets)
        for (const t of rx.templates) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          out.push({
            id: t.id,
            name: patientSetName(t.name),
            description: t.description,
            lessons: lessons.filter((l) => t.materialIds.includes(l.id)),
            sender: `${rx.orgName} ${rx.clinicianName}`,
            date: shortDate(rx.createdAt),
            inLatest: rx.setId === latestSetId,
          });
        }
      return out;
    })(),
    /**
     * テンプレート名（医療者向け）で、そのセットが処方された最新の記録（送り元・日付）を探す。
     * 判定は教材の一致（処方の記録にセットの ID はない）。見つからなければ null
     */
    setPrescribedAs: (templateName: string) => {
      const s = prescribedSets.find((x) => x.templates.some((t) => t.name === templateName));
      return s ? { sender: `${s.orgName} ${s.clinicianName}`, date: shortDate(s.createdAt) } : null;
    },
    reload,
  };
}

export type Slide = {
  seq: number;
  title: string;
  proposition: string | null;
  bodyMd: string;
  detailMd: string | null;
  voiceText: string;
  figures: { src: string; altText: string | null; caption: string | null; longDescription: string | null; width: number | null; height: number | null }[];
};
export type LearnView = {
  versionId: string;
  title: string;
  slides: Slide[];
  questionCount: number;
  progress: { phase: string; lastSlideSeq: number };
};

/** 学習画面: スライドと保存済みの位置 */
export function useLearnView(versionId: string | null, notify: (message: string) => void) {
  const [view, setView] = useState<LearnView | null>(null);
  useEffect(() => {
    if (!versionId) return;
    let stop = false;
    api<LearnView>(`/api/v1/learn/${versionId}`)
      .then((v) => !stop && setView(v))
      .catch((e) => notify(errorText(e)));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);
  return view && view.versionId === versionId ? view : null;
}

export const saveProgress = (versionId: string, lastSlideSeq: number, phase: "reading" | "quiz" | "completed") =>
  api(`/api/v1/learn/${versionId}/progress`, { json: { lastSlideSeq, phase } });

export type AttemptView = {
  attemptId: string;
  versionId: string;
  nQuestions: number;
  completedAt: string | null;
  nCorrect: number;
  nWrong: number;
  nUnknown: number;
  questions: {
    questionId: string;
    seq: number;
    stem: string;
    options: [string, string, string];
    relatedSlideSeq: number | null;
    answer: null | { selectedIndex: number | null; isUnknown: boolean; isCorrect: boolean; correctIndex: number; explanation: string };
  }[];
};

/**
 * 理解確認: 進行中の挑戦を再開（なければ作成）。完了済みの挑戦は、学習画面から「理解を確認する」で入ったときだけ新しく作る。
 * 1 問ずつ「この回答で確定する」で記録（選んだだけでは記録しない）。「わからない」は selectedIndex = null。
 */
export function useAttempt(versionId: string | null, notify: (message: string) => void) {
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (forceNew: boolean) => {
      if (!versionId) return null;
      try {
        const a = await api<AttemptView>(`/api/v1/learn/${versionId}/attempts`, { json: { forceNew } });
        setAttempt(a);
        return a;
      } catch (e) {
        notify(errorText(e));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versionId],
  );
  const answer = useCallback(
    async (questionId: string, selectedIndex: number | null) => {
      if (!attempt || busy) return false;
      setBusy(true);
      try {
        await api(`/api/v1/attempts/${attempt.attemptId}/answers`, { json: { questionId, selectedIndex } });
        setAttempt(await api<AttemptView>(`/api/v1/attempts/${attempt.attemptId}`));
        return true;
      } catch (e) {
        notify(errorText(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [attempt, busy, notify],
  );
  return { attempt: attempt && attempt.versionId === versionId ? attempt : null, load, answer, busy };
}

/*
 * ---- ホームの「新着」（患者がまだ開いていない今回の処方） ----
 * サーバーには「患者が処方を開いた」記録がない（学習の進捗は教材ごとで、処方ごとではない）。
 * そのため既読は、この端末のブラウザーに処方の鍵（rxKey）だけを保存して判定する（医療情報・本文は保存しない）。
 * 学習の進捗・処方の履歴はサーバーの記録のまま変えない。
 */
const SEEN_RX_PREFIX = "shiori:rx-seen:v1:";

/** 保存済みの「開いた処方」の鍵。記録がなければ null（保存できない環境でも null） */
export function readSeenRx(owner: string): string | null {
  try {
    return window.localStorage.getItem(SEEN_RX_PREFIX + owner);
  } catch {
    return null;
  }
}

export function writeSeenRx(owner: string, key: string) {
  try {
    window.localStorage.setItem(SEEN_RX_PREFIX + owner, key);
  } catch {
    /* 保存できない環境（プライベートブラウズ等）ではこの画面の中だけで既読にする */
  }
}

/**
 * 今回の処方を「新着」として示すか。
 * - 開いた処方の鍵と同じなら新着ではない
 * - この端末で初めて開いたとき（記録なし）は、今回の教材をすべて読み始めていて、処方から日が経っていれば
 *   新着としない（以前から読んでいる処方）。最近（RECENT_RX_DAYS 日以内）の処方は、読み始めた教材の再処方でも新着
 * - 同じ教材・既存セット内の教材の再処方は、処方の記録が新しくなるので鍵が変わり、新着になる
 */
export const RECENT_RX_DAYS = 3;
export function isRecentRx(createdAt: string, now = Date.now()): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t < RECENT_RX_DAYS * 864e5;
}
export function isNewRx(key: string, seen: string | null | undefined, allStarted: boolean, recent = false): boolean {
  if (!key) return false;
  if (seen === undefined) return false;
  if (seen === key) return false;
  if (seen === null && allStarted && !recent) return false;
  return true;
}
