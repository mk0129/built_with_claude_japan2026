import { test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage, openRegisterForm } from "./helpers";

/**
 * Day 6 教材スタジオ（6 ステップ・対応が必要・構成案の比較・必須事項・承認前点検）の通しと撮影。
 * 擬似生成モード（Claude は呼ばない）。390 / 430 / 820 / 1180 で横スクロール 0 を検査する。
 */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];

async function registerSource(s: Page, title: string) {
  await s.goto("/staff/studio");
  await openRegisterForm(s);
  await s.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_detailed_demo.docx");
  await s.getByLabel("資料名").fill(title);
  await s.getByLabel("許諾元（著作権者・作成部署）").fill("あおば記念病院（架空）乳腺センター");
  await s.getByLabel("許諾の根拠・確認内容").fill("Day 6 検証用の架空資料");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.getByLabel(l).check();
  await s.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await s.getByRole("button", { name: "登録する" }).click();
  await s.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.waitForURL(/\/staff\/studio\/sources\//);
  return s.url();
}

test("スタジオ 6 ステップ: 構成案の比較 → 必須事項の分類 → 生成 → 承認前点検（安全上の未確認は承認前に警告）", async ({ browser }) => {
  test.setTimeout(300_000);
  const report: Record<string, unknown> = {};
  const { ctx, page: s } = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(s, "staff", "佐藤 一郎");
  const stamp = Date.now().toString().slice(-5);
  const sourceUrl = await registerSource(s, `ホルモン療法を受ける方へ（Day6 ${stamp}）`);

  // ステップ 2: 構成案（比較しやすさ: 同じ項目が同じ順・「おすすめ」なし）
  await expect(s.getByRole("list", { name: "制作の進み方" })).toBeVisible();
  await s.getByRole("button", { name: "構成案を作る" }).click();
  const result = s.getByTestId("generation-result");
  await expect(result.getByRole("heading", { name: /Claude の構成案/ })).toBeVisible({ timeout: 60_000 });
  expect(await result.getByText("おすすめ").count()).toBe(0);
  await expect(result.getByText("学習目標", { exact: false }).first()).toBeVisible();
  await s.screenshot({ path: `${SHOT_DIR}/studio_after_outline_1180.png`, fullPage: false });

  // ステップ 3: 必須事項の分類（この教材で必須 / 別教材で扱う / 医療者の確認が必要）
  await result.getByRole("button", { name: "この案で進む" }).first().click();
  await expect(result.getByText(/ステップ 3: 必須事項を確認/)).toBeVisible();
  await expect(s.getByRole("list", { name: "制作の進み方" }).locator("[aria-current=step]")).toContainText("必須事項を確認");
  const groups = result.getByRole("radiogroup");
  expect(await groups.count()).toBeGreaterThanOrEqual(2);
  await groups.nth(1).getByRole("radio", { name: "別教材で扱う" }).click();
  // 項目を 1 件追加（医療者の確認が必要）
  await result.getByText("必須事項を追加する").click();
  await result.getByLabel("追加する必須事項の文").fill("片足の急な腫れや息苦しさがあれば、次の診察を待たずに連絡する");
  await result.getByLabel("追加する必須事項の種別").selectOption("emergency");
  await result.getByRole("button", { name: "追加", exact: true }).click();
  await groups.nth(2).getByRole("radio", { name: "医療者の確認が必要" }).click();
  await s.screenshot({ path: `${SHOT_DIR}/studio_after_must_cover_1180.png`, fullPage: false });
  await result.getByRole("button", { name: /必須事項 1 件を含めて教材・クイズを生成する/ }).click();
  await expect(result.getByText("下書きができました")).toBeVisible({ timeout: 60_000 });
  await expect(result.getByRole("link", { name: "患者画面で確認する" })).toBeVisible();

  // スタジオホーム: 「対応が必要」に下書きが出る
  await s.goto("/staff/studio");
  const needs = s.getByTestId("needs-action");
  await expect(needs.getByText(/下書き（編集中）/)).toBeVisible();
  await expect(needs.getByRole("link", { name: "編集を続ける" }).first()).toBeVisible();
  await s.screenshot({ path: `${SHOT_DIR}/studio_after_home_1180.png`, fullPage: false });

  // ステップ 6: 編集画面の承認前点検（必須事項と本文の対応・安全上の未確認警告）
  await result.waitFor({ state: "detached" }).catch(() => {});
  await needs.getByRole("link", { name: "編集を続ける" }).first().click();
  await s.waitForURL(/\/staff\/studio\/materials\//);
  const editorUrl = s.url();
  const precheck = s.getByTestId("precheck");
  await expect(precheck).toBeVisible();
  await expect(precheck.getByText(/必須事項と本文の対応（3 件 ・ 別教材で扱う 1 件）/)).toBeVisible();
  await expect(precheck.getByText(/Claude の申告: 画面 1/)).toBeVisible();
  await expect(precheck.getByRole("alert")).toContainText("安全上の重要事項が未確認");
  await s.screenshot({ path: `${SHOT_DIR}/studio_after_precheck_1180.png`, fullPage: false });
  // 承認依頼 → 承認者（本人）は未確認のままでは承認ボタンが無効。了承チェックで有効化、または確認済みにする
  await s.getByRole("button", { name: "承認を依頼する" }).click();
  await expect(s.getByText("承認依頼を出しました")).toBeVisible();
  const approve = s.getByRole("button", { name: "承認して公開する" });
  await expect(approve).toBeDisabled();
  await expect(s.locator("section#actions").getByRole("alert")).toContainText("承認の前に");
  await s.screenshot({ path: `${SHOT_DIR}/studio_after_approve_warning_1180.png`, fullPage: false });
  // 医療者が本文と照合して確認済みにする（2 件: 必須 1 + 要確認 1）
  const confirm = precheck.getByRole("button", { name: "本文と照合して確認済みにする" });
  while ((await confirm.count()) > 0) {
    await confirm.first().click();
    await s.waitForTimeout(400);
  }
  await expect(precheck.getByText(/✓ 医療者が確認済み/).first()).toBeVisible();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(s.getByText(/公開中です/)).toBeVisible();

  // 幅ごとの検査（横スクロール 0）: ホーム / 原資料（構成案あり） / 編集（点検あり）
  const overflow: string[] = [];
  for (const vp of WIDTHS) {
    const { ctx: c, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "佐藤 一郎");
    for (const [label, url] of [
      ["home", "/staff/studio"],
      ["source", sourceUrl],
      ["editor", editorUrl],
    ] as const) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const a = await layoutAudit(page);
      report[`${label}_${vp.name}`] = a;
      if (a.overflowX > 0) overflow.push(`${label}@${vp.name}: +${a.overflowX}px`);
      if (vp.name !== "1180") await page.screenshot({ path: `${SHOT_DIR}/studio_after_${label}_${vp.name}.png`, fullPage: false });
    }
    await c.close();
  }
  writeFileSync(`${SHOT_DIR}/studio_layout_audit.json`, JSON.stringify(report, null, 2));
  expect(overflow, "横スクロールが発生した画面").toEqual([]);
  await ctx.close();
});
