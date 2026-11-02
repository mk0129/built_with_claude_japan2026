import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { materialSlides, materialVersions, materials, organizations, quizQuestions, sourceDocuments, sourcePermissions, user, type SourceRef } from "@/server/db/schema";
import { badRequest, conflict, forbidden, notFound } from "@/server/authz/errors";
import { listMemberships, type Principal } from "@/server/authz/principal";
import { audit } from "./audit";
import { validateMaterial } from "./ai-generation";

/**
 * 教材の編集・承認・公開（C）。
 * - 編集: 所有組織（共通は運営）の教材編集者・承認者
 * - 承認: 共通教材は運営の承認者かつ作成者以外（T06）。病院独自教材は所有組織の承認者（自己承認可、T07）
 * - 公開: 承認と同時に published にし、ライブラリ（共通 / 病院独自）に登録。未承認は処方候補に出ない（T09）
 */

async function loadVersion(versionId: string, db: Db) {
  const [row] = await db
    .select({ v: materialVersions, m: materials })
    .from(materialVersions)
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(materialVersions.id, versionId))
    .limit(1);
  if (!row) throw notFound("VERSION_NOT_FOUND");
  return row;
}

async function roleFor(p: Principal, m: typeof materials.$inferSelect) {
  if (p.kind !== "staff") throw forbidden("STAFF_ONLY");
  const ms = await listMemberships(p.userId);
  const mem = m.scope === "org" ? ms.find((x) => x.orgId === m.ownerOrgId) : ms.find((x) => x.orgKind === "operator");
  if (!mem) throw forbidden("NOT_MATERIAL_ORG_MEMBER");
  const canEdit = mem.roles.includes("material_editor") || mem.roles.includes("material_approver");
  if (!canEdit) throw forbidden("MATERIAL_ROLE_REQUIRED");
  return { membership: mem, canApprove: mem.roles.includes("material_approver") };
}

export async function getDraftForEditor(p: Principal, versionId: string, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  const role = await roleFor(p, m);
  const slides = await db.select().from(materialSlides).where(eq(materialSlides.materialVersionId, versionId)).orderBy(asc(materialSlides.seq));
  const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.materialVersionId, versionId)).orderBy(asc(quizQuestions.seq));
  const sources = v.sourceDocumentIds.length
    ? await db
        .select({ id: sourceDocuments.id, title: sourceDocuments.title, extractedText: sourceDocuments.extractedText, extractionWarning: sourceDocuments.extractionWarning, perm: sourcePermissions })
        .from(sourceDocuments)
        .leftJoin(sourcePermissions, eq(sourcePermissions.sourceId, sourceDocuments.id))
        .where(inArray(sourceDocuments.id, v.sourceDocumentIds))
    : [];
  const [creator] = await db.select({ name: user.name }).from(user).where(eq(user.id, v.createdByUserId)).limit(1);
  const check = validateMaterial(
    {
      title: m.title,
      summary: v.summary ?? "",
      primaryDomain: m.primaryDomain as never,
      learningObjectives: v.learningObjectives,
      slides: slides.map((s) => ({ title: s.title, proposition: s.proposition ?? "", body: s.bodyMd, detail: s.detailMd ?? "", sourceRefs: s.sourceRefs as { sourceId: string; section: string; quote: string }[] })),
      questions: questions.map((q) => ({ stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlide: q.relatedSlideSeq ?? 1, sourceRefs: q.sourceRefs as { sourceId: string; section: string; quote: string }[] })),
      notCoveredBySource: [],
    },
    sources,
  );
  const approvalBlock = approvalBlocker(p, m, v, role.canApprove, sources.map((s) => s.perm));
  return { version: v, material: m, slides, questions, sources, creatorName: creator?.name ?? "", role: { canEdit: true, canApprove: role.canApprove }, check, approvalBlock };
}

