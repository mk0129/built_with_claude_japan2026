import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * デザイン比較用スクリーンショット（本番 UI は変更しない）。
 * 既定ではスキップ。`DESIGN_COMPARE=1 E2E_SHOT_DIR=docs/design/compare_20261103 npx playwright test design_compare` で撮影する。
 * - 教材学習: 案 A / B / C × 390 / 430 × 文字サイズ 標準 / 大 × 最初の表示（ビューポート）と全体
 * - クイズ結果: 現行 / 改善案 × 390 / 430、回答直後（保存中）の見え方
 */
const OUT = process.env.E2E_SHOT_DIR ?? "docs/design/compare_20261103";
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
];

test.skip(!process.env.DESIGN_COMPARE, "DESIGN_COMPARE=1 のときだけ撮影する");

async function versionId(page: Page) {
  await page.goto("/design");
  const href = await page.getByRole("link", { name: "教材学習 案 A" }).getAttribute("href");
  return href!.split("/learn/")[1].split("?")[0];
}

async function setLarge(page: Page, large: boolean) {
  await page.evaluate((l) => {
    document.documentElement.dataset.textsize = l ? "large" : "";
    try {
      localStorage.setItem("shiori.textsize", l ? "large" : "normal");
    } catch {}
  }, large);
}

/** 最初の表示に入っている要素を記録（本文・読み上げ・図） */
async function firstViewMetrics(page: Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const inView = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top < vh - 8 && r.bottom > 0 ? Math.round(r.top) : null;
    };
    const body = Array.from(document.querySelectorAll<HTMLElement>("article p")).find((p) => p.className.includes("leading-[1.8]"));
    const speak = Array.from(document.querySelectorAll<HTMLElement>("article button")).find((b) => /読み上げ/.test(b.textContent ?? ""));
    const fig = q("article figure img");
    const toBody = body ? Math.max(0, Math.round(body.getBoundingClientRect().top + window.scrollY - vh + 120)) : null;
    return { viewportH: vh, bodyTop: inView(body ?? null), speakTop: inView(speak ?? null), figureTop: inView(fig as HTMLElement | null), scrollToBody: toBody, docHeight: document.documentElement.scrollHeight };
  });
}

test("教材学習 3 案の撮影と計測", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown>[] = [];
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "佐藤 一郎");
    const v = await versionId(page);
    for (const variant of ["A", "B", "C"] as const) {
      for (const large of [false, true]) {
        await page.goto(`/design/learn/${v}?variant=${variant}&slide=1`);
        await setLarge(page, large);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(300);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const m = await firstViewMetrics(page);
        metrics.push({ variant, width: vp.width, large, ...m });
        const suffix = `${variant}_${vp.name}${large ? "_large" : ""}`;
        await page.screenshot({ path: `${OUT}/learn_${suffix}_first.png`, fullPage: false });
        await page.screenshot({ path: `${OUT}/learn_${suffix}_full.png`, fullPage: true });
      }
    }
    await setLarge(page, false);
    await ctx.close();
  }
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/learn_metrics.json`, JSON.stringify(metrics, null, 2));
});

test("クイズ結果 現行 / 改善案 の撮影", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "佐藤 一郎");
    const v = await versionId(page);
    for (const variant of ["current", "proposed"] as const) {
      await page.goto(`/design/quiz-result/${v}?variant=${variant}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({ path: `${OUT}/result_${variant}_${vp.name}_first.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/result_${variant}_${vp.name}_full.png`, fullPage: true });
      if (variant === "proposed") {
        // 質問候補を 1 つ選んだ状態
        await page.getByRole("button", { name: /同じ病期の人は/ }).click();
        await page.getByRole("button", { name: "質問がある" }).click();
        await page.screenshot({ path: `${OUT}/result_${variant}_${vp.name}_selected.png`, fullPage: false });
      }
      await page.goto(`/design/quiz-result/${v}?variant=${variant}&screen=question`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/question_pending_${variant}_${vp.name}.png`, fullPage: false });
    }
    await ctx.close();
  }
});
