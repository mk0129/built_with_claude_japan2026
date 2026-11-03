import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 正式 UI（Figma Make Concept D）。Phase 1: 表示内容は Figma の架空データ（実データ未接続を画面に明示）。
 * - 通常ログイン後: 患者 /home、医療者 /staff に Figma 版が出る。旧 UI の URL は新 UI へ転送
 * - アクセス制御はサーバー側（requirePageUser）
 * - 本番に Figma の検証用 UI（シナリオ選択・テスト状態・Before/After・架空の承認ボタン）を出さない。開発用 /d/dev には残す
 * - 既存 CSS（globals.css）が混ざらない（html 16px、Noto Sans JP）
 * 見た目の一致は scripts/concept-d/compare.mjs で Figma エクスポートと画素比較する。
 */
const noHScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("未ログイン・別ロールのアクセス制御と旧 URL の転送", async ({ browser }) => {
  const anon = await newPage(browser, { width: 390, height: 844 });
  for (const [p, to] of [
    ["/home", /\/login/],
    ["/staff", /\/staff\/login/],
    ["/d/dev", /\/staff\/login/],
  ] as const) {
    const r = await anon.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (anon)`).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(to);
  }
  for (const [p, to] of [
    ["/library", "/home"],
    ["/learn/x", "/home"],
    ["/quiz/x", "/home"],
    ["/scores", "/home"],
    ["/share", "/home"],
    ["/d/patient", "/home"],
    ["/staff/consult/x", "/staff"],
    ["/staff/studio", "/staff"],
    ["/staff/scan", "/staff"],
    ["/d/clinician", "/staff"],
  ] as const) {
    const r = await anon.page.request.get(p, { maxRedirects: 0 });
    expect(r.headers()["location"] ?? "", p).toBe(to);
  }
  await anon.ctx.close();

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  for (const p of ["/staff", "/d/dev"]) {
    const r = await patient.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (patient)`).toContain(r.status());
  }
  await patient.ctx.close();
});

test("患者: ログイン後に Figma 版ホーム。主要な画面遷移、再読み込みで同じ画面", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(page, "patient", "佐藤 花子");
  await expect(page).toHaveURL(/\/home$/);
  const device = page.locator(".d-device");
  await expect(device).toBeVisible();
  await expect(page.locator(".d-scenario-bar, .prototype-bar, .concept-switch")).toHaveCount(0);
  await expect(page.locator("[data-proto-flag]")).toContainText("架空データ");
  expect(await device.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  const css = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).fontSize, font: getComputedStyle(document.body).fontFamily }));
  expect(css.html).toBe("16px");
  expect(css.font).toContain("Noto Sans JP");
  await expect(page.getByRole("heading", { name: "今日、確認すること" })).toBeVisible();

  await page.getByRole("button", { name: /^教材を確認する/ }).click();
  await expect(page).toHaveURL(/view=detail/);
  await page.getByRole("button", { name: /学習を始める/ }).click();
  await expect(page).toHaveURL(/view=learn/);
  await page.reload();
  await expect(page.getByRole("button", { name: "理解を確認する" })).toBeVisible();
  await page.getByRole("button", { name: "理解を確認する" }).click();
  await page.locator(".d-answer-list button").first().click();
  await page.getByRole("button", { name: "この回答で確定する" }).click();
  await page.getByRole("button", { name: "振り返りへ" }).click();
  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await expect(page).toHaveURL(/\/home$/);
  for (const tab of ["教材を探す", "学習記録", "体調記録", "診察ノート"]) {
    await page.locator(".d-nav").getByRole("button", { name: tab }).click();
    await expect(page.locator(".d-nav button.active")).toContainText(tab);
  }
  await page.reload();
  await expect(page.locator(".d-nav button.active")).toContainText("診察ノート");
  await page.goBack();
  await expect(page.locator(".d-nav button.active")).toContainText("体調記録");
  expect(await noHScroll(page)).toBe(0);

  // 一時共有: 本番では共有中を装わない（準備中と知らせる）
  await page.locator(".d-share-chip").click();
  await page.locator(".d-consent input").check();
  await page.getByRole("button", { name: "QRを読み取って共有を開始" }).click();
  await expect(page.locator(".toast")).toContainText("準備中");
  await expect(page.getByText("山田医師と一時共有中です")).toHaveCount(0);

  // PC: Figma のタブレット表示（768px）を中央に置く
  await page.setViewportSize({ width: 1440, height: 948 });
  expect(await device.boundingBox()).toMatchObject({ x: 336, y: 24, width: 768, height: 900 });
  await ctx.close();
});

test("医療者: ログイン後に Figma 版の共有開始。本番に架空の承認ボタンなし。設計幅で中央配置", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, { width: 1440, height: 848 });
  await demoLogin(page, "staff", "山田 太郎");
  await expect(page).toHaveURL(/\/staff$/);
  const device = page.locator(".cd-device");
  await expect(page.locator(".cd-device.cd-1180")).toBeVisible();
  expect(await device.boundingBox()).toMatchObject({ x: 130, y: 24, width: 1180, height: 800 });
  await expect(page.locator(".cd-testbar, .cd-compare-button")).toHaveCount(0);
  await expect(page.getByText("患者一覧はありません")).toBeVisible();
  await page.getByRole("button", { name: "患者との接続を開始" }).click();
  await page.getByRole("button", { name: "6桁コード" }).click();
  await page.getByRole("button", { name: "QRコード" }).click();
  await page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  await expect(page.getByRole("button", { name: /プロトタイプ：/ })).toHaveCount(0);
  await page.getByRole("button", { name: "申請を取り消す" }).click();
  await expect(page.getByRole("heading", { name: "患者へ接続を申請" })).toBeVisible();

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator(".cd-device.cd-820")).toBeVisible();
  expect(await device.boundingBox()).toMatchObject({ x: 140, width: 820 });
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(await noHScroll(page)).toBe(0);
  await ctx.close();
});

test("開発用 /d/dev: 一時共有中 → 診察サマリー・質問・理解確認・在宅経過・情報処方・教材スタジオ", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
  await demoLogin(page, "staff", "山田 太郎");
  await page.goto("/d/dev");
  await page.locator(".view-switch").first().getByRole("button", { name: "医療者" }).click();
  await page.getByRole("button", { name: "患者との接続を開始" }).click();
  await page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await page.getByRole("button", { name: "プロトタイプ：患者が承認" }).click();
  await expect(page.getByText("佐藤 花子さん")).toBeVisible();
  await expect(page.getByRole("heading", { name: "診察サマリー" })).toBeVisible();
  await page.locator(".cd-check-list article > button").first().click();
  await page.getByRole("button", { name: "詳しく確認" }).first().click();
  await page.getByRole("button", { name: "関連教材の候補を見る" }).click();
  await page.getByRole("button", { name: /選択中/ }).click();
  await page.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  for (const v of ["バイタル統合", "症状グラフ", "経過表"]) await page.getByRole("button", { name: v }).click();
  await page.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
  await expect(page.locator(".cd-stepper button")).toHaveCount(7);
  await page.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expect(page.getByText("患者一覧はありません")).toBeVisible();
  await ctx.close();
});
