import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db } from "@/server/db/client";
import { aiGenerationJobs, materialSlides, materialVersions, materials, quizQuestions, sourceDocuments, type MustCoverItem, type SourceRef } from "@/server/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/server/authz/errors";
import type { Principal } from "@/server/authz/principal";
import { audit } from "./audit";
import { balanceAnswerPositions } from "./quiz-balance";
import { replayFile } from "@/server/demo";
import { ClaudeError, callClaudeStructured, claudeMode, classifyClaudeError, type ClaudeResult } from "./claude";
import { assertAiAllowedForSources, requireStudioMembership } from "./sources";

// 出力スキーマ・プロンプトは ai-prompts.ts（DB に依存しない。公開デモのサーバー関数と共用）
import { MaterialSchema, MustCoverInput, OutlineSchema, SYSTEM, materialPrompt, outlinePrompt, type MaterialOutput, type MustCoverInputItem, type OutlineOutput } from "./ai-prompts";
export { MaterialSchema, MustCoverInput, OutlineSchema, type MaterialOutput, type MustCoverInputItem, type OutlineOutput };

// ---------------- 検証 ----------------
function normalize(s: string) {
  return s.replace(/\s+/g, "").replace(/[「」『』]/g, "");
}

/** 出力の形式チェックと、引用が原資料に実在するかの確認 */
export function validateMaterial(out: MaterialOutput, sources: { id: string; extractedText: string | null }[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (out.slides.length < 3 || out.slides.length > 5) errors.push(`画面数が ${out.slides.length} です（3〜5 が必要）`);
  if (out.questions.length < 2 || out.questions.length > 5) errors.push(`問題数が ${out.questions.length} です（2〜5 が必要）`);
  out.questions.forEach((q, i) => {
    if (q.options.length !== 3) errors.push(`問 ${i + 1}: 選択肢が 3 つではありません`);
    if (q.correctIndex < 0 || q.correctIndex > 2) errors.push(`問 ${i + 1}: 正答の番号が不正です`);
    if (q.options.some((o) => /わからない/.test(o))) errors.push(`問 ${i + 1}: 「わからない」は選択肢に含めません`);
    if (q.relatedSlide < 1 || q.relatedSlide > out.slides.length) warnings.push(`問 ${i + 1}: 関連画面の番号が範囲外です`);
  });
  const texts = new Map(sources.map((s) => [s.id, normalize(s.extractedText ?? "")]));
  // GEN-02: 1 画面 1 主題。出典の section（原資料の見出し）が 1 画面で 2 つ以上に分かれていれば候補として警告する（判定は医療者）
  out.slides.forEach((s, i) => {
    const sections = new Set(s.sourceRefs.map((r) => (r.section ?? "").trim()).filter(Boolean));
    if (sections.size >= 2) warnings.push(`画面 ${i + 1}: 出典が複数の見出しにまたがります（${[...sections].join(" / ")}）。1 画面 1 主題か確認してください`);
  });
  const check = (refs: SourceRef[], where: string) => {
    if (refs.length === 0) warnings.push(`${where}: 原資料の参照がありません`);
    for (const r of refs) {
      const t = texts.get(r.sourceId);
      if (!t) warnings.push(`${where}: 存在しない資料 ID を参照しています`);
      else if (r.quote && !t.includes(normalize(r.quote))) warnings.push(`${where}: 引用「${r.quote.slice(0, 30)}…」が原資料に見つかりません`);
    }
  };
  out.slides.forEach((s, i) => check(s.sourceRefs, `画面 ${i + 1}`));
  out.questions.forEach((q, i) => check(q.sourceRefs, `問 ${i + 1}`));
  return { errors, warnings };
}

/**
 * GEN-05: 必須事項と教材の機械照合（参考情報）。
 * 項目の引用が教材のいずれかの出典引用と重なる（どちらかがどちらかを含む）かだけを見る。
 * 「出典があるだけ」で網羅とは判定しない: 結果は autoMatched に記録し、網羅の最終確認は医療者が confirmed で行う。
 */
export function matchMustCover(items: MustCoverInputItem[], out: Pick<MaterialOutput, "slides" | "questions" | "coverage">): MustCoverItem[] {
  const quotes = [...out.slides.flatMap((s) => s.sourceRefs), ...out.questions.flatMap((q) => q.sourceRefs)].map((r) => normalize(r.quote ?? "")).filter((q) => q.length >= 8);
  return items.map((i) => {
    const q = normalize(i.sourceRef.quote ?? "");
    const autoMatched = i.status === "required" ? q.length >= 8 && quotes.some((x) => x.includes(q) || q.includes(x)) : null;
    const cov = out.coverage.find((c) => c.itemId === i.id);
    return { ...i, coverage: { slides: cov?.slides ?? [], questions: cov?.questions ?? [] }, autoMatched, confirmed: null };
  });
}

// ---------------- ジョブ ----------------
export type JobInput =
  | { mode: "outline"; sourceIds: string[] }
  | { mode: "generate"; sourceIds: string[]; fromJobId: string; outlineIndex: number; mustCover?: MustCoverInputItem[] }
  | { mode: "freeform"; sourceIds: string[]; theme: string; audience?: string; objectives: string[]; mustCover?: MustCoverInputItem[] };

/** ジョブを登録する（同じ冪等キーなら既存ジョブを返す）。実行は scheduleJob / drainJobs が担う */
export async function createJob(p: Principal, orgId: string | null, input: JobInput, idempotencyKey?: string, db: Db = getDb()) {
  const m = await requireStudioMembership(p, orgId);
  if (idempotencyKey) {
    const [existing] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) return { jobId: existing.id, duplicate: true };
  }
  // 送信前のサーバー側許諾チェック（ここで不可ならジョブも作らない）
  await assertAiAllowedForSources(input.sourceIds, m.orgId, db);
  if (input.mode === "freeform" && !input.theme.trim()) throw badRequest("THEME_REQUIRED");
  if (input.mode === "generate") {
    const [src] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, input.fromJobId)).limit(1);
    if (!src || src.mode !== "outline" || src.status !== "succeeded" || src.orgId !== m.orgId) throw badRequest("OUTLINE_JOB_INVALID");
    const outlines = (src.outputPayload as OutlineOutput | null)?.outlines ?? [];
    if (!outlines[input.outlineIndex]) throw badRequest("OUTLINE_INDEX_INVALID");
  }
  const generator = replayFile("STUDIO_REPLAY_FILE") ? "replay" : (claudeMode() ?? "claude");
  const [job] = await db
    .insert(aiGenerationJobs)
    .values({
      orgId: m.orgId,
      mode: input.mode,
      sourceDocumentIds: input.sourceIds,
      model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
      generator,
      status: "queued",
      progress: "待機中",
      idempotencyKey: idempotencyKey ?? null,
      inputPayload: input,
      createdByUserId: p.userId,
      maxAttempts: Number(process.env.AI_JOB_MAX_ATTEMPTS || 3),
    })
    .returning({ id: aiGenerationJobs.id });
  await audit({ actorUserId: p.userId, orgId: m.orgId, action: `ai.job.create.${input.mode}`, resourceType: "ai_generation_job", resourceId: job.id, outcome: "ok" }, db);
  await scheduleJob(job.id, db);
  return { jobId: job.id, duplicate: false };
}

