import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { materials, materialSlides, materialVersions, quizQuestions } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { createJob } from "@/server/services/ai-generation";
import { approveAndPublish, getDraftForEditor, submitForReview } from "@/server/services/authoring";
import { listVisibleMaterials } from "@/server/services/materials";
import { importV11 } from "../../scripts/review/import-materials-draft";
import { setupDb, type Seeded } from "../helpers";

/**
 * 教材 v1.1（編集草稿）の取り込み（レビュー用）。原稿そのものはリポジトリに入れないため、同じ形の架空の原稿で確かめる。
 * 新しい下書きとして入り、患者・処方候補には出ず、承認（公開）も AI 生成もできない。既存の教材は変わらない。
 */
const slide = (n: number) => ({ seq: n, title: `見出し${n}`, proposition: `見出し${n}`, bodyMd: `本文${n}（架空）`, detailMd: `詳しく${n}（架空）`, voiceText: `本文${n}（架空）`, source_pages: [], illustration_asset: null, editorial_intent: "" });
const q = (n: number) => ({ seq: n, stem: `設問${n}`, options: ["A", "B", "C"], correctIndex: (n - 1) % 3, explanation: `解説${n}`, source_pages: [], allowUnknown: true, cognitiveLevel: "基礎" });
const material = (title: string, domain: string) => ({
  id: title,
  title,
  domain,
  summary: "架空の要約",
  objectives: ["架空の学習目標"],
  slides: [1, 2, 3, 4, 5].map(slide),
  quiz: [1, 2, 3].map(q),
  status: { medical: "unreviewed", rights: "permission_pending", publication: "not_approved" },
});
const RAW = Buffer.from(JSON.stringify({ version: "1.1", source_note: "架空の原稿（テスト）", materials: [material("架空教材A（テスト）", "検査・診断"), material("架空教材B（テスト）", "副作用・支持療法")] }));

let seeded: Seeded;
const staff = (email: string) => ({ userId: seeded.users.get(email)!, kind: "staff" as const, name: email, email });
async function expectAppError(p: Promise<unknown>, status: number, code: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => {
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
  });
}

beforeAll(async () => {
  process.env.AI_JOBS_INLINE = "1";
  process.env.PRIVATE_STORAGE_ROOT = `${tmpdir()}/shiori-test-v11-${process.pid}`;
  seeded = await setupDb();
});

describe("教材 v1.1 の下書き取り込み（レビュー用）", () => {
  it("新しい下書きとして入り、5 画面・詳しく・3 問がそのまま入る。題名と同じ要点は重ねない。2 回目は取り込まない", async () => {
    const before = await getDb().select({ id: materials.id }).from(materials);
    const r = await importV11(getDb(), RAW);
    expect(r.map((x) => x.skipped)).toEqual([false, false]);
    const vid = r[0].versionId!;
    const [v] = await getDb().select().from(materialVersions).where(eq(materialVersions.id, vid));
    expect(v.status).toBe("draft");
    const slides = await getDb().select().from(materialSlides).where(eq(materialSlides.materialVersionId, vid)).orderBy(materialSlides.seq);
    expect(slides.map((s) => [s.title, s.proposition, s.bodyMd, s.detailMd])).toEqual([1, 2, 3, 4, 5].map((n) => [`見出し${n}`, null, `本文${n}（架空）`, `詳しく${n}（架空）`]));
    const qs = await getDb().select().from(quizQuestions).where(eq(quizQuestions.materialVersionId, vid)).orderBy(quizQuestions.seq);
    expect(qs.map((x) => x.correctIndex)).toEqual([0, 1, 2]);
    expect((await getDb().select({ id: materials.id }).from(materials)).length).toBe(before.length + 2);
    expect((await importV11(getDb(), RAW)).every((x) => x.skipped)).toBe(true);
  });

  it("患者・処方候補には出ない。提出しても原資料に公開の許可がないため承認できない。AI 生成もできない", async () => {
    const sato = staff("approver.sato@example.com");
    const [m] = await getDb().select().from(materials).where(eq(materials.title, "架空教材A（テスト）"));
    const [v] = await getDb().select().from(materialVersions).where(eq(materialVersions.materialId, m.id));
    expect(m.currentPublishedVersionId).toBeNull();
    const visible = await listVisibleMaterials({ orgId: seeded.orgs.get("sakura-general")! });
    expect(visible.some((x) => x.materialId === m.id)).toBe(false);

    const d = await getDraftForEditor(sato, v.id);
    expect(d.sources[0].perm).toMatchObject({ allowAi: false, allowPublish: false, allowShare: false });
    await submitForReview(sato, v.id);
    expect((await getDraftForEditor(sato, v.id)).approvalBlock).toContain("公開の許可がありません");
    await expectAppError(approveAndPublish(sato, v.id), 403, "SOURCE_PERMISSION_MISSING");
    await expectAppError(createJob(sato, null, { mode: "outline", sourceIds: v.sourceDocumentIds }), 403, "AI_NOT_PERMITTED");
  });
});
