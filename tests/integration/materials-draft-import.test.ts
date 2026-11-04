import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { materials, materialSlides, materialVersions, quizQuestions } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { createJob } from "@/server/services/ai-generation";
import { approveAndPublish, getDraftForEditor, submitForReview, updateDraft } from "@/server/services/authoring";
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
const RAW_D03 = Buffer.from(JSON.stringify({ version: "1.1", source_note: "架空の原稿（テスト・治療選択）", materials: [material("架空教材C（テスト）", "診断・治療選択")] }));

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

  it("「診断・治療選択」は「検査・診断」に入れ「治療選択」のタグを付ける。編集の保存で、タグは消えず「もう少し詳しく」が保存される", async () => {
    const sato = staff("approver.sato@example.com");
    const [r] = await importV11(getDb(), RAW_D03);
    const [m] = await getDb().select().from(materials).where(eq(materials.title, "架空教材C（テスト）"));
    expect([m.primaryDomain, m.tags]).toEqual(["diagnosis_staging", ["diagnosis_staging", "治療選択"]]);

    const d = await getDraftForEditor(sato, r.versionId!);
    const slides = d.slides.map((x, i) => ({ title: x.title, proposition: x.proposition ?? "", body: x.bodyMd, detail: i === 0 ? "編集した詳しい説明（架空）" : (x.detailMd ?? ""), sourceRefs: [] }));
    const questions = d.questions.map((x) => ({ stem: x.stem, options: x.options, correctIndex: x.correctIndex, explanation: x.explanation, relatedSlide: x.relatedSlideSeq ?? 1, sourceRefs: [] }));
    await updateDraft(sato, r.versionId!, { title: m.title, summary: d.version.summary ?? "", primaryDomain: m.primaryDomain, learningObjectives: d.version.learningObjectives, slides, questions });
    const [after] = await getDb().select().from(materials).where(eq(materials.id, m.id));
    expect(after.tags).toEqual(["diagnosis_staging", "治療選択"]);
    const saved = await getDb().select().from(materialSlides).where(eq(materialSlides.materialVersionId, r.versionId!)).orderBy(materialSlides.seq);
    expect(saved.map((x) => x.detailMd)).toEqual(["編集した詳しい説明（架空）", "詳しく2（架空）", "詳しく3（架空）", "詳しく4（架空）", "詳しく5（架空）"]);
    // 学習領域を変えたときは、先頭の学習領域だけ置き換わる
    await updateDraft(sato, r.versionId!, { title: m.title, summary: d.version.summary ?? "", primaryDomain: "drug_therapy", learningObjectives: d.version.learningObjectives, slides, questions });
    expect((await getDb().select().from(materials).where(eq(materials.id, m.id)))[0].tags).toEqual(["drug_therapy", "治療選択"]);
  });
});
