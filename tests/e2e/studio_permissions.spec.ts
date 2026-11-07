import { test } from "@playwright/test";
import { demoLogin, expect, expectShareEnded, newPage, shareByPatientCode } from "./helpers";

/**
 * 教材スタジオの利用条件を段階ごとに求める（架空資料。Claude は開発用の擬似生成）。
 * 手順 1 では登録に必要な確認だけを求め、AI 処理・改変の許可がなくても「登録だけ」できる。
 * 許可を得た後に進むと、登録済みの原資料の利用条件を更新して構成案の依頼へ進む。公開の許可は手順 7 で確認する。
 */
test("教材スタジオ: AI処理の許可がなくても登録だけでき、許可後に構成案へ進める", async ({ browser }) => {
  test.setTimeout(120_000);
  const staff = await newPage(browser, { width: 1440, height: 900 });
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  const s = staff.page;
  await shareByPatientCode(s, patient.page);
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();

  const missing = s.locator("[data-step-missing]");
  await expect(missing).toContainText("原資料");
  await expect(missing).toContainText("作成元（許諾元）");
  // 公開・施設外共有の許可は、この段階では求めない（初期値は未確認）
  const stages = s.locator("[data-permission-stages]");
  await expect(stages).toContainText("公開するときに必要");
  await expect(stages.locator(".cd-toggle-row").filter({ hasText: "患者への公開" }).locator("input")).not.toBeChecked();

  await s.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await s.locator(".cd-form-grid input").nth(1).fill("さくら総合病院 薬剤部（架空）");
  await s.locator(".cd-form-grid textarea").fill("院内作成の架空資料。登録のみ（AI処理の許可は確認中）");
  await s.locator(".cd-license-check input").nth(0).check();
  await s.locator(".cd-license-check input").nth(1).check();
  // AI 処理の許可を外す → 次へは進めないが、登録だけはできる
  await stages.locator(".cd-toggle-row").filter({ hasText: "AI処理" }).locator("input").uncheck({ force: true });
  await expect(missing).toContainText("Claudeで作るには: AI処理の許可");
  await expect(s.getByRole("button", { name: "次へ進む" })).toBeDisabled();
  await s.locator("[data-register-only]").click();
  await expect(s.locator(".cd-file-ready")).toContainText("文字を読み取り済み", { timeout: 15_000 });
  await expect(s.locator("[data-register-only]")).toHaveCount(0);

  // 許可を得た後: 登録済みの利用条件を更新して、構成案の依頼へ
  await stages.locator(".cd-toggle-row").filter({ hasText: "AI処理" }).locator("input").check({ force: true });
  await expect(missing).toHaveCount(0);
  await s.getByRole("button", { name: "次へ進む" }).click();
  await expect(s.getByRole("heading", { name: "教材の作成方針" })).toBeVisible({ timeout: 15_000 });
  await s.getByRole("button", { name: "Claudeに構成案を依頼" }).click();
  await expect(s.getByRole("heading", { name: "Claudeの構成案を比較" })).toBeVisible({ timeout: 60_000 });

  await s.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expectShareEnded(s);
});
