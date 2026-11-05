import { devices, test, type Browser, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * QR 一時共有の正式な方式: 患者が QR コードと 6 桁コードを表示（同じ発行・5 分・1 回限り）→ ログイン済みの医療者が読み取る
 * （端末の標準カメラで QR を読み取ると /c、PC にカメラがなければ 6 桁コードを入力）→ 患者が申請者を確認して明示承認 → 60 分の一時共有。
 * 医療者がスマートフォンで読み取った場合も、同じアカウントでログインしている PC の画面が承認待ち → 診察サマリーへ切り替わる。
 *
 * 実機のスマートフォンから開けるかの確認: E2E_PUBLIC_ORIGIN=http://<PC の LAN の IP>:3100 npx playwright test share_flow
 *   QR の URL がその宛先になり、スマートフォン相当のブラウザ（iPhone の画面・UA・タッチ）で QR の URL をそのまま開いてログイン・読み取りをする。
 */

/** 患者: 共有画面で QR と 6 桁コードを表示する（POST /api/v1/qr の応答を受け取る） */
async function issuePatientQr(patient: Page) {
  await patient.locator(".d-share-chip").click();
  const issued = patient.waitForResponse((r) => r.url().endsWith("/api/v1/qr") && r.request().method() === "POST");
  await patient.getByRole("button", { name: "QRコードと6桁コードを表示する" }).click();
  const g = (await (await issued).json()) as { grantId: string; code: string; qrUrl: string };
  const box = patient.locator("[data-share-code]");
  await expect(box.locator("[data-share-qr] img")).toBeVisible();
  await expect(box).toContainText(`${g.code.slice(0, 3)} ${g.code.slice(3)}`);
  await expect(box).toContainText("1回限り");
  const u = new URL(g.qrUrl);
  return { ...g, path: `${u.pathname}${u.search}` };
}

/** 医療者のスマートフォン（iPhone 相当。カメラで読み取った URL をそのまま開く） */
async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  return { ctx, page: await ctx.newPage() };
}

