import { expect, test } from "@playwright/test";
import { demoLogin, newPage, shareByPatientCode } from "../e2e/helpers";

/**
 * 「仕事とお金のこと」の撮影条件（基準日 2026-11-04・Claude を呼ばない）。社会制度の 4 教材は 2026-11 にシードへ登録した（SOCIAL_SUPPORT_SEEDED=0 で登録前の確認）。
 * - 承認前（既定）: 教材は「準備中」。公開済みのように見せない（教材のカード・リンク・医療者の教材ライブラリ・テンプレートに出ない）。シミュレーターはテーマの画面から開ける
 * - 承認後（SOCIAL_SUPPORT_SEEDED=1 のときだけ実行）: 4 教材と「仕事とお金のこと」セットが登録され、教材「高額療養費制度を知る」からシミュレーターへ進める
 * 伊藤 涼子で確認する（佐藤 花子の記録は変えない）。
 */
const MONEY_TITLES = ["治療と仕事を両立するために", "傷病手当金を知る", "高額療養費制度を知る", "困ったときの相談先"];
// 2026-11: 社会制度の 4 教材はシードに登録済み（医療者の承認は架空の承認者。本番の制度的監修ではない）。承認前のテストは登録前の環境でだけ実行する
const seeded = process.env.SOCIAL_SUPPORT_SEEDED !== "0";

test("仕事とお金のこと（教材の承認前）: 教材は準備中・公開済みに見せない・シミュレーターはテーマから開ける", async ({ browser }) => {
  test.skip(seeded, "教材を登録した撮影環境では、承認後のテストで確認する");
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "伊藤 涼子");
  // 教材一覧（API）にも 4 教材はない
  const lib = await (await p.request.get("/api/v1/library")).json();
  const titles = (lib.data ?? lib).items.map((i: { title: string }) => i.title);
  for (const t of MONEY_TITLES) expect(titles).not.toContain(t);

  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click(); // 2026-11: テーマは探す画面から
  await p.locator("[data-money-card]").click();
  const theme = p.locator("[data-money-theme]");
  await expect(theme).toBeVisible();
  await expect(p.locator("[data-money-pending]")).toContainText("準備中");
  await expect(p.locator("[data-money-lesson]")).toHaveCount(0);
  await p.locator("[data-simulator-open]").click();
  await p.locator("[data-sim-demo]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(p.locator("[data-sim-amount]")).toBeInViewport();
  await ctx.close();
});

test("仕事とお金のこと（教材の承認前）: 医療者の教材ライブラリ・セットに社会制度の教材が出ない", async ({ browser }) => {
  test.skip(seeded, "教材を登録した撮影環境では、承認後のテストで確認する");
  const s = await newPage(browser, { width: 1180, height: 820 });
  const p = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(s.page, "staff", "佐藤 一郎");
  await demoLogin(p.page, "patient", "伊藤 涼子");
  await shareByPatientCode(s.page, p.page);
  await s.page.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  await expect(s.page.locator(".cd-library-grid")).toBeVisible();
  for (const t of MONEY_TITLES) await expect(s.page.locator(".cd-library-grid")).not.toContainText(t);
  await expect(s.page.locator('[data-template-name="仕事とお金のこと"]')).toHaveCount(0);
  await s.page.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expect(s.page.locator("[data-share-ended]")).toBeVisible();
  await s.ctx.close();
  await p.ctx.close();
});

test("仕事とお金のこと（教材の承認後）: 4 教材・セット・教材からシミュレーターへ", async ({ browser }) => {
  test.skip(!seeded, "社会制度の教材は承認前のため未登録（SOCIAL_SUPPORT_SEEDED=1 の撮影環境で実行）");
  // 医療者: 「仕事とお金のこと」セット（4件）を処方
  const s = await newPage(browser, { width: 1180, height: 820 });
  const p = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(s.page, "staff", "佐藤 一郎");
  await demoLogin(p.page, "patient", "伊藤 涼子");
  await shareByPatientCode(s.page, p.page);
  await s.page.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  const tpl = s.page.locator('[data-template-name="仕事とお金のこと"]');
  await expect(tpl).toContainText("4件");
  await tpl.getByRole("button", { name: /まとめて追加/ }).click();
  await s.page.getByRole("button", { name: /選択中 4件/ }).click();
  await s.page.getByRole("button", { name: "4件の情報処方を確定" }).click();
  await s.page.getByRole("button", { name: "診察を終えて共有終了" }).click();
  await expect(s.page.locator("[data-share-ended]")).toBeVisible();

  // 患者: テーマの画面に 4 教材 → 「高額療養費制度を知る」→ シミュレーター → 戻る
  const pg = p.page;
  await pg.goto("/home");
  await pg.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await pg.locator("[data-money-card]").click();
  await expect(pg.locator("[data-money-pending]")).toHaveCount(0);
  await expect(pg.locator("[data-money-lesson]")).toHaveCount(4);
  await pg.locator("[data-money-lesson]").filter({ hasText: "高額療養費制度を知る" }).click();
  await expect(pg.locator(".d-detail > h1")).toHaveText("高額療養費制度を知る");
  await pg.locator("[data-open-simulator]").click();
  await pg.locator("[data-sim-demo]").click();
  await expect(pg.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(pg.locator("[data-sim-amount]")).toBeInViewport();
  await pg.locator(".d-sim").getByRole("button").first().click(); // 結果 → 入力
  await pg.locator(".d-sim").getByRole("button").first().click(); // 入力 → 教材の詳細
  await expect(pg.locator(".d-detail > h1")).toHaveText("高額療養費制度を知る");
  await s.ctx.close();
  await p.ctx.close();
});
