import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, newPage } from "./helpers";

/**
 * P0-1 受け入れ条件: 375 / 390 / 430px で学習・クイズ・ホームの主要ボタンが固定ナビに隠れない。
 * シードされたデモ履歴（佐藤 花子）の教材を使うので、他のテストに依存しない。
 */
const WIDTHS = [
  { name: "iphoneSE", width: 375, height: 667 },
  { name: "iphone390", width: 390, height: 844 },
  { name: "iphone430", width: 430, height: 932 },
];

async function assertReachable(page: import("@playwright/test").Page, name: RegExp | string) {
  const btn = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();
  const r = await btn.evaluate((el) => {
    el.scrollIntoView({ block: "end" });
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const nav = document.querySelector("nav[data-patient-tabs]");
    return {
      bottom: Math.round(b.bottom),
      vh: window.innerHeight,
      covered: !!top && !el.contains(top) && top !== el,
      coveredByNav: !!nav && !!top && nav.contains(top),
      navPresent: !!nav,
    };
  });
  expect(r.covered, `${String(name)} が他の要素に隠れている`).toBe(false);
  expect(r.bottom, `${String(name)} が画面外`).toBeLessThanOrEqual(r.vh + 1);
  return r;
}

test("主要ボタンが下部ナビに隠れない（375 / 390 / 430）", async ({ browser }) => {
  const report: Record<string, unknown>[] = [];
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    // ホーム: 主導線
    const home = await assertReachable(page, /読む・聞く|続きから読む|確認問題の続きから|もう一度読む/);
    expect(home.navPresent).toBe(true);
    await page.screenshot({ path: `${SHOT_DIR}/cta_${vp.name}_home.png` });
    // 学習: ナビなし、次へが到達可能
    const href = await page.locator('a[href^="/learn/"]').first().getAttribute("href");
    await page.goto(href!);
    const learn = await assertReachable(page, /次へ|確認問題へ/);
    expect(learn.navPresent, "学習画面に下部ナビが出ている").toBe(false);
    await page.screenshot({ path: `${SHOT_DIR}/cta_${vp.name}_learn.png` });
    // クイズ: 回答後の「次の問題へ / 結果を見る」が到達可能
    await page.goto(href!.replace("/learn/", "/quiz/"));
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const unanswered = page.getByRole("button", { name: /^ア/ });
    if ((await unanswered.count()) > 0 && (await unanswered.isEnabled({ timeout: 1000 }).catch(() => false))) {
      await unanswered.click();
      await expect(page.getByText(/正解です|こちらが正解です/).first()).toBeVisible({ timeout: 10_000 });
    }
    const quiz = await assertReachable(page, /次の問題へ|結果を見る|もう一度挑戦する/);
    expect(quiz.navPresent, "クイズ画面に下部ナビが出ている").toBe(false);
    await page.screenshot({ path: `${SHOT_DIR}/cta_${vp.name}_quiz.png` });
    report.push({ viewport: vp, home, learn, quiz });
    await ctx.close();
  }
  writeFileSync(`${SHOT_DIR}/cta_audit.json`, JSON.stringify(report, null, 2));
});