/** 患者: 申請者・共有範囲・時間を確認して承認 */
async function approve(patient: Page, org: string, clinician: string) {
  const request = patient.locator("[data-share-request]");
  await expect(request).toContainText(org, { timeout: 10_000 });
  await expect(request).toContainText(clinician);
  await expect(request).toContainText("承認した時点から60分");
  await expect(patient.locator(".d-share-scope")).toContainText("理解確認の回答");
  const start = patient.getByRole("button", { name: "この医療者に共有を許可する" });
  await expect(start).toBeDisabled();
  await patient.locator(".d-consent input").check();
  await start.click();
  await expect(patient.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible({ timeout: 10_000 });
}

test("患者 QR → 医療者がスマートフォンで読み取り（未ログイン → ログイン後に戻る）→ 同じアカウントの PC も承認待ちへ → 患者が承認 → PC で診察サマリー → 延長の再承認 → 患者が即時終了 → 403", async ({ browser, baseURL }) => {
  // 医療者の PC: ログイン済みで接続前の画面
  const pc = await newPage(browser, { width: 1440, height: 848 });
  await demoLogin(pc.page, "staff", "山田 太郎");
  await expect(pc.page.getByText("患者一覧はありません")).toBeVisible();

  // 患者: QR と 6 桁コードを同時に表示（カメラ起動のボタンはない）。トークンは画面の文字に出ない
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const g = await issuePatientQr(patient.page);
  await expect(patient.page.getByRole("button", { name: /カメラ/ })).toHaveCount(0);
  await expect(patient.page.getByRole("button", { name: "この医療者に共有を許可する" })).toHaveCount(0);
  expect(await patient.page.locator("body").innerText()).not.toContain(new URL(g.qrUrl).searchParams.get("t"));
  // QR の宛先: 通常は PC と同じ宛先。実機確認時（E2E_PUBLIC_ORIGIN）は LAN の宛先
  expect(new URL(g.qrUrl).origin).toBe(process.env.E2E_PUBLIC_ORIGIN?.replace(/\/$/, "") ?? new URL(baseURL!).origin);

  // 医療者のスマートフォン: 標準カメラで読み取った URL を開く → 未ログインなら医療者ログイン後に戻り、承認待ちへ
  const sp = await phone(browser);
  await sp.page.goto(g.qrUrl);
  await expect(sp.page).toHaveURL(/\/staff\/login\?returnTo=/);
  await sp.page.getByRole("button", { name: /山田 太郎/ }).first().click();
  await sp.page.waitForURL(/\/staff\?grant=/);
  await expect(sp.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();

  // 同じアカウントの PC も自動で承認待ちへ（ID だけを同期。患者情報は承認前に一切返らない）
  await expect(pc.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible({ timeout: 10_000 });
  expect(await (await pc.page.request.get("/api/v1/staff/live")).json()).toEqual({ activeSessionId: null, pendingGrantId: g.grantId });
  const pending = await (await pc.page.request.get(`/api/v1/qr/claim/${g.grantId}`)).json();
  expect(Object.keys(pending).sort()).toEqual(["consultationSessionId", "decision", "grantId"]);
  expect(pending.decision).toBe("pending");
  expect((await pc.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);
  await expect(pc.page.locator("body")).not.toContainText("佐藤 花子");

  // 患者: 読み取った医療機関・医療者・共有範囲・時間を確認して承認
  await approve(patient.page, "さくら総合病院", "山田 医師");
  await expect(patient.page.locator(".d-share-session")).toContainText("さくら総合病院");
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有中");

  // 医療者の PC: 診察サマリー（患者名は実データ）。スマートフォンも同じセッション
  await expect(pc.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  await expect(pc.page.locator(".cd-app-header")).toContainText("佐藤 花子さん");
  await expect(pc.page).toHaveURL(/\/staff\?s=/);
  await expect(pc.page.locator(".cd-session-card")).toContainText(/残り (59|60):/);
  await expect(sp.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  await pc.page.reload();
  await expect(pc.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible();

  // 延長: 患者の再承認まで「再承認待ち」
  await pc.page.getByRole("button", { name: "共有を延長" }).click();
  await expect(pc.page.getByText("患者の再承認待ち")).toBeVisible();
  await expect(patient.page.locator(".toast")).toContainText("延長申請", { timeout: 10_000 });
  await expect(patient.page.locator("[data-share-request]")).toContainText("延長後の有効期間");
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "共有時間の延長を承認する" }).click();
  await expect(patient.page.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible();
  await expect(pc.page.locator(".cd-toast")).toContainText("再承認しました", { timeout: 10_000 });

  // 患者が即時終了 → 医療者は終了画面、API も拒否（PC・スマートフォンとも）
  const sid = new URL(pc.page.url()).searchParams.get("s")!;
  await patient.page.getByRole("button", { name: "一時共有を終了する" }).click();
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する");
  expect((await pc.page.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(403);
  expect((await sp.page.request.get(`${new URL(sp.page.url()).origin}/api/v1/consultations/${sid}/patient`)).status()).toBe(403);
  await expect(pc.page.getByRole("heading", { name: "一時共有は終了しました" })).toBeVisible({ timeout: 10_000 });
  await pc.page.reload();
  await expect(pc.page.getByText("患者一覧はありません")).toBeVisible();

  await pc.ctx.close();
  await sp.ctx.close();
  await patient.ctx.close();
});

test("6 桁コード（PC にカメラがない場合）: 医療者が入力（入力だけでは共有しない）→ 患者が承認 → PC で診察サマリー → 医療者が終了 → 403。使用済み・取り消し済みのコードは使えない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const g = await issuePatientQr(patient.page);

  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  // ゲートのヘッダーは実際の所属（Figma の架空の「乳腺外科」ではない）
  await expect(staff.page.locator(".cd-gate header")).toContainText("さくら総合病院");
  await expect(staff.page.locator(".cd-gate header")).toContainText("山田 医師");
  await staff.page.getByRole("button", { name: "患者のQRを読み取る／6桁コードを入力" }).click();
  await expect(staff.page.locator(".cd-code-panel")).toContainText("5分間・1回限り");
  await staff.page.locator(".cd-code-panel input").fill(g.code);
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  // 入力しただけでは共有しない（患者の承認前は患者情報を取得できない）
  expect((await staff.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);

  await approve(patient.page, "さくら総合病院", "山田 医師");
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  const sid = new URL(staff.page.url()).searchParams.get("s")!;
  expect((await staff.page.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(200);
  // DB にない年齢・病歴・次回診察は架空の値を出さない
  await expect(staff.page.locator(".cd-app-header")).toContainText("未登録");
  await expect(staff.page.locator(".cd-app-header")).not.toContainText("52歳");
  await staff.page.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();
  expect((await staff.page.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(403);
  const { sessions } = await (await patient.page.request.get("/api/v1/sessions/mine")).json();
  expect(sessions[0]).toMatchObject({ active: false, endedBy: "clinician" });

  // 使用済みのコード・取り消したコードは使えない（承認待ちにならない）
  const claimFails = async (c: string) => {
    await staff.page.getByRole("button", { name: "患者のQRを読み取る／6桁コードを入力" }).click();
    await staff.page.locator(".cd-code-panel input").fill(c);
    await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
    await expect(staff.page.locator(".cd-toast")).toContainText("コードが無効か、期限切れ・使用済みです", { timeout: 10_000 });
    await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toHaveCount(0);
    await staff.page.getByRole("button", { name: "← 戻る" }).click();
  };
  await claimFails(g.code);
  await patient.page.goto("/home?view=share");
  const g2 = await issuePatientQr(patient.page);
  await patient.page.getByRole("button", { name: "QRとコードを取り消す" }).click();
  await expect(patient.page.locator("[data-share-code]")).toHaveCount(0);
  await claimFails(g2.code);
  await staff.ctx.close();
  await patient.ctx.close();
});

test("複数の医療機関に所属する医療者: 申請先を選ぶまで申請できない。選んだ医療機関が患者に表示され、患者は断れる", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  const g = await issuePatientQr(patient.page);

  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "中村 健");
  await staff.page.getByRole("button", { name: "患者のQRを読み取る／6桁コードを入力" }).click();
  const select = staff.page.locator(".cd-org-select select");
  await expect(select).toBeVisible();
  await staff.page.locator(".cd-code-panel input").fill(g.code);
  await expect(staff.page.getByRole("button", { name: "患者へ承認を依頼する" })).toBeDisabled();
  await select.selectOption({ label: "ひだまり医療センター（架空）" });
  await expect(staff.page.locator(".cd-gate header")).toContainText("ひだまり医療センター");
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();

  await expect(patient.page.locator("[data-share-request]")).toContainText("ひだまり医療センター", { timeout: 10_000 });
  await expect(patient.page.locator("[data-share-request]")).toContainText("中村 医師");
  await patient.page.getByRole("button", { name: "共有しない" }).click();
  await expect(patient.page.locator(".toast")).toContainText("共有しませんでした");
  await expect(staff.page.locator(".cd-toast")).toContainText("断りました", { timeout: 10_000 });
  await staff.ctx.close();
  await patient.ctx.close();
});

test("医療者が承認前に取り消すと患者は承認できない。使用済み・取り消し済み・無効な QR（/c）は申請できない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "高橋 由美");
  const g = await issuePatientQr(patient.page);

  // 医療者（佐藤 一郎）: ログイン済みの端末で QR の URL を開く → 承認待ち → 取り消す
  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  await staff.page.goto(g.path);
  await staff.page.waitForURL(/\/staff\?grant=/);
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  await expect(patient.page.locator("[data-share-request]")).toContainText("佐藤 医師", { timeout: 10_000 });
  await staff.page.getByRole("button", { name: "申請を取り消す" }).click();
  // 患者: 申請が消え、承認できない
  await expect(patient.page.locator(".toast")).toContainText("医療者が申請を取り消しました", { timeout: 10_000 });
  await expect(patient.page.getByRole("button", { name: "この医療者に共有を許可する" })).toHaveCount(0);
  expect((await patient.page.request.post(`/api/v1/qr/${g.grantId}/approve`, { data: {} })).status()).toBe(409);
  // 取り消した後に、同じ画面が承認待ちへ戻らない（同期で引き継がない）
  await staff.page.waitForTimeout(3000);
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toHaveCount(0);

  // 取り消し済みの QR・無効な QR では申請できない
  await staff.page.goto(g.path);
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  await expect(staff.page).toHaveURL(/\/c$/);
  await staff.page.goto("/c?t=invalid-token-0000000000000000");
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  // 患者が QR を取り消した後も申請できない
  await patient.page.goto("/home?view=share");
  const g2 = await issuePatientQr(patient.page);
  await patient.page.getByRole("button", { name: "QRとコードを取り消す" }).click();
  await expect(patient.page.locator("[data-share-code]")).toHaveCount(0);
  await staff.page.goto(g2.path);
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  await staff.ctx.close();
  await patient.ctx.close();
});
