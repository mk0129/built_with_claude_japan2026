import { devices, test, type Browser, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * QR 一時共有の正式な方式（医療者が QR を表示 → 患者がスマートフォンの標準カメラで読み取り → 申請者を確認して明示承認）を、正式 UI（/staff・/home）で通す。
 * 読み取れないときの代替（患者が 6 桁コードを表示 → 医療者が PC で入力 → 患者が承認）も確認する。
 * 旧 UI の p0_regressions（UX-10 共有終了）・flow（共有開始）の安全性の検証を新 UI 向けに置き換えたもの。
 *
 * 実機のスマートフォンから開けるかの確認: E2E_PUBLIC_ORIGIN=http://<PC の LAN の IP>:3100 npx playwright test share_flow
 *   QR の URL がその宛先になり、スマートフォン相当のブラウザ（iPhone の画面・UA・タッチ）で QR の URL をそのまま開いてログイン・承認する。
 */
async function issueQr(staff: Page) {
  const res = staff.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
  await staff.getByRole("button", { name: "患者との接続を開始" }).click();
  const body = await (await res).json();
  await expect(staff.locator(".cd-qr-placeholder img")).toBeVisible();
  const u = new URL(body.qrUrl as string);
  return { path: `${u.pathname}${u.search}`, url: body.qrUrl as string, orgId: body.orgId as string };
}

/** 患者のスマートフォン（iPhone 相当。カメラで読み取った URL をそのまま開く） */
async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  return { ctx, page: await ctx.newPage() };
}

test("医療者 QR → 患者がスマートフォンで読み取り（未ログイン → ログイン後に承認画面へ戻る）→ 承認 → 通常の /staff で診察サマリー → 延長の再承認 → 患者が即時終了", async ({ browser, baseURL }) => {
  const staff = await newPage(browser, { width: 1440, height: 848 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  await expect(staff.page.getByText("患者一覧はありません")).toBeVisible();
  const qr = await issueQr(staff.page);
  // QR の提示が主。医療者側に「依頼する」操作はなく、患者の読み取りと承認を待つ（承認されると自動で切り替わる）
  await expect(staff.page.locator("[data-qr-waiting]")).toContainText("患者の読み取りと承認を待っています");
  await expect(staff.page.locator("[data-connect-steps]")).toContainText("スマートフォンのカメラ");
  await expect(staff.page.getByRole("button", { name: "患者へ承認を依頼する" })).toHaveCount(0);
  await expect(staff.page.getByRole("button", { name: /プロトタイプ：/ })).toHaveCount(0);
  // QR の宛先: 通常は PC と同じ宛先。実機確認時（E2E_PUBLIC_ORIGIN）は LAN の宛先
  expect(new URL(qr.url).origin).toBe(process.env.E2E_PUBLIC_ORIGIN?.replace(/\/$/, "") ?? new URL(baseURL!).origin);
  // 承認前: 医療者は患者情報の API を使えない
  expect((await staff.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);

  // 患者: スマートフォンで QR の URL をそのまま開く（未ログイン）→ ログイン後に同じ申請へ戻る
  const patient = await phone(browser);
  await patient.page.goto(qr.url);
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

test("QR を読み取れない場合の 6 桁コード: 患者が表示 → 医療者が PC で入力（入力だけでは共有しない）→ 患者が申請者を確認して承認 → 診察サマリー。医療者が共有終了。使用済み・取り消し済みのコードは使えない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  await patient.page.locator(".d-share-chip").click();
  // 通常は医療者の QR を読み取る案内。患者側にカメラ起動のボタンや患者の QR は出さない
  await expect(patient.page.locator("[data-share-steps]")).toContainText("医療者の画面のQRコードを読み取る");
  await expect(patient.page.locator(".d-share-page img")).toHaveCount(0);
  await expect(patient.page.getByRole("button", { name: /カメラ|QRコードと6桁コード/ })).toHaveCount(0);
  // 申請がないときは承認ボタンを出さない
  await expect(patient.page.getByRole("button", { name: "この医療者に共有を許可する" })).toHaveCount(0);
  await patient.page.getByRole("button", { name: "QRコードを読み取れない場合は6桁コードを表示" }).click();
  const codeBox = patient.page.locator("[data-share-code]");
  await expect(codeBox).toContainText("1回限り");
  await expect(codeBox).toContainText("入力しただけでは共有されません");
  await expect(codeBox.locator("img")).toHaveCount(0);
  const code = ((await codeBox.locator("b").first().textContent()) ?? "").replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);

  const staff = await newPage(browser, { width: 1180, height: 800 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  // ゲートのヘッダーは実際の所属（Figma の架空の「乳腺外科」ではない）
  await expect(staff.page.locator(".cd-gate header")).toContainText("さくら総合病院");
  await expect(staff.page.locator(".cd-gate header")).toContainText("山田 医師");
  const { orgId } = await issueQr(staff.page);
  await staff.page.getByRole("button", { name: "6桁コード（読み取れない場合）" }).click();
  await expect(staff.page.locator(".cd-code-panel")).toContainText("5分間・1回限り");
  await staff.page.locator(".cd-code-panel input").fill(code);
  await staff.page.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  // 入力しただけでは共有しない（患者の承認前は患者情報を取得できない）
  expect((await staff.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);

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

  // 使用済みのコードは使えない
  const claim = async (c: string) => {
    const r = await staff.page.request.post("/api/v1/qr/claim", { data: { orgId, code: c } });
    return { status: r.status(), body: await r.text() };
  };
  expect(await claim(code)).toMatchObject({ status: 404, body: expect.stringContaining("GRANT_INVALID_OR_USED") });
  // 取り消したコードも使えない
  await patient.page.getByRole("button", { name: "QRコードを読み取れない場合は6桁コードを表示" }).click();
  const code2 = ((await codeBox.locator("b").first().textContent()) ?? "").replace(/\D/g, "");
  await patient.page.getByRole("button", { name: "コードを取り消す" }).click();
  await expect(codeBox).toHaveCount(0);
  expect(await claim(code2)).toMatchObject({ status: 404, body: expect.stringContaining("GRANT_INVALID_OR_USED") });
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
  await expect(staff.page.locator("[data-qr-waiting]")).toContainText("申請を出す医療機関を選んでください");
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
  const { path: qrPath } = await issueQr(staff.page);
  // 取り消し（戻る）→ もう一度 QR を表示（古い QR は無効）
  await staff.page.getByRole("button", { name: "← 戻る" }).click();
  await issueQr(staff.page);

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  await patient.page.goto(qrPath);
  await expect(patient.page.locator(".toast")).toContainText("すでに使われています");
  await expect(patient.page).not.toHaveURL(/connect=/);
  // 申請がなければ承認ボタンは出ない（読み取り方の案内のみ。共有中にはならない）
  await expect(patient.page.locator(".d-share-intro")).toContainText("カメラで");
  await expect(patient.page.getByRole("button", { name: "この医療者に共有を許可する" })).toHaveCount(0);
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する");
  await staff.ctx.close();
  await patient.ctx.close();
});
