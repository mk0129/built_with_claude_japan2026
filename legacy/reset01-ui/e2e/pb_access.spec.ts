import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 比較用ルート /pb/* のアクセス制御（サーバー側）。
 * 未ログイン → /staff/login へ、患者 → /home へ、医療者 → 表示。図解は承認済み（患者公開可）のものだけを使う。
 */
const PAGES = ["/pb", "/pb/home", "/pb/learn", "/pb/quiz-result", "/pb/consult", "/pb/studio-outline"];

test("未ログインと患者は /pb/* を表示できない。医療者は表示できる", async ({ browser }) => {
  const anon = await newPage(browser, { width: 820, height: 1180 });
  for (const p of PAGES) {
    const r = await anon.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (anon) should redirect`).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(/\/staff\/login/);
  }
  await anon.ctx.close();

  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  for (const p of PAGES) {
    const r = await patient.page.request.get(p, { maxRedirects: 0 });
    expect([302, 303, 307, 308], `${p} (patient) should redirect`).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(/\/home/);
  }
  await patient.ctx.close();

  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  await staff.page.goto("/pb");
  await expect(staff.page.getByRole("heading", { name: /Porcelain Blue/ })).toBeVisible();
  // 学習プレビューの図解は患者公開済み（/assets/ 配下）のみ。未承認画像の管理者 URL（/api/v1/admin/figures/）は使わない
  const learnHref = (await staff.page.getByRole("link", { name: "教材学習（図解ストリップ）" }).getAttribute("href"))!;
  await staff.page.goto(learnHref);
  const srcs = await staff.page.locator("article img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src") ?? ""));
  expect(srcs.length).toBeGreaterThan(0);
  for (const s of srcs) expect(s, "図解は承認済みの公開アセットのみ").not.toMatch(/\/api\/v1\/admin\/figures\//);
  await staff.ctx.close();
});
