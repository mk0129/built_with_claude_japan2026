import { tmpdir } from "node:os";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { aiGenerationJobs, materials } from "@/server/db/schema";
import { AppError } from "@/server/authz/errors";
import { uploadSource, type PermissionInput } from "@/server/services/sources";
import { createJob, getJob, retryJob, type MaterialOutput, type OutlineOutput } from "@/server/services/ai-generation";
import { approveAndPublish, getDraftForEditor, submitForReview, updateDraft } from "@/server/services/authoring";
import { listVisibleMaterials } from "@/server/services/materials";
import { requireActiveConsultation } from "@/server/authz/consultation";
import { prescribe } from "@/server/services/prescription";
import { endConsultation } from "@/server/services/consultation";
import { getLearningView } from "@/server/services/learning";
import { DR_YAMADA, PATIENT_B, loginHeaders, setupDb, startSession, type Seeded } from "../helpers";

let seeded: Seeded;
const uid = (e: string) => seeded.users.get(e)!;
const staff = (email: string) => ({ userId: uid(email), kind: "staff" as const, name: email, email });
const DOCX = readFileSync("tests/fixtures/sources/hormone_therapy_demo.docx");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const okPerm: PermissionInput = { allowStore: true, allowAi: true, allowDerive: true, allowPublish: true, allowShare: true, rightsHolder: "さくら総合病院（架空）乳腺外科", evidenceNote: "院内作成のオリジナル資料。AI 処理・改変・公開の許可を確認（デモ）" };

let claudeCalls = 0;
let failNext = false;
const g = globalThis as { __shioriClaudeMock?: (a: { schemaName: string; user: string }) => Promise<unknown> };

function sourceIdFrom(user: string) {
  return user.match(/<source id="([^"]+)"/)![1];
}
const outline = (sid: string): OutlineOutput => ({
  outlines: [
    { title: "ホルモン療法を続けるために", primaryDomain: "drug_therapy", targetReader: "ホルモン療法を始める方", learningObjectives: ["続ける期間の考え方を知る"], slideTitles: ["ホルモン療法とは", "続ける期間", "体の変化", "まとめ"], rationale: "1〜5 章に基づく", sourceRefs: [{ sourceId: sid, section: "2", quote: "5年以上の長い期間続けることが多い治療です" }] },
  ],
  notCoveredBySource: [],
});
const material = (sid: string, quote = "女性ホルモンの影響を受けて増えやすい性質があります"): MaterialOutput => ({
  title: "ホルモン療法を続けるために",
  summary: "ホルモン療法の目的と続け方",
  primaryDomain: "drug_therapy",
  learningObjectives: ["続ける期間の考え方を知る"],
  slides: [
    { title: "ホルモン療法とは", proposition: "女性ホルモンの働きを抑える治療です。", body: "ホルモン受容体が陽性の乳がんで使います。", detail: "", sourceRefs: [{ sourceId: sid, section: "1", quote }] },
    { title: "続ける期間", proposition: "長く続けることが多い治療です。", body: "期間は人によって違います。", detail: "", sourceRefs: [{ sourceId: sid, section: "2", quote: "5年以上の長い期間続けることが多い治療です" }] },
    { title: "まとめ", proposition: "担当医の説明が優先されます。", body: "わからないことは次の診察で聞いてください。", detail: "", sourceRefs: [{ sourceId: sid, section: "5", quote: "あなたの治療内容と期間については、担当医の説明が優先されます" }] },
  ],
  questions: [
    { stem: "自己判断で薬をやめてよいですか。", options: ["やめてよい", "やめない", "量を半分にする"], correctIndex: 1, explanation: "自己判断でやめたり減らしたりしません。", relatedSlide: 2, sourceRefs: [{ sourceId: sid, section: "2", quote: "自己判断で薬をやめたり、量を減らしたりしないでください" }] },
    { stem: "つらい症状があるときは？", options: ["我慢する", "次の診察で伝える", "薬をやめる"], correctIndex: 1, explanation: "我慢せず次の診察で伝えます。", relatedSlide: 3, sourceRefs: [{ sourceId: sid, section: "3", quote: "我慢せずに次の診察で伝えてください" }] },
  ],
  notCoveredBySource: [],
});

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
  process.env.AI_JOBS_INLINE = "1";
  process.env.PRIVATE_STORAGE_ROOT = `${tmpdir()}/shiori-test-storage-${process.pid}`;
  seeded = await setupDb();
});
beforeEach(() => {
  claudeCalls = 0;
  failNext = false;
  g.__shioriClaudeMock = async ({ schemaName, user }) => {
    claudeCalls++;
    if (failNext) {
      failNext = false;
      throw new Error("simulated network failure");
    }
    const sid = sourceIdFrom(user);
    return schemaName === "outline" ? outline(sid) : material(sid);
  };
});

