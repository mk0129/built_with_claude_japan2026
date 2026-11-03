import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoLogin, expect, layoutAudit, newPage, openRegisterForm, showQrCode } from "./helpers";

/**
 * Experience Reset 01 Phase C（医療者の診察画面・教材スタジオ）の撮影と計測。
 * 既定ではスキップ: RESET_SHOTS=1 E2E_SHOT_DIR=docs/design/reset01_phase_c/app npx playwright test reset_phase_c
 * 患者は事前に 3 問（正解・誤答・わからない）と質問を残し、診察画面に「確認したいこと」が出る状態にする。
 */
const OUT = process.env.E2E_SHOT_DIR ?? "docs/design/reset01_phase_c/app";
const W = [
  { name: "1180", width: 1180, height: 820 },
  { name: "820", width: 820, height: 1180 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 },
];
test.skip(!process.env.RESET_SHOTS, "RESET_SHOTS=1 のときだけ撮影する");

const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), font: cs.fontSize };
  }, sel);
/** 医療者画面に文字サイズ切替は無いため、ブラウザ拡大（125%）相当で横スクロールの有無を見る */
async function setZoom(page: Page, on: boolean) {
  await page.evaluate((z) => {
    (document.documentElement.style as unknown as { zoom: string }).zoom = z ? "1.25" : "";
  }, on);
  await page.waitForTimeout(150);
}
/** 固定・粘着要素が最後の内容を隠していないか */
const bottomCheck = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const main = document.querySelector("main") ?? document.querySelector(".rsd-content")!;
    const last = Array.from(main.querySelectorAll("p, li, summary, button, a")).filter((e) => e.getBoundingClientRect().height > 0 && !e.closest("details:not([open])")).at(-1)!;
    const b = last.getBoundingClientRect();
    const el = document.elementFromPoint(Math.min(b.left + b.width / 2, window.innerWidth - 4), b.bottom - 2);
    return { text: (last.textContent ?? "").slice(0, 30), bottom: Math.round(b.bottom), vh: window.innerHeight, coveredByFixed: !!el && !last.contains(el) && ["fixed", "sticky"].includes(getComputedStyle(el.closest("[class]") ?? el).position) };
  });

