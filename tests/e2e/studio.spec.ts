import { test } from "@playwright/test";
import { VIEWPORTS, demoLogin, expect, newPage, showQrCode, openRegisterForm } from "./helpers";

/**
 * Day 4 教材スタジオの通し操作（原資料登録 → 生成 → 編集 → 承認 → 処方 → 患者が学習）。
 * - API キーなし: 開発サーバーを CLAUDE_FAKE=1 で起動すると擬似生成で画面を通せる（Claude の検証ではない）
 * - 実 API 検証: .env.local に ANTHROPIC_API_KEY を設定し、CLAUDE_FAKE なしで npm run dev → 同じテストを実行
 * 実行: E2E_SHOT_DIR=docs/screenshots/day4 npx playwright test studio
 */
const SHOT = process.env.E2E_SHOT_DIR ?? "docs/screenshots/day4";
const shot = async (page: import("@playwright/test").Page, name: string) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true });
};

test("原資料の登録から患者への処方まで", async ({ browser }) => {
  test.setTimeout(420_000);
  const staff = await newPage(browser, VIEWPORTS.ipadLandscape);
  const s = staff.page;
  await demoLogin(s, "staff", "佐藤 一郎");
  await s.getByRole("link", { name: "教材スタジオを開く" }).click();
  await s.waitForURL(/\/staff\/studio/);
  await shot(s, "d4_01_studio_top");

  // A. 原資料の登録と許諾
  const stamp = Date.now().toString().slice(-5);
  await openRegisterForm(s);
  await s.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await s.getByLabel("資料名").fill(`ホルモン療法を続けるために（デモ ${stamp}）`);
  await s.getByLabel("許諾元（著作権者・作成部署）").fill("さくら総合病院（架空）乳腺外科");
  await s.getByLabel("許諾の根拠・確認内容").fill("デモ用に作成したオリジナル資料。AI 処理・改変・院内公開を確認（架空）");
  for (const l of ["AI（Claude）で処理してよい", "改変・要約した教材を作ってよい", "患者向けに Web 公開してよい"]) await s.getByLabel(l).check();
  await s.getByLabel(/患者さんの個人情報.*含まないことを確認しました/).check();
  await shot(s, "d4_02_upload_form");
  await s.getByRole("button", { name: "登録する" }).click();
  await expect(s.getByText("登録しました。")).toBeVisible({ timeout: 30_000 });
  await s.getByRole("link", { name: "原資料の画面へ" }).click();
  await s.waitForURL(/\/staff\/studio\/sources\//);
  await expect(s.getByText(/Claude に送信できます/)).toBeVisible();
  await shot(s, "d4_03_source_detail");

  // B. 生成（C 方式: テーマ指定）
  await s.getByLabel("テーマ").fill("ホルモン療法を自己判断でやめないために");
  await s.getByLabel(/学習目標/).fill("続ける期間の考え方を知る\nつらい症状は相談できると知る");
  await s.getByRole("button", { name: "この内容で下書きを作る" }).click();
  // ステップ 3: 必須事項の確認（構成案が無いので候補は空。そのまま生成に進む）
  await expect(s.getByRole("heading", { name: "ステップ 3", exact: false }).or(s.getByText(/ステップ 3: 必須事項を確認/))).toBeVisible();
  await s.getByRole("button", { name: /件を含めて教材・クイズを生成する/ }).click();
  const open = s.getByRole("link", { name: /下書きを確認・編集する/ }).first();
  await expect(open).toBeVisible({ timeout: 180_000 });
  await shot(s, "d4_04_job_done");
  await open.click();
  await s.waitForURL(/\/staff\/studio\/materials\//);
  await expect(s.getByRole("heading", { name: "原資料と比較" })).toBeVisible();
  await shot(s, "d4_05_editor_draft");

  // C. 編集 → 承認依頼 → 承認・公開
  const title = `ホルモン療法を続けるために（監修済み ${stamp}）`;
  await s.getByLabel("タイトル").fill(title);
  await s.getByRole("button", { name: "下書きを保存" }).click();
  await expect(s.getByText("保存しました")).toBeVisible();
  await s.getByRole("button", { name: "承認を依頼する" }).click();
  await expect(s.getByText("承認依頼を出しました")).toBeVisible();
  await expect(s.getByRole("button", { name: "承認して公開する" })).toBeEnabled();
  await shot(s, "d4_06_in_review");
  await s.getByRole("button", { name: "承認して公開する" }).click();
  await expect(s.getByText(/公開中です/)).toBeVisible();
  await shot(s, "d4_07_published");

  // 処方 → 患者が学習
  const patient = await newPage(browser, VIEWPORTS.phone390);
  const p = patient.page;
  await demoLogin(p, "patient", "鈴木 美咲");
  const code = await showQrCode(p);
  await s.goto("/staff");
  await s.getByRole("button", { name: /患者さんの QR を読み取る/ }).click();
  await s.getByLabel("6桁の番号").fill(code);
  await s.getByRole("button", { name: /共有を要求する/ }).click();
  await p.getByRole("button", { name: "許可する" }).click();
  await s.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  await s.getByRole("button", { name: "開く" }).click();
  await s.getByRole("button", { name: "検索" }).click();
  await s.getByLabel("キーワード検索").fill(stamp);
  await s.getByRole("button", { name: "追加", exact: true }).first().click();
  await shot(s, "d4_08_prescribe_new_material");
  await s.getByRole("button", { name: /処方を確定する/ }).click();
  await expect(s.getByText(/件を処方しました/)).toBeVisible();

  await p.goto("/home");
  await p.getByRole("link", { name: new RegExp(`監修済み ${stamp}`) }).first().click();
  await p.waitForURL(/\/learn\//);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(p, "d4_09_patient_learn_new_material");
  await staff.ctx.close();
  await patient.ctx.close();
});

test("権限: 一般医療者はスタジオに入れず、AI 不可の資料は生成ボタンが無効", async ({ browser }) => {
  const { ctx, page } = await newPage(browser, VIEWPORTS.ipadLandscape);
  await demoLogin(page, "staff", "山田 太郎");
  await expect(page.getByRole("link", { name: "教材スタジオを開く" })).toHaveCount(0);
  await page.goto("/staff/studio");
  await expect(page.getByText("教材の編集・承認の権限がありません。")).toBeVisible();
  await ctx.close();

  const t = await newPage(browser, VIEWPORTS.phone390);
  await demoLogin(t.page, "staff", "田中 恵");
  await t.page.goto("/staff/studio");
  await openRegisterForm(t.page);
  await t.page.getByLabel("原資料ファイル").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await t.page.getByLabel("許諾元（著作権者・作成部署）").fill("デモ");
  await t.page.getByLabel("許諾の根拠・確認内容").fill("AI 処理は未許可（デモ）");
  await t.page.getByRole("button", { name: "登録する" }).click();
  await t.page.getByRole("link", { name: "原資料の画面へ" }).click();
  await expect(t.page.getByText("AI 処理はできません。", { exact: true })).toBeVisible();
  await expect(t.page.getByRole("button", { name: "構成案を作る" })).toBeDisabled();
  await shot(t.page, "d4_10_source_ai_blocked_390");
  await t.ctx.close();
});
