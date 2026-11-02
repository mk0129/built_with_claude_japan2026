import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, VIEWPORTS, demoLogin, expect, layoutAudit, newPage, showQrCode } from "./helpers";

/**
 * 画面幅ごとのレイアウト検査: 横スクロールなし、44px 未満の操作要素を一覧化。
 * 結果は docs/screenshots/day3/layout_audit.json に保存する。
 */
test("画面幅ごとのレイアウト検査", async ({ browser }) => {
  const report: Record<string, unknown>[] = [];

  // 患者側: 宿題があるアカウントで確認（flow.spec の後に実行される想定。なくても home/share は検証できる）
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "patient", "佐藤 花子");
    const pages = ["/home", "/share", "/scores"];
    const firstLearn = page.locator('a[href^="/learn/"], a[href^="/quiz/"]').first();
    if (await firstLearn.count()) {
      const href = await firstLearn.getAttribute("href");
      if (href) pages.push(href, href.replace("/learn/", "/quiz/"));
    }
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const audit = await layoutAudit(page);
      report.push({ role: "patient", viewport: name, width: vp.width, path, ...audit });
      if (name === "phone390") await page.screenshot({ path: `${SHOT_DIR}/w390_patient${path.replace(/\//g, "_").slice(0, 20)}.png`, fullPage: true });
      if (name === "phone430") await page.screenshot({ path: `${SHOT_DIR}/w430_patient${path.replace(/\//g, "_").slice(0, 20)}.png`, fullPage: false });
    }
    await ctx.close();
  }

  // 医療者側
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "staff", "山田 太郎");
    for (const path of ["/staff", "/staff/scan"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const audit = await layoutAudit(page);
      report.push({ role: "staff", viewport: name, width: vp.width, path, ...audit });
    }
    if (["ipadPortrait", "ipadLandscape", "pc"].includes(name)) await page.screenshot({ path: `${SHOT_DIR}/w${vp.width}_staff_scan.png`, fullPage: true });
    await ctx.close();
  }

  writeFileSync(`${SHOT_DIR}/layout_audit.json`, JSON.stringify(report, null, 2));
  const overflowing = report.filter((r) => (r.overflowX as number) > 0).map((r) => `${r.viewport} ${r.path} (+${r.overflowX}px)`);
  expect(overflowing, "横スクロールが発生した画面").toEqual([]);
});

/** 医療者ダッシュボードを各幅で撮影（有効セッションが必要なので、その場で作る） */
test("医療者ダッシュボードの幅別表示", async ({ browser }) => {
  const patient = await newPage(browser, VIEWPORTS.phone390);
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const report: Record<string, unknown>[] = [];

  for (const name of ["phone430", "ipadPortrait", "ipadLandscape", "pc"] as const) {
    const vp = VIEWPORTS[name];
    const staff = await newPage(browser, vp);
    await demoLogin(staff.page, "staff", "山田 太郎");
    const code = await showQrCode(patient.page);
    await staff.page.goto("/staff/scan");
    await staff.page.getByLabel("6桁の番号").fill(code);
    await staff.page.getByRole("button", { name: /共有を要求する/ }).click();
    await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
    await staff.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
    await expect(staff.page.getByText(/佐藤 花子 さん/)).toBeVisible({ timeout: 15_000 });
    await staff.page.waitForLoadState("networkidle");
    const closed = await layoutAudit(staff.page);
    await staff.page.screenshot({ path: `${SHOT_DIR}/w${vp.width}_staff_dashboard.png`, fullPage: true });
    await staff.page.getByRole("button", { name: "開く" }).click();
    await staff.page.waitForTimeout(400);
    const open = await layoutAudit(staff.page);
    await staff.page.screenshot({ path: `${SHOT_DIR}/w${vp.width}_staff_dashboard_panel_open.png`, fullPage: false });
    report.push({ viewport: name, width: vp.width, closed, open });
    await staff.page.getByRole("button", { name: "終了", exact: true }).click();
    await staff.ctx.close();
  }
  writeFileSync(`${SHOT_DIR}/dashboard_audit.json`, JSON.stringify(report, null, 2));
  await patient.ctx.close();
  const overflowing = report.filter((r) => ((r.closed as { overflowX: number }).overflowX > 0 || (r.open as { overflowX: number }).overflowX > 0)).map((r) => r.viewport);
  expect(overflowing, "横スクロールが発生したダッシュボード幅").toEqual([]);
});
