import { test } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * 患者の言葉で教材に届くか（スマートフォン 390px・架空患者）。
 * 題名にない言葉でも本文・スライドに説明があれば見つかり、該当ページを直接開ける。
 * 題名検索・該当なしは従来どおり。
 */
test("患者: 「食事」「吐き気」「腕」で本文のある教材が見つかり、該当ページを開ける", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const p = patient.page;
  const search = async (word: string) => {
    await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
    await p.getByPlaceholder("教材名やキーワード").fill(word);
    await p.getByRole("button", { name: "検索", exact: true }).click();
    await expect(p.getByRole("heading", { name: `「${word}」の教材` })).toBeVisible();
  };

  // 従来の題名検索
  await search("病期");
  await expect(p.locator(".d-search-hit").filter({ hasText: "乳がんの診断と病期の考え方" })).toHaveCount(1);

  // 該当なし
  await p.getByPlaceholder("例：腕、食事、仕事").fill("該当しない言葉");
  await expect(p.getByRole("heading", { name: "一致する教材がありません" })).toBeVisible();

  // 「腕」: 手術後の教材の該当ページが出る
  await search("腕");
  const arm = p.locator(".d-search-hit").filter({ hasText: "手術後の生活と気をつけること" });
  await expect(arm.locator(".d-search-slides")).toContainText("腕のリハビリ");

  // 「吐き気」: 化学療法の教材
  await search("吐き気");
  await expect(p.locator(".d-search-hit").filter({ hasText: "化学療法中の副作用とセルフケア" }).locator(".d-search-slides")).toContainText("吐き気・食欲が落ちたとき");

  // 「食事」: 該当ページを開くと、そのページの説明が表示される
  await search("食事");
  const meal = p.locator(".d-search-hit").filter({ hasText: "化学療法中の副作用とセルフケア" });
  await meal.getByRole("button", { name: /吐き気・食欲が落ちたとき/ }).click();
  await expect(p.locator(".d-learning h1")).toHaveText("吐き気・食欲が落ちたとき");
  await expect(p.locator(".d-learning")).toContainText("食事");
  await patient.ctx.close();
});