/**
 * ジョブの実行を予約する。
 * - テスト（AI_JOBS_INLINE=1）: その場で完了まで待つ
 * - サーバー: レスポンス後に after() で実行を試みる（最速経路）。after() は関数の打ち切りで中断されうるため、
 *   取りこぼしは「リース切れの回収」と cron の drainJobs、画面のポーリング時の再実行で必ず拾う
 */
export async function scheduleJob(jobId: string, db: Db = getDb()) {
  if (process.env.AI_JOBS_INLINE === "1") {
    await processJob(jobId, db);
    return;
  }
  try {
    const { after } = await import("next/server");
    after(() => processJob(jobId, db).catch((e) => console.error("[ai-job]", jobId, e instanceof Error ? e.message : e)));
  } catch {
    void processJob(jobId, db).catch((e) => console.error("[ai-job]", jobId, e instanceof Error ? e.message : e));
  }
}

/** テスト用 */
export async function runJobNow(jobId: string, db: Db = getDb()) {
  await processJob(jobId, db);
}

const LEASE_MS = () => Number(process.env.CLAUDE_TIMEOUT_MS || 300_000) * 2 + 60_000;
const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 10 * 60_000);

/** 実行可能な条件: 待機中で再試行時刻を過ぎた / 実行中だがリースが切れた（関数の打ち切り等） */
const runnable = () =>
  or(
    and(eq(aiGenerationJobs.status, "queued"), or(isNull(aiGenerationJobs.nextAttemptAt), lte(aiGenerationJobs.nextAttemptAt, sql`now()`))),
    and(eq(aiGenerationJobs.status, "running"), lte(aiGenerationJobs.leaseExpiresAt, sql`now()`)),
  );

