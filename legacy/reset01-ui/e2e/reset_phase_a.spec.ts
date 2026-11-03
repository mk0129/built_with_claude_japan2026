import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoLogin, expect, layoutAudit, newPage } from "./helpers";

/**
 * Experience Reset 01 Phase A（患者ホーム・教材学習）の撮影と計測。
 * 既定ではスキップ: RESET_SHOTS=1 E2E_SHOT_DIR=docs/design/reset01_phase_a/app npx playwright test reset_phase_a
 * 390 / 430（標準・文字拡大）、820 / 1180（表示崩れの確認）。参照 HTML と同じ要素の位置を記録する。
 */
const OUT = process.env.E2E_SHOT_DIR ?? "docs/design/reset01_phase_a/app";
const W = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];
test.skip(!process.env.RESET_SHOTS, "RESET_SHOTS=1 のときだけ撮影する");

async function setLarge(page: Page, large: boolean) {
  await page.evaluate((l) => {
    document.documentElement.dataset.textsize = l ? "large" : "";
  }, large);
  await page.waitForTimeout(150);
}
const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) };
  }, sel);

test("Phase A: 患者ホームと教材学習の撮影・計測", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown> = {};
  for (const vp of W) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "patient", "佐藤 花子");
    await page.waitForLoadState("networkidle");
    for (const large of vp.width <= 430 ? [false, true] : [false]) {
      await setLarge(page, large);
      const sfx = `${vp.name}${large ? "_large" : ""}`;
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/app_home_${sfx}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/app_home_${sfx}_full.png`, fullPage: true });
      const homeBottom = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const main = document.querySelector("main")!;
        const last = Array.from(main.querySelectorAll("p, li, button, a")).filter((e) => e.getBoundingClientRect().height > 0 && !e.closest("details:not([open])")).at(-1)!;
        const b = last.getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.bottom - 2);
        const r = { text: (last.textContent ?? "").slice(0, 30), bottom: Math.round(b.bottom), vh: window.innerHeight, coveredByFixed: !!el && !last.contains(el) && !!el.closest(".rs-cta, .rs-tabs") };
        window.scrollTo(0, 0);
        return r;
      });
      expect(homeBottom.coveredByFixed, `ホーム最下部の要素が下部タブに隠れる (${sfx}): ${homeBottom.text}`).toBe(false);
      metrics[`home_${sfx}_bottom`] = homeBottom;
      metrics[`home_${sfx}`] = {
        header: await box(page, ".rs-header"),
        hero: await box(page, ".rs-hero"),
        heroImg: await box(page, ".rs-hero-photo"),
        h1: await box(page, ".rs-hero-text .rs-h1"),
        rxCard: await box(page, ".rs-rx"),
        rxTitle: await box(page, ".rs-rx h2"),
        primaryBtn: await box(page, ".rs-rx .rs-btn.primary"),
        tabs: await box(page, ".rs-tabs"),
        ...(await layoutAudit(page)),
      };
    }
    await setLarge(page, false);
    await page.goto("/library"); // Phase E: 前回までの処方はホームでは折りたたみ。教材は「まなぶ」から開く
    const href = await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().getAttribute("href");
    const v = href!.split("/")[2].split("?")[0];
    for (const large of vp.width <= 430 ? [false, true] : [false]) {
      await page.goto(`/learn/${v}?slide=1`);
      await setLarge(page, large);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(200);
      const sfx = `${vp.name}${large ? "_large" : ""}`;
      await page.screenshot({ path: `${OUT}/app_learn_${sfx}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/app_learn_${sfx}_full.png`, fullPage: true });
      metrics[`learn_${sfx}`] = {
        header: await box(page, ".rs-header"),
        h1: await box(page, ".rs-h1"),
        prop: await box(page, ".rs-prop"),
        listen: await box(page, ".rs-listen"),
        short: await box(page, ".rs-short"),
        figure: await box(page, ".rs-figure"),
        segments: await box(page, ".rs-segments"),
        figMain: await box(page, ".rs-figmain"),
        cta: await box(page, ".rs-cta"),
        primaryBtn: await box(page, ".rs-cta .rs-btn.primary"),
        ...(await layoutAudit(page)),
      };
      // 図の 3 タブ（390 / 430 は標準・拡大とも撮影）。タブ名が省略（ellipsis）されていないことを確認
      const tabs = page.getByRole("tab");
      const n = await tabs.count();
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
        const clipped = await tabs.nth(i).evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(clipped, `タブ名が省略されている (${sfx}, tab ${i + 1})`).toBe(false);
        if (vp.width <= 430) {
          await page.locator(".rs-figure").screenshot({ path: `${OUT}/app_learn_${sfx}_fig${i + 1}.png` });
        }
      }
      // 最下部までスクロールしても固定 CTA に本文・詳細・ボタンが隠れない
      await page.locator("details.rs-details > summary").click().catch(() => {});
      const covered = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const main = document.querySelector("main")!;
        const last = Array.from(main.querySelectorAll("p, li, summary, button, a")).filter((e) => e.getBoundingClientRect().height > 0 && !e.closest("details:not([open])")).at(-1)!;
        const b = last.getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.bottom - 2);
        return { text: (last.textContent ?? "").slice(0, 30), bottom: Math.round(b.bottom), vh: window.innerHeight, coveredByFixed: !!el && !last.contains(el) && !!el.closest(".rs-cta, .rs-tabs") };
      });
      metrics[`learn_${sfx}_bottom`] = covered;
      expect(covered.coveredByFixed, `最下部の要素が固定 CTA に隠れる (${sfx}): ${covered.text}`).toBe(false);
      if (!large) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: /次のページへ/ }).click();
        await expect(page.getByText(/2 \/ 4/)).toBeVisible();
      }
    }
    await setLarge(page, false);
    await ctx.close();
  }
  writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
  const overflow = Object.entries(metrics).filter(([, m]) => (m as { overflowX: number }).overflowX > 0).map(([k]) => k);
  expect(overflow, "横スクロール").toEqual([]);
});
