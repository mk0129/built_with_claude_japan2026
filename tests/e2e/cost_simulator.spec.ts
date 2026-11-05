import { expect, test } from "@playwright/test";
import { demoLogin, newPage } from "./helpers";

/**
 * 「仕事とお金のこと」→ 医療費シミュレーター（架空の条件）。計算は決定論的な関数（Claude は使わない・入力は保存しない）。
 * 教材 4 件は内容の確認後に登録するため、現時点のテーマの画面は「準備中」の案内とシミュレーター。
 */
test("患者ホーム → 仕事とお金のこと → 医療費シミュレーター（架空の例・入力の変更・対象外の条件）", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "伊藤 涼子");

  await p.locator("[data-money-card]").click();
  const theme = p.locator("[data-money-theme]");
  await expect(theme).toBeVisible();
  await expect(theme.getByRole("heading", { name: "仕事とお金のこと" })).toBeVisible();
  await expect(theme).toContainText("このアプリでは判定しません");
  await expect(p.locator("[data-money-pending]")).toBeVisible(); // 教材は未登録（準備中）

  // 架空の例をワンタップ → 結果（区分ウ・総医療費100万円: 85,800＋(1,000,000−286,000)×1% = 92,940円）
  await p.locator("[data-simulator-open]").click();
  await expect(p.locator("[data-sim]")).toContainText("1つの医療機関の外来か入院のどちらか一方");
  await expect(p.locator("[data-sim]")).toContainText("院外処方の薬局の分");
  await p.locator("[data-sim-demo]").click();
  const result = p.locator("[data-sim-result]");
  await expect(result).toBeVisible();
  await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(result).toContainText("300,000円");
  await expect(result).toContainText("207,060円");
  await expect(result).toContainText("2026年8月〜2027年7月の診療分");
  await expect(result).toContainText("確定した請求額ではありません");
  await expect(result).toContainText("年間上限");
  await expect(result).toContainText("世帯合算");
  await expect(result).toContainText("同じ医療機関の入院と外来の合算");
  await expect(result).toContainText("払い戻しの時期・手続きは加入している健康保険に確認");
  await expect(result).not.toContainText("2027年8月以降に");
  await expect(result).toContainText("差額ベッド代");
  await expect(result).toContainText("加入している健康保険（保険者）");
  await expect(result.locator("a[href^='https://www.mhlw.go.jp/']").first()).toBeVisible();

  // 実際の入力で結果が変わる: 総医療費 200万円 → 85,800＋17,140 = 102,940円
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await p.locator("[data-sim-cost-input]").fill("2000000");
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("102,940円");

  // 多数回該当「わからない」→ 該当しない場合と該当する場合を両方表示（推測しない）
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await p.getByRole("radio", { name: "わからない" }).click();
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("102,940円");
  await expect(p.locator("[data-sim-alt]")).toContainText("44,400円");

  // 最初から: 手順どおりに選ぶ（2027年1月・70歳未満・国民健康保険・区分エ・30万円）→ 61,500円
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2027年1月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='national']").click();
  await expect(p.locator("[data-sim-step='4']")).toContainText("旧ただし書き所得"); // 国民健康保険の判定基準
  await expect(p.locator("[data-sim-step='4']")).not.toContainText("標準報酬月額");
  await p.locator("[data-sim-choice='bracket-d']").click();
  await p.getByRole("button", { name: "30万円" }).click();
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("61,500円");

  // 対象外の条件では金額を出さない
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='over70']").click();
  await expect(p.locator("[data-sim-unsupported]")).toContainText("70歳以上");
  await expect(p.locator("[data-sim-amount]")).toHaveCount(0);
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年7月以前" }).click();
  await expect(p.locator("[data-sim-unsupported]")).toContainText("見直し前の制度");
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='employee']").click();
  await p.locator("[data-sim-choice='bracket-unknown']").click();
  await expect(p.locator("[data-sim-unsupported]")).toContainText("所得区分は加入している健康保険が判定します");
  await expect(p.locator("[data-sim-amount]")).toHaveCount(0);

  await ctx.close();
});
