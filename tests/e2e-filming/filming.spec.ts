import { expect, test, type Page } from "@playwright/test";
import { demoLogin, newPage, shareByPatientCode } from "../e2e/helpers";

/**
 * 撮影条件の通し確認（playwright.filming.config.ts: 基準日 2026-11-04・記録済みの Claude 出力の再生・日本時間・Claude を呼ばない）。
 * - 伊藤 涼子: 医療者が「初回診断時セット」を処方 → 患者ホームの診断時セット → セットの内容 → 学習 → 理解確認（わからない）→ 質問
 * - 佐藤 花子: 経過グラフ（記録のない日で線を切る）→ 6 桁コードで共有 → Claude外来間サマリー（再生・要点 3 項目・根拠）→ 在宅経過表の期間 → 共有終了で 403
 * 佐藤 花子の記録は変えない（再生の条件を保つ）。
 */
const SET_TITLES = ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先"];

async function expect403(page: Page, sid: string) {
  // 共有終了の要求が終わるまで待つ（終了後は医療者の API が 403）
  await expect.poll(async () => (await page.request.get(`/api/v1/consultations/${sid}/patient`)).status(), { timeout: 15_000 }).toBe(403);
}
const sessionIdOf = async (staff: Page) => {
  const live = await (await staff.request.get("/api/v1/staff/live")).json();
  expect(live.activeSessionId).toBeTruthy();
  return live.activeSessionId as string;
};

test("伊藤 涼子: 診断時セットの処方 → 患者ホーム → セットの内容 → 学習 → 理解確認 → 質問", async ({ browser }) => {
  const s = await newPage(browser, { width: 1180, height: 820 });
  const p = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(s.page, "staff", "佐藤 一郎");
  await demoLogin(p.page, "patient", "伊藤 涼子");
  const staff = s.page, patient = p.page;

  // 処方前は診断時セットが出ない（固定データで処方済みに見せかけない）
  await expect(patient.locator(".d-home")).toBeVisible();
  await expect(patient.locator("[data-set-card]")).toHaveCount(0);

  // 患者が QR と 6 桁コードを提示 → 医療者が入力 → 患者が承認
  await shareByPatientCode(staff, patient);
  const sid = await sessionIdOf(staff);

  // 情報処方: セットから選ぶ（既存のテンプレート）→ 確定 → 共有終了
  await staff.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  const tpl = staff.locator('[data-template][data-template-name="初回診断時セット"]');
  await expect(tpl).toContainText("3件");
  await tpl.getByRole("button", { name: /セットを選択に追加/ }).click();
  await staff.getByRole("button", { name: /選択中 3件/ }).click();
  await staff.getByRole("button", { name: "3件の情報処方を確定" }).click();
  await staff.getByRole("button", { name: "診察を終えて共有終了" }).click();
  await expect403(staff, sid);

  // 患者ホーム: 診断時セット（医療者から届いた・3件・セットの内容を見る・続きから学ぶ）
  await patient.goto("/home");
  const card = patient.locator("[data-set-card]");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("診断時セット");
  await expect(card).toContainText("佐藤 医師");
  await expect(card).toContainText("3件");
  await expect(patient.locator("[data-home-lesson]")).toBeVisible();
  await expect(patient.locator("[data-home-note-input]")).toBeVisible();
  await expect(patient.locator("[data-visit-edit]")).toBeVisible();

  // セットの内容: 実際に処方された 3 教材が個別のカード
  await card.locator("[data-set-open]").click();
  const detail = patient.locator("[data-set-detail]");
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-set-lesson]")).toHaveCount(3);
  for (const t of SET_TITLES) await expect(detail).toContainText(t);
  await expect(patient.getByText("画像準備中")).toHaveCount(0);

  // 学習 → 理解確認で「わからない」
  await detail.locator("[data-set-lesson]").filter({ hasText: SET_TITLES[0] }).click();
  await patient.locator(".d-detail .d-bottom-action").click();
  for (let i = 0; i < 8; i++) {
    const t = await patient.locator(".d-learning-actions .primary-button").textContent();
    if (t?.includes("理解を確認する")) break;
    await patient.getByRole("button", { name: "次へ" }).click();
  }
  await expect(patient.getByText("画像準備中")).toHaveCount(0);
  await patient.getByRole("button", { name: "理解を確認する" }).click();
  await patient.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await patient.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(patient.getByRole("heading", { name: "「わからない」を記録しました" })).toBeVisible();

  // ホームから診察で聞きたいことを追加 → 再読み込みでも残る
  await patient.goto("/home");
  await patient.locator("[data-home-note-input]").fill("病期の説明で、リンパ節のところをもう一度聞きたい");
  await patient.locator("[data-home-note-add]").click();
  await expect(patient.getByText("病期の説明で、リンパ節のところをもう一度聞きたい")).toBeVisible();
  await patient.reload();
  await expect(patient.getByText("病期の説明で、リンパ節のところをもう一度聞きたい")).toBeVisible();

  await s.ctx.close();
  await p.ctx.close();
});

