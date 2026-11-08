import { test } from "@playwright/test";
import { expect } from "./helpers";

/**
 * 2026-11: 患者の新規登録画面。入口とログイン画面からたどれ、メールアドレスと 2 つの確認にチェックするまで「確認コードを送る」は押せない。
 * 医療者のログイン画面には自己登録の案内はなく、施設が発行する旨を出す。確認コードの送信以降は統合テスト（signup.test.ts）で確認する。
 */
test("入口 → 新規登録 → メールと確認で送信ボタンが有効になる。医療者側には自己登録がない", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-entry-signup]").click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByRole("heading", { name: "はじめての方の登録" })).toBeVisible();
  const send = page.locator("[data-signup-send]");
  await expect(send).toBeDisabled();
  await page.locator("[data-signup-email]").fill("new.patient@example.com");
  await expect(send).toBeDisabled();
  await page.locator("[data-signup-consent-demo]").check();
  await page.locator("[data-signup-consent-share]").check();
  await expect(send).toBeEnabled();
  // ログイン画面からも新規登録へ
  await page.goto("/login");
  await page.locator("[data-to-signup]").click();
  await expect(page).toHaveURL(/\/signup/);
  // 医療者のログイン画面には自己登録の導線がない
  await page.goto("/staff/login");
  await expect(page.locator("[data-to-signup]")).toHaveCount(0);
  await expect(page.getByText("ご所属の医療機関が発行します")).toBeVisible();
});