async function setProgress(db: Db, jobId: string, progress: string) {
  await db.update(aiGenerationJobs).set({ progress }).where(eq(aiGenerationJobs.id, jobId));
}

/** 1 件のジョブを原子的に確保して実行する（二重実行しない） */
export async function processJob(jobId: string, db: Db = getDb()) {
  const [prev] = await db.select({ status: aiGenerationJobs.status, attempt: aiGenerationJobs.attempt, maxAttempts: aiGenerationJobs.maxAttempts }).from(aiGenerationJobs).where(eq(aiGenerationJobs.id, jobId)).limit(1);
  if (!prev) return;
  // リース切れで回収する場合は試行回数を進め、上限を超えたら失敗にする
  if (prev.status === "running") {
    const reclaimed = prev.attempt + 1;
    if (reclaimed > prev.maxAttempts) {
      await db
        .update(aiGenerationJobs)
        .set({ status: "failed", progress: "失敗しました", errorCode: "TIMEOUT", errorMessage: "処理が時間内に完了しませんでした。再試行してください。", finishedAt: new Date(), leaseExpiresAt: null })
        .where(and(eq(aiGenerationJobs.id, jobId), eq(aiGenerationJobs.status, "running"), lte(aiGenerationJobs.leaseExpiresAt, sql`now()`)));
      return;
    }
  }
  const claimed = await db
    .update(aiGenerationJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MS()),
      progress: "原資料の許諾を確認しています",
      attempt: prev.status === "running" ? prev.attempt + 1 : prev.attempt,
    })
    .where(and(eq(aiGenerationJobs.id, jobId), runnable()))
    .returning();
  const job = claimed[0];
  if (!job) return;
  await runClaimed(job, db);
}

/** cron 等から呼ぶ: 実行可能なジョブを古い順に処理する（時間予算内） */
export async function drainJobs(opts: { limit?: number; budgetMs?: number } = {}, db: Db = getDb()) {
  const started = Date.now();
  const ids = await db.select({ id: aiGenerationJobs.id }).from(aiGenerationJobs).where(runnable()).orderBy(asc(aiGenerationJobs.createdAt)).limit(opts.limit ?? 5);
  const done: string[] = [];
  for (const { id } of ids) {
    if (Date.now() - started > (opts.budgetMs ?? 200_000)) break;
    await processJob(id, db);
    done.push(id);
  }
  return { picked: ids.length, processed: done };
}

/** 画面のポーリング時に呼ぶ: 取り残されたジョブなら実行を予約する */
export async function nudgeJob(job: typeof aiGenerationJobs.$inferSelect, db: Db = getDb()) {
  const now = Date.now();
  const stuckQueued = job.status === "queued" && (!job.nextAttemptAt || job.nextAttemptAt.getTime() <= now) && now - job.createdAt.getTime() > 15_000;
  const leaseExpired = job.status === "running" && job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= now;
  if (stuckQueued || leaseExpired) await scheduleJob(job.id, db);
}

