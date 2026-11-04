/**
 * 教材生成の実演（Claude 実 API・構成案 1 回＋本文 1 回）。隔離した一時 DB のサーバー（scripts/real-intervisit-screen.mjs と同じ起動方法）で実行する。
 * 原資料はデモ用に独自に作成した架空の原稿（tests/fixtures/sources/hormone_therapy_detailed_demo.docx。架空病院・患者情報なし）だけ。
 * 生成後、編集・患者プレビュー・承認・公開・情報処方・患者の学習画面までを実画面で確認し、生成結果と画面を保存する。
 * 承認者（佐藤 一郎）は架空のデモ承認者で、本番の医学的監修ではない。ボタンの再押下や再生成はしない（追加の課金を起こさない）。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const B = process.env.BASE ?? "http://localhost:3500", OUT = "docs/design/phase2/step5/real";
mkdirSync(OUT, { recursive: true });
const acc = await (await fetch(B + "/api/v1/demo/accounts")).json();
if (!acc.accounts.every((a) => a.email.endsWith("@example.com"))) throw new Error("架空以外のアカウントがあるため中止");
const b = await chromium.launch();
async function login(kind, name, vp) {
  const ctx = await b.newContext({ viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"));
  return p;
}
const shot = async (p, n) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png` }); };
const s = await login("staff", "佐藤 一郎", { width: 1440, height: 900 });
const p = await login("patient", "伊藤 涼子", { width: 390, height: 844 });
const jobs = [];
s.on("response", async (r) => {
  if (/\/api\/v1\/studio\/jobs\/[0-9a-f-]+$/.test(r.url()) && r.request().method() === "GET") {
    try { const { job } = await r.json(); if (job.status === "succeeded" || job.status === "failed") jobs.push(job); } catch {}
  }
});
const res = s.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
await s.getByRole("button", { name: "患者との接続を開始" }).click();
const u = new URL((await (await res).json()).qrUrl);
await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await p.goto(B + u.pathname + u.search);
await p.locator(".d-consent input").check();
await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 20000 });
await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
await s.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
await s.locator(".cd-form-grid input").nth(1).fill("あおば記念病院 乳腺センター・薬剤部（架空）");
await s.locator(".cd-form-grid textarea").fill("ハッカソンのデモ用に独自に作成した架空の原稿。患者向け教材化・AI 処理・施設内公開を許可（デモ）");
await s.locator(".cd-license-check input").nth(0).check();
await s.locator(".cd-license-check input").nth(1).check();
await shot(s, "01_source");
await s.getByRole("button", { name: "次へ進む" }).click();
await s.getByRole("heading", { name: "教材の作成方針" }).waitFor({ timeout: 30000 });
// 実 API 1 回目: 構成案
await s.getByRole("button", { name: "Claudeに構成案を依頼" }).click();
await s.getByRole("heading", { name: "Claudeの構成案を比較" }).waitFor({ timeout: 600000 });
await shot(s, "02_outlines");
for (const d of await s.locator(".cd-proposal-detail").all()) await d.click();
await shot(s, "03_outlines_detail");
await s.getByRole("button", { name: "次へ進む" }).click();
for (const c of await s.locator("[data-must-item] input[type=checkbox]").all()) await c.check();
await shot(s, "04_must_cover");
// 実 API 2 回目: 本文と確認問題
await s.getByRole("button", { name: "確認した内容で下書きを作成" }).click();
await s.locator("[data-studio-editor]").waitFor({ timeout: 600000 });
await shot(s, "05_edit_slide");
await s.locator(".cd-editor aside button.quiz").click();
await shot(s, "06_edit_quiz");
// 医療者の編集（1 画面目の要点に一文を足す。自動保存）
await s.locator(".cd-editor aside button").first().click();
const prop = s.locator("[data-studio-editor] textarea").first();
await prop.fill((await prop.inputValue()) + "（医療者が確認・編集）");
await s.locator("[data-studio-editor] input").first().click();
await s.locator(".cd-draft-status").getByText(/自動保存/).waitFor({ timeout: 15000 });
await s.getByRole("button", { name: "次へ進む" }).click();
await s.locator("[data-studio-preview]").waitFor();
await shot(s, "07_preview");
for (let i = 0; i < 10; i++) { const t = await s.locator("[data-studio-preview] footer .cd-primary").textContent(); if (t.includes("承認依頼へ")) break; await s.locator("[data-studio-preview] footer .cd-primary").click(); }
await s.locator("[data-studio-preview] footer .cd-primary").click();
await s.getByRole("heading", { name: "医学的承認と公開" }).waitFor();
for (const c of await s.locator(".cd-approval-check input").all()) await c.check();
await shot(s, "08_approval");
await s.getByRole("button", { name: "医学的に承認して公開" }).click();
await s.getByRole("heading", { name: "教材を公開しました" }).waitFor({ timeout: 20000 });
await shot(s, "09_published");
// 生成結果（ジョブの出力）と公開した教材の内容を保存
const outline = jobs.find((j) => j.mode === "outline");
const draft = jobs.find((j) => j.mode === "generate");
const versionId = draft?.outputVersionId;
const material = versionId ? await (await s.request.get(`${B}/api/v1/studio/materials/${versionId}`)).json() : null;
const strip = (j) => j && { mode: j.mode, status: j.status, generator: j.generator, model: j.model, inputTokens: j.inputTokenCount, outputTokens: j.outputTokenCount, durationMs: j.durationMs, fallbackUsed: j.fallbackUsed, errorCode: j.errorCode, output: j.outputPayload };
writeFileSync(`${OUT}/generation.json`, JSON.stringify({ outline: strip(outline), draft: strip(draft), published: material && { title: material.material.title, status: material.version.status, slides: material.slides.map((x) => ({ seq: x.seq, title: x.title, proposition: x.proposition, body: x.bodyMd, sourceRefs: x.sourceRefs })), questions: material.questions.map((q) => ({ stem: q.stem, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation })), mustCover: material.version.mustCover, preCheck: material.preCheck } }, null, 2));
console.log("outline:", outline?.status, outline?.inputTokenCount, outline?.outputTokenCount, "draft:", draft?.status, draft?.inputTokenCount, draft?.outputTokenCount, "title:", material?.material.title);
// 情報処方 → 患者の画面
await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
const card = s.locator(".cd-library-grid article").filter({ hasText: material.material.title });
await card.getByRole("button", { name: "処方に追加" }).click();
await shot(s, "10_library");
await s.getByRole("button", { name: /選択中 1件/ }).click();
await s.getByRole("button", { name: "1件の情報処方を確定" }).click();
await s.getByRole("heading", { name: "情報処方を届けました" }).waitFor();
await shot(s, "11_prescribed");
await s.getByRole("button", { name: "診察を終えて共有終了" }).click();
await p.goto(B + "/home");
await p.locator(".d-next-card").waitFor();
await shot(p, "12_patient_home");
await p.locator(".d-next-card .primary-button").click();
await shot(p, "13_patient_detail");
await p.locator(".d-detail .d-bottom-action").click();
await p.locator(".d-learning h1").waitFor();
await shot(p, "14_patient_learn");
await b.close();
console.log("done");
