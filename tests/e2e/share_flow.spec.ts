import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * Step 1: QR 一時共有（医療者が QR を表示 → 患者が読み取り → 明示承認）を、正式 UI（/staff・/home）で通す。
 * 旧 UI の p0_regressions（UX-10 共有終了）・flow（共有開始）の安全性の検証を新 UI 向けに置き換えたもの。
 */
async function issueQr(staff: Page) {
  const res = staff.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
  await staff.getByRole("button", { name: "患者との接続を開始" }).click();
  const body = await (await res).json();
  await expect(staff.locator(".cd-qr-placeholder img")).toBeVisible();
  const u = new URL(body.qrUrl as string);
  return `${u.pathname}${u.search}`;
}

test("医療者 QR → 患者が申請者を確認して承認 → 通常の /staff で診察サマリー → 延長の再承認 → 患者が即時終了", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1440, height: 848 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();
  const qrPath = await issueQr(staff.page);
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  await expect(staff.page.getByRole("button", { name: /プロトタイプ：/ })).toHaveCount(0);
  // 承認前: 医療者は患者情報の API を使えない
  expect((await staff.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);

  // 患者: 未ログインで QR を開く → ログイン後に同じ申請へ戻る
  const patient = await newPage(browser, { width: 390, height: 844 });
  await patient.page.goto(qrPath);
  await expect(patient.page).toHaveURL(/\/login\?returnTo=/);
  await patient.page.getByRole("button", { name: /佐藤 花子/ }).first().click();
  await patient.page.waitForURL(/\/home\?view=share&connect=/);
  await expect(patient.page.locator(".d-share-intro")).toContainText("閲覧を申請しています");
  // 申請先の医療機関・医療者・有効期間・共有する情報を承認前に確認できる
  const request = patient.page.locator("[data-share-request]");
  await expect(request).toContainText("さくら総合病院");
  await expect(request).toContainText("山田 医師");
  await expect(request).toContainText("承認した時点から60分");
  await expect(patient.page.locator(".d-share-scope")).toContainText("理解確認の回答");
  const start = patient.page.getByRole("button", { name: "この医療者に共有を許可する" });
  await expect(start).toBeDisabled();
  await patient.page.locator(".d-consent input").check();
  await start.click();
  await expect(patient.page.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible();
  await expect(patient.page.locator(".d-share-session")).toContainText("さくら総合病院");
  await expect(patient.page).not.toHaveURL(/connect=/);
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有中");

  // 医療者: 通常の /staff で診察サマリー（患者名は実データ）
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  await expect(staff.page.locator(".cd-app-header")).toContainText("佐藤 花子さん");
  await expect(staff.page).toHaveURL(/\/staff\?s=/);
  await expect(staff.page.locator(".cd-session-card")).toContainText(/残り (59|60):/);
  await staff.page.reload();
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible();

  // 延長: 患者の再承認まで「再承認待ち」
  await staff.page.getByRole("button", { name: "共有を延長" }).click();
  await expect(staff.page.getByText("患者の再承認待ち")).toBeVisible();
  await expect(patient.page.locator(".toast")).toContainText("延長申請", { timeout: 10_000 });
  await expect(patient.page.locator(".d-share-intro")).toContainText("延長");
  await expect(patient.page.locator("[data-share-request]")).toContainText("延長後の有効期間");
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "共有時間の延長を承認する" }).click();
  await expect(patient.page.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible();
  await expect(staff.page.locator(".cd-toast")).toContainText("再承認しました", { timeout: 10_000 });
  await expect(staff.page.getByText("患者の再承認待ち")).toHaveCount(0);

  // 患者が即時終了 → 医療者は終了画面、API も拒否
  const sid = new URL(staff.page.url()).searchParams.get("s")!;
  await patient.page.getByRole("button", { name: "一時共有を終了する" }).click();
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する");
  expect((await staff.page.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(403);
  await expect(staff.page.getByRole("heading", { name: "一時共有は終了しました" })).toBeVisible({ timeout: 10_000 });
  await staff.page.reload();
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();

  await staff.ctx.close();
  await patient.ctx.close();
});

test("6 桁コード（患者が共有画面で発行）: 医療者が入力 → 患者が申請者を確認して承認 → 診察サマリー。医療者が共有終了", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  await patient.page.locator(".d-share-chip").click();
  // 申請がないときは承認ボタンを出さない
  await expect(patient.page.locator(".d-share-page .primary-button")).toHaveCount(0);
  await patient.page.getByRole("button", { name: /6桁コードで共有する/ }).click();
  const codeBox = patient.page.locator("[data-share-code]");
  await expect(codeBox).toContainText("1回限り");
  const code = ((await codeBox.locator("b").first().textContent()) ?? "").replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);

  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  // ゲートのヘッダーは実際の所属（Figma の架空の「乳腺外科」ではない）
  await expect(staff.page.locator(".cd-gate header")).toContainText("さくら総合病院");
  await expect(staff.page.locator(".cd-gate header")).toContainText("山田 医師");
  await issueQr(staff.page);
  await staff.page.getByRole("button", { name: "6桁コード" }).click();
  await expect(staff.page.locator(".cd-code-panel")).toContainText("5分間・1回限り");
  await staff.page.locator(".cd-code-panel input").fill(code);
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();

  // 患者: 入力した医療者を確認して承認
  await expect(patient.page.locator("[data-share-request]")).toContainText("山田 医師", { timeout: 10_000 });
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await expect(patient.page.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible({ timeout: 10_000 });
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  // DB にない年齢・病歴・次回診察は架空の値を出さない
  await expect(staff.page.locator(".cd-app-header")).toContainText("未登録");
  await expect(staff.page.locator(".cd-app-header")).not.toContainText("52歳");
  await staff.page.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();
  const { sessions } = await (await patient.page.request.get("/api/v1/sessions/mine")).json();
  expect(sessions[0]).toMatchObject({ active: false, endedBy: "clinician" });
  await staff.ctx.close();
  await patient.ctx.close();
});

test("複数の医療機関に所属する医療者: 申請先を選ぶまで QR を出さない。選んだ医療機関が患者に表示される", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "中村 健");
  await staff.page.getByRole("button", { name: "患者との接続を開始" }).click();
  const select = staff.page.locator(".cd-org-select select");
  await expect(select).toBeVisible();
  await expect(staff.page.locator(".cd-qr-placeholder img")).toHaveCount(0);
  await expect(staff.page.getByRole("button", { name: "患者へ承認を依頼する" })).toBeDisabled();
  const res = staff.page.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
  await select.selectOption({ label: "ひだまり医療センター（架空）" });
  const body = await (await res).json();
  await expect(staff.page.locator(".cd-qr-placeholder img")).toBeVisible();
  await expect(staff.page.locator(".cd-gate header")).toContainText("ひだまり医療センター");
  const u = new URL(body.qrUrl as string);

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  await patient.page.goto(`${u.pathname}${u.search}`);
  await expect(patient.page.locator("[data-share-request]")).toContainText("ひだまり医療センター");
  await expect(patient.page.locator("[data-share-request]")).toContainText("中村 医師");
  await patient.page.getByRole("button", { name: "共有しない" }).click();
  await expect(patient.page.locator(".toast")).toContainText("共有しませんでした");
  await expect(staff.page.locator(".cd-toast")).toContainText("断りました", { timeout: 10_000 });
  await staff.ctx.close();
  await patient.ctx.close();
});

test("使用済み・取り消し済みの QR は承認できない（患者に案内が出る）", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  const qrPath = await issueQr(staff.page);
  // 取り消し → 新しい QR に替わる（古い QR は無効）
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await staff.page.getByRole("button", { name: "申請を取り消す" }).click();
  await expect(staff.page.locator(".cd-qr-placeholder img")).toBeVisible();

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  await patient.page.goto(qrPath);
  await expect(patient.page.locator(".toast")).toContainText("すでに使われています");
  await expect(patient.page).not.toHaveURL(/connect=/);
  // 申請がなければ承認ボタンは出ない（読み取り方の案内のみ。共有中にはならない）
  await expect(patient.page.locator(".d-share-intro")).toContainText("カメラで");
  await expect(patient.page.locator(".d-share-page .primary-button")).toHaveCount(0);
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する");
  await staff.ctx.close();
  await patient.ctx.close();
});