function approvalBlocker(
  p: Principal,
  m: typeof materials.$inferSelect,
  v: typeof materialVersions.$inferSelect,
  canApprove: boolean,
  perms: (typeof sourcePermissions.$inferSelect | null)[],
): string | null {
  if (!canApprove) return "承認権限がありません";
  if (v.status !== "in_review") return "承認待ちに提出されていません";
  if (m.scope === "common" && v.createdByUserId === p.userId) return "共通教材は作成者以外の承認者が承認する必要があります";
  if (perms.some((x) => !x?.allowPublish)) return "原資料に患者向け公開の許可がありません";
  if (m.scope === "common" && perms.some((x) => !x?.allowShare)) return "共通教材にするには原資料の他施設共有の許可が必要です";
  return null;
}

export type DraftUpdate = {
  title: string;
  summary: string;
  primaryDomain: string;
  learningObjectives: string[];
  slides: { title: string; proposition: string; body: string; detail: string; sourceRefs: SourceRef[] }[];
  questions: { stem: string; options: [string, string, string]; correctIndex: number; explanation: string; relatedSlide: number; sourceRefs: SourceRef[] }[];
};

/** 下書きの編集（draft のみ。in_review は差し戻してから） */
export async function updateDraft(p: Principal, versionId: string, u: DraftUpdate, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  await roleFor(p, m);
  if (v.status !== "draft") throw conflict("NOT_DRAFT");
  if (u.slides.length < 3 || u.slides.length > 5) throw badRequest("SLIDE_COUNT", "画面は 3〜5 にしてください");
  if (u.questions.length < 2 || u.questions.length > 5) throw badRequest("QUESTION_COUNT", "問題は 2〜5 問にしてください");
  for (const q of u.questions) if (q.correctIndex < 0 || q.correctIndex > 2 || q.options.some((o) => !o.trim())) throw badRequest("QUESTION_INVALID");
  await db.transaction(async (tx) => {
    await tx.update(materials).set({ title: u.title, primaryDomain: u.primaryDomain, tags: [u.primaryDomain] }).where(eq(materials.id, m.id));
    await tx.update(materialVersions).set({ summary: u.summary, learningObjectives: u.learningObjectives }).where(eq(materialVersions.id, versionId));
    await tx.delete(materialSlides).where(eq(materialSlides.materialVersionId, versionId));
    await tx.delete(quizQuestions).where(eq(quizQuestions.materialVersionId, versionId));
    await tx.insert(materialSlides).values(
      u.slides.map((s, i) => ({ materialVersionId: versionId, seq: i + 1, title: s.title, proposition: s.proposition || null, bodyMd: s.body, detailMd: s.detail || null, voiceText: s.body, sourceRefs: s.sourceRefs })),
    );
    await tx.insert(quizQuestions).values(
      u.questions.map((q, i) => ({ materialVersionId: versionId, seq: i + 1, stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlideSeq: q.relatedSlide, sourceRefs: q.sourceRefs })),
    );
  });
  await audit({ actorUserId: p.userId, action: "material.draft.update", resourceType: "material_version", resourceId: versionId, outcome: "ok" }, db);
}

export async function submitForReview(p: Principal, versionId: string, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  await roleFor(p, m);
  if (v.status !== "draft") throw conflict("NOT_DRAFT");
  await db.update(materialVersions).set({ status: "in_review", submittedByUserId: p.userId, submittedAt: new Date(), reviewComment: null }).where(eq(materialVersions.id, versionId));
  await audit({ actorUserId: p.userId, action: "material.submit", resourceType: "material_version", resourceId: versionId, outcome: "ok" }, db);
}

/** 差し戻し（承認者）。draft に戻してコメントを残す */
export async function returnToDraft(p: Principal, versionId: string, comment: string, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  const role = await roleFor(p, m);
  if (!role.canApprove) throw forbidden("APPROVER_REQUIRED");
  if (v.status !== "in_review") throw conflict("NOT_IN_REVIEW");
  await db.update(materialVersions).set({ status: "draft", reviewComment: comment || null }).where(eq(materialVersions.id, versionId));
  await audit({ actorUserId: p.userId, action: "material.return", resourceType: "material_version", resourceId: versionId, outcome: "ok" }, db);
}