/** 画面幅を超えている要素（横スクロールの原因調査用） */
const wideElements = (page: Page) =>
  page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll("main *"))
      .filter((e) => e.getBoundingClientRect().right > cw + 1 && !e.closest("[style*='overflow'], .rsd-sidebar"))
      .slice(0, 6)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className.toString().slice(0, 30)}:${(e.textContent ?? "").trim().slice(0, 15)}@${Math.round(e.getBoundingClientRect().right)}`);
  });

async function prepPatient(page: Page) {
  await demoLogin(page, "patient", "佐藤 花子");
  await page.goto("/home");
  const href = await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().getAttribute("href");
  await page.goto(href!.replace("/learn/", "/quiz/").split("?")[0]);
  const retry = page.getByRole("button", { name: /もう一度挑戦する/ });
  await expect(retry.or(page.getByText(/QUESTION \d+/))).toBeVisible({ timeout: 10_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByText(/QUESTION 01/)).toBeVisible({ timeout: 10_000 });
  for (const [pick, msg] of [
    [/^ウ/, "確認できました。"],
    [/^ア/, "一緒に振り返りましょう。"],
    [/^わからない/, /を記録しました/],
  ] as const) {
    await page.getByRole("radio", { name: pick }).click();
    await page.getByRole("button", { name: /回答を確認する/ }).click();
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });
    const next = page.getByRole("button", { name: "次の問題へ" });
    if (await next.isVisible()) await next.click();
  }
  await page.getByRole("button", { name: "学びの結果を見る" }).click();
  await page.getByTestId("ask-theme").first().click();
  await page.getByRole("button", { name: "次の診察に残す" }).click();
  await expect(page.getByText(/次の診察に残しました/)).toBeVisible({ timeout: 10_000 });
}

test("Phase C: 診察画面の撮影・計測", async ({ browser }) => {
  test.setTimeout(400_000);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown> = {};
  const patient = await newPage(browser, { width: 390, height: 844 });
  await prepPatient(patient.page);
  const code = await showQrCode(patient.page);
  // 医療者が共有を要求し、患者が承認
  const first = await newPage(browser, W[0]);
  await demoLogin(first.page, "staff", "山田 太郎");
  await first.page.getByRole("button", { name: /患者さんの QR を読み取る/ }).click();
  await first.page.getByLabel("6桁の番号").fill(code);
  await first.page.getByRole("button", { name: /共有を要求する/ }).click();
  await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 15_000 });
  await first.page.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  const consultUrl = first.page.url();
  await first.ctx.close();

  for (const vp of W) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "staff", "山田 太郎");
    await page.screenshot({ path: `${OUT}/app_staffhome_${vp.name}.png`, fullPage: false });
    await page.goto(consultUrl);
    await expect(page.getByText(/未確認の質問/)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/app_consult_${vp.name}.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/app_consult_${vp.name}_full.png`, fullPage: true });
    metrics[`consult_${vp.name}`] = {
      sidebar: await box(page, ".rsd-sidebar"),
      bar: await box(page, ".rsd-bar"),
      eyebrow: await box(page, ".rsd-eyebrow"),
      h1: await box(page, ".rsd-h1"),
      desc: await box(page, ".rsd-desc"),
      status: await box(page, ".rsd-status"),
      endBtn: await box(page, "button[aria-label='共有を終了']"),
      card: await box(page, ".rsd-grid .rsd-card"),
      infoline: await box(page, ".rsd-infoline"),
      mark: await box(page, ".rsd-mark"),
      primaryBtn: await box(page, ".rsd-infoline .btn-primary"),
      rxPanel: await box(page, "[aria-label='次の情報処方']"),
      ...(await layoutAudit(page)),
      bottom: await bottomCheck(page),
    };
    // 情報処方パネル（PC は右カラム、タブレット以下はドロワー）を開く
    await page.getByRole("button", { name: "開く" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/app_consult_${vp.name}_rx.png`, fullPage: false });
    metrics[`consult_${vp.name}_rx`] = { panel: await box(page, "[aria-label='次の情報処方']"), ...(await layoutAudit(page)) };
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "閉じる" }).first().click({ timeout: 3000 }).catch(() => {});
    // 対応を記録フォーム
    await page.getByRole("button", { name: /^対応する/ }).first().click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/app_consult_${vp.name}_record.png`, fullPage: false });
    if (vp.width <= 430) {
      await setZoom(page, true);
      await page.screenshot({ path: `${OUT}/app_consult_${vp.name}_zoom125.png`, fullPage: false });
      metrics[`consult_${vp.name}_zoom125`] = { ...(await layoutAudit(page)), bottom: await bottomCheck(page), wide: await wideElements(page) };
      await setZoom(page, false);
    }
    await ctx.close();
  }
  await patient.ctx.close();
  writeFileSync(`${OUT}/metrics_consult.json`, JSON.stringify(metrics, null, 2));
  const overflow = Object.entries(metrics).filter(([, m]) => (m as { overflowX: number }).overflowX > 0).map(([k]) => k);
  expect(overflow, "横スクロール").toEqual([]);
  const covered = Object.entries(metrics).filter(([, m]) => (m as { bottom?: { coveredByFixed: boolean } }).bottom?.coveredByFixed).map(([k]) => k);
  expect(covered, "最下部が固定要素に隠れる").toEqual([]);
});