async function runClaimed(job: typeof aiGenerationJobs.$inferSelect, db: Db) {
  const jobId = job.id;
  const input = job.inputPayload as JobInput;
  try {
    // 実行時にも再チェック（許諾が取り消されていたら送らない）
    const sources = await assertAiAllowedForSources(input.sourceIds, job.orgId!, db);
    await setProgress(
      db,
      jobId,
      replayFile("STUDIO_REPLAY_FILE")
        ? "記録済みの Claude の出力を再生しています（撮影用）"
        : claudeMode() === "fake"
          ? "擬似生成しています（開発用・Claude ではありません）"
          : "Claude で作成しています（1〜3 分ほどかかります）",
    );
    const usage = (r: ClaudeResult<unknown>) => ({
      generator: r.generator,
      model: r.model,
      inputTokenCount: r.inputTokens,
      outputTokenCount: r.outputTokens,
      cacheReadTokenCount: r.cacheReadTokens,
      durationMs: r.durationMs,
      requestId: r.requestId,
      fallbackUsed: r.fallbackUsed,
    });
    if (input.mode === "outline") {
      const r = await structuredOrReplay({ system: SYSTEM, user: outlinePrompt(sources), schema: OutlineSchema, schemaName: "outline" }, sources);
      if (r.data.outlines.length === 0) throw new ClaudeError("PARSE_FAILED", "構成案が返りませんでした（原資料が教材化に十分でない可能性があります）");
      await db
        .update(aiGenerationJobs)
        .set({ status: "succeeded", progress: "構成案ができました", outputPayload: r.data, ...usage(r), errorCode: null, errorMessage: null, finishedAt: new Date(), leaseExpiresAt: null })
        .where(eq(aiGenerationJobs.id, jobId));
    } else {
      let spec: Parameters<typeof materialPrompt>[1];
      if (input.mode === "generate") {
        const [src] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, input.fromJobId)).limit(1);
        const o = (src!.outputPayload as OutlineOutput).outlines[input.outlineIndex];
        spec = { title: o.title, audience: o.targetReader, objectives: o.learningObjectives, slideTitles: o.slideTitles, mustCover: input.mustCover };
      } else {
        spec = { theme: input.theme, audience: input.audience, objectives: input.objectives, mustCover: input.mustCover };
      }
      const r = await structuredOrReplay({ system: SYSTEM, user: materialPrompt(sources, spec), schema: MaterialSchema, schemaName: "material" }, sources, input.mode === "generate" ? input.outlineIndex : -1);
      await setProgress(db, jobId, "形式と原資料の引用を確認しています");
      const v = validateMaterial(r.data, sources);
      if (v.errors.length) throw new ClaudeError("PARSE_FAILED", `生成結果が条件を満たしていません: ${v.errors.join(" / ")}`);
      await setProgress(db, jobId, "下書きを保存しています");
      const mustCover = matchMustCover(input.mustCover ?? [], r.data);
      // 正答の位置の偏りを防ぐ（新しい下書きだけ。正答のインデックスも更新し、設問・解説は変えない）
      const balanced = balanceAnswerPositions(r.data.questions);
      const data = { ...r.data, questions: balanced.questions };
      const warnings = [...v.warnings, ...(balanced.moved.length ? [`正答の位置の偏りを防ぐため、${balanced.moved.length}問の選択肢の順番を入れ替えました（正答・解説は変わりません）`] : []), ...(balanced.warning ? [balanced.warning] : [])];
      const versionId = await saveDraft(db, job, data, sources.map((s) => s.id), r.model, mustCover);
      await db
        .update(aiGenerationJobs)
        .set({ status: "succeeded", progress: "下書きができました", outputPayload: { ...data, validationWarnings: warnings, originalCorrectIndices: r.data.questions.map((q) => q.correctIndex) }, outputVersionId: versionId, ...usage(r), errorCode: null, errorMessage: null, finishedAt: new Date(), leaseExpiresAt: null })
        .where(eq(aiGenerationJobs.id, jobId));
    }
    await audit({ actorUserId: job.createdByUserId, orgId: job.orgId, action: "ai.job.succeeded", resourceType: "ai_generation_job", resourceId: jobId, outcome: "ok" }, db);
  } catch (e) {
    const ce = e instanceof ClaudeError ? e : e instanceof Error && "code" in e && (e as { status?: number }).status ? null : classifyClaudeError(e);
    const code = ce?.code ?? (e as { code?: string }).code ?? "ERROR";
    const msg = ce ? ce.message : e instanceof Error ? `${code}: ${e.message}` : "生成に失敗しました";
    // 一時的な障害（タイムアウト・混雑・5xx・接続）は自動で再試行を予約する
    if (ce?.retryable && job.attempt < job.maxAttempts) {
      const wait = backoffMs(job.attempt);
      await db
        .update(aiGenerationJobs)
        .set({ status: "queued", progress: `一時的な障害のため ${Math.round(wait / 1000)} 秒後に自動で再試行します（${job.attempt + 1} / ${job.maxAttempts} 回目）`, errorCode: code, errorMessage: msg, attempt: job.attempt + 1, nextAttemptAt: new Date(Date.now() + wait), leaseExpiresAt: null, requestId: ce.requestId })
        .where(eq(aiGenerationJobs.id, jobId));
      await audit({ actorUserId: job.createdByUserId, orgId: job.orgId, action: "ai.job.retry_scheduled", resourceType: "ai_generation_job", resourceId: jobId, outcome: "error" }, db);
      return;
    }
    await db
      .update(aiGenerationJobs)
      .set({ status: "failed", progress: "失敗しました", errorCode: code, errorMessage: msg, finishedAt: new Date(), leaseExpiresAt: null, requestId: ce?.requestId ?? null })
      .where(eq(aiGenerationJobs.id, jobId));
    await audit({ actorUserId: job.createdByUserId, orgId: job.orgId, action: "ai.job.failed", resourceType: "ai_generation_job", resourceId: jobId, outcome: "error" }, db);
  }
}

