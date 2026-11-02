import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { organizations, sourceDocuments, sourcePermissions } from "@/server/db/schema";
import { badRequest, forbidden, notFound } from "@/server/authz/errors";
import { listMemberships, type MemberRole, type OrgMembership, type Principal } from "@/server/authz/principal";
import { audit } from "./audit";
import { detectKind, detectPii, extractText } from "./extract";
import { putObject } from "./storage";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** 教材制作（編集者・承認者）の所属を返す。orgId 指定時はその所属に限定 */
export async function requireStudioMembership(p: Principal, orgId?: string | null): Promise<OrgMembership> {
  if (p.kind !== "staff") throw forbidden("STAFF_ONLY");
  const ms = (await listMemberships(p.userId)).filter((m) => m.roles.some((r: MemberRole) => r === "material_editor" || r === "material_approver"));
  const m = orgId ? ms.find((x) => x.orgId === orgId) : ms[0];
  if (!m) throw forbidden("MATERIAL_ROLE_REQUIRED");
  return m;
}

export type PermissionInput = {
  allowStore: boolean;
  allowAi: boolean;
  allowDerive: boolean;
  allowPublish: boolean;
  allowShare: boolean;
  rightsHolder: string;
  evidenceNote: string;
  restrictions?: string | null;
  expiresAt?: string | null;
};

/** 原資料のアップロード（非公開ストレージ）＋テキスト抽出＋個人情報の簡易検出＋許諾の登録 */
export async function uploadSource(
  p: Principal,
  input: { orgId?: string | null; title: string; filename: string; mime: string; body: Buffer; piiAttestedNone: boolean; permissions: PermissionInput },
  db: Db = getDb(),
) {
  const m = await requireStudioMembership(p, input.orgId);
  if (!m.roles.includes("material_editor") && !m.roles.includes("material_approver")) throw forbidden("MATERIAL_ROLE_REQUIRED");
  const kind = detectKind(input.filename, input.mime);
  if (!kind) throw badRequest("UNSUPPORTED_FILE", "PDF・Word（.docx）・PowerPoint（.pptx）・テキストに対応しています");
  if (input.body.length === 0 || input.body.length > MAX_UPLOAD_BYTES) throw badRequest("FILE_SIZE", "15MB 以下のファイルにしてください");
  if (!input.permissions.allowStore) throw badRequest("STORE_NOT_ALLOWED", "アプリへの保存が許可されていない資料は登録できません");
  if (!input.permissions.rightsHolder.trim() || !input.permissions.evidenceNote.trim()) throw badRequest("PERMISSION_EVIDENCE_REQUIRED", "許諾元と確認の根拠を入力してください");

  const extraction = await extractText(input.body, kind);
  const piiFlags = detectPii(extraction.text);
  const sha256 = createHash("sha256").update(input.body).digest("hex");
  const id = randomUUID();
  const storageKey = `${m.orgId}/${id}/${input.filename.replace(/[^\w.\-]/g, "_")}`;
  await putObject(storageKey, input.body, input.mime || "application/octet-stream");

  const warnings = [...extraction.warnings];
  if (piiFlags.length) warnings.unshift(`患者個人情報らしき記載を検出しました（${piiFlags.join("、")}）。MVP では AI 処理しません。`);
  if (!input.piiAttestedNone) warnings.unshift("「患者個人情報を含まない」ことが確認されていません。AI 処理はできません。");

  await db.transaction(async (tx) => {
    await tx.insert(sourceDocuments).values({
      id,
      ownerOrgId: m.orgId,
      title: input.title.trim() || input.filename,
      storageKey,
      mime: input.mime || kind,
      sizeBytes: input.body.length,
      sha256,
      textSource: extraction.textSource,
      extractedText: extraction.text,
      extractionWarning: warnings.join("\n") || null,
      extractionMeta: extraction.meta,
      piiAttestedNone: input.piiAttestedNone,
      piiFlags,
      uploadedByUserId: p.userId,
    });
    await tx.insert(sourcePermissions).values({
      sourceId: id,
      allowStore: input.permissions.allowStore,
      allowAi: input.permissions.allowAi,
      allowDerive: input.permissions.allowDerive,
      allowPublish: input.permissions.allowPublish,
      allowShare: input.permissions.allowShare,
      rightsHolder: input.permissions.rightsHolder.trim(),
      evidenceNote: input.permissions.evidenceNote.trim(),
      restrictions: input.permissions.restrictions ?? null,
      checkedByUserId: p.userId,
      checkedAt: new Date(),
      expiresAt: input.permissions.expiresAt ? new Date(input.permissions.expiresAt) : null,
    });
  });
  await audit({ actorUserId: p.userId, orgId: m.orgId, action: "source.upload", resourceType: "source_document", resourceId: id, outcome: "ok" }, db);
  return { sourceId: id, warnings, piiFlags, charCount: extraction.meta.charCount };
}

/** 資料へのアクセス: 所有組織の編集者・承認者のみ（T05） */
export async function requireSourceAccess(p: Principal, sourceId: string, db: Db = getDb()) {
  const [s] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, sourceId)).limit(1);
  if (!s) throw notFound("SOURCE_NOT_FOUND");
  const m = await requireStudioMembership(p, s.ownerOrgId);
  return { source: s, membership: m };
}

