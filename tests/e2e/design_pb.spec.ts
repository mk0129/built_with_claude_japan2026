import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoLogin, expect, layoutAudit, newPage, openRegisterForm, showQrCode } from "./helpers";

/**
 * Porcelain Blue 比較の撮影（既定ではスキップ）。
 *   DESIGN_PB=1 E2E_SHOT_DIR=docs/design/porcelain_blue_20261103/shots npx playwright test design_pb
 * Before = 現行の本番画面、After = /pb/*。390 / 430 / 820 / 1180、患者画面は文字拡大も撮る。
 */
const OUT = process.env.E2E_SHOT_DIR ?? "docs/design/porcelain_blue_20261103/shots";
const W = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];
test.skip(!process.env.DESIGN_PB, "DESIGN_PB=1 のときだけ撮影する");

async function setLarge(page: Page, large: boolean) {
  await page.evaluate((l) => {
    document.documentElement.dataset.textsize = l ? "large" : "";
  }, large);
  await page.waitForTimeout(150);
}
async function shot(page: Page, name: string, full = false) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}
async function firstView(page: Page) {
  return page.evaluate(() => {
    const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    const body = Array.from(document.querySelectorAll<HTMLElement>("article p")).find((p) => p.className.includes("leading-[1.8]"));
    const strip = document.querySelector(".pb-figstrip");
    const fig = document.querySelector("article figure img, article img.object-contain");
    return { vh: window.innerHeight, body: top(body ?? null), strip: top(strip), figure: top(fig), docH: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

test("Before: 現行画面", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const audit: Record<string, unknown> = {};
  // 患者: ホーム / 学習 / クイズ結果
  for (const vp of W) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "patient", "佐藤 花子");
    await page.waitForLoadState("networkidle");
    await shot(page, `before_home_${vp.name}`);
    // MED-001（図解あり・seed で確認問題を完了済み）を使う
    const href = await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().getAttribute("href");
    const v = href!.split("/")[2].split("?")[0];
    await page.goto(`/learn/${v}?slide=1`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, `before_learn_${vp.name}`);
    audit[`before_learn_${vp.name}`] = await firstView(page);
    await page.goto(`/quiz/${v}`);
    await page.getByText(/確認を終えました|確認問題 \d+ \//).first().waitFor({ timeout: 10_000 });
    await shot(page, `before_result_${vp.name}`);
    await shot(page, `before_result_${vp.name}_full`, true);
    if (vp.name === "390" || vp.name === "430") {
      await setLarge(page, true);
      await shot(page, `before_result_${vp.name}_large`);
      await page.goto(`/learn/${v}?slide=1`);
      await setLarge(page, true);
      await shot(page, `before_learn_${vp.name}_large`);
      audit[`before_learn_${vp.name}_large`] = await firstView(page);
      await page.goto("/home");
      await setLarge(page, true);
      await shot(page, `before_home_${vp.name}_large`);
      await setLarge(page, false);
    }
    await ctx.close();
  }
  // 医療者: 診察画面（QR 共有を 1 回作って各幅で表示）
  const patient = await newPage(browser, W[0]);
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const staff = await newPage(browser, W[3]);
  await demoLogin(staff.page, "staff", "山田 太郎");
  const code = await showQrCode(patient.page);
  await staff.page.goto("/staff/scan");
  await staff.page.getByLabel("6桁の番号").fill(code);
  await staff.page.getByRole("button", { name: /共有を要求する/ }).click();
  await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
  await staff.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  await expect(staff.page.getByText(/佐藤 花子 さん/)).toBeVisible({ timeout: 15_000 });
  const consultUrl = staff.page.url();
  for (const vp of W) {
    await staff.page.setViewportSize({ width: vp.width, height: vp.height });
    await staff.page.goto(consultUrl);
    await expect(staff.page.getByText(/佐藤 花子 さん/)).toBeVisible({ timeout: 15_000 });
    if (vp.width >= 1180) await staff.page.getByRole("button", { name: "開く" }).click().catch(() => {});
    await shot(staff.page, `before_consult_${vp.name}`);
    audit[`before_consult_${vp.name}`] = await layoutAudit(staff.page);
  }
  await staff.page.getByRole("button", { name: "終了", exact: true }).click();
  await staff.ctx.close();
  await patient.ctx.close();
  // スタジオ: 構成案（擬似生成は 1 案。3 案の内容は docs/screenshots/day6_20261103/real/d5_02_b_outlines.png を参照）
  const s = await newPage(browser, W[3]);
  await demoLogin(s.page, "staff", "佐藤 一郎");
  await s.page.goto("/staff/studio");
  await openRegisterForm(s.page);
  await s.page.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
  await s.page.getByLabel("資料名").fill("乳がんのホルモン療法を受ける方へ（架空・PB 比較）");
  await s.page.getByLabel("許諾元（著作権者・作成部署）").fill("あおば記念病院（架空）乳腺センター");
  await s.page.getByLabel("許諾の根拠・確認内容").fill("デザイン比較用の架空資料");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.page.getByLabel(l).check();
  await s.page.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await s.page.getByRole("button", { name: "登録する" }).click();
  await s.page.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.page.waitForURL(/\/staff\/studio\/sources\//);
  const srcUrl = s.page.url();
  await s.page.getByRole("button", { name: "構成案を作る" }).click();
  await expect(s.page.getByRole("button", { name: "この案で進む" }).first()).toBeVisible({ timeout: 60_000 });
  for (const vp of W) {
    await s.page.setViewportSize({ width: vp.width, height: vp.height });
    await s.page.goto(srcUrl);
    await expect(s.page.getByRole("button", { name: "この案で進む" }).first()).toBeVisible({ timeout: 30_000 });
    await s.page.getByRole("heading", { name: /Claude の構成案/ }).scrollIntoViewIfNeeded();
    await shot(s.page, `before_outline_${vp.name}`);
  }
  await s.ctx.close();
  writeFileSync(`${OUT}/before_audit.json`, JSON.stringify(audit, null, 2));
});

test("After: Porcelain Blue 版", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const audit: Record<string, unknown> = {};
  const { ctx, page } = await newPage(browser, W[3]);
  await demoLogin(page, "staff", "佐藤 一郎");
  await page.goto("/pb");
  const learnHref = (await page.getByRole("link", { name: "教材学習（図解ストリップ）" }).getAttribute("href"))!;
  const v = new URL(learnHref, "http://x").searchParams.get("versionId")!;
  const screens: [string, string][] = [
    ["home", "/pb/home"],
    ["learn", `/pb/learn?versionId=${v}`],
    ["learn_fullfig", `/pb/learn?versionId=${v}&fig=full`],
    ["result", `/pb/quiz-result?versionId=${v}`],
    ["consult", "/pb/consult"],
    ["outline", "/pb/studio-outline"],
  ];
  for (const vp of W) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const [name, url] of screens) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await shot(page, `after_${name}_${vp.name}`);
      if (name === "result" || name === "outline") await shot(page, `after_${name}_${vp.name}_full`, true);
      const a = await layoutAudit(page);
      audit[`after_${name}_${vp.name}`] = { ...a, ...(name.startsWith("learn") ? await firstView(page) : {}) };
      expect(a.overflowX, `${name}@${vp.name}`).toBe(0);
      if (name === "result" && vp.width <= 430) {
        // 2 段階: テーマを 1 つ選んだ状態
        await page.getByRole("group", { name: "質問のテーマ" }).getByRole("button").first().click();
        await shot(page, `after_result_${vp.name}_picked`);
      }
      if ((name === "home" || name === "learn" || name === "result") && vp.width <= 430) {
        await setLarge(page, true);
        await page.waitForTimeout(200);
        await shot(page, `after_${name}_${vp.name}_large`);
        if (name === "learn") audit[`after_learn_${vp.name}_large`] = await firstView(page);
        await setLarge(page, false);
      }
    }
  }
  writeFileSync(`${OUT}/after_audit.json`, JSON.stringify(audit, null, 2));
  await ctx.close();
});
