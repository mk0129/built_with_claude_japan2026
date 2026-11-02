import { test } from "@playwright/test";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage, showQrCode } from "./helpers";

/**
 * C2 適用後の患者画面（ホーム / 教材 / クイズ結果）と医療者ダッシュボードを 390 / 430 / 820 / 1180 で撮影し、
 * 横スクロールが無いことを検査する。患者は佐藤 花子（デモ履歴あり）。
 */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];

test("C2 患者画面の幅別スクリーンショット", async ({ browser }) => {
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await page.waitForLoadState("networkidle");
    expect((await layoutAudit(page)).overflowX, `home ${vp.name}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOT_DIR}/c2_home_${vp.name}.png`, fullPage: true });
    // 教材: 病期（完了済み）を開く
    await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
    await page.waitForURL(/\/(learn|quiz)\//);
    if (page.url().includes("/quiz/")) {
      const learnUrl = page.url().replace("/quiz/", "/learn/");
      await page.goto(learnUrl);
    }
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect((await layoutAudit(page)).overflowX, `learn ${vp.name}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOT_DIR}/c2_learn_${vp.name}.png`, fullPage: true });
    // 結果（完了済みの挑戦）
    const quizUrl = page.url().replace("/learn/", "/quiz/").split("?")[0];
    await page.goto(quizUrl);
    await expect(page.getByText(/確認を終えました|確認問題 1/)).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    expect((await layoutAudit(page)).overflowX, `result ${vp.name}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOT_DIR}/c2_result_${vp.name}.png`, fullPage: true });
    await ctx.close();
  }
});

test("C2 医療者ダッシュボードと監修プレビュー（820 / 1180）", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  for (const vp of WIDTHS.filter((w) => w.width >= 820)) {
    const staff = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(staff.page, "staff", "山田 太郎");
    const code = await showQrCode(patient.page);
    await staff.page.goto("/staff/scan");
    await staff.page.getByLabel("6桁の番号").fill(code);
    await staff.page.getByRole("button", { name: /共有を要求する/ }).click();
    await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
    await staff.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
    await expect(staff.page.getByText(/今日の確認事項/)).toBeVisible({ timeout: 15_000 });
    await staff.page.waitForLoadState("networkidle");
    await staff.page.screenshot({ path: `${SHOT_DIR}/c2_staff_dashboard_${vp.name}.png`, fullPage: true });
    await staff.page.getByRole("button", { name: "終了", exact: true }).click();
    await staff.ctx.close();
  }
  // 監修プレビュー（運営の承認者）
  const op = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(op.page, "staff", "運営 承認担当");
  await op.page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
  await op.page.waitForURL(/\/staff\/materials\/.+\/preview/);
  await expect(op.page.getByText(/管理者プレビュー/).first()).toBeVisible();
  await expect(op.page.getByText(/監修待ち（MED-001-01/).first()).toBeVisible();
  await expect(op.page.getByRole("tab", { name: "離れた臓器" })).toBeVisible();
  await op.page.screenshot({ path: `${SHOT_DIR}/c2_admin_preview_1180.png`, fullPage: true });
  await op.ctx.close();
  await patient.ctx.close();
});