test("佐藤 花子: 経過グラフ → 共有 → Claude外来間サマリー（再生・要点・根拠）→ 在宅経過表の期間 → 共有終了", async ({ browser }) => {
  const s = await newPage(browser, { width: 1180, height: 820 });
  const p = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(s.page, "staff", "佐藤 一郎");
  await demoLogin(p.page, "patient", "佐藤 花子");
  const staff = s.page, patient = p.page;

  // 患者の経過グラフ: 記録のない日は線をつながず、「記録なし」と「なし（症状なし）」を分ける（閲覧だけ・記録は変えない）
  await patient.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
  await patient.getByRole("button", { name: "履歴・グラフ" }).click();
  const chart = patient.locator("[data-health-chart]");
  await expect(chart).toBeVisible();
  await expect(chart.locator("[data-chart-missing]").first()).toBeAttached();
  // 期間の終わりは撮影の基準日（11/4）。医療者の在宅経過表・外来間サマリーと同じ観察期間
  const chartBox = patient.locator(".d-health-chart");
  await expect(chartBox).toContainText("11/4");
  await expect(chartBox).not.toContainText("11/5");
  await expect(patient.getByText("記録のない日は線をつなぎません", { exact: false })).toBeVisible();

  // 共有 → 診察サマリー
  await shareByPatientCode(staff, patient);
  const sid = await sessionIdOf(staff);

  // Claude外来間サマリー: 記録済みの Claude 出力の再生（18 項目・再検証済み）と冒頭の要点 3 項目
  const iv = staff.locator("[data-intervisit]");
  await expect(iv).toContainText("記録済みのClaude出力を再生", { timeout: 30_000 });
  await expect(iv.locator("[data-summary-item]")).toHaveCount(18);
  // 「1/4」などの表記は自覚症状の程度（0〜4）であることを示す（要約の文は変えない）
  await expect(staff.locator("[data-severity-legend]")).toContainText("自覚症状の程度");
  await expect(staff.locator("[data-severity-legend]")).toContainText("CTCAE Grade ではありません");
  const key = staff.locator("[data-key-summary]");
  await expect(key.locator('[data-key-row="symptom"]')).toContainText("手足のしびれ");
  await expect(key.locator('[data-key-row="unknown"]')).toContainText("わからない");
  await expect(key.locator('[data-key-row="questions"]')).not.toContainText("該当なし");
  // 要点の文は検証済みの項目の本文そのもの（新しい文を作らない）
  const keyTexts = await key.locator("[data-summary-key-item]").allTextContents();
  const itemTexts = (await iv.locator("[data-summary-item]").allTextContents()).join("\n");
  for (const t of keyTexts) expect(itemTexts).toContain(t.trim().slice(0, 20));
  // 根拠の展開
  await key.locator("[data-summary-key-item]").first().click();
  await expect(staff.locator("[data-summary-sources]")).toBeVisible();
  await expect(staff.locator("[data-summary-sources] [data-source-id]").first()).toBeVisible();

  // 在宅経過表: 端末の日付（撮影日）ではなく、サマリーと同じ観察期間（10月22日〜11月4日）
  await staff.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await expect(staff.getByRole("heading", { name: "在宅経過表" })).toBeVisible();
  const heads = staff.locator(".cd-course-table thead th span");
  await expect(heads.first()).toHaveText("10/22");
  await expect(heads.last()).toHaveText("11/4");

  // 共有終了 → API 403
  await staff.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expect403(staff, sid);

  await s.ctx.close();
  await p.ctx.close();
});
