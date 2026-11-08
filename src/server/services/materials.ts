import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { materialSlides, materialVersions, materials, prescriptionTemplates, quizQuestions } from "@/server/db/schema";
import { badRequest, forbidden, notFound } from "@/server/authz/errors";
import type { ConsultationContext } from "@/server/authz/consultation";
import { audit } from "./audit";

export type MaterialListItem = {
  materialId: string;
  versionId: string;
  title: string;
  summary: string | null;
  objectives: string[];
  primaryDomain: string;
  tags: string[];
  scope: "common" | "org";
  slideCount: number;
  questionCount: number;
};

/** 組織から見える公開教材（共通 + 自組織の病院独自）。MAT-01 / T05 */
export function visibleMaterialWhere(orgId: string) {
  return or(eq(materials.scope, "common"), and(eq(materials.scope, "org"), eq(materials.ownerOrgId, orgId)));
}

export async function listVisibleMaterials(
  input: { orgId: string; q?: string; domain?: string },
  db: Db = getDb(),
): Promise<MaterialListItem[]> {
  const conds = [visibleMaterialWhere(orgId(input)), eq(materialVersions.status, "published")];
  if (input.domain) conds.push(eq(materials.primaryDomain, input.domain));
  if (input.q?.trim()) {
    const pat = `%${input.q.trim()}%`;
    conds.push(or(ilike(materials.title, pat), ilike(materialVersions.summary, pat), sql`${input.q.trim()} = ANY(${materials.tags})`)!);
  }
  const rows = await db
    .select({
      materialId: materials.id,
      versionId: materialVersions.id,
      title: materials.title,
      summary: materialVersions.summary,
      objectives: materialVersions.learningObjectives,
      primaryDomain: materials.primaryDomain,
      tags: materials.tags,
      scope: materials.scope,
      slideCount: sql<number>`(select count(*) from ${materialSlides} where ${materialSlides.materialVersionId} = ${materialVersions.id})`,
      questionCount: sql<number>`(select count(*) from ${quizQuestions} where ${quizQuestions.materialVersionId} = ${materialVersions.id})`,
    })
    .from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentPublishedVersionId))
    .where(and(...conds))
    .orderBy(asc(materials.primaryDomain), asc(materials.title));
  return rows.map((r) => ({ ...r, slideCount: Number(r.slideCount), questionCount: Number(r.questionCount) }));
}

function orgId(input: { orgId: string }) {
  return input.orgId;
}

/** 処方対象として妥当か（可視・公開中）を検証し、現在の公開版IDを返す */
export async function resolvePrescribableVersions(orgIdValue: string, materialIds: string[], db: Db = getDb()) {
  if (materialIds.length === 0) return [];
  const rows = await db
    .select({ materialId: materials.id, versionId: materials.currentPublishedVersionId, status: materialVersions.status })
    .from(materials)
    .leftJoin(materialVersions, eq(materialVersions.id, materials.currentPublishedVersionId))
    .where(and(inArray(materials.id, materialIds), visibleMaterialWhere(orgIdValue)));
  const found = new Map(rows.map((r) => [r.materialId, r]));
  for (const id of materialIds) {
    const r = found.get(id);
    if (!r) throw forbidden("MATERIAL_NOT_VISIBLE");
    if (!r.versionId || r.status !== "published") throw forbidden("MATERIAL_NOT_PUBLISHED");
  }
  return materialIds.map((id) => ({ materialId: id, versionId: found.get(id)!.versionId! }));
}

