import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 患者ホーム（次回診察日・ホームからの質問）と、互換のため残している /c（患者発行のグラントの URL を医療者が開く）の流れ。
 * 読み取り後も患者本人の承認まで共有されない。終了後は 403。無効・使用済みの QR は申請できない。
 * 鈴木 美咲（架空）を使い、最後に登録した次回診察日と質問を元に戻す。
 */
const tokyo = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

test("ホーム: 次回診察日の登録（再読み込みで残る・当日・過去）と、ホームから質問を追加（再読み込みで残る）", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const p = patient.page;
  await demoLogin(p, "patient", "鈴木 美咲");
  // 未登録: 架空の日付を出さず「次回診察日を登録」
  const card = p.locator(".d-visit-card");
  await expect(card).toContainText("次回の診察日は未登録です");
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(14));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toContainText("次の診察まで あと14日");
  await p.reload();
  await expect(p.locator("[data-visit-days]")).toContainText("あと14日");
  // 診察ノートにも同じ日付
  await p.locator(".d-nav").getByRole("button", { name: "診察ノート" }).click();
  await expect(p.locator(".d-visit-date")).toContainText("次回診察日：");
  await expect(p.locator(".d-visit-date")).not.toContainText("未登録");
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  // 当日・過ぎた日
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(0));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toHaveText("今日が診察日です");
  await p.locator("[data-visit-edit]").click();
  await p.locator("[data-visit-input]").fill(tokyo(-2));
  await p.locator("[data-visit-save]").click();
  await expect(p.locator("[data-visit-days]")).toContainText("過ぎました");

  // ホームから質問を追加: 空欄では追加できない。保存に成功したものだけが表示され、再読み込みでも残る
  const add = p.locator("[data-home-note-add]");
  await expect(add).toBeDisabled();
  const text = "治療中の予防接種について聞きたい（E2E）";
  await p.locator("[data-home-note-input]").fill(text);
  await add.click();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  await expect(p.locator("[data-home-note-input]")).toHaveValue("");
  await p.reload();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  // 他の画面へ移って戻っても残る
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-nav").getByRole("button", { name: "ホーム" }).click();
  await expect(p.locator(".d-home-ask-list")).toContainText(text);
  await p.locator(".d-nav").getByRole("button", { name: "診察ノート" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText(text);

  // 後片付け（この患者を使う他のテストに影響させない）
  const { notes } = await (await p.request.get("/api/v1/notes")).json();
  for (const n of notes.filter((x: { body: string }) => x.body === text)) await p.request.delete(`/api/v1/notes/${n.id}`);
  await p.request.put("/api/v1/next-visit", { data: { date: null } });
  await patient.ctx.close();
});

test("互換: 6 桁コードと同時に発行される /c の URL（患者画面には QR を出さない）→ 承認待ち → 患者が申請者を確認して承認 → 閲覧 → 終了で 403。無効・使用済み・取り消し済みは申請できない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  await patient.page.locator(".d-share-chip").click();
  const issued = patient.page.waitForResponse((r) => r.url().endsWith("/api/v1/qr") && r.request().method() === "POST");
  await patient.page.locator("[data-share-issue]").click();
  const g = await (await issued).json();
  // 患者画面には QR を出さない（コードのみ）。同じ発行の /c は互換のため残している
  await expect(patient.page.locator("[data-share-code] img")).toHaveCount(0);
  await expect(patient.page.locator("[data-share-code]")).toContainText(`${g.code.slice(0, 3)} ${g.code.slice(3)}`);
  // 生のトークン（QR の URL）は画面の文字にも URL にも出ない
  expect(await patient.page.locator("body").innerText()).not.toContain(new URL(g.qrUrl).searchParams.get("t"));
  const qrPath = `${new URL(g.qrUrl).pathname}${new URL(g.qrUrl).search}`;

  // 医療者: 未ログインで読み取る → ログイン後に /c へ戻り、承認待ちへ
  const staff = await newPage(browser, { width: 1180, height: 800 });
  await staff.page.goto(qrPath);
  await expect(staff.page).toHaveURL(/\/staff\/login\?returnTo=/);
  await staff.page.getByRole("button", { name: /山田 太郎/ }).first().click();
  await staff.page.waitForURL(/\/staff\?grant=/);
  await expect(staff.page.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  // 承認前: 医療者は患者情報を見られない
  expect((await staff.page.request.get("/api/v1/sessions/mine")).status()).toBe(403);
  const pending = await (await staff.page.request.get(`/api/v1/qr/claim/${g.grantId}`)).json();
  expect(pending.decision).toBe("pending");

  // 患者: 読み取った医療者・医療機関・有効期間を確認して承認（断ることもできる）
  const request = patient.page.locator("[data-share-request]");
  await expect(request).toContainText("さくら総合病院", { timeout: 10_000 });
  await expect(request).toContainText("山田 医師");
  await expect(request).toContainText("承認した時点から60分");
  await expect(patient.page.getByRole("button", { name: "共有しない" })).toBeVisible();
  await patient.page.locator(".d-consent input").check();
  await patient.page.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await expect(patient.page.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible({ timeout: 10_000 });

  // 医療者: 承認後だけ閲覧できる
  await expect(staff.page.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  await expect(staff.page).toHaveURL(/\/staff\?s=/);
  await expect(staff.page).not.toHaveURL(/grant=/);
  const sessionId = new URL(staff.page.url()).searchParams.get("s")!;
  expect((await staff.page.request.get(`/api/v1/consultations/${sessionId}/patient`)).status()).toBe(200);
  // 患者が終了 → 403
  await patient.page.getByRole("button", { name: "一時共有を終了する" }).click();
  await expect(staff.page.getByRole("heading", { name: "一時共有は終了しました" })).toBeVisible({ timeout: 15_000 });
  expect((await staff.page.request.get(`/api/v1/consultations/${sessionId}/patient`)).status()).toBe(403);

  // 使用済みの QR・無効な QR では申請できない
  await staff.page.goto(qrPath);
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  await expect(staff.page).toHaveURL(/\/c$/);
  await staff.page.goto("/c?t=invalid-token-0000000000000000");
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  // 患者が QR を取り消した後も申請できない
  await patient.page.locator(".d-share-chip").click();
  const again = patient.page.waitForResponse((r) => r.url().endsWith("/api/v1/qr") && r.request().method() === "POST");
  await patient.page.locator("[data-share-issue]").click();
  const g2 = await (await again).json();
  await patient.page.getByRole("button", { name: "コードを取り消す" }).click();
  await expect(patient.page.locator("[data-share-code]")).toHaveCount(0);
  await staff.page.goto(`${new URL(g2.qrUrl).pathname}${new URL(g2.qrUrl).search}`);
  await expect(staff.page.locator("[data-claim-error]")).toBeVisible();
  await staff.ctx.close();
  await patient.ctx.close();
});