/**
 * 撮影用デモ環境: 記録済みの Claude の出力（scripts/build-studio-replay.ts で作成）を再生する。Claude は呼ばない。
 * 原資料が記録時と同じファイル（SHA-256 が一致）で、構成案は記録した案から作る場合だけ使える。引用の原資料 ID は今回の資料に置き換える。
 */
async function structuredOrReplay<S extends z.ZodType>(
  args: { system: string; user: string; schema: S; schemaName: "outline" | "material" },
  sources: { id: string; sha256: string }[],
  outlineIndex = -1,
): Promise<ClaudeResult<z.infer<S>>> {
  const path = replayFile("STUDIO_REPLAY_FILE");
  if (!path) return callClaudeStructured(args);
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(path, "utf8")) as { generatedOn: string; model: string; sourceSha256: string; outlineIndex: number; outline: unknown; material: unknown };
  if (sources.length !== 1 || sources[0].sha256 !== file.sourceSha256) throw new ClaudeError("BAD_REQUEST", "再生用に記録した原資料と異なる資料のため、記録済みの出力は使えません（撮影用デモ環境）");
  if (args.schemaName === "material" && outlineIndex !== file.outlineIndex) throw new ClaudeError("BAD_REQUEST", `再生用の記録は案 ${file.outlineIndex + 1} から作った下書きだけです（撮影用デモ環境）`);
  const swap = (o: unknown): unknown =>
    Array.isArray(o) ? o.map(swap) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === "sourceId" ? sources[0].id : swap(v)])) : o;
  const data = args.schema.parse(swap(args.schemaName === "outline" ? file.outline : file.material));
  return { data, generator: "replay" as never, model: `${file.model}（${file.generatedOn} の記録を再生）`, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, durationMs: 0, requestId: null, stopReason: "replay", fallbackUsed: false };
}

