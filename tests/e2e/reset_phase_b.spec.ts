import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoLogin, expect, layoutAudit, newPage } from "./helpers";

/**
 * Experience Reset 01 Phase B（クイズ・学びの結果）の撮影と計測。
 * 既定ではスキップ: RESET_SHOTS=1 E2E_SHOT_DIR=docs/design/reset01_phase_b/app npx playwright test reset_phase_b
 */
const OUT = process.env.E2E_SHOT_DIR ?? "docs/design/reset01_phase_b/app";
const W = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];
test.skip(!process.env.RESET_SHOTS, "RESET_SHOTS=1 のときだけ撮影する");

const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) };
  }, sel);
async function setLarge(page: Page, large: boolean) {
  await page.evaluate((l) => {
    document.documentElement.dataset.textsize = l ? "large" : "";
  }, large);
  await page.waitForTimeout(150);
}
async function openFresh(page: Page) {
  await page.goto("/home");
  const href = await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().getAttribute("href");
  await page.goto(href!.replace("/learn/", "/quiz/").split("?")[0]);
  const retry = page.getByRole("button", { name: /もう一度挑戦する/ });
  await expect(retry.or(page.getByText(/QUESTION \d+/))).toBeVisible({ timeout: 10_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByText(/QUESTION 01/)).toBeVisible({ timeout: 10_000 });
}

test("Phase B: クイズと結果の撮影・計測", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown> = {};
  for (const vp of W) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "patient", "佐藤 花子");
    for (const large of vp.width <= 430 ? [false, true] : [false]) {
      const sfx = `${vp.name}${large ? "_large" : ""}`;
      await openFresh(page);
      await setLarge(page, large);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/app_quiz_${sfx}.png`, fullPage: false });
      metrics[`quiz_${sfx}`] = { progress: await box(page, ".rs-quiz-progress"), number: await box(page, ".rs-qnum"), title: await box(page, ".rs-qtitle"), choice1: await box(page, ".rs-choice"), unknown: await box(page, ".rs-choice.unknown"), cta: await box(page, ".rs-cta"), ctaBtn: await box(page, ".rs-cta .rs-btn"), ...(await layoutAudit(page)) };
      await page.getByRole("radio", { name: /^ウ/ }).click();
      await page.screenshot({ path: `${OUT}/app_quiz_${sfx}_selected.png`, fullPage: false });
      await page.getByRole("button", { name: /回答を確認する/ }).click();
      await expect(page.getByText("確認できました。")).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: `${OUT}/app_quiz_${sfx}_answered.png`, fullPage: false });
      metrics[`quiz_${sfx}_answered`] = { feedback: await box(page, ".rs-feedback"), ...(await layoutAudit(page)) };
      // 残り 2 問: 誤答・わからない → 結果
      await page.getByRole("button", { name: "次の問題へ" }).click();
      await page.getByRole("radio", { name: /^ア/ }).click();
      await page.getByRole("button", { name: /回答を確認する/ }).click();
      await expect(page.getByText("一緒に振り返りましょう。")).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "次の問題へ" }).click();
      await page.getByRole("radio", { name: /^わからない/ }).click();
      await page.getByRole("button", { name: /回答を確認する/ }).click();
      await expect(page.getByText(/を記録しました/)).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "学びの結果を見る" }).click();
      await expect(page.getByText(/ここまで学べました/)).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/app_result_${sfx}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/app_result_${sfx}_full.png`, fullPage: true });
      metrics[`result_${sfx}`] = { icon: await box(page, ".rs-result-icon"), h1: await box(page, ".rs-result-heading h1"), counts: await box(page, ".rs-counts"), qbox: await box(page, ".rs-qbox"), chips: await box(page, ".rs-chiprow"), sectionLabel: await box(page, ".rs-section-label"), toReview: await box(page, ".rs-to-review"), cta: await box(page, ".rs-cta"), ...(await layoutAudit(page)) };
      await page.getByTestId("ask-theme").first().click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/app_result_${sfx}_chip_full.png`, fullPage: true });
      // 最下部まで送っても固定 CTA に隠れない
      const covered = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const main = document.querySelector("main")!;
        const last = Array.from(main.querySelectorAll("p, li, summary, button, a")).filter((e) => e.getBoundingClientRect().height > 0 && !e.closest("details:not([open])")).at(-1)!;
        const b = last.getBoundingClientRect();
        const el = document.elementFromPoint(b.left + b.width / 2, b.bottom - 2);
        const cta = document.querySelector(".rs-cta")!.getBoundingClientRect();
        return { text: (last.textContent ?? "").slice(0, 30), tag: last.tagName, bottom: Math.round(b.bottom), vh: window.innerHeight, ctaTop: Math.round(cta.top), hit: el?.className?.toString().slice(0, 40), pagePad: getComputedStyle(document.querySelector(".rs-page")!).paddingBottom, coveredByFixed: !!el && !last.contains(el) && !!el.closest(".rs-cta, .rs-tabs") };
      });
      metrics[`result_${sfx}_bottom`] = covered;
      expect(covered.coveredByFixed, `結果の最下部が固定 CTA に隠れる (${sfx}): ${JSON.stringify(covered)}`).toBe(false);
      await setLarge(page, false);
    }
    await ctx.close();
  }
  writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
  const overflow = Object.entries(metrics).filter(([, m]) => (m as { overflowX: number }).overflowX > 0).map(([k]) => k);
  expect(overflow, "横スクロール").toEqual([]);
});
