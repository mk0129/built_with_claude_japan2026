"use client";

/**
 * Figma Concept D の教材スタジオを、既存の教材制作 API に接続するフック（Phase 2 Step 5）。
 * 原資料（非公開ストレージ・許諾）→ Claude の構成案（ジョブ）→ 医療者が選択 → 必須事項の確認 → Claude の下書き（ジョブ）→
 * 本文・確認問題の編集（自動保存）→ 患者向けプレビュー → 承認待ち → 医学的承認・公開（ライブラリへ登録）→ 情報処方。
 * Claude の出力は下書きで、採用・医学的な判断は医療者が行う。デモの承認者は架空の承認者で、本番の医学的監修ではない。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "@/lib/api";

export type Permissions = { allowAi: boolean; allowDerive: boolean; allowPublish: boolean; allowShare: boolean };
export type Outline = { title: string; primaryDomain: string; targetReader: string; learningObjectives: string[]; slideTitles: string[]; rationale: string; sourceRefs: { sourceId: string; section: string; quote: string }[] };
export type MustCandidate = { id: string; text: string; kind: "emergency" | "visit" | "prohibition" | "caution" | "fact"; sourceRef: { sourceId: string; section?: string; quote?: string } };
type Job = { id: string; mode: string; status: string; progress: string | null; errorCode: string | null; errorMessage: string | null; generator: string; model: string; outputPayload: unknown; outputVersionId: string | null };
export type Draft = {
  version: { id: string; status: "draft" | "in_review" | "published" | "retired"; summary: string | null; learningObjectives: string[]; mustCover: { id: string; text: string; kind: string; status: string; confirmed?: boolean; sourceRef?: { quote?: string; section?: string } }[]; reviewComment: string | null };
  material: { id: string; title: string; primaryDomain: string; scope: "common" | "org"; tags?: string[] };
  slides: { seq: number; title: string; proposition: string | null; bodyMd: string; detailMd: string | null; sourceRefs: { sourceId: string; section?: string; quote?: string }[] }[];
  questions: { seq: number; stem: string; options: [string, string, string]; correctIndex: number; explanation: string; relatedSlideSeq: number | null; sourceRefs: { sourceId: string; section?: string; quote?: string }[] }[];
  sources: { id: string; title: string; perm: { rightsHolder: string; allowPublish: boolean; allowShare: boolean; allowDerive: boolean } | null }[];
  creatorName: string;
  role: { canEdit: boolean; canApprove: boolean };
  approvalBlock: string | null;
  preCheck: { mustCover: { safetyUnconfirmed: { id: string; text: string }[]; unconfirmed: number } };
};

export const SAFETY_KINDS = ["emergency", "visit", "prohibition"];

export type StudioLive = ReturnType<typeof useStudio>;

export function useStudio(orgId: string | null, enabled: boolean, notify: (message: string) => void) {
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  });
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceInfo, setSourceInfo] = useState<{ title: string; filename: string; size: number; charCount: number; warnings: string[] } | null>(null);
  const [outlineJob, setOutlineJob] = useState<Job | null>(null);
  const [draftJob, setDraftJob] = useState<Job | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [config, setConfig] = useState<{ claudeConfigured: boolean; model: string } | null>(null);

  // 教材制作の権限（教材編集者・承認者）と Claude の設定状況
  useEffect(() => {
    if (!enabled) return;
    const q = orgId ? `?orgId=${orgId}` : "";
    api(`/api/v1/studio/sources${q}`)
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false));
    api<{ claudeConfigured: boolean; model: string }>("/api/v1/studio/config")
      .then(setConfig)
      .catch(() => {});
  }, [enabled, orgId]);

  const run = async <T,>(label: string, f: () => Promise<T>): Promise<T | null> => {
    setBusy(label);
    try {
      return await f();
    } catch (e) {
      notifyRef.current(errorText(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const loadDraft = async (versionId: string) => {
    const d = await api<Draft>(`/api/v1/studio/materials/${versionId}`);
    setDraft(d);
    return d;
  };

  // 既存の下書きを開く（URL の ?draft=<versionId>。例: 取り込んだ教材の下書きを編集・患者プレビューで確認する）。権限はサーバーで検証
  const [openedFromUrl, setOpenedFromUrl] = useState<string | null>(null);
  const urlDraftRequested = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !allowed) return;
    const id = new URLSearchParams(window.location.search).get("draft");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || urlDraftRequested.current === id) return;
    urlDraftRequested.current = id;
    api<Draft>(`/api/v1/studio/materials/${id}`)
      .then((d) => {
        setDraft(d);
        setOpenedFromUrl(id);
      })
      .catch((e) => notifyRef.current(errorText(e)));
  }, [enabled, allowed]);

  /** 原資料の登録（ファイル・資料名・許諾元・許諾の根拠・利用条件・個人情報を含まないことの確認） */
  const upload = useCallback(
    async (file: File, meta: { title: string; rightsHolder: string; evidenceNote: string; perm: Permissions; piiAttestedNone: boolean }) =>
      run("upload", async () => {
        const form = new FormData();
        form.append("file", file);
        form.append(
          "meta",
          JSON.stringify({
            orgId,
            title: meta.title,
            piiAttestedNone: meta.piiAttestedNone,
            permissions: { allowStore: true, ...meta.perm, rightsHolder: meta.rightsHolder, evidenceNote: meta.evidenceNote },
          }),
        );
        const res = await fetch("/api/v1/studio/sources", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw Object.assign(new Error(data.message ?? data.error ?? "UPLOAD_FAILED"), { code: data.error });
        setSourceId(data.sourceId);
        setSourceInfo({ title: meta.title || file.name, filename: file.name, size: file.size, charCount: data.charCount, warnings: data.warnings ?? [] });
        setOutlineJob(null);
        setDraftJob(null);
        setDraft(null);
        return data.sourceId as string;
      }),
    [orgId],
  );
  /** 許諾の変更（登録後に利用条件を直す場合） */
  const updatePermissions = useCallback(
    async (meta: { rightsHolder: string; evidenceNote: string; perm: Permissions; piiAttestedNone: boolean }) => {
      if (!sourceId) return null;
      return run("permissions", () => api(`/api/v1/studio/sources/${sourceId}`, { method: "PATCH", json: { allowStore: true, ...meta.perm, rightsHolder: meta.rightsHolder, evidenceNote: meta.evidenceNote, piiAttestedNone: meta.piiAttestedNone } }));
    },
    [sourceId],
  );
  const removeSource = useCallback(() => {
    setSourceId(null);
    setSourceInfo(null);
    setOutlineJob(null);
    setDraftJob(null);
    setDraft(null);
  }, []);

  /** ジョブの完了まで待つ（2 秒ごと。最大 5 分） */
  const waitJob = async (jobId: string, onUpdate: (j: Job) => void) => {
    for (let i = 0; i < 150; i++) {
      const { job } = await api<{ job: Job }>(`/api/v1/studio/jobs/${jobId}`);
      onUpdate(job);
      if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return job;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("生成に時間がかかっています。しばらくしてから確認してください");
  };

  /** Claude に構成案（3 案）と必須事項の候補を依頼 */
  const requestOutlines = useCallback(
    async () =>
      run("outline", async () => {
        if (!sourceId) throw new Error("原資料を登録してください");
        const q = orgId ? `?orgId=${orgId}` : "";
        const { jobId } = await api<{ jobId: string }>(`/api/v1/studio/jobs${q}`, { json: { mode: "outline", sourceIds: [sourceId] } });
        const j = await waitJob(jobId, setOutlineJob);
        if (j.status !== "succeeded") throw new Error(j.errorMessage ?? "構成案を作れませんでした");
        return j;
      }),
    [sourceId, orgId],
  );

  /** テーマ・学習目標を指定して下書きを作る（構成案なし） */
  const requestFreeform = useCallback(
    async (brief: { theme: string; audience: string; objectives: string[] }) =>
      run("draft", async () => {
        if (!sourceId) throw new Error("原資料を登録してください");
        const q = orgId ? `?orgId=${orgId}` : "";
        const { jobId } = await api<{ jobId: string }>(`/api/v1/studio/jobs${q}`, { json: { mode: "freeform", sourceIds: [sourceId], ...brief } });
        const j = await waitJob(jobId, setDraftJob);
        if (j.status !== "succeeded" || !j.outputVersionId) throw new Error(j.errorMessage ?? "下書きを作れませんでした");
        await loadDraft(j.outputVersionId);
        return j;
      }),
    [sourceId, orgId],
  );

  /** 選んだ構成案と、医療者が確認した必須事項で下書きを作る */
  const requestDraft = useCallback(
    async (outlineIndex: number, must: { id: string; text: string; kind: MustCandidate["kind"]; sourceRef: MustCandidate["sourceRef"]; status: "required" | "other_material" | "needs_review" }[]) =>
      run("draft", async () => {
        if (!sourceId || !outlineJob) throw new Error("構成案がありません");
        const q = orgId ? `?orgId=${orgId}` : "";
        const { jobId } = await api<{ jobId: string }>(`/api/v1/studio/jobs${q}`, {
          json: { mode: "generate", sourceIds: [sourceId], fromJobId: outlineJob.id, outlineIndex, mustCover: must },
        });
        const j = await waitJob(jobId, setDraftJob);
        if (j.status !== "succeeded" || !j.outputVersionId) throw new Error(j.errorMessage ?? "下書きを作れませんでした");
        // 手順 4 で医療者が確認した必須事項は「確認済み」として記録（氏名と日時はサーバーが記録）
        const required = must.filter((m) => m.status === "required").map((m) => ({ id: m.id, confirmed: true }));
        if (required.length) await api(`/api/v1/studio/materials/${j.outputVersionId}/must-cover`, { method: "PUT", json: { updates: required } }).catch(() => {});
        await loadDraft(j.outputVersionId);
        return j;
      }),
    [sourceId, orgId, outlineJob],
  );

  /** 下書きの保存（自動保存） */
  const saveDraft = useCallback(
    async (next: Draft) => {
      setDraft(next);
      try {
        await api(`/api/v1/studio/materials/${next.version.id}`, {
          method: "PUT",
          json: {
            title: next.material.title,
            summary: next.version.summary ?? "",
            primaryDomain: next.material.primaryDomain,
            learningObjectives: next.version.learningObjectives,
            slides: next.slides.map((s) => ({ title: s.title, proposition: s.proposition ?? "", body: s.bodyMd, detail: s.detailMd ?? "", sourceRefs: s.sourceRefs.map((r) => ({ sourceId: r.sourceId, section: r.section ?? "", quote: r.quote ?? "" })) })),
            questions: next.questions.map((q) => ({
              stem: q.stem,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              relatedSlide: q.relatedSlideSeq ?? 1,
              sourceRefs: q.sourceRefs.map((r) => ({ sourceId: r.sourceId, section: r.section ?? "", quote: r.quote ?? "" })),
            })),
          },
        });
        setSavedAt(new Date());
      } catch (e) {
        notifyRef.current(errorText(e));
      }
    },
    [],
  );

  const transition = useCallback(
    async (kind: "submit" | "approve" | "return" | "retire", body: Record<string, unknown> = {}) => {
      if (!draft) return null;
      return run(kind, async () => {
        await api(`/api/v1/studio/materials/${draft.version.id}/${kind}`, { json: body });
        return loadDraft(draft.version.id);
      });
    },
    [draft],
  );

  /** 既存の下書きを開く（URL を使わずに。例: 記録済みの下書きを手順 4 の後に開く） */
  const openDraft = useCallback(async (versionId: string) => {
    try {
      return await loadDraft(versionId);
    } catch (e) {
      notifyRef.current(errorText(e));
      return null;
    }
  }, []);

  const outlines = (outlineJob?.status === "succeeded" ? (outlineJob.outputPayload as { outlines: Outline[] })?.outlines : null) ?? [];
  const candidates: MustCandidate[] = ((outlineJob?.status === "succeeded" ? (outlineJob.outputPayload as { mustCoverCandidates?: Omit<MustCandidate, "id">[] })?.mustCoverCandidates : null) ?? []).map((c, i) => ({ ...c, id: `mc${i + 1}` }));
  return {
    allowed,
    config,
    busy,
    savedAt,
    sourceId,
    sourceInfo,
    upload,
    updatePermissions,
    removeSource,
    outlineJob,
    outlines,
    candidates,
    requestOutlines,
    requestFreeform,
    draftJob,
    requestDraft,
    draft,
    saveDraft,
    reloadDraft: () => (draft ? loadDraft(draft.version.id) : null),
    openedFromUrl,
    openDraft,
    /** 構成案・下書きが記録済み出力の再生か（再生を実際の生成と表示しない） */
    replay: outlineJob?.generator === "replay" || draftJob?.generator === "replay",
    /** サンプル資料（公開デモなど）。通常の運用では null */
    sample: null as StudioSample | null,
    /** 自分のファイルを選べない理由（公開デモなど）。null なら選べる */
    ownFileBlockedReason: null as string | null,
    /** 公開前チェックに使う原資料の本文（クライアントにある場合のみ）。ないときは出典の引用で照合する */
    sourceText: null as string | null,
    submit: () => transition("submit"),
    approve: (acknowledgeSafety: boolean, note: string | null) => transition("approve", { acknowledgeSafety, note }),
    returnToDraft: (comment: string) => transition("return", { comment }),
    retire: () => transition("retire"),
  };
}

/**
 * サンプル資料（架空・許諾済み）で教材スタジオを試すための情報。公開デモなどで使い、通常の運用では null。
 * 資料名・作成元・許諾の根拠を画面に示し、医療者が確認してから登録する。
 */
export type StudioSample = {
  title: string;
  filename: string;
  rightsHolder: string;
  evidenceNote: string;
  /** 資料の説明（架空であること・作成の目的） */
  description: string;
  file: () => File;
};

export type DraftCheck = {
  id: string;
  kind: "source_word" | "detail_only" | "condition_missing";
  title: string;
  where: string;
  excerpt: string;
  /** 編集画面で開く画面（1 始まり。設問は slides.length + 1） */
  page: number;
};

const CONDITIONS: { label: string; re: RegExp }[] = [
  { label: "手術のあと", re: /手術の(?:あと|後)/ },
  { label: "治療を始める前", re: /治療を(?:始める|はじめる|開始する)前/ },
  { label: "次の診察を待たずに", re: /次の診察を待たず/ },
  { label: "夜間や休日", re: /夜間(?:や|・|、)?休日/ },
  { label: "早めに", re: /早めに/ },
  { label: "事前に", re: /事前に/ },
];
const URGENT = /(次の診察を待たず|すぐに?(?:病院|連絡|受診)|ただちに|夜間(?:や|・|、)?休日|救急)/;

const sentences = (text: string) =>
  text
    .split(/(?<=[。！？!?])|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);
const bigrams = (s: string) => {
  const t = s.replace(/[\s、。・「」（）()]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
/** 文字 bigram の Dice 係数（0〜1） */
export function textSimilarity(a: string, b: string) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}
const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Claude の下書き（または記録済みの出力）を、公開前に医療者が見直すための機械チェック。出力は書き換えない。
 * 1. 患者向けの文（本文・設問）に「原資料」という語が残っていないか
 * 2. 連絡・受診の指示が「もう少し詳しく」（初期は閉じている）の中だけにないか
 * 3. 原資料の時期・条件（「手術のあと」「治療を始める前」など）が、対応する本文・設問から抜けていないか
 * 判定は候補の抽出で、採否は医療者が決める。
 */
export function reviewDraft(
  draft: Pick<Draft, "slides" | "questions"> & { version?: Pick<Draft["version"], "mustCover"> },
  opts: { sourceText?: string | null } = {},
): DraftCheck[] {
  const out: DraftCheck[] = [];
  const quizPage = draft.slides.length + 1;
  const units = [
    ...draft.slides.map((s, i) => ({
      where: `画面${i + 1}「${s.title}」`,
      page: i + 1,
      kind: "slide" as const,
      parts: [
        ["見出し", s.title],
        ["要点", s.proposition ?? ""],
        ["本文", s.bodyMd],
        ["もう少し詳しく", s.detailMd ?? ""],
      ] as [string, string][],
    })),
    ...draft.questions.map((q, i) => ({
      where: `問${i + 1}`,
      page: quizPage,
      kind: "question" as const,
      parts: [
        ["問題文", q.stem],
        ["選択肢", q.options.join(" / ")],
        ["解説", q.explanation],
      ] as [string, string][],
    })),
  ];

  // 1. 患者向けの文の「原資料」
  for (const u of units)
    for (const [part, text] of u.parts) {
      const hit = sentences(text).find((s) => s.includes("原資料"));
      if (hit)
        out.push({ id: `word:${u.where}:${part}`, kind: "source_word", title: "患者向けの文に「原資料」という語があります", where: `${u.where}の${part}`, excerpt: short(hit), page: u.page });
    }

  // 2. 連絡・受診の指示が「もう少し詳しく」の中だけ
  const shownText = draft.slides.map((s) => `${s.title}\n${s.proposition ?? ""}\n${s.bodyMd}`).join("\n");
  draft.slides.forEach((s, i) => {
    for (const sent of sentences(s.detailMd ?? "")) {
      const m = sent.match(URGENT);
      if (!m) continue;
      const phrase = m[0];
      if (shownText.includes(phrase)) continue;
      const related = draft.questions.map((q, qi) => (q.relatedSlideSeq === s.seq || q.relatedSlideSeq === i + 1) && URGENT.test(q.explanation) ? `問${qi + 1}` : null).filter(Boolean);
      out.push({
        id: `detail:${i + 1}:${phrase}`,
        kind: "detail_only",
        title: `連絡の指示（「${phrase}」）が「もう少し詳しく」の中だけにあります`,
        where: `画面${i + 1}「${s.title}」のもう少し詳しく（初期は閉じています）${related.length ? `。${related.join("・")}の解説はこの画面を参照` : ""}`,
        excerpt: short(sent),
        page: i + 1,
      });
    }
  });

  // 3. 原資料の時期・条件の欠落（本文と設問をそれぞれ照合）
  const quoteText = [
    ...draft.slides.flatMap((s) => s.sourceRefs.map((r) => r.quote ?? "")),
    ...draft.questions.flatMap((q) => q.sourceRefs.map((r) => r.quote ?? "")),
    ...(draft.version?.mustCover ?? []).map((m) => m.sourceRef?.quote ?? ""),
  ].join("\n");
  const source = opts.sourceText?.trim() ? opts.sourceText : quoteText;
  const seen = new Set<string>();
  for (const sent of sentences(source)) {
    for (const c of CONDITIONS) {
      if (!c.re.test(sent)) continue;
      const key = `${c.label}:${sent}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const best = (kind: "slide" | "question") => {
        let top: { u: (typeof units)[number]; score: number } | null = null;
        for (const u of units.filter((x) => x.kind === kind))
          for (const [, text] of u.parts)
            for (const t of sentences(text)) {
              const score = textSimilarity(sent, t);
              if (!top || score > top.score) top = { u, score };
            }
        return top;
      };
      const slide = best("slide");
      const question = best("question");
      const lacking = [slide, question].filter(
        (m): m is NonNullable<typeof m> => !!m && m.score >= 0.3 && !c.re.test(m.u.parts.map(([, t]) => t).join("\n")),
      );
      const matched = [slide, question].some((m) => m && m.score >= 0.3);
      if (!matched)
        out.push({ id: `cond:${key}`, kind: "condition_missing", title: `原資料の「${c.label}」を含む記載が、本文・設問のどこにもありません（教材の範囲外なら問題ありません）`, where: "対応する画面・設問なし", excerpt: short(sent), page: 1 });
      for (const m of lacking)
        out.push({ id: `cond:${key}:${m.u.where}`, kind: "condition_missing", title: `原資料の時期・条件「${c.label}」が抜けています`, where: `${m.u.where}（原資料の文に最も近い記載）`, excerpt: short(sent), page: m.u.page });
    }
  }
  // 安全に関わる順（連絡の指示 → 条件の欠落 → 語の言い換え → 教材の範囲外）
  const rank = (x: DraftCheck) => (x.kind === "detail_only" ? 0 : x.kind === "condition_missing" ? (x.where.startsWith("対応する") ? 3 : 1) : 2);
  return out.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map(({ x }) => x);
}
