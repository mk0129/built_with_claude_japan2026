import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode, expectShareEnded } from "./helpers";

/**
 * Phase 2 Step 2: 情報処方と学習記録を実 API・DB で通す（架空患者・架空医療者）。
 * 医療者が QR 接続 → 患者が承認 → 教材を 1 件処方 → 患者がホームで確認 → 学習 → 「わからない」と誤答 →
 * 再読み込みで保持 → 次の承認済み診察で医療者が回答を確認 → 何も入力せずに共有終了 → 終了後の API は拒否。
 * 旧 UI の flow（処方 → 学習 → クイズ → 次回診察）・quiz_result（わからないと誤答の区別）を新 UI 向けに置き換えたもの。
 */
const MATERIAL = "乳がんの診断と病期の考え方";
const Q1 = "病期（ステージ）を考えるときの基本に含まれないものはどれですか。";
const Q2 = "同じ病期の人は、必ず同じ治療を受けますか。";

/** 患者が QR と 6 桁コードを表示 → 医療者が PC でコードを入力 → 患者が承認 */
async function connect(staff: Page, patient: Page) {
  await shareByPatientCode(staff, patient);
  await expect(patient.getByRole("heading", { name: /と一時共有中です/ })).toBeVisible();
  return new URL(staff.url()).searchParams.get("s")!;
}