export async function getSourceDetail(p: Principal, sourceId: string, db: Db = getDb()) {
  const { source, membership } = await requireSourceAccess(p, sourceId, db);
  const [perm] = await db.select().from(sourcePermissions).where(eq(sourcePermissions.sourceId, sourceId)).limit(1);
  return { source, permission: perm ?? null, membership, aiCheck: checkAiAllowed(source, perm ?? null) };
}

export async function listSources(p: Principal, orgId: string, db: Db = getDb()) {
  await requireStudioMembership(p, orgId);
  const rows = await db
    .select({ s: sourceDocuments, perm: sourcePermissions, orgName: organizations.name })
    .from(sourceDocuments)
    .leftJoin(sourcePermissions, eq(sourcePermissions.sourceId, sourceDocuments.id))
    .innerJoin(organizations, eq(organizations.id, sourceDocuments.ownerOrgId))
    .where(eq(sourceDocuments.ownerOrgId, orgId))
    .orderBy(desc(sourceDocuments.createdAt));
  return rows.map((r) => ({ ...r.s, extractedText: undefined, permission: r.perm, orgName: r.orgName, aiCheck: checkAiAllowed(r.s, r.perm) }));
}

type SourceRow = typeof sourceDocuments.$inferSelect;
type PermRow = typeof sourcePermissions.$inferSelect;

/** Claude へ送ってよいかの判定（サーバー側。GOV-03 / T08） */
export function checkAiAllowed(s: SourceRow, perm: PermRow | null): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!perm) reasons.push("許諾情報が登録されていません");
  else {
    if (!perm.allowAi) reasons.push("外部 AI（Claude）への送信が許可されていません");
    if (!perm.allowDerive) reasons.push("改変・派生教材の作成が許可されていません");
    if (!perm.checkedAt || !perm.checkedByUserId) reasons.push("許諾の確認者・確認日が記録されていません");
    if (perm.expiresAt && perm.expiresAt.getTime() < Date.now()) reasons.push("許諾の期限が切れています");
  }
  if (!s.piiAttestedNone) reasons.push("患者個人情報を含まないことが確認されていません");
  if (s.piiFlags.length) reasons.push(`患者個人情報らしき記載があります（${s.piiFlags.join("、")}）`);
  if (s.status !== "active") reasons.push("資料が有効ではありません");
  if (!s.extractedText || s.textSource === "none") reasons.push("本文のテキストが取り出せていません");
  return { ok: reasons.length === 0, reasons };
}

/** Claude 送信直前のサーバー側チェック。1 件でも不可なら送信しない */
export async function assertAiAllowedForSources(sourceIds: string[], orgId: string, db: Db = getDb()) {
  if (sourceIds.length === 0) throw badRequest("NO_SOURCES");
  const rows = await db
    .select({ s: sourceDocuments, perm: sourcePermissions })
    .from(sourceDocuments)
    .leftJoin(sourcePermissions, eq(sourcePermissions.sourceId, sourceDocuments.id))
    .where(inArray(sourceDocuments.id, sourceIds));
  if (rows.length !== sourceIds.length) throw notFound("SOURCE_NOT_FOUND");
  for (const r of rows) {
    if (r.s.ownerOrgId !== orgId) throw forbidden("SOURCE_OTHER_ORG");
    const c = checkAiAllowed(r.s, r.perm);
    if (!c.ok) throw forbidden("AI_NOT_PERMITTED", `${r.s.title}: ${c.reasons.join(" / ")}`);
  }
  return rows.map((r) => r.s);
}

/** 許諾の更新（確認者・確認日時を記録し直す） */
export async function updatePermissions(p: Principal, sourceId: string, perm: PermissionInput & { piiAttestedNone?: boolean }, db: Db = getDb()) {
  const { source, membership } = await requireSourceAccess(p, sourceId, db);
  if (!perm.rightsHolder.trim() || !perm.evidenceNote.trim()) throw badRequest("PERMISSION_EVIDENCE_REQUIRED");
  await db
    .update(sourcePermissions)
    .set({
      allowStore: perm.allowStore,
      allowAi: perm.allowAi,
      allowDerive: perm.allowDerive,
      allowPublish: perm.allowPublish,
      allowShare: perm.allowShare,
      rightsHolder: perm.rightsHolder.trim(),
      evidenceNote: perm.evidenceNote.trim(),
      restrictions: perm.restrictions ?? null,
      expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
      checkedByUserId: p.userId,
      checkedAt: new Date(),
    })
    .where(eq(sourcePermissions.sourceId, sourceId));
  if (perm.piiAttestedNone !== undefined) await db.update(sourceDocuments).set({ piiAttestedNone: perm.piiAttestedNone }).where(eq(sourceDocuments.id, sourceId));
  await audit({ actorUserId: p.userId, orgId: membership.orgId, action: "source.permissions.update", resourceType: "source_document", resourceId: source.id, outcome: "ok" }, db);
}

export { and };
