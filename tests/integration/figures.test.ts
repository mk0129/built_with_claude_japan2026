import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { figureAssets, materials } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { getLearningView } from "@/server/services/learning";
import { listAllFiguresForVersion, listApprovedFiguresForVersion, requireMaterialRole, reviewFigure } from "@/server/services/figures";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { prescribe } from "@/server/services/prescription";
import { endConsultation } from "@/server/services/consultation";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
const uid = (email: string) => seeded.users.get(email)!;
const principal = (email: string, name = "x") => ({ userId: uid(email), kind: "staff" as const, name, email });

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).status).toBe(status);
    if (code) expect((e as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected AppError ${status}`);
}

beforeAll(async () => {
  seeded = await setupDb();
});

describe("図解の配信ゲート（未承認は患者に出ない）", () => {
  it("患者の学習ビューには承認済みで画像ありの図解だけが含まれ、未承認は URL も返らない", async () => {
    const materialId = seeded.materials.get("乳がんの診断と病期の考え方")!;
    const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
    const versionId = m.v!;
    // 配置はあるが pending_review（MED-001）
    const all = await listAllFiguresForVersion(versionId);
    expect(all[1]?.map((f) => f.assetId)).toEqual(["MED-001-01", "MED-001-02", "MED-001-03"]);
    expect(all[1][0].reviewStatus).toBe("pending_review");
    const approved = await listApprovedFiguresForVersion(versionId);
    expect(approved[1] ?? []).toHaveLength(0);

    // 患者に処方して学習ビューを取得 → figures は空、命題と補足はある
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const ctx = await requireActiveConsultation(await loginHeaders(DR_YAMADA), sessionId);
    await prescribe(ctx, [materialId]);
    const view = await getLearningView(uid(PATIENT_B), versionId);
    expect(view.slides[0].figures).toHaveLength(0);
    expect(view.slides[0].proposition).toContain("病期");
    expect(view.slides[0].detailMd).toContain("バイオマーカー");
    expect(JSON.stringify(view)).not.toContain("MED-001");
    await endConsultation(sessionId, uid(PATIENT_B));

    // 画像ファイルが無いままでは承認できない。ファイルを登録すると承認でき、患者ビューに現れる
    const approver = principal("op.approver@example.com");
    // 納品済み（private_assets）でも pending_review のまま。管理者用 URL は認証付きルート
    const pending = (await listAllFiguresForVersion(versionId))[1].find((f) => f.assetId === "MED-001-02")!;
    expect(pending.reviewStatus).toBe("pending_review");
    expect(pending.src).toBe("/api/v1/admin/figures/MED-001-02/image");
    // 画像ファイルが無ければ承認できない
    await getDb().update(figureAssets).set({ filename: null }).where(eq(figureAssets.assetId, "MED-001-02"));
    await expectAppError(reviewFigure(approver, "MED-001-02", "approved", null), 403, "ASSET_FILE_MISSING");
    await getDb().update(figureAssets).set({ filename: "med_001_02_regional_nodes.png", width: 900, height: 900 }).where(eq(figureAssets.assetId, "MED-001-02"));
    await reviewFigure(approver, "MED-001-02", "approved", "デモ用に承認");
    const after = await getLearningView(uid(PATIENT_B), versionId);
    expect(after.slides[0].figures).toHaveLength(1);
    expect(after.slides[0].figures[0].src).toBe("/assets/medical/med_001_02_regional_nodes.png");
    expect(after.slides[0].figures[0].labels.map((l) => l.text)).toContain("わきの下のリンパ節");
    // 差し戻すと再び非表示
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${process.cwd()}/public/assets/medical/med_001_02_regional_nodes.png`)).toBe(true);
    await reviewFigure(approver, "MED-001-02", "rejected", "位置関係を要確認");
    expect((await getLearningView(uid(PATIENT_B), versionId)).slides[0].figures).toHaveLength(0);
    // 差し戻しで public から削除される
    expect(existsSync(`${process.cwd()}/public/assets/medical/med_001_02_regional_nodes.png`)).toBe(false);
  });

  it("共通教材の監修プレビューは運営の編集者・承認者のみ。病院の一般医療者や編集者は不可。承認は承認者のみ", async () => {
    const materialId = seeded.materials.get("乳がんの診断と病期の考え方")!;
    const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
    const versionId = m.v!;
    await expectAppError(requireMaterialRole(principal("dr.yamada@example.com"), versionId), 403, "NOT_MATERIAL_ORG_MEMBER");
    await expectAppError(requireMaterialRole(principal("nurse.tanaka@example.com"), versionId), 403, "NOT_MATERIAL_ORG_MEMBER");
    const editor = await requireMaterialRole(principal("op.editor@example.com"), versionId);
    expect(editor.canApprove).toBe(false);
    await expectAppError(reviewFigure(principal("op.editor@example.com"), "MED-001-01", "pending_review", null), 403, "APPROVER_REQUIRED");
    const approver = await requireMaterialRole(principal("op.approver@example.com"), versionId);
    expect(approver.canApprove).toBe(true);
    // 患者は不可
    await expectAppError(requireMaterialRole({ userId: uid(PATIENT_B), kind: "patient", name: "p", email: PATIENT_B }, versionId), 403, "STAFF_ONLY");
  });

  it("病院独自教材は所有組織の編集者・承認者のみ", async () => {
    const materialId = seeded.materials.get("さくら総合病院 外来化学療法室のご案内")!;
    const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
    const versionId = m.v!;
    const editor = await requireMaterialRole(principal("nurse.tanaka@example.com"), versionId);
    expect(editor.canApprove).toBe(false);
    const approver = await requireMaterialRole(principal("approver.sato@example.com"), versionId);
    expect(approver.canApprove).toBe(true);
    await expectAppError(requireMaterialRole(principal("op.approver@example.com"), versionId), 403, "NOT_MATERIAL_ORG_MEMBER");
    await expectAppError(requireMaterialRole(principal("dr.kobayashi@example.com"), versionId), 403, "NOT_MATERIAL_ORG_MEMBER");
  });
});