export async function listTemplates(orgIdValue: string, db: Db = getDb()) {
  const rows = await db
    .select()
    .from(prescriptionTemplates)
    .where(or(eq(prescriptionTemplates.scope, "common"), and(eq(prescriptionTemplates.scope, "org"), eq(prescriptionTemplates.ownerOrgId, orgIdValue))))
    .orderBy(asc(prescriptionTemplates.scope), asc(prescriptionTemplates.name));
  // テンプレートに含まれる教材のうち、この組織から見えて公開中のものだけを返す
  const allIds = [...new Set(rows.flatMap((r) => r.materialIds))];
  const visible = allIds.length
    ? await db
        .select({ id: materials.id, title: materials.title, primaryDomain: materials.primaryDomain })
        .from(materials)
        .innerJoin(materialVersions, eq(materialVersions.id, materials.currentPublishedVersionId))
        .where(and(inArray(materials.id, allIds), visibleMaterialWhere(orgIdValue), eq(materialVersions.status, "published")))
    : [];
  const byId = new Map(visible.map((v) => [v.id, v]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    scope: r.scope,
    materials: r.materialIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x),
  }));
}

/**
 * 医療者が自分の施設のセット（処方テンプレート）を作る。有効な一時共有の中の医療者だけ。
 * 教材はその施設から見える公開中のものに限る（見えない・未公開の教材が 1 つでもあれば作らない）。
 * 情報処方そのものの記録や採点には触れない（セットは「まとめて選ぶ」ための名前付きの一覧にすぎない）。
 */
export async function createTemplateForClinician(
  ctx: ConsultationContext,
  input: { name?: unknown; description?: unknown; materialIds?: unknown },
  db: Db = getDb(),
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 40) throw badRequest("TEMPLATE_NAME_INVALID", "セット名は 1〜40 文字で入力してください");
  const description = typeof input.description === "string" && input.description.trim() ? input.description.trim().slice(0, 120) : null;
  const ids = Array.isArray(input.materialIds) ? [...new Set(input.materialIds.filter((x): x is string => typeof x === "string"))] : [];
  if (ids.length === 0 || ids.length > 20) throw badRequest("TEMPLATE_MATERIALS_INVALID", "教材は 1〜20 件で選んでください");
  if (ids.some((x) => !/^[0-9a-f-]{36}$/i.test(x))) throw badRequest("TEMPLATE_MATERIALS_INVALID", "教材の指定が正しくありません");
  const visible = await db
    .select({ id: materials.id })
    .from(materials)
    .innerJoin(materialVersions, eq(materialVersions.id, materials.currentPublishedVersionId))
    .where(and(inArray(materials.id, ids), visibleMaterialWhere(ctx.orgId), eq(materialVersions.status, "published")));
  if (visible.length !== ids.length) throw badRequest("TEMPLATE_MATERIALS_INVALID", "この施設で使えない教材が含まれています");
  const [row] = await db
    .insert(prescriptionTemplates)
    .values({ scope: "org", ownerOrgId: ctx.orgId, name, description, materialIds: ids })
    .returning({ id: prescriptionTemplates.id });
  await audit(
    { actorUserId: ctx.clinician.userId, orgId: ctx.orgId, action: "template.create", resourceType: "prescription_template", resourceId: row.id, consultationSessionId: ctx.sessionId, outcome: "ok" },
    db,
  );
  return { id: row.id, templates: await listTemplates(ctx.orgId, db) };
}

/** 版の本文（スライド・設問）。正解は含めて返すので、患者向け API では correctIndex を落とすこと */
export async function getVersionContent(versionId: string, db: Db = getDb()) {
  const [v] = await db
    .select({
      versionId: materialVersions.id,
      materialId: materialVersions.materialId,
      versionNo: materialVersions.versionNo,
      status: materialVersions.status,
      summary: materialVersions.summary,
      learningObjectives: materialVersions.learningObjectives,
      retiredAt: materialVersions.retiredAt,
      retireReason: materialVersions.retireReason,
      title: materials.title,
      primaryDomain: materials.primaryDomain,
      currentPublishedVersionId: materials.currentPublishedVersionId,
    })
    .from(materialVersions)
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(materialVersions.id, versionId))
    .limit(1);
  if (!v) throw notFound("VERSION_NOT_FOUND");
  const slides = await db.select().from(materialSlides).where(eq(materialSlides.materialVersionId, versionId)).orderBy(asc(materialSlides.seq));
  const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.materialVersionId, versionId)).orderBy(asc(quizQuestions.seq));
  return { ...v, slides, questions };
}

export { isNull };