async function saveDraft(db: Db, job: typeof aiGenerationJobs.$inferSelect, out: MaterialOutput, sourceIds: string[], model: string, mustCover: MustCoverItem[] = []) {
  return db.transaction(async (tx) => {
    const { organizations } = await import("@/server/db/schema");
    const [org] = await tx.select({ kind: organizations.kind }).from(organizations).where(eq(organizations.id, job.orgId!)).limit(1);
    const scope = org?.kind === "operator" ? "common" : "org";
    const [mat] = await tx
      .insert(materials)
      .values({ scope, ownerOrgId: scope === "org" ? job.orgId : null, primaryDomain: out.primaryDomain, title: out.title, tags: [out.primaryDomain] })
      .returning({ id: materials.id });
    const [ver] = await tx
      .insert(materialVersions)
      .values({
        materialId: mat.id,
        versionNo: 1,
        status: "draft",
        revisionClass: "initial",
        summary: out.summary,
        learningObjectives: out.learningObjectives,
        sourceDocumentIds: sourceIds,
        aiGenerationJobId: job.id,
        createdByUserId: job.createdByUserId,
        changeNote: model.startsWith("fake:")
          ? "開発用の擬似生成。Claude による生成ではありません。"
          : model.includes("の記録を再生")
            ? `記録済みの Claude の出力の再生（${model}）による下書き。医療者の監修前。`
            : `Claude（${model}）による下書き。医療者の監修前。`,
        mustCover,
      })
      .returning({ id: materialVersions.id });
    await tx.insert(materialSlides).values(
      out.slides.map((s, i) => ({ materialVersionId: ver.id, seq: i + 1, title: s.title, proposition: s.proposition, bodyMd: s.body, detailMd: s.detail || null, voiceText: s.body, sourceRefs: s.sourceRefs })),
    );
    await tx.insert(quizQuestions).values(
      out.questions.map((q, i) => ({
        materialVersionId: ver.id,
        seq: i + 1,
        stem: q.stem,
        options: q.options as [string, string, string],
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        relatedSlideSeq: q.relatedSlide,
        sourceRefs: q.sourceRefs,
      })),
    );
    await tx.update(sourceDocuments).set({ lastUsedAt: new Date() }).where(inArray(sourceDocuments.id, sourceIds));
    return ver.id;
  });
}

/** 失敗したジョブの手動再試行（同じ入力で queued に戻す） */
export async function retryJob(p: Principal, jobId: string, db: Db = getDb()) {
  const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, jobId)).limit(1);
  if (!job) throw notFound("JOB_NOT_FOUND");
  await requireStudioMembership(p, job.orgId);
  if (job.status !== "failed") throw conflict("JOB_NOT_FAILED");
  await assertAiAllowedForSources(job.sourceDocumentIds, job.orgId!, db);
  const attempt = job.attempt + 1;
  await db
    .update(aiGenerationJobs)
    .set({ status: "queued", progress: "再試行を待っています", attempt, maxAttempts: Math.max(job.maxAttempts, attempt), errorCode: null, errorMessage: null, finishedAt: null, nextAttemptAt: null, generator: claudeMode() ?? job.generator })
    .where(eq(aiGenerationJobs.id, jobId));
  await audit({ actorUserId: p.userId, orgId: job.orgId, action: "ai.job.retry", resourceType: "ai_generation_job", resourceId: jobId, outcome: "ok" }, db);
  await scheduleJob(jobId, db);
  return { jobId, attempt };
}

export async function getJob(p: Principal, jobId: string, db: Db = getDb()) {
  const [job] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, jobId)).limit(1);
  if (!job) throw notFound("JOB_NOT_FOUND");
  await requireStudioMembership(p, job.orgId);
  return job;
}

export async function listJobs(p: Principal, orgId: string, db: Db = getDb()) {
  await requireStudioMembership(p, orgId);
  return db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.orgId, orgId)).orderBy(desc(aiGenerationJobs.createdAt)).limit(30);
}

export { forbidden };