test("Phase C: 教材スタジオ（構成案）の撮影・計測", async ({ browser }) => {
  test.setTimeout(400_000);
  mkdirSync(OUT, { recursive: true });
  const metrics: Record<string, unknown> = {};
  // 原資料を 1 件登録して構成案を作る（擬似生成）
  const setup = await newPage(browser, W[0]);
  const s = setup.page;
  await demoLogin(s, "staff", "佐藤 一郎");
  await s.goto("/staff/studio");
  await openRegisterForm(s);
  await s.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
  await s.getByLabel("資料名").fill(`ホルモン療法を受ける方へ（Reset C ${Date.now().toString().slice(-5)}）`);
  await s.getByLabel("許諾元（著作権者・作成部署）").fill("あおば記念病院（架空）乳腺センター");
  await s.getByLabel("許諾の根拠・確認内容").fill("Phase C 撮影用の架空資料");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.getByLabel(l).check();
  await s.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await s.getByRole("button", { name: "登録する" }).click();
  await s.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.waitForURL(/\/staff\/studio\/sources\//);
  const sourceUrl = s.url();
  await s.getByRole("button", { name: "構成案を作る" }).click();
  await expect(s.getByRole("heading", { name: /構成案が届きました/ })).toBeVisible({ timeout: 60_000 });
  await setup.ctx.close();

  for (const vp of W) {
    const { ctx, page } = await newPage(browser, vp);
    await demoLogin(page, "staff", "佐藤 一郎");
    await page.goto("/staff/studio");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/app_studiohome_${vp.name}.png`, fullPage: false });
    metrics[`studiohome_${vp.name}`] = { h1: await box(page, ".rsd-h1"), stepper: await box(page, ".rsd-stepper"), ...(await layoutAudit(page)) };
    await page.goto(sourceUrl);
    await expect(page.getByRole("heading", { name: /構成案が届きました/ })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/app_studio_${vp.name}.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/app_studio_${vp.name}_full.png`, fullPage: true });
    metrics[`studio_${vp.name}`] = {
      sidebar: await box(page, ".rsd-sidebar"),
      bar: await box(page, ".rsd-bar"),
      eyebrow: await box(page, ".rsd-eyebrow"),
      h1: await box(page, ".rsd-h1"),
      sourcePill: await box(page, ".rsd-source-pill"),
      stepper: await box(page, ".rsd-stepper"),
      outlineHeading: await box(page, "[data-testid='generation-result'] h2"),
      grid: await box(page, ".rsd-outlinegrid"),
      outline: await box(page, ".rsd-outline"),
      outlineH3: await box(page, ".rsd-outline h3"),
      outlineBtn: await box(page, ".rsd-outline .action .btn"),
      nextBtn: await box(page, "[data-testid='generation-result'] .btn-primary"),
      ...(await layoutAudit(page)),
      bottom: await bottomCheck(page),
    };
    // 2 案目を選び、詳細を展開
    const picks = page.getByRole("button", { name: /この案を選ぶ|選択中/ });
    await picks.nth(Math.min(1, (await picks.count()) - 1)).click();
    await page.getByText("詳細を開く").first().click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/app_studio_${vp.name}_selected_full.png`, fullPage: true });
    if (vp.width <= 430) {
      await setZoom(page, true);
      await page.screenshot({ path: `${OUT}/app_studio_${vp.name}_zoom125.png`, fullPage: false });
      metrics[`studio_${vp.name}_zoom125`] = { ...(await layoutAudit(page)) };
      await setZoom(page, false);
    }
    if (vp.name === "1180") {
      await page.getByRole("button", { name: /この構成で次へ/ }).click();
      await expect(page.getByText(/ステップ 3: 必須事項を確認/)).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/app_studio_${vp.name}_mustcover_full.png`, fullPage: true });
    }
    await ctx.close();
  }
  writeFileSync(`${OUT}/metrics_studio.json`, JSON.stringify(metrics, null, 2));
  const overflow = Object.entries(metrics).filter(([, m]) => (m as { overflowX: number }).overflowX > 0).map(([k]) => k);
  expect(overflow, "横スクロール").toEqual([]);
});
