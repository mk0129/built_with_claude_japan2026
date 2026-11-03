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
  await expect(patient.page.locator(".d-share-intro")).toContainText("山田");
  await expect(patient.page.locator(".d-share-intro")).toContainText("閲覧を申請しています");
  const start = patient.page.getByRole("button", { name: "QRを読み取って共有を開始" });
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
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "QRを読み取って共有を開始" }).click();
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

test("6 桁コード（患者発行）: 医療者がコードを入力 → 患者が承認 → 診察サマリー。医療者が共有終了", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const grant = await (await patient.page.request.post("/api/v1/qr", { data: {} })).json();

  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  await issueQr(staff.page);
  await staff.page.getByRole("button", { name: "6桁コード" }).click();
  await staff.page.locator(".cd-code-panel input").fill(grant.code);
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  const ap = await patient.page.request.post(`/api/v1/qr/${grant.grantId}/approve`, { data: {} });
  expect(ap.status()).toBe(200);
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  await staff.page.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();
  const { sessions } = await (await patient.page.request.get("/api/v1/sessions/mine")).json();
  expect(sessions[0]).toMatchObject({ active: false, endedBy: "clinician" });
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
  // QR なしで開始ボタン → 読み取り方の案内のみ（共有中にはならない）
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "QRを読み取って共有を開始" }).click();
  await expect(patient.page.locator(".toast")).toContainText("カメラで");
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する");
  await staff.ctx.close();
  await patient.ctx.close();
});
