import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { seed } from "@/server/db/seed";
import { figureAssets, figurePlacements, materials } from "@/server/db/schema";
import { SEED_FIGURES } from "@/server/db/seed-figures";
import { getLearningView } from "@/server/services/learning";
import { listApprovedFiguresForVersion } from "@/server/services/figures";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { prescribe } from "@/server/services/prescription";
import { endConsultation } from "@/server/services/consultation";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
beforeAll(async () => {
  seeded = await setupDb();
});

/** 2026-11-08 の本文挿絵（editorial・納品済み・配置あり）。生活場面の装飾で、医学監修の対象外 */
const EDITORIAL = SEED_FIGURES.filter((f) => f.type === "editorial" && f.delivered && f.placements.length > 0);

async function versionOf(title: string) {
  const materialId = seeded.materials.get(title)!;
  const [m] = await getDb().select({ v: materials.currentPublishedVersionId }).from(materials).where(eq(materials.id, materialId));
  return { materialId, versionId: m.v! };
}

describe("教材イラスト（本文挿絵 29 点）の登録", () => {
  it("29 点が納品済みで seed により approved になり、配置が教材・ページに 1 件ずつある", async () => {
    expect(EDITORIAL).toHaveLength(29);
    const db = getDb();
    for (const f of EDITORIAL) {
      const [a] = await db.select().from(figureAssets).where(eq(figureAssets.assetId, f.assetId));
      expect(a?.reviewStatus, f.assetId).toBe("approved");
      expect(a?.filename, f.assetId).toBe(f.delivered!.filename);
      expect([a?.width, a?.height], f.assetId).toEqual([1200, 900]);
      const placements = await db.select().from(figurePlacements).where(eq(figurePlacements.assetId, f.assetId));
      expect(placements, f.assetId).toHaveLength(1);
      expect(placements[0].slideSeq).toBe(f.placements[0].slideSeq);
      const { versionId } = await versionOf(f.placements[0].materialTitle);
      expect(placements[0].materialVersionId, `${f.assetId} の配置先の教材`).toBe(versionId);
    }
  });

  it("seed を再実行しても二重登録にならない（既存の DB に初期化なしで反映できる）", async () => {
    const db = getDb();
    const before = (await db.select({ id: figurePlacements.id }).from(figurePlacements)).length;
    await seed(db);
    const after = (await db.select({ id: figurePlacements.id }).from(figurePlacements)).length;
    expect(after).toBe(before);
    for (const f of EDITORIAL) {
      expect(await db.select({ id: figurePlacements.id }).from(figurePlacements).where(eq(figurePlacements.assetId, f.assetId)), f.assetId).toHaveLength(1);
    }
  });

  it("「化学療法中の副作用とセルフケア」の 1〜5 ページに別々の挿絵が届き、病期の医学図解 3 枚は監修前のまま出ない", async () => {
    const { materialId, versionId } = await versionOf("化学療法中の副作用とセルフケア");
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const ctx = await requireActiveConsultation(await loginHeaders(DR_YAMADA), sessionId);
    await prescribe(ctx, [materialId]);
    const patientId = seeded.users.get(PATIENT_B)!;
    const view = await getLearningView(patientId, versionId);
    for (const seq of [1, 2, 3, 4, 5]) {
      const figures = view.slides.find((s) => s.seq === seq)!.figures;
      expect(figures, `${seq} ページ`).toHaveLength(1);
      expect(figures[0].type).toBe("editorial");
      expect(figures[0].src).toBe(`/assets/editorial/edi_se_0${seq}.png`);
      expect(figures[0].altText.length).toBeGreaterThan(0);
    }
    // 4 ページ目の医学図解 MED-003 は未納品・未承認なので URL も出ない
    expect(JSON.stringify(view)).not.toContain("MED-003");
    await endConsultation(sessionId, patientId);

    const dx = await versionOf("乳がんの診断と病期の考え方");
    expect((await listApprovedFiguresForVersion(dx.versionId))[1] ?? []).toHaveLength(0);
  });
});
