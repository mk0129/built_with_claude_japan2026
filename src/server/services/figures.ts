import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { figureAssets, figurePlacements, materialVersions, materials, type FigureLabel } from "@/server/db/schema";
import { forbidden, notFound } from "@/server/authz/errors";
import { listMemberships, type Principal } from "@/server/authz/principal";
import { audit } from "./audit";

/**
 * 図解アセット（MEDICAL_FIGURE_COMPONENT.md の設計）。
 * - 患者向け: review_status = approved かつ filename あり のものだけ src を返す（サーバー側でゲート）
 * - 管理者プレビュー: 編集者・承認者に限り、状態に関わらず返す
 */

export type FigureView = {
  placementId: string;
  assetId: string;
  version: number;
  type: "medical" | "editorial";
  src: string | null;
  width: number | null;
  height: number | null;
  altText: string;
  longDescription: string | null;
  labels: FigureLabel[];
  caption: string | null;
  sourceNote: string | null;
  reviewStatus: "draft" | "pending_review" | "approved" | "rejected";
  reviewedAt: Date | null;
  learningObjective: string | null;
  sourceRefs: { sourceId: string; section?: string; quote?: string }[];
  reviewNote: string | null;
};

function toSrc(a: { type: "medical" | "editorial"; filename: string | null }): string | null {
  return a.filename ? `/assets/${a.type}/${a.filename}` : null;
}

async function loadPlacements(versionId: string, db: Db) {
  return db
    .select({ p: figurePlacements, a: figureAssets })
    .from(figurePlacements)
    .innerJoin(figureAssets, eq(figureAssets.assetId, figurePlacements.assetId))
    .where(eq(figurePlacements.materialVersionId, versionId))
    .orderBy(asc(figurePlacements.slideSeq), asc(figurePlacements.displayOrder));
}

/** 患者向け: 承認済みで画像ファイルがある図解だけ。未承認は URL も返さない（配信ゲート） */
export async function listApprovedFiguresForVersion(versionId: string, db: Db = getDb()): Promise<Record<number, FigureView[]>> {
  const rows = await loadPlacements(versionId, db);
  const out: Record<number, FigureView[]> = {};
  for (const { p, a } of rows) {
    if (a.reviewStatus !== "approved" || !a.filename) continue;
    (out[p.slideSeq] ??= []).push({
      placementId: p.id,
      assetId: a.assetId,
      version: a.version,
      type: a.type,
      src: toSrc(a),
      width: a.width,
      height: a.height,
      altText: a.altText,
      longDescription: a.longDescription,
      labels: p.labels,
      caption: p.caption,
      sourceNote: p.sourceNote,
      reviewStatus: a.reviewStatus,
      reviewedAt: a.reviewedAt,
      learningObjective: a.learningObjective,
      sourceRefs: a.sourceRefs,
      reviewNote: a.reviewNote,
    });
  }
  return out;
}

/** 教材の版を編集・監修できるか（病院独自: 所有組織、共通: 運営組織）。editor または approver */
export async function requireMaterialRole(
  principal: Principal,
  versionId: string,
  db: Db = getDb(),
): Promise<{ canApprove: boolean; orgId: string | null; scope: "common" | "org" }> {
  if (principal.kind !== "staff") throw forbidden("STAFF_ONLY");
  const [v] = await db
    .select({ scope: materials.scope, ownerOrgId: materials.ownerOrgId })
    .from(materialVersions)
    .innerJoin(materials, eq(materials.id, materialVersions.materialId))
    .where(eq(materialVersions.id, versionId))
    .limit(1);
  if (!v) throw notFound("VERSION_NOT_FOUND");
  const memberships = await listMemberships(principal.userId);
  const m = v.scope === "org" ? memberships.find((x) => x.orgId === v.ownerOrgId) : memberships.find((x) => x.orgKind === "operator");
  if (!m) throw forbidden("NOT_MATERIAL_ORG_MEMBER");
  const isEditor = m.roles.includes("material_editor");
  const isApprover = m.roles.includes("material_approver");
  if (!isEditor && !isApprover) throw forbidden("MATERIAL_ROLE_REQUIRED");
  return { canApprove: isApprover, orgId: m.orgId, scope: v.scope };
}

/** 管理者プレビュー: 状態に関わらず全配置を返す（呼び出し側で requireMaterialRole 済みであること） */
export async function listAllFiguresForVersion(versionId: string, db: Db = getDb()): Promise<Record<number, FigureView[]>> {
  const rows = await loadPlacements(versionId, db);
  const out: Record<number, FigureView[]> = {};
  for (const { p, a } of rows) {
    (out[p.slideSeq] ??= []).push({
      placementId: p.id,
      assetId: a.assetId,
      version: a.version,
      type: a.type,
      src: toSrc(a),
      width: a.width,
      height: a.height,
      altText: a.altText,
      longDescription: a.longDescription,
      labels: p.labels,
      caption: p.caption,
      sourceNote: p.sourceNote,
      reviewStatus: a.reviewStatus,
      reviewedAt: a.reviewedAt,
      learningObjective: a.learningObjective,
      sourceRefs: a.sourceRefs,
      reviewNote: a.reviewNote,
    });
  }
  return out;
}

/** 監修ステータスの変更（承認者のみ）。画像ファイルが無いものは approved にできない */
export async function reviewFigure(
  principal: Principal,
  assetId: string,
  status: "approved" | "rejected" | "pending_review",
  note: string | null,
  db: Db = getDb(),
) {
  const [a] = await db.select().from(figureAssets).where(eq(figureAssets.assetId, assetId)).limit(1);
  if (!a) throw notFound("ASSET_NOT_FOUND");
  // 配置先の版のいずれかで承認権限が必要
  const placements = await db.select({ versionId: figurePlacements.materialVersionId }).from(figurePlacements).where(eq(figurePlacements.assetId, assetId));
  if (placements.length === 0) throw forbidden("ASSET_NOT_PLACED");
  let canApprove = false;
  for (const p of placements) {
    const r = await requireMaterialRole(principal, p.versionId, db).catch(() => null);
    if (r?.canApprove) canApprove = true;
  }
  if (!canApprove) throw forbidden("APPROVER_REQUIRED");
  if (status === "approved" && !a.filename) throw forbidden("ASSET_FILE_MISSING");
  await db
    .update(figureAssets)
    .set({ reviewStatus: status, reviewerUserId: principal.userId, reviewedAt: new Date(), reviewNote: note, updatedAt: new Date() })
    .where(eq(figureAssets.assetId, assetId));
  await audit({ actorUserId: principal.userId, action: `figure.${status}`, resourceType: "figure_asset", resourceId: assetId, outcome: "ok" }, db);
  return { assetId, reviewStatus: status };
}

/** 承認済みで画像があるアセット（挿絵など）。無ければ null */
export async function getApprovedAsset(assetId: string, db: Db = getDb()) {
  const [a] = await db.select().from(figureAssets).where(eq(figureAssets.assetId, assetId)).limit(1);
  if (!a || a.reviewStatus !== "approved" || !a.filename) return null;
  return { assetId: a.assetId, src: toSrc(a), altText: a.altText, width: a.width, height: a.height };
}

export async function listAssets(assetIds: string[], db: Db = getDb()) {
  if (assetIds.length === 0) return [];
  return db.select().from(figureAssets).where(inArray(figureAssets.assetId, assetIds));
}

export { and };