describe("原資料のアップロードと許諾（A）", () => {
  it("docx からテキストを抽出し、非公開ストレージに保存、許諾元・確認者・確認日時を記録", async () => {
    const r = await uploadSource(staff("nurse.tanaka@example.com"), { title: "ホルモン療法（デモ）", filename: "hormone.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    expect(r.charCount).toBeGreaterThan(300);
    expect(r.piiFlags).toEqual([]);
    const { getSourceDetail } = await import("@/server/services/sources");
    const d = await getSourceDetail(staff("nurse.tanaka@example.com"), r.sourceId);
    expect(d.source.extractedText).toContain("ホルモン療法");
    expect(d.permission?.checkedByUserId).toBe(uid("nurse.tanaka@example.com"));
    expect(d.permission?.checkedAt).toBeInstanceOf(Date);
    expect(d.aiCheck.ok).toBe(true);
    // 他院の医療者・一般医療者は見られない
    await expectAppError(getSourceDetail(staff("dr.kobayashi@example.com"), r.sourceId), 403);
    await expectAppError(getSourceDetail(staff("dr.yamada@example.com"), r.sourceId), 403);
  });

  it("患者個人情報らしき記載がある資料は AI 処理しない（Claude を呼ばない）", async () => {
    const body = Buffer.from("説明資料\n患者ID: A123456\n生年月日 1960年1月1日\n" + "治療の説明です。".repeat(40));
    const r = await uploadSource(staff("nurse.tanaka@example.com"), { title: "PII", filename: "x.txt", mime: "text/plain", body, piiAttestedNone: true, permissions: okPerm });
    expect(r.piiFlags.length).toBeGreaterThan(0);
    await expectAppError(createJob(staff("nurse.tanaka@example.com"), null, { mode: "outline", sourceIds: [r.sourceId] }), 403, "AI_NOT_PERMITTED");
    expect(claudeCalls).toBe(0);
  });

  it("T08: AI 送信不可・未確認の資料では生成 API が呼び出されない", async () => {
    const noAi = await uploadSource(staff("nurse.tanaka@example.com"), { title: "no ai", filename: "a.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: { ...okPerm, allowAi: false } });
    await expectAppError(createJob(staff("nurse.tanaka@example.com"), null, { mode: "outline", sourceIds: [noAi.sourceId] }), 403, "AI_NOT_PERMITTED");
    const noAttest = await uploadSource(staff("nurse.tanaka@example.com"), { title: "no attest", filename: "b.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: false, permissions: okPerm });
    await expectAppError(createJob(staff("nurse.tanaka@example.com"), null, { mode: "freeform", sourceIds: [noAttest.sourceId], theme: "x", objectives: [] }), 403, "AI_NOT_PERMITTED");
    expect(claudeCalls).toBe(0);
    // 他院の資料は使えない
    const own = await uploadSource(staff("nurse.tanaka@example.com"), { title: "own", filename: "c.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    await expectAppError(createJob(staff("op.editor@example.com"), null, { mode: "outline", sourceIds: [own.sourceId] }), 403, "SOURCE_OTHER_ORG");
  });

  it("画像が多い・文字が少ない pptx は警告を返す（OCR はしない）", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>図</a:t></p:sld>");
    zip.file("ppt/media/image1.png", "x");
    const body = await zip.generateAsync({ type: "nodebuffer" });
    const r = await uploadSource(staff("nurse.tanaka@example.com"), { title: "pptx", filename: "s.pptx", mime: "", body, piiAttestedNone: true, permissions: okPerm });
    expect(r.warnings.join()).toMatch(/画像・図表/);
    expect(r.warnings.join()).toMatch(/文字が少ない/);
  });
});

describe("Claude による教材生成（B / C）と承認・公開（C）", () => {
  it("B 方式: 構成案 → 選択 → 生成 → 編集 → 提出 → 病院独自は承認者の自己承認で公開 → 処方 → 患者が学習", async () => {
    const tanaka = staff("nurse.tanaka@example.com");
    const sato = staff("approver.sato@example.com");
    const src = await uploadSource(tanaka, { title: "ホルモン療法（デモ）", filename: "hormone.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    const o = await createJob(tanaka, null, { mode: "outline", sourceIds: [src.sourceId] }, "test-outline-1");
    const oj = await getJob(tanaka, o.jobId);
    expect(oj.status).toBe("succeeded");
    expect((oj.outputPayload as OutlineOutput).outlines).toHaveLength(1);
    // 冪等キー
    expect((await createJob(tanaka, null, { mode: "outline", sourceIds: [src.sourceId] }, "test-outline-1")).duplicate).toBe(true);

    const gj = await createJob(tanaka, null, { mode: "generate", sourceIds: [src.sourceId], fromJobId: o.jobId, outlineIndex: 0 });
    const job = await getJob(tanaka, gj.jobId);
    expect(job.status).toBe("succeeded");
    const versionId = job.outputVersionId!;

    // T09: 未承認は処方候補に出ない
    const sakura = seeded.orgs.get("sakura-general")!;
    expect((await listVisibleMaterials({ orgId: sakura })).some((m) => m.versionId === versionId)).toBe(false);

    // 編集（原資料と比較できる）
    const d = await getDraftForEditor(tanaka, versionId);
    expect(d.sources[0].extractedText).toContain("ホルモン療法");
    expect(d.check.warnings.filter((w) => w.includes("見つかりません"))).toEqual([]);
    expect(d.material.scope).toBe("org");
    await updateDraft(tanaka, versionId, {
      title: "ホルモン療法を続けるために（編集済み）",
      summary: d.version.summary ?? "",
      primaryDomain: "drug_therapy",
      learningObjectives: d.version.learningObjectives,
      slides: d.slides.map((s) => ({ title: s.title, proposition: s.proposition ?? "", body: s.bodyMd, detail: s.detailMd ?? "", sourceRefs: s.sourceRefs })),
      questions: d.questions.map((q) => ({ stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, relatedSlide: q.relatedSlideSeq ?? 1, sourceRefs: q.sourceRefs })),
    });
    // 一般医療者・編集者は承認できない
    await submitForReview(tanaka, versionId);
    await expectAppError(approveAndPublish(tanaka, versionId), 403, "APPROVER_REQUIRED");
    await expectAppError(approveAndPublish(staff("dr.yamada@example.com"), versionId), 403);
    // T07: 病院独自は承認者の自己承認も可（ここでは別人の承認者が承認）
    await approveAndPublish(sato, versionId);
    const visible = await listVisibleMaterials({ orgId: sakura });
    expect(visible.find((m) => m.versionId === versionId)?.title).toBe("ホルモン療法を続けるために（編集済み）");
    // 他院からは見えない（T05）
    expect((await listVisibleMaterials({ orgId: seeded.orgs.get("hidamari-medical")! })).some((m) => m.versionId === versionId)).toBe(false);

    // 処方 → 患者の学習
    const { sessionId } = await startSession(seeded, PATIENT_B, DR_YAMADA, "sakura-general");
    const ctx = await requireActiveConsultation(await loginHeaders(DR_YAMADA), sessionId);
    const [mat] = await getDb().select({ id: materials.id }).from(materials).where(eq(materials.currentPublishedVersionId, versionId));
    await prescribe(ctx, [mat.id]);
    const view = await getLearningView(uid(PATIENT_B), versionId);
    expect(view.slides).toHaveLength(3);
    expect(view.questionCount).toBe(2);
    await endConsultation(sessionId, uid(PATIENT_B));
  });

  it("T07: 病院独自教材は承認権限があれば作成者本人が自己承認できる（C 方式）", async () => {
    const sato = staff("approver.sato@example.com");
    const src = await uploadSource(sato, { title: "self", filename: "s.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    const j = await createJob(sato, null, { mode: "freeform", sourceIds: [src.sourceId], theme: "ホルモン療法の続け方", objectives: ["飲み忘れの工夫を知る"] });
    const versionId = (await getJob(sato, j.jobId)).outputVersionId!;
    await submitForReview(sato, versionId);
    await approveAndPublish(sato, versionId);
  });

  it("T06: 共通教材は作成者本人の承認を拒否し、別の承認者が承認できる。他施設共有の許可が必要", async () => {
    const editor = staff("op.editor@example.com");
    const approver = staff("op.approver@example.com");
    // 共有不可の資料からの共通教材は承認不可
    const noShare = await uploadSource(approver, { title: "no share", filename: "n.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: { ...okPerm, allowShare: false } });
    const j0 = await createJob(approver, null, { mode: "freeform", sourceIds: [noShare.sourceId], theme: "ホルモン療法", objectives: [] });
    const v0 = (await getJob(approver, j0.jobId)).outputVersionId!;
    await submitForReview(approver, v0);
    await expectAppError(approveAndPublish(approver, v0), 403); // 自己承認 & 共有不可

    const src = await uploadSource(approver, { title: "共通", filename: "c.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    const j = await createJob(approver, null, { mode: "freeform", sourceIds: [src.sourceId], theme: "ホルモン療法", objectives: [] });
    const versionId = (await getJob(approver, j.jobId)).outputVersionId!;
    expect((await getDraftForEditor(editor, versionId)).material.scope).toBe("common");
    await submitForReview(editor, versionId);
    await expectAppError(approveAndPublish(approver, versionId), 403, "SELF_APPROVAL_NOT_ALLOWED");
    await expectAppError(approveAndPublish(editor, versionId), 403, "APPROVER_REQUIRED");
    // 別の承認者（このデモでは病院の承認者は運営に所属しないため承認不可）
    await expectAppError(approveAndPublish(staff("approver.sato@example.com"), versionId), 403);
  });

  it("引用が原資料に無い場合は警告し、形式違反は失敗にして再試行できる", async () => {
    const tanaka = staff("nurse.tanaka@example.com");
    const src = await uploadSource(tanaka, { title: "q", filename: "q.docx", mime: DOCX_MIME, body: DOCX, piiAttestedNone: true, permissions: okPerm });
    g.__shioriClaudeMock = async ({ user }) => {
      claudeCalls++;
      return material(sourceIdFrom(user), "原資料にない文言です");
    };
    const j = await createJob(tanaka, null, { mode: "freeform", sourceIds: [src.sourceId], theme: "x", objectives: [] });
    const job = await getJob(tanaka, j.jobId);
    expect((job.outputPayload as { validationWarnings: string[] }).validationWarnings.join()).toMatch(/見つかりません/);

    // 形式違反（画面 1 枚）→ 失敗
    g.__shioriClaudeMock = async ({ user }) => ({ ...material(sourceIdFrom(user)), slides: material(sourceIdFrom(user)).slides.slice(0, 1) });
    const bad = await createJob(tanaka, null, { mode: "freeform", sourceIds: [src.sourceId], theme: "x", objectives: [] });
    const bj = await getJob(tanaka, bad.jobId);
    expect(bj.status).toBe("failed");
    expect(bj.errorMessage).toMatch(/画面数/);
    // ネットワーク失敗 → 失敗 → 再試行で成功
    g.__shioriClaudeMock = async ({ user, schemaName }) => {
      claudeCalls++;
      if (failNext) {
        failNext = false;
        throw new Error("simulated");
      }
      return schemaName === "outline" ? outline(sourceIdFrom(user)) : material(sourceIdFrom(user));
    };
    failNext = true;
    const f = await createJob(tanaka, null, { mode: "freeform", sourceIds: [src.sourceId], theme: "x", objectives: [] });
    expect((await getJob(tanaka, f.jobId)).status).toBe("failed");
    const r = await retryJob(tanaka, f.jobId);
    expect(r.attempt).toBe(2);
    const done = await getDb().select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, f.jobId));
    expect(done[0].status).toBe("succeeded");
  });
});