test("処方 → 患者が学習・「わからない」と誤答 → 再読み込みで保持 → 次の診察で医療者が確認 → 入力なしで終了 → API 拒否", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1440, height: 900 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  // 患者B（履歴なし）
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "鈴木 美咲");
  const s = staff.page;
  const p = patient.page;

  // 処方前: 患者ホームは「届いている教材はありません」
  await expect(p.getByRole("heading", { name: "今届いている教材はありません" })).toBeVisible();

  // 1・2. QR 接続 → 患者の承認
  const sid1 = await connect(s, p);
  // 処方前のサマリー: 架空の質問・回答を出さない
  // （患者の質問は実データ。他のテストで保存した診察ノートがあり得るため、架空の質問がないことだけを確認）
  await expect(s.locator(".cd-understanding")).toContainText("確認問題は未回答です");
  await expect(s.locator(".cd-summary")).not.toContainText("腕のつっぱり");

  // 3. 医療者が教材を 1 件処方（教材ライブラリ → 確認 → 確定。メッセージは任意）
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  const card = s.locator(".cd-library-grid article").filter({ hasText: MATERIAL });
  await card.getByRole("button", { name: "処方に追加" }).click();
  await s.getByRole("button", { name: /選択中 1件/ }).click();
  await expect(s.getByRole("heading", { name: "今回の情報処方を確認" })).toBeVisible();
  await expect(s.locator(".cd-confirm-recipient")).toContainText("鈴木 美咲さん");
  await s.getByRole("button", { name: "1件の情報処方を確定" }).click();
  await expect(s.getByRole("heading", { name: "情報処方を届けました" })).toBeVisible();
  await expect(s.locator(".cd-sent")).toContainText("1件の教材が、鈴木さんの患者アプリ");
  // 同じ診察では同じ教材を重複処方しない（画面は「処方済み」、API でも 1 件のまま）
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  await expect(card.getByRole("button", { name: "この診察で処方済み" })).toBeDisabled();
  const materialId = (await (await s.request.get(`/api/v1/consultations/${sid1}/materials`)).json()).items.find((m: { title: string }) => m.title === MATERIAL).materialId;
  const again = await (await s.request.post(`/api/v1/consultations/${sid1}/prescriptions`, { data: { materialIds: [materialId] } })).json();
  expect(again.set.items).toHaveLength(1);

  // 4. 患者のホームに届く
  await p.locator(".d-share-page").getByRole("button", { name: "共有したままホームへ戻る" }).click();
  await expect(p.getByRole("heading", { name: "新しい教材が届いています" })).toBeVisible({ timeout: 10_000 });
  await expect(p.locator(".d-next-card")).toContainText(MATERIAL);
  await expect(p.locator(".d-next-card")).toContainText("山田 医師から");
  await p.getByRole("button", { name: "今回の教材をすべて見る（1件）" }).click();
  await expect(p.locator(".d-prescription-info")).toContainText("さくら総合病院");

  // 5. 学習（詳細 → 学習を始める → ページ送り → 理解を確認する）
  await p.locator(".d-lesson-card").filter({ hasText: MATERIAL }).click();
  await expect(p.locator(".d-detail > h1")).toHaveText(MATERIAL);
  await expect(p.locator(".d-content-list")).toContainText("短い説明 4ページ");
  await expect(p.locator(".d-content-list")).toContainText("理解確認 3問");
  await p.getByRole("button", { name: "学習を始める" }).click();
  await expect(p.locator(".d-learning-head")).toContainText("1 / 4");
  await expect(p.locator(".d-learning h1")).toHaveText("病期（ステージ）とは");
  for (let i = 0; i < 3; i++) await p.getByRole("button", { name: "次へ" }).click();
  await expect(p.locator(".d-learning-head")).toContainText("4 / 4");
  await p.getByRole("button", { name: "理解を確認する" }).click();

  // 6. 「わからない」を回答（選んだだけでは記録しない → 確定で記録）
  await expect(p.locator(".d-quiz h1")).toHaveText(Q1);
  await p.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await expect(p.locator(".d-selection-note")).toContainText("「わからない」を選択しています");
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: "「わからない」を記録しました" })).toBeVisible();
  await expect(p.locator(".d-key-answer")).toContainText("正解は「患者さんの年齢」");

  // 7. 再読み込みしても回答と進捗が保持される
  await p.reload();
  await expect(p.getByRole("heading", { name: "「わからない」を記録しました" })).toBeVisible();
  await expect(p.locator(".d-your-answer")).toContainText("わからない");
  await p.getByRole("button", { name: "次の問題へ" }).click();
  await expect(p.locator(".d-quiz h1")).toHaveText(Q2);
  // 2 問目は誤答（「わからない」と区別して記録）
  await p.locator(".d-answer-list button").filter({ hasText: "必ず同じ治療になる" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: "いっしょに確認しましょう" })).toBeVisible();
  await p.reload();
  await expect(p.locator(".d-your-answer")).toContainText("必ず同じ治療になる");
  // 3 問目は答えずに中断 → ホームは「学習途中」
  await p.getByRole("button", { name: "次の問題へ" }).click();
  await p.reload();
  await expect(p.locator(".d-quiz")).toContainText("3 / 3");
  await p.goto("/home");
  await expect(p.getByRole("heading", { name: "続きから再開できます" })).toBeVisible({ timeout: 10_000 });
  await expect(p.locator(".d-next-lesson")).toContainText("学習途中");
  const lib = await (await p.request.get("/api/v1/library")).json();
  expect(lib.items.find((i: { title: string }) => i.title === MATERIAL)).toMatchObject({ phase: "quiz", nUnknown: 0 });

  // 1 回目の共有を医療者が終了（何も入力しない）
  await s.locator(".cd-sidebar").getByRole("button", { name: "共有を終了" }).click();
  await expectShareEnded(s);

  // 8. 次の承認済み診察で、医療者が回答を確認できる
  await p.locator(".d-share-chip").click();
  const sid2 = await connect(s, p);
  expect(sid2).not.toBe(sid1);
  const checks = s.locator(".cd-understanding");
  await expect(checks).toContainText("2件");
  const unknown = checks.locator("article").filter({ hasText: "「わからない」" });
  await expect(unknown).toContainText(Q1);
  await expect(unknown).toContainText("回答「わからない」");
  const wrong = checks.locator("article").filter({ hasText: "誤答" });
  await expect(wrong).toContainText(Q2);
  await expect(wrong).toContainText("回答「必ず同じ治療になる」");
  await unknown.getByRole("button", { name: /詳細/ }).click();
  await expect(unknown).toContainText("「患者さんの年齢」");
  await expect(unknown).toContainText(`関連教材：${MATERIAL}`);
  await expect(unknown).toContainText(/回答/);
  // 領域別（点数で断定しない）と学習履歴の根拠
  await expect(s.locator(".cd-area-compact")).toContainText("検査・診断");
  await expect(s.locator(".cd-area-compact button").filter({ hasText: "検査・診断" })).toContainText("0 / 2");
  await s.locator(".cd-intervisit-cards article").filter({ hasText: "学習履歴" }).getByRole("button").click();
  await expect(s.locator("[data-learning-evidence]")).toContainText(`${MATERIAL}（第1版）：学習途中`);
  await expect(s.locator("[data-intervisit]")).toContainText("直近14日間の経過");
  // 詳しく確認 → 再処方候補（同じ診察ではまだ処方していないので追加できる）
  await unknown.getByRole("button", { name: "詳しく確認" }).click();
  await expect(s.locator(".cd-answer-compare")).toContainText("わからない");
  await expect(s.locator(".cd-answer-compare")).toContainText("患者さんの年齢");
  await s.getByRole("button", { name: "再処方候補へ" }).click();
  await expect(s.locator(".cd-toast").filter({ hasText: "処方候補へ追加しました" })).toBeVisible();
  await expect(s.locator(".cd-toast").filter({ hasText: /エラー|ERROR|できません/ })).toHaveCount(0);
  await s.getByRole("button", { name: "何も記録せずサマリーへ戻る" }).click();

  // 9. 何も追加入力せずに共有を終了できる
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expectShareEnded(s);

  // 10. 終了後は患者データへの API アクセスが拒否される
  for (const path of [`/api/v1/consultations/${sid2}/patient`, `/api/v1/consultations/${sid2}/materials`, `/api/v1/consultations/${sid1}/patient`]) {
    expect((await s.request.get(path)).status()).toBe(403);
  }
  expect((await s.request.post(`/api/v1/consultations/${sid2}/prescriptions`, { data: { materialIds: [materialId] } })).status()).toBe(403);
  await expect(p.locator(".d-share-chip")).toContainText("共有する", { timeout: 10_000 });

  await staff.ctx.close();
  await patient.ctx.close();
});

test("患者: 処方のない教材を自分で探して学べる（自主学習）。学習記録に残る", async ({ browser }) => {
  // 患者A（デモ履歴あり。手術の領域は未学習）
  const patient = await newPage(browser, { width: 430, height: 900 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const p = patient.page;
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-category-cards button").filter({ hasText: "手術" }).click();
  await expect(p.locator(".d-area-overview")).toContainText("公開教材");
  await p.locator(".d-lesson-card").first().click();
  await expect(p.locator(".d-detail .d-status")).toContainText("自主・未学習");
  await p.getByRole("button", { name: "学習を始める" }).click();
  await p.getByRole("button", { name: "次へ" }).click();
  await p.getByRole("button", { name: "閉じる" }).click();
  await expect(p.locator(".toast")).toContainText("学習位置を保存しました");
  await p.locator(".d-nav").getByRole("button", { name: "学習記録" }).click();
  await expect(p.locator(".d-recent .d-lesson-card").filter({ hasText: "自主・学習途中" })).toHaveCount(1);
  await expect(p.locator(".d-recent")).toContainText("乳房の手術の種類と選び方");
  await patient.ctx.close();
});
