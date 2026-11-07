import { expect, test } from "@playwright/test";
import { demoLogin, newPage } from "./helpers";

/**
 * 「仕事とお金のこと」→ 医療費シミュレーター（架空の条件）。計算は決定論的な関数（Claude は使わない・入力は保存しない）。
 * 教材 4 件は内容の確認後に登録するため、現時点のテーマの画面は「準備中」の案内とシミュレーター。
 */
test("患者ホーム → 仕事とお金のこと → 医療費シミュレーター（入口の分岐・架空の例・入力の変更・金額を出さない条件の区別）", async ({ browser }) => {
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
  // 入口: 「これから治療する（金額はまだわからない）」「総医療費（10割）や見積もりがわかる」の分岐。適用範囲は短く示し、長い説明は「対象条件を見る」を開いたときだけ
  await expect(p.locator("[data-sim-entry]")).toBeVisible();
  await expect(p.locator("[data-sim-choice='entry-plan']")).toContainText("これから治療する（金額はまだわからない）");
  await expect(p.locator("[data-sim-choice='entry-known']")).toContainText("総医療費（10割）や見積もりがわかる");
  await expect(p.locator("[data-sim-progress]")).toHaveCount(0);
  const scope = p.locator("[data-sim-scope]");
  await expect(scope.getByText("院外処方の薬局の分", { exact: false })).toBeHidden();
  await scope.getByText("対象条件を見る").click();
  await expect(scope.getByText("1つの医療機関の外来か入院のどちらか一方", { exact: false })).toBeVisible();
  await expect(scope.getByText("院外処方の薬局の分", { exact: false })).toBeVisible();
  await p.locator("[data-sim-demo]").click();
  const result = p.locator("[data-sim-result]");
  await expect(result).toBeVisible();
  // 結果の先頭: 対象月・意味・金額・確定額ではない旨・架空例の明示・主操作（初期表示で見える）
  const top = p.locator("[data-sim-summary]");
  await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(top).toContainText("2026年11月の診療分");
  await expect(top).toContainText("保険診療1か月分の自己負担の目安");
  await expect(top).toContainText("確定した請求額ではありません");
  await expect(p.locator("[data-sim-demo-badge]")).toHaveText("架空の例");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("区分ウ");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("架空の条件");
  await expect(p.getByRole("button", { name: "医療費を変えて計算する" })).toBeVisible();
  // 詳細は見出しから開く（開く前は見えない → 開いて内容を確認）
  const breakdown = result.locator("[data-sim-detail='breakdown']");
  await expect(breakdown.getByText("207,060円", { exact: false })).toBeHidden();
  await breakdown.locator("summary").click();
  await expect(breakdown.getByText("300,000円", { exact: false })).toBeVisible();
  await expect(breakdown.getByText("207,060円", { exact: false })).toBeVisible();
  await expect(breakdown.getByText("92,940円", { exact: false })).toBeVisible();
  const excluded = result.locator("[data-sim-detail='excluded']");
  await excluded.locator("summary").click();
  for (const t of ["年間上限", "世帯合算", "同じ医療機関の入院と外来の合算", "払い戻しの時期・手続きは加入している健康保険に確認", "差額ベッド代", "加入している健康保険（保険者）"])
    await expect(excluded.getByText(t, { exact: false }).first()).toBeVisible();
  await expect(result).not.toContainText("2027年8月以降に");
  const sources = result.locator("[data-sim-detail='sources']");
  await sources.locator("summary").click();
  await expect(sources.getByText("2026年8月〜2027年7月の診療分", { exact: false })).toBeVisible();
  await expect(sources.locator("a[href^='https://www.mhlw.go.jp/']").first()).toBeVisible();

  // 実際の入力で結果が変わる: 直前の条件を引き継いで総医療費だけ変える（200万円 → 85,800＋17,140 = 102,940円）
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await expect(p.locator("[data-sim-progress]")).toContainText("6/6");
  await expect(p.locator("[data-sim-cost-input]")).toHaveValue("1,000,000");
  await expect(p.locator("[data-sim-step='6']")).toContainText("保険診療の総医療費（10割）");
  await expect(p.locator("[data-sim-step='6']")).toContainText("窓口で支払った額（3割）ではありません");
  await p.locator("[data-sim-cost-input]").fill("2000000");
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("102,940円");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("区分ウ");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("2,000,000円");

  // 多数回該当「わからない」（一問ずつ: 総医療費の 1 つ前の質問）→ 該当しない場合と該当する場合の両方を最初から表示（推測しない）
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await expect(p.locator("[data-sim-step-key='manyTimes']")).toBeVisible();
  await p.locator("[data-sim-choice='many-unknown']").click();
  await expect(p.locator("[data-sim-cost-input]")).toHaveValue("2,000,000");
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("102,940円");
  await expect(p.locator("[data-sim-alt]")).toBeVisible();
  await expect(p.locator("[data-sim-alt]")).toContainText("44,400円");
  await expect(p.locator("[data-sim-key-conditions]")).toContainText("多数回該当は加入している健康保険に確認");

  // 最初から: 「総医療費がわかる」を選び、手順どおりに一問ずつ（2027年1月・70歳未満・国民健康保険・区分エ・多数回該当しない・30万円）→ 61,500円
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await expect(p.locator("[data-sim-progress]")).toContainText("1/6");
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2027年1月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='national']").click();
  await expect(p.locator("[data-sim-step='4']")).toContainText("旧ただし書き所得"); // 国民健康保険の判定基準
  await expect(p.locator("[data-sim-step='4']")).not.toContainText("標準報酬月額");
  await expect(p.locator("[data-sim-bracket-help]")).toContainText("年収だけでは区分は決まりません");
  await p.locator("[data-sim-choice='bracket-d']").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await p.locator("[data-sim-cost-input]").fill("300000");
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("61,500円");
  await expect(p.locator("[data-sim-demo-badge]")).toHaveCount(0); // 手入力の結果は架空例と表示しない

  // 金額を出さない条件: 「アプリ未対応」「情報が足りない」を区別し、次にできること（確認先）を出す
  await p.getByRole("button", { name: "最初から選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='over70']").click();
  const unsupported = p.locator("[data-sim-unsupported]");
  await expect(unsupported).toContainText("70歳以上");
  await expect(unsupported.locator("[data-sim-reason='age_over70'] [data-sim-kind]")).toHaveText("アプリ未対応");
  await expect(unsupported).toContainText("制度を使えるかどうかの判断ではありません");
  await expect(unsupported.locator("[data-sim-next]")).toContainText("私の所得区分と、1か月の上限額を教えてください");
  await expect(p.locator("[data-sim-amount]")).toHaveCount(0);
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年7月以前" }).click(); // 例: 2024年8月の診療分
  await expect(unsupported).toContainText("見直し前の制度");
  await expect(unsupported.locator("[data-sim-reason='month_before'] [data-sim-kind]")).toHaveText("アプリ未対応");
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='preschool']").click();
  await expect(unsupported.locator("[data-sim-reason='age_preschool'] [data-sim-kind]")).toHaveText("アプリ未対応");
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='insurance-unknown']").click();
  await expect(unsupported.locator("[data-sim-reason='insurance_unknown'] [data-sim-kind]")).toHaveText("情報が足りない");
  await expect(unsupported.locator("[data-sim-next]")).toContainText("マイナポータル");
  await expect(p.locator("[data-sim-amount]")).toHaveCount(0);
  await expect(unsupported.getByText("加入している健康保険（保険者）").first()).toBeVisible(); // 確認・相談先
  // 止まらない: そのまま「病院で見積もりを確認する」へ
  await unsupported.locator("[data-sim-open-ask]").click();
  await expect(p.locator("[data-sim-ask]")).toBeVisible();
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await expect(unsupported).toBeVisible();

  // 所得区分「わからない」: 止めずに区分ごとに並べる（区分を決めない・確認先を示す）
  await p.getByRole("button", { name: "条件を選び直す" }).click();
  await p.locator("[data-sim-choice='entry-known']").click();
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='employee']").click();
  await p.locator("[data-sim-choice='bracket-unknown']").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await p.locator("[data-sim-cost-input]").fill("1000000");
  await p.locator("[data-sim-calc]").click();
  const table = p.locator("[data-sim-table='bracket']");
  await expect(table).toBeVisible();
  await expect(p.locator("[data-sim-bracket-notice]")).toContainText("年収だけでは決まりません");
  await expect(p.locator("[data-sim-bracket-notice] [data-sim-kind]")).toHaveText("情報が足りない");
  await expect(table.locator("[data-sim-row='c'] [data-sim-row-amount]")).toHaveText("92,940円");
  await expect(table.locator("[data-sim-row]")).toHaveCount(5);
  await expect(p.locator("[data-sim-amount]")).toHaveCount(0); // 1 つの金額に決めない

  await ctx.close();
});

