import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * Phase 2 Step 3: 体調記録・症状の設定・診察ノートを実 API・DB で通す（架空患者・架空医療者）。
 * 記録 → 症状の追加・非表示 → 再読み込みで保持 → 同じ日の複数回 → 欠測と「なし」の区別 →
 * 教材に紐づかない質問の作成・編集 → QR 一時共有の承認 → 医療者が診察サマリーで質問を確認 → 共有終了後は拒否。
 */
const symptom = (p: Page, name: string) => p.locator(".d-symptom-records article").filter({ hasText: name });
const vital = (p: Page, label: string) => p.locator(".d-vital-card").filter({ hasText: label }).locator("input").first();
const severity = (p: Page, name: string, value: number) => symptom(p, name).locator(".d-severity-scale button").nth(value).click();

/** 2026-11: AI 外来間サマリー（要約・根拠・タイムライン）は診察サマリーの折りたたみの中。開いてから確認する */
async function openAi(page: import("@playwright/test").Page) {
  const t = page.locator("[data-ai-fold] .cd-ai-fold-toggle");
  await t.waitFor({ timeout: 15_000 });
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
}

test("体調記録・症状の設定・診察ノート → QR 共有で医療者が質問を確認 → 終了後は拒否", async ({ browser }) => {
  // 1. 患者がログイン（患者B: 履歴なし）
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  const p = patient.page;
  // 架空データの表示はもう出ない（患者画面はすべて実データ）
  await expect(p.locator("[data-proto-flag]")).toHaveCount(0);
  await expect(p.locator(".d-home")).toContainText("まだ記録はありません");

  // 2. バイタルと症状を記録（初回は前回の記録がないので空欄から）
  await p.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
  await expect(vital(p, "体温")).toHaveValue("");
  await vital(p, "体温").fill("36.8");
  await vital(p, "脈拍").fill("72");
  await severity(p, "だるさ・倦怠感", 0); // なし
  await severity(p, "吐き気", 2); // 中くらい
  await severity(p, "発汗・ほてり", 1); // 軽い（このあと非表示にする）
  await expect(symptom(p, "手足のしびれ")).toContainText("未回答");
  await p.getByRole("button", { name: "この記録を保存" }).click();
  await expect(p.locator(".toast")).toContainText("体調を記録しました");
  await expect(p.locator(".d-gentle-feedback")).toContainText("1");
  // 2026-11: 保存後のフォームには前回（いま保存した記録）の値が入り、変わったところだけ直せばよい。「空欄から記録」で空にできる
  await expect(p.locator("[data-prefill-note]")).toBeVisible();
  await expect(vital(p, "体温")).toHaveValue("36.8");
  await expect(symptom(p, "吐き気").locator(".d-severity-scale button.active")).toContainText("中くらい");
  await expect(symptom(p, "手足のしびれ")).toContainText("未回答");
  await p.locator("[data-prefill-clear]").click();
  await expect(vital(p, "体温")).toHaveValue("");
  await expect(symptom(p, "吐き気")).toContainText("未回答");

  // 3. 症状を追加（ライブラリから・自由入力）
  await p.getByRole("button", { name: "症状を追加" }).click();
  await p.locator(".d-symptom-library > div").filter({ hasText: "皮疹・発疹" }).getByRole("button", { name: "記録項目に追加" }).click();
  await expect(p.locator(".d-active-symptoms")).toContainText("皮疹・発疹");
  await p.locator(".d-custom-symptom input").fill("足の裏のぴりぴり");
  await p.locator(".d-custom-symptom").getByRole("button", { name: "追加" }).click();
  await expect(p.locator(".d-active-symptoms")).toContainText("足の裏のぴりぴり");
  // 4. 既存の症状を非表示に（過去の記録は残る）
  await p.locator(".d-active-symptoms > div").filter({ hasText: "発汗・ほてり" }).getByRole("button", { name: "非表示" }).click();
  await expect(p.locator(".d-active-symptoms")).not.toContainText("発汗・ほてり");
  // 並び替え（足の裏のぴりぴりを一つ上へ）
  await p.locator(".d-active-symptoms > div").filter({ hasText: "足の裏のぴりぴり" }).getByRole("button", { name: "上へ" }).click();
  await expect(p.locator(".d-active-symptoms > div").nth(4)).toContainText("足の裏のぴりぴり");

  // 5. 再読み込みしても記録と設定が残る
  await p.reload();
  await expect(p.locator(".d-symptom-records")).toContainText("足の裏のぴりぴり");
  await expect(p.locator(".d-symptom-records")).toContainText("皮疹・発疹");
  await expect(p.locator(".d-symptom-records")).not.toContainText("発汗・ほてり");
  await p.getByRole("button", { name: "症状を追加" }).click();
  await expect(p.locator(".d-active-symptoms > div").nth(4)).toContainText("足の裏のぴりぴり");
  await p.locator(".d-page-title button.back").click();

  // 6. 同じ日に 2 回目のバイタル（別の記録として保存）
  await vital(p, "体温").fill("37.2");
  await p.getByLabel("収縮期血圧").fill("118");
  await p.getByLabel("拡張期血圧").fill("74");
  await severity(p, "足の裏のぴりぴり", 1);
  await p.getByRole("button", { name: "この記録を保存" }).click();
  await expect(p.locator(".toast")).toContainText("体調を記録しました");
  await p.getByRole("button", { name: "履歴" }).click();
  await expect(p.locator(".d-health-list .d-section-head")).toContainText("1日分・2件");

  // 7. 欠測と「なし」が区別される / 非表示にした症状の過去の記録は残る
  const items = p.locator(".d-health-list details");
  await items.nth(1).locator("summary").click(); // 1 回目（古い方）
  await expect(items.nth(1)).toContainText("だるさ・倦怠感0 · なし");
  await expect(items.nth(1)).toContainText("発汗・ほてり1 · 軽い");
  await expect(items.nth(1)).not.toContainText("手足のしびれ");
  await expect(items.nth(1)).toContainText("血圧 —");
  await items.nth(0).locator("summary").click(); // 2 回目
  await expect(items.nth(0)).toContainText("118/74");
  await expect(items.nth(0)).toContainText("脈拍 72"); // 2026-11: 前回の値（脈拍 72）を引き継いで保存
  await expect(items.nth(0)).toContainText("足の裏のぴりぴり1 · 軽い");
  // 過去の記録の編集（体温を直す）
  await items.nth(0).getByRole("button", { name: "この記録を編集" }).click();
  await expect(vital(p, "体温")).toHaveValue("37.2");
  await vital(p, "体温").fill("37.0");
  await p.getByRole("button", { name: "この記録を更新" }).click();
  await expect(p.locator(".toast")).toContainText("記録を更新しました");
  const { records } = await (await p.request.get("/api/v1/health/records")).json();
  expect(records).toHaveLength(2);
  expect(records[0].vitals).toMatchObject({ temperature: 37, systolic: 118, diastolic: 74, pulse: 72, spo2: null });
  expect(records[1].symptoms.map((s: { key: string }) => s.key)).not.toContain("numbness");

  // 8. 教材に紐づかない質問を作成
  await p.locator(".d-nav").getByRole("button", { name: "聞きたいこと" }).click();
  await expect(p.locator(".d-visit-date")).toContainText("次回診察日：未登録");
  await p.locator(".d-add-question textarea").fill("治療中に旅行に行ってもよいですか？");
  await p.getByRole("button", { name: "質問を保存" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText("治療中に旅行に行ってもよいですか？");
  await expect(p.locator(".d-nav")).toContainText("1");
  // 9. 質問を編集（再読み込み後も残る）
  await p.locator(".d-saved-notes > div").first().getByRole("button", { name: "編集" }).click();
  await p.locator(".d-saved-notes textarea").fill("来月、2泊の旅行に行ってもよいですか？");
  await p.locator(".d-saved-notes").getByRole("button", { name: "保存" }).click();
  await expect(p.locator(".toast")).toContainText("質問を更新しました");
  await p.reload();
  await expect(p.locator(".d-saved-notes")).toContainText("来月、2泊の旅行に行ってもよいですか？");
  await expect(p.locator(".d-saved-notes")).toContainText("に更新");
  const { notes } = await (await p.request.get("/api/v1/notes")).json();
  expect(notes).toEqual([expect.objectContaining({ body: "来月、2泊の旅行に行ってもよいですか？", source: "free", materialId: null })]);

  // 10. QR 一時共有を患者が承認
  const staff = await newPage(browser, { width: 1440, height: 900 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  const s = staff.page;
  // 患者が QR と 6 桁コードを表示 → 医療者が PC でコードを入力
  await p.goto("/home?view=share");
  await p.locator("[data-share-issue]").click();
  const code = ((await p.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: "患者のQRを読み取る／6桁コードを入力" }).click();
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(s.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  // 承認前: 医療者は体調記録・質問を読めない
  expect((await s.request.get("/api/v1/health/records")).status()).toBe(403);
  await expect(p.locator("[data-share-request]")).toBeVisible({ timeout: 10_000 });
  await p.locator(".d-consent input").check();
  await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await expect(s.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  const sid = new URL(s.url()).searchParams.get("s")!;

  // 11. 医療者が診察サマリーで質問を確認（教材に紐づかない質問。閲覧だけで操作は求めない）
  const q = s.locator(".cd-question-priority article").filter({ hasText: "来月、2泊の旅行に行ってもよいですか？" });
  await expect(q).toBeVisible();
  await expect(q).toContainText("診察ノート ·");
  await expect(q).toContainText("自由な質問");
  await q.getByRole("button").first().click();
  await expect(q).toContainText("患者が入力した原文は変更されません");
  await openAi(s);
  await expect(s.locator("[data-intervisit]")).toContainText("来月、2泊の旅行に行ってもよいですか？");
  // 体調記録の取得 API（Step 4 の経過表で使う）は共有中だけ読める
  const h = await (await s.request.get(`/api/v1/consultations/${sid}/health`)).json();
  expect(h.records).toHaveLength(2);
  expect(h.symptoms.hidden).toContain("hotFlash");

  // 12. 共有終了後は医療者のアクセスを拒否
  await p.goto("/home?view=share");
  await p.getByRole("button", { name: "一時共有を終了する" }).click();
  await expect(p.locator(".d-share-chip")).toContainText("共有する");
  expect((await s.request.get(`/api/v1/consultations/${sid}/health`)).status()).toBe(403);
  expect((await s.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(403);
  await expect(s.getByRole("heading", { name: "一時共有は終了しました" })).toBeVisible({ timeout: 10_000 });

  await staff.ctx.close();
  await patient.ctx.close();
});

test("理解確認から作った質問候補は、患者が確認して保存したときだけ記録される（教材付き）", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const p = patient.page;
  const before = (await (await p.request.get("/api/v1/notes")).json()).notes.length;
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  // 他のテスト（自主学習の「手術」）と重ならない領域を使う。学習済みの教材でも理解確認はやり直せる
  await p.locator(".d-category-cards button").filter({ hasText: "日常生活・相談支援" }).click();
  await p.locator(".d-lesson-card").first().click();
  await p.locator(".d-detail .d-bottom-action").click();
  for (let i = 0; i < 6; i++) {
    const t = await p.locator(".d-learning-actions .primary-button").textContent();
    if (t?.includes("理解を確認する")) break;
    await p.getByRole("button", { name: "次へ" }).click();
  }
  await p.getByRole("button", { name: "理解を確認する" }).click();
  await p.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await p.getByRole("button", { name: "この内容を「聞きたいこと」に入れる" }).click();
  // 入力欄に候補が入るだけ（まだ記録されない）
  await expect(p.locator(".d-add-question textarea")).toHaveValue(/について、私の場合を教えてください/);
  expect((await (await p.request.get("/api/v1/notes")).json()).notes.length).toBe(before);
  await expect(p.locator("[data-notes-return]")).toBeVisible(); // 理解確認へ戻れる
  await p.getByRole("button", { name: "質問を保存", exact: true }).click();
  await expect(p.locator(".toast")).toContainText("質問を保存しました");
  const { notes } = await (await p.request.get("/api/v1/notes")).json();
  expect(notes.length).toBe(before + 1);
  expect(notes.at(-1)).toMatchObject({ source: "quiz" });
  expect(notes.at(-1).materialId).toBeTruthy();
  await expect(p.locator(".d-saved-notes")).toContainText("教材「");
  await patient.ctx.close();
});
