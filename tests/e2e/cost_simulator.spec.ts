import { expect, test } from "@playwright/test";
import { demoLogin, newPage } from "./helpers";

/**
 * 「仕事とお金のこと」→ 医療費シミュレーター（2026-11 の見直し）。計算は決定論的な関数（Claude は使わない・入力は保存しない）。
 * 1 問ずつ選ぶだけで進み、70 歳以上・小学校入学前・保険や区分が「わからない」場合も目安を出す。医療費は金額の入力か、治療内容からの概算。
 */
test("患者ホーム → 仕事とお金のこと → 医療費シミュレーター（架空の例・入力の変更・区分不明・70歳以上・治療内容から）", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "伊藤 涼子");

  // 2026-11: 「仕事とお金のこと」はホームに常設せず、探す画面のテーマから開く
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator("[data-money-card]").click();
  const theme = p.locator("[data-money-theme]");
  await expect(theme).toBeVisible();
  await expect(theme.getByRole("heading", { name: "仕事とお金のこと" })).toBeVisible();
  await expect(p.locator("[data-money-lesson]")).toHaveCount(4); // 社会制度の 4 教材（登録済み）

  // 架空の例をワンタップ → 結果（区分ウ・総医療費100万円: 85,800＋(1,000,000−286,000)×1% = 92,940円）
  await p.locator("[data-simulator-open]").click();
  await expect(p.locator("[data-sim-progress]")).toContainText("1/5");
  await expect(p.locator("[data-sim-progress]")).toContainText("年齢");
  await p.locator("[data-sim-demo]").click();
  const result = p.locator("[data-sim-result]");
  await expect(result).toBeVisible();
  await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(p.locator("[data-sim-summary]")).toContainText("2026年11月の診療分");
  await expect(p.locator("[data-sim-summary]")).toContainText("確定した請求額ではなく目安です");
  await expect(p.locator("[data-sim-demo-badge]")).toHaveText("架空の例");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("区分ウ");
  const breakdown = result.locator("[data-sim-detail='breakdown']");
  await breakdown.locator("summary").click();
  await expect(breakdown.getByText("207,060円", { exact: false })).toBeVisible();

  // 医療費を変えて計算する（直前の条件を引き継ぐ）→ 200 万円 → 102,940 円
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await p.locator("[data-sim-mode='amount']").click();
  await expect(p.locator("[data-sim-cost-input]")).toHaveValue("1,000,000");
  await p.locator("[data-sim-cost-input]").fill("2000000");
  await p.locator("[data-sim-next]").click();
  await p.locator("[data-sim-choice='many-unknown']").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("102,940円");
  await expect(p.locator("[data-sim-alt]")).toContainText("44,400円"); // 多数回該当する場合
  await expect(p.locator("[data-sim-demo-badge]")).toHaveCount(0); // 手入力の結果は架空例と表示しない

  // 最初から: 国民健康保険・年収の目安で区分エ → 金額入力 → 61,500 円
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='national']").click();
  await expect(p.locator("[data-sim-step='bracket']")).toContainText("旧ただし書き所得");
  await p.locator("[data-sim-choice='bracket-d']").click();
  await p.locator("[data-sim-mode='amount']").click();
  await p.locator("[data-sim-cost-input]").fill("1000000");
  await p.locator("[data-sim-next]").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("61,500円");

  // 所得区分が「わからない」: 金額を出さずに止めず、区分ごとの幅と表を出す
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='insurance-unknown']").click();
  await p.locator("[data-sim-choice='bracket-unknown']").click();
  await p.locator("[data-sim-mode='amount']").click();
  await p.locator("[data-sim-cost-input]").fill("1000000");
  await p.locator("[data-sim-next]").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("36,900円〜271,290円");
  await expect(p.locator("[data-sim-scenarios]")).toContainText("区分ウ");
  await expect(p.locator("[data-sim-scenarios]")).toContainText("92,940円");

  // 70 歳以上・2 割・一般・外来: 外来（個人ごと）の上限 22,000 円
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='over70']").click();
  await p.locator("[data-sim-choice='rate-2']").click();
  await p.locator("[data-sim-choice='senior-general']").click();
  await p.locator("[data-sim-mode='amount']").click();
  await p.locator("[data-sim-cost-input]").fill("300000");
  await p.locator("[data-sim-next]").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("22,000円");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("外来（個人の上限）");

  // 治療内容から: EC療法（3週ごと）を選ぶ → 総医療費の幅と自己負担の目安の幅
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='employee']").click();
  await p.locator("[data-sim-choice='bracket-c']").click();
  await p.locator("[data-sim-mode='treatment']").click();
  await p.locator("[data-sim-treatment='ec']").click();
  await expect(p.locator("[data-sim-treatment-sum]")).toContainText("約5万〜16万円");
  await p.locator("[data-sim-next]").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await expect(p.locator("[data-sim-range]")).toContainText("総医療費 約5万〜16万円");
  await expect(p.locator("[data-sim-range]")).toContainText("15,000円〜48,000円");
  await expect(result.locator("[data-sim-detail='treatments']")).toContainText("選んだ治療と費用の目安");

  await ctx.close();
});