test("総医療費を知らない人: 金額を推測せずに「費用を仮定して比べる」「病院で見積もりを確認する」へ進める（390px）", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "伊藤 涼子");
  await p.locator("[data-money-card]").click();
  await p.locator("[data-simulator-open]").click();

  await p.locator("[data-sim-choice='entry-plan']").click();
  await expect(p.locator("[data-sim-plan]")).toContainText("総医療費を推測して入れる必要はありません");

  // 病院で見積もりを確認する: 聞く相手と質問（計算はしない）
  await p.locator("[data-sim-choice='plan-ask']").click();
  const ask = p.locator("[data-sim-ask]");
  await expect(ask).toBeVisible();
  await expect(ask.locator("[data-sim-ask-group]")).toHaveCount(3);
  await expect(ask).toContainText("病院の医療費の相談窓口");
  await expect(ask).toContainText("私の所得区分と、1か月の上限額を教えてください");
  await expect(ask).toContainText("制度の対象外");
  await expect(p.locator("[data-sim-cost-input]")).toHaveCount(0);

  // 費用を仮定して比べる: 総医療費は聞かない（5 問）。仮定額・対象月・概算と分かる表示
  await ask.locator("[data-sim-ask-compare]").click();
  await expect(p.locator("[data-sim-progress]")).toContainText("1/5");
  await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年12月" }).click();
  await p.locator("[data-sim-choice='under70']").click();
  await p.locator("[data-sim-choice='employee']").click();
  await p.locator("[data-sim-choice='bracket-c']").click();
  await p.locator("[data-sim-choice='many-no']").click();
  const table = p.locator("[data-sim-table='cost']");
  await expect(table).toBeVisible();
  await expect(p.locator("[data-sim-cost-input]")).toHaveCount(0);
  await expect(table.locator("[data-sim-summary]")).toContainText("2026年12月の診療分");
  await expect(table.locator("[data-sim-summary]")).toContainText("概算");
  await expect(p.locator("[data-sim-assumed-note]")).toContainText("実際の治療費の予測ではありません");
  await expect(table.locator("[data-sim-row]")).toHaveCount(4);
  await expect(table.locator("[data-sim-row='300000']")).toContainText("総医療費 30万円と仮定");
  await expect(table.locator("[data-sim-row='300000'] [data-sim-row-amount]")).toHaveText("85,940円");
  await expect(table.locator("[data-sim-row='1000000'] [data-sim-row-amount]")).toHaveText("92,940円");
  await expect(table.locator("[data-sim-row='2000000'] [data-sim-row-amount]")).toHaveText("102,940円");
  await expect(table.locator("[data-sim-row-amount]").first()).toBeInViewport();
  expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // 所得区分がわからない: 仮定額を選んで、区分ごとに並べる
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await p.locator("[data-sim-choice='bracket-unknown']").click();
  await p.locator("[data-sim-choice='many-no']").click();
  const byBracket = p.locator("[data-sim-table='bracket']");
  await expect(byBracket).toBeVisible();
  await expect(byBracket.locator("[data-sim-row='c'] [data-sim-row-amount]")).toHaveText("92,940円");
  await p.locator("[data-sim-assumed-cost='300000']").click();
  await expect(byBracket.locator("[data-sim-row='c'] [data-sim-row-amount]")).toHaveText("85,940円");
  await expect(byBracket.locator("[data-sim-row='a'] [data-sim-row-amount]")).toHaveText("90,000円");

  // 総医療費がわかったら、条件を引き継いで金額を入れる（区分ウを選び直して 100万円 → 92,940円）
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await p.getByRole("button", { name: "前の画面へ" }).click();
  await p.locator("[data-sim-choice='bracket-c']").click();
  await p.locator("[data-sim-choice='many-no']").click();
  await p.locator("[data-sim-actual]").click();
  await expect(p.locator("[data-sim-progress]")).toContainText("6/6");
  await p.locator("[data-sim-cost-input]").fill("1000000");
  await p.locator("[data-sim-calc]").click();
  await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
  await expect(p.locator("[data-sim-demo-badge]")).toHaveCount(0);

  // 総医療費の画面からも止まらない: 「費用を仮定して比べる」へ切り替え
  await p.getByRole("button", { name: "医療費を変えて計算する" }).click();
  await p.locator("[data-sim-switch-compare]").click();
  await expect(p.locator("[data-sim-table='cost']")).toBeVisible();
  await ctx.close();
});
