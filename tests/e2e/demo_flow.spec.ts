import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode, expectShareEnded } from "./helpers";

/**
 * Phase 2 Step 5: デモの通し（架空データ。Claude は開発用の擬似生成）。
 * 医療者が教材を作成・承認 → 患者に情報処方 → 患者が学習し「わからない」と回答 → 体調と質問を記録 → QR 共有を承認 →
 * 医療者が AI 外来間サマリーと根拠の記録を確認 → 教材を追加処方 → 追加入力なしで共有終了。
 * 医療者は架空の承認者（佐藤 一郎: 診療・教材編集・教材承認）。この承認は本番の医学的監修ではない。
 */
/** 患者が QR と 6 桁コードを表示 → 医療者が PC でコードを入力 → 患者が承認 */
async function connect(s: Page, p: Page) {
  await shareByPatientCode(s, p);
  return new URL(s.url()).searchParams.get("s")!;
}

test("デモの通し: 教材の作成・承認 → 処方 → 学習・「わからない」→ 体調と質問 → QR 共有 → AI サマリーと根拠 → 追加処方 → 入力なしで終了", async ({ browser }) => {
  test.setTimeout(240_000);
  const staff = await newPage(browser, { width: 1440, height: 900 });
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "伊藤 涼子");
  const s = staff.page;
  const p = patient.page;

  // ---- 1. 医療者が教材を作成・承認する（教材スタジオ）----
  await connect(s, p);
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
  await s.locator("[data-source-file]").setInputFiles("tests/fixtures/sources/hormone_therapy_demo.docx");
  await s.locator(".cd-form-grid input").nth(1).fill("さくら総合病院 薬剤部（架空）");
  await s.locator(".cd-form-grid textarea").fill("院内作成の架空資料。患者向け教材化と AI 処理を許可（デモ）");
  await s.locator(".cd-license-check input").nth(0).check();
  await s.locator(".cd-license-check input").nth(1).check();
  await s.getByRole("button", { name: "次へ進む" }).click();
  await expect(s.getByRole("heading", { name: "教材の作成方針" })).toBeVisible({ timeout: 30_000 });
  await s.getByRole("button", { name: "Claudeに構成案を依頼" }).click();
  await expect(s.getByRole("heading", { name: "Claudeの構成案を比較" })).toBeVisible({ timeout: 60_000 });
  await expect(s.locator(".cd-proposal-grid article")).not.toHaveCount(0);
  await s.getByRole("button", { name: "次へ進む" }).click();
  // 必須事項: 未確認があれば進めない → すべて確認
  await expect(s.getByRole("button", { name: "確認した内容で下書きを作成" })).toBeDisabled();
  for (const c of await s.locator("[data-must-item] input[type=checkbox]").all()) await c.check();
  await s.getByRole("button", { name: "確認した内容で下書きを作成" }).click();
  await expect(s.locator("[data-studio-editor]")).toBeVisible({ timeout: 60_000 });
  // 本文の編集（自動保存）
  const heading = s.locator("[data-studio-editor] input").first();
  await heading.fill("ホルモン療法を続けるために（デモ）");
  await s.locator("[data-studio-editor] textarea").first().click();
  await expect(s.locator(".cd-draft-status")).toContainText("自動保存", { timeout: 10_000 });
  // 「もう少し詳しく」の編集（自動保存）
  await s.locator("[data-studio-detail]").fill("詳しい説明（デモの編集）");
  await heading.click();
  await expect(s.locator(".cd-draft-status")).toContainText("自動保存", { timeout: 10_000 });
  await s.getByRole("button", { name: "次へ進む" }).click();
  // 患者向けプレビュー（患者の学習画面と同じ部品。学習・回答 API は呼ばない）→ 承認依頼
  const writes: string[] = [];
  s.on("request", (r) => {
    if (r.method() !== "GET" && /\/api\/v1\/(learn|attempts)\b/.test(r.url())) writes.push(r.url());
  });
  const pv = s.locator("[data-studio-preview]");
  await expect(pv.locator(".d-preview-banner")).toContainText("未監修");
  await expect(pv.locator(".d-learning h1")).toContainText("ホルモン療法を続けるために（デモ）");
  await pv.locator(".d-disclosure").click();
  await expect(pv.locator(".d-detail-copy")).toHaveText("詳しい説明（デモの編集）");
  await pv.locator(".d-disclosure").click();
  await expect(pv.locator(".d-detail-copy")).toHaveCount(0);
  for (let i = 0; i < 8 && !(await pv.getByRole("button", { name: "理解を確認する" }).count()); i++) await pv.getByRole("button", { name: "次へ" }).click();
  await pv.getByRole("button", { name: "理解を確認する" }).click();
  for (let i = 0; i < 6; i++) {
    await pv.locator(".d-answer-list button").first().click();
    await pv.getByRole("button", { name: "この回答で確定する" }).click();
    await expect(pv.locator(".d-explanation-copy")).toContainText("解説");
    await expect(pv.locator(".d-answer-result")).toContainText("回答は記録されません");
    const next = pv.getByRole("button", { name: /次の問題へ|振り返りへ/ });
    const last = (await next.textContent())?.includes("振り返りへ");
    await next.click();
    if (last) break;
  }
  await expect(pv.getByRole("heading", { name: "プレビューを最後まで確認しました" })).toBeVisible();
  expect(writes).toEqual([]);
  await s.locator(".cd-preview-actions").getByRole("button", { name: "承認依頼へ" }).click();
  await expect(s.getByRole("heading", { name: "医学的承認と公開" })).toBeVisible();
  await expect(s.locator(".cd-demo-approval-note")).toContainText("本番の医学的監修を意味しません");
  const approve = s.getByRole("button", { name: "医学的に承認して公開" });
  await expect(approve).toBeDisabled();
  for (const c of await s.locator(".cd-approval-check input").all()) await c.check();
  await approve.click();
  await expect(s.getByRole("heading", { name: "教材を公開しました" })).toBeVisible({ timeout: 15_000 });

  // ---- 2. 承認した教材を患者に情報処方 ----
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  const newCard = s.locator(".cd-library-grid article").filter({ hasText: "【擬似生成】" });
  await expect(newCard).toHaveCount(1);
  await expect(newCard).toContainText("施設内教材");
  await newCard.getByRole("button", { name: "処方に追加" }).click();
  await s.getByRole("button", { name: /選択中 1件/ }).click();
  await s.getByRole("button", { name: "1件の情報処方を確定" }).click();
  await expect(s.getByRole("heading", { name: "情報処方を届けました" })).toBeVisible();
  await s.getByRole("button", { name: "診察を終えて共有終了" }).click();
  await expectShareEnded(s);

  // ---- 3. 患者が学習し、理解確認で「わからない」----
  await p.goto("/home");
  await expect(p.locator(".d-next-card")).toContainText("【擬似生成】", { timeout: 10_000 });
  await p.locator(".d-next-card .primary-button").click();
  await p.locator(".d-detail .d-bottom-action").click();
  await expect(p.locator(".d-learning h1")).toContainText("ホルモン療法を続けるために（デモ）");
  for (let i = 0; i < 8; i++) {
    const t = await p.locator(".d-learning-actions .primary-button").textContent();
    if (t?.includes("理解を確認する")) break;
    await p.getByRole("button", { name: "次へ" }).click();
  }
  await p.getByRole("button", { name: "理解を確認する" }).click();
  await p.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: "「わからない」を記録しました" })).toBeVisible();

  // ---- 4. 体調と質問を記録 ----
  await p.goto("/home?view=health");
  await p.locator(".d-vital-card").filter({ hasText: "体温" }).locator("input").fill("36.9");
  await p.locator(".d-symptom-records article").filter({ hasText: "手足のしびれ" }).locator(".d-severity-scale button").nth(2).click();
  await p.getByRole("button", { name: "この記録を保存" }).click();
  await expect(p.locator(".toast")).toContainText("体調を記録しました");
  await p.goto("/home?view=notes");
  await p.locator(".d-add-question textarea").fill("薬を飲み忘れたときは、どうすればよいですか？");
  await p.getByRole("button", { name: "質問を保存" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText("薬を飲み忘れたときは");

  // ---- 5. QR 共有を承認 → 6. AI 外来間サマリー → 7. 根拠の記録 ----
  const sid = await connect(s, p);
  await expect(s.locator('.cd-summary-narrative[data-summary-kind="fake"]')).toBeVisible({ timeout: 15_000 });
  const iv = s.locator("[data-intervisit]");
  // 患者の質問（原文）が先頭の行に出る
  await expect(iv.locator('[data-key-row="questions"]')).toContainText("「薬を飲み忘れたときは、どうすればよいですか？」");
  await expect(iv.locator('[data-key-row="unknown"]')).toContainText("わからない");
  await iv.locator("[data-summary-all-toggle]").click();
  await iv.locator("[data-summary-item]").filter({ hasText: "手足のしびれ" }).first().click();
  await expect(s.locator("[data-summary-sources] [data-source-id^='hs:']").first()).toContainText("手足のしびれ 2/4（中くらい）");

  // ---- 8. 必要な教材を追加処方（「わからない」の詳細 → 再処方候補 → 別の教材も追加）----
  const unknown = s.locator(".cd-understanding article").filter({ hasText: "「わからない」" }).first();
  await unknown.getByRole("button").first().click();
  await unknown.getByRole("button", { name: "詳しく確認" }).click();
  await s.getByRole("button", { name: "再処方候補へ" }).click();
  await s.getByRole("button", { name: "関連教材の候補を見る" }).click();
  await s.locator(".cd-library-grid article").filter({ hasText: "化学療法中の副作用とセルフケア" }).getByRole("button", { name: "処方に追加" }).click();
  await s.getByRole("button", { name: /選択中 2件/ }).click();
  await s.getByRole("button", { name: "2件の情報処方を確定" }).click();
  await expect(s.getByRole("heading", { name: "情報処方を届けました" })).toBeVisible();

  // ---- 9. 追加入力なしで共有を終了 → アクセス拒否 ----
  await s.getByRole("button", { name: "診察を終えて共有終了" }).click();
  await expectShareEnded(s);
  for (const path of ["patient", "intervisit", "health"]) expect((await s.request.get(`/api/v1/consultations/${sid}/${path}`)).status()).toBe(403);
  await p.goto("/home");
  await expect(p.locator(".d-next-card")).toContainText("今回の情報処方");
  await p.getByRole("button", { name: /今回の教材をすべて見る（2件）/ }).click();
  await expect(p.locator(".d-card-list")).toContainText("化学療法中の副作用とセルフケア");

  await staff.ctx.close();
  await patient.ctx.close();
});
