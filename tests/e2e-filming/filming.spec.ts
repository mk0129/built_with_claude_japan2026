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

/** 2026-11: AI 外来間サマリー（要約・根拠・タイムライン）は診察サマリーの折りたたみの中。開いてから確認する */
async function openAi(page: import("@playwright/test").Page) {
  const t = page.locator("[data-ai-fold] .cd-ai-fold-toggle");
  await t.waitFor({ timeout: 15_000 });
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
}

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
  await tpl.getByRole("button", { name: /まとめて追加/ }).click();
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

  // ホームから診察で聞きたいことを追加 → 「聞きたいこと」に残り、再読み込みでも残る（2026-11: ホームは件数だけ）
  await patient.goto("/home");
  const count = patient.locator("[data-home-note-count]");
  const before = Number(((await count.textContent()) ?? "0").replace(/\D/g, ""));
  await patient.locator("[data-home-note-input]").fill("病期の説明で、リンパ節のところをもう一度聞きたい");
  await patient.locator("[data-home-note-add]").click();
  await expect(count).toContainText(`${before + 1}件`);
  await patient.locator(".d-nav").getByRole("button", { name: "聞きたいこと" }).click();
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
  await patient.getByRole("button", { name: "履歴" }).click();
  await patient.locator("[data-history-mode='chart']").click(); // 2026-11: 履歴は表が既定。グラフは切り替えて見る（全症状を重ねる）
  const chart = patient.locator("[data-symptom-chart] [data-health-chart]");
  await expect(chart).toBeVisible();
  await expect(chart.locator("[data-chart-missing]").first()).toBeAttached();
  // 期間の終わりは撮影の基準日（11/4）。医療者の在宅経過表・外来間サマリーと同じ観察期間
  const chartBox = patient.locator("[data-symptom-chart]");
  await expect(chartBox).toContainText("11/4");
  await expect(chartBox).not.toContainText("11/5");
  await expect(patient.getByText("記録のある日どうしを線で結んでいます", { exact: false })).toBeVisible();

  // 共有 → 診察サマリー
  await shareByPatientCode(staff, patient);
  const sid = await sessionIdOf(staff);

  // Claude外来間サマリー: 記録済みの Claude 出力の再生（18 項目・再検証済み）と冒頭の要点 3 項目
  await openAi(staff);
  const iv = staff.locator("[data-intervisit]");
  await expect(iv.locator('[data-summary-kind="replay"]')).toBeVisible({ timeout: 30_000 }); // 記録済みの Claude 出力の再生
  await expect(iv.locator("[data-summary-item]")).toHaveCount(0); // 全項目は開いたときだけ
  await iv.locator("[data-summary-all-toggle]").click();
  await expect(iv.locator("[data-summary-item]")).toHaveCount(18);
  // 生成元は 1 回（「AI要約（記録再生）」）。作成情報を開くと、記録済みの出力の再生・生成日・照合方法と「1/4」の説明
  await expect(iv.locator("[data-ai-kind]")).toHaveText("AI要約（記録再生）");
  await iv.locator("[data-ai-info-toggle]").click();
  await expect(iv.locator("[data-ai-info]")).toContainText("記録済みの Claude 出力");
  await expect(iv.locator("[data-ai-info]")).toContainText("2026-11-04 生成");
  await expect(iv.locator("[data-ai-info]")).toContainText("今回は Claude を呼び出していません");
  await expect(staff.locator("[data-severity-legend]")).toContainText("自覚症状の程度");
  await expect(staff.locator("[data-severity-legend]")).toContainText("CTCAE Grade ではありません");
  const key = staff.locator("[data-key-summary]");
  await expect(key.locator('[data-key-row="symptom"]')).toContainText("手足のしびれ");
  await expect(key.locator('[data-key-row="unknown"]')).toContainText("わからない");
  await expect(key.locator('[data-key-row="questions"] [data-key-question]').first()).toContainText("手のしびれは、治療が終わったら戻りますか？");
  // 症状は記録された値（最大とその日付・直近の記録）。同じ日の 2 回の入力は別々の元の記録として開ける
  const numb = key.locator('[data-symptom="numbness"]');
  await expect(numb).toContainText("10月28日 3/4");
  await expect(numb).toContainText("直近の記録は11月3日 1/4");
  await numb.locator("button.cd-key-sentence").click();
  const src = numb.locator("[data-summary-sources] [data-source-id^='hs:']");
  await expect(src).toHaveCount(8);
  await expect(src.filter({ hasText: "10/28 08:22" })).toContainText("3/4");
  await expect(src.filter({ hasText: "10/28 21:05" })).toContainText("3/4");
  // 学習: 「わからない」と回答した設問 → 教材名・設問・回答・日時
  await key.locator('[data-key-row="unknown"] button.cd-key-sentence').first().click();
  await expect(key.locator('[data-key-row="unknown"] [data-summary-sources] [data-source-id^="qa:"]')).toContainText("回答「わからない」");
  await expect(key.locator('[data-key-row="unknown"] [data-summary-sources] [data-source-id^="qa:"]')).toContainText("教材「");

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