/** 承認して公開（ライブラリ登録）。共通は別人承認、病院独自は自己承認可 */
export async function approveAndPublish(p: Principal, versionId: string, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  const role = await roleFor(p, m);
  const perms = v.sourceDocumentIds.length ? await db.select().from(sourcePermissions).where(inArray(sourcePermissions.sourceId, v.sourceDocumentIds)) : [];
  const block = approvalBlocker(p, m, v, role.canApprove, v.sourceDocumentIds.map((id) => perms.find((x) => x.sourceId === id) ?? null));
  if (block) {
    await audit({ actorUserId: p.userId, action: "material.approve", resourceType: "material_version", resourceId: versionId, outcome: "denied" }, db);
    if (block.includes("作成者以外")) throw forbidden("SELF_APPROVAL_NOT_ALLOWED", block);
    if (block.includes("承認権限")) throw forbidden("APPROVER_REQUIRED", block);
    if (block.includes("提出されていません")) throw conflict("NOT_IN_REVIEW", block);
    throw forbidden("SOURCE_PERMISSION_MISSING", block);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    // 既存の公開版があれば retire（superseded）にする
    if (m.currentPublishedVersionId && m.currentPublishedVersionId !== versionId) {
      await tx.update(materialVersions).set({ status: "retired", retiredAt: now, retireReason: "superseded" }).where(eq(materialVersions.id, m.currentPublishedVersionId));
    }
    await tx.update(materialVersions).set({ status: "published", approvedByUserId: p.userId, approvedAt: now, publishedAt: now }).where(eq(materialVersions.id, versionId));
    await tx.update(materials).set({ currentPublishedVersionId: versionId }).where(eq(materials.id, m.id));
  });
  await audit({ actorUserId: p.userId, orgId: role.membership.orgId, action: "material.approve_publish", resourceType: "material_version", resourceId: versionId, outcome: "ok" }, db);
  return { versionId, scope: m.scope };
}

/** 公開停止（承認者）。新規処方不可になる（既存の学習履歴は残る） */
export async function retireVersion(p: Principal, versionId: string, db: Db = getDb()) {
  const { v, m } = await loadVersion(versionId, db);
  const role = await roleFor(p, m);
  if (!role.canApprove) throw forbidden("APPROVER_REQUIRED");
  if (v.status !== "published") throw conflict("NOT_PUBLISHED");
  await db.transaction(async (tx) => {
    await tx.update(materialVersions).set({ status: "retired", retiredAt: new Date(), retireReason: "other" }).where(eq(materialVersions.id, versionId));
    if (m.currentPublishedVersionId === versionId) await tx.update(materials).set({ currentPublishedVersionId: null }).where(eq(materials.id, m.id));
  });
  await audit({ actorUserId: p.userId, action: "material.retire", resourceType: "material_version", resourceId: versionId, outcome: "ok" }, db);
}

/** 教材制作の一覧（自組織の下書き・承認待ち・公開済み。共通は運営のみ） */
export async function listStudioMaterials(p: Principal, orgId: string, db: Db = getDb()) {
  const ms = await listMemberships(p.userId);
  const mem = ms.find((x) => x.orgId === orgId);
  if (!mem || !(mem.roles.includes("material_editor") || mem.roles.includes("material_approver"))) throw forbidden("MATERIAL_ROLE_REQUIRED");
  const where = mem.orgKind === "operator" ? eq(materials.scope, "common") : and(eq(materials.scope, "org"), eq(materials.ownerOrgId, orgId));
  const rows = await db
    .select({
      versionId: materialVersions.id,
      materialId: materials.id,
      title: materials.title,
      scope: materials.scope,
      status: materialVersions.status,
      versionNo: materialVersions.versionNo,
      createdAt: materialVersions.createdAt,
      createdBy: user.name,
      aiJobId: materialVersions.aiGenerationJobId,
    })
    .from(materialVersions)
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .innerJoin(user, eq(user.id, materialVersions.createdByUserId))
    .where(where)
    .orderBy(desc(materialVersions.createdAt));
  return rows;
}

export { or, isNull, organizations };
