import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * Figma Make Concept D の移植画面（/d/*、Phase 1: Figma の架空データ）。
 * - アクセス制御はサーバー側（requirePageUser）: 患者画面は患者、医療者画面と開発用画面は医療者だけ
 * - 本番表示に Figma の検証用 UI（シナリオ選択・テスト状態・Before/After・案 A/B/C）が出ないこと
 * - 既存画面の CSS（globals.css）が混ざらないこと（html 16px、Noto Sans JP）
 * 見た目の一致は scripts/concept-d/compare.mjs で Figma エクスポートと画素比較する。
 */
test("未ログイン・別ロールは /d/* を表示できない", async ({ browser }) => {
  const anon = await newPage(browser, { width: 390, height: 844 });
  for (const [p, to] of [
    ["/d/patient", /\/login/],
    ["/d/clinician", /\/staff\/login/],
    ["/d/dev", /\/staff\/login/],
  ] as const) {
    const r = await anon.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (anon)`).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(to);
  }
  await anon.ctx.close();

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  for (const p of ["/d/clinician", "/d/dev"]) {
    const r = await patient.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (patient)`).toContain(r.status());
  }
  await patient.ctx.close();
});

test("患者 Concept D: 全画面表示、検証用 UI なし、主要な画面遷移", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(page, "patient", "佐藤 花子");
  await page.goto("/d/patient");
  const device = page.locator(".d-device");
  await expect(device).toBeVisible();
  await expect(page.locator(".d-scenario-bar, .prototype-bar, .concept-switch")).toHaveCount(0);
  expect(await device.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  const css = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).fontSize, font: getComputedStyle(document.body).fontFamily }));
  expect(css.html).toBe("16px");
  expect(css.font).toContain("Noto Sans JP");
  await expect(page.getByRole("heading", { name: "今日、確認すること" })).toBeVisible();

  await page.getByRole("button", { name: /^教材を確認する/ }).click();
  await page.getByRole("button", { name: /学習を始める/ }).click();
  await page.getByRole("button", { name: "理解を確認する" }).click();
  await page.locator(".d-answer-list button").first().click();
  await page.getByRole("button", { name: "この回答で確定する" }).click();
  await page.getByRole("button", { name: "振り返りへ" }).click();
  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  for (const tab of ["教材を探す", "学習記録", "体調記録", "診察ノート"]) {
    await page.locator(".d-nav").getByRole("button", { name: tab }).click();
    await expect(page.locator(".d-nav button.active")).toContainText(tab);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await ctx.close();
});

test("医療者 Concept D: 共有開始 → サマリー → 在宅経過・教材スタジオ、検証用 UI なし", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(page, "staff", "山田 太郎");
  await page.goto("/d/clinician");
  await expect(page.locator(".cd-device.cd-1180")).toBeVisible();
  await expect(page.locator(".cd-testbar, .cd-compare-button")).toHaveCount(0);
  await expect(page.getByText("患者一覧はありません")).toBeVisible();
  await page.getByRole("button", { name: "患者との接続を開始" }).click();
  await page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await page.getByRole("button", { name: "プロトタイプ：患者が承認" }).click();
  await expect(page.getByText("佐藤 花子さん")).toBeVisible();
  await page.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await page.getByRole("button", { name: "バイタル統合" }).click();
  await page.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
  await expect(page.locator(".cd-stepper button")).toHaveCount(7);
  await page.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expect(page.getByText("患者一覧はありません")).toBeVisible();

  await page.setViewportSize({ width: 820, height: 800 });
  await expect(page.locator(".cd-device.cd-820")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await ctx.close();
});
