import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage, openRegisterForm } from "./helpers";

/**
 * UX 監査用: 既存スペックで撮っていない画面（教材スタジオのスマホ・タブレット幅、
 * クイズ出題中の画面）を撮影し、横スクロールと小さい操作要素を記録する。
 * 実行: E2E_SHOT_DIR=<出力先> npx playwright test ux_audit（擬似生成。Claude は呼ばない）
 */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "820", width: 820, height: 1180 },
];

test("UX 監査: スタジオとクイズの幅別スクリーンショット", async ({ browser }) => {
  test.setTimeout(300_000);
  const report: Record<string, unknown> = {};
  const snap = async (page: import("@playwright/test").Page, name: string, fullPage = true) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250);
    report[name] = await layoutAudit(page);
    await page.screenshot({ path: `${SHOT_DIR}/ux_${name}.png`, fullPage });
  };

  // 下書きを 1 件作る（タブレット幅）
  const { ctx, page: s } = await newPage(browser, { width: 820, height: 1180 });
  await demoLogin(s, "staff", "佐藤 一郎");
  await s.goto("/staff/studio");
  const stamp = Date.now().toString().slice(-5);
  await openRegisterForm(s);
  await s.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await s.getByLabel("資料名").fill(`ホルモン療法を続けるために（UX ${stamp}）`);
  await s.getByLabel("許諾元（著作権者・作成部署）").fill("さくら総合病院（架空）乳腺外科");
  await s.getByLabel("許諾の根拠・確認内容").fill("UX 監査用の架空資料");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.getByLabel(l).check();
  await s.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await s.getByRole("button", { name: "登録する" }).click();
  await s.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.waitForURL(/\/staff\/studio\/sources\//);
  const sourceUrl = s.url();
  await s.getByRole("button", { name: "構成案を作る" }).click();
  await expect(s.getByRole("button", { name: "この案で進む" }).first()).toBeVisible({ timeout: 60_000 });
  await s.getByRole("button", { name: "この案で進む" }).first().click();
  await s.getByRole("button", { name: /件を含めて教材・クイズを生成する/ }).click();
  const open = s.getByRole("link", { name: /下書きを確認・編集する/ }).first();
  await expect(open).toBeVisible({ timeout: 60_000 });
  await open.click();
  await s.waitForURL(/\/staff\/studio\/materials\//);
  const editorUrl = s.url();
  await ctx.close();

  for (const vp of WIDTHS) {
    const { ctx: c, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "佐藤 一郎");
    await page.goto("/staff/studio");
    await snap(page, `studio_top_${vp.name}`);
    await page.goto(sourceUrl);
    await snap(page, `studio_source_${vp.name}`);
    await page.goto(editorUrl);
    await expect(page.getByRole("heading", { name: "原資料と比較" })).toBeVisible();
    await snap(page, `studio_editor_${vp.name}`);
    await snap(page, `studio_editor_${vp.name}_viewport`, false);
    await c.close();
  }

  // 患者: クイズ出題中（未回答）と回答後
  for (const vp of WIDTHS) {
    const { ctx: c, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await page.waitForLoadState("networkidle");
    await snap(page, `patient_home_${vp.name}_viewport`, false);
    await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
    await page.waitForURL(/\/(learn|quiz)\//);
    const quizUrl = page.url().replace("/learn/", "/quiz/").split("?")[0];
    await page.goto(page.url().replace("/quiz/", "/learn/").split("?")[0]);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await snap(page, `patient_learn_${vp.name}_viewport`, false);
    await page.goto(quizUrl);
    const retry = page.getByRole("button", { name: /もう一度挑戦する/ });
    await expect(retry.or(page.getByText(/確認問題 \d+ \//))).toBeVisible({ timeout: 10_000 });
    if (await retry.isVisible()) {
      await snap(page, `patient_quiz_result_${vp.name}`);
      await retry.click();
    }
    await expect(page.getByText(/確認問題 \d+ \//)).toBeVisible({ timeout: 10_000 });
    await snap(page, `patient_quiz_q_${vp.name}`, false);
    await page.getByRole("button", { name: /^イ/ }).click();
    await snap(page, `patient_quiz_feedback_${vp.name}`, false);
    await c.close();
  }
  writeFileSync(`${SHOT_DIR}/ux_audit.json`, JSON.stringify(report, null, 2));
});
