import { test } from "@playwright/test";
import { VIEWPORTS, demoLogin, expect, newPage, shot, showQrCode } from "./helpers";

/**
 * 患者（iPhone 幅）と医療者（iPad 横）の 2 ブラウザで、情報処方 → 学習 → 理解確認 → 次回診察の
 * 一連の操作を通す。各段階のスクリーンショットを docs/screenshots/day3/ に保存する。
 */
test("情報処方から次回診察までの通し操作", async ({ browser }) => {
  const patient = await newPage(browser, VIEWPORTS.phone390);
  const staff = await newPage(browser, VIEWPORTS.ipadLandscape);
  const p = patient.page;
  const s = staff.page;

  // 1. 患者ログイン → 共有 QR
  await demoLogin(p, "patient", "鈴木 美咲");
  await shot(p, "01_patient_home_empty");
  const code = await showQrCode(p);
  expect(code).toHaveLength(6);
  await shot(p, "02_patient_share_qr");

  // 2. 医療者が 6 桁コードで要求
  await demoLogin(s, "staff", "山田 太郎");
  await shot(s, "03_staff_home");
  await s.getByRole("button", { name: /患者さんの QR を読み取る/ }).click();
  await s.waitForURL(/\/staff\/scan/);
  await s.getByLabel("6桁の番号").fill(code);
  await s.getByRole("button", { name: /共有を要求する/ }).click();
  await expect(s.getByText(/患者さんの承認を待っています/)).toBeVisible();
  await shot(s, "04_staff_waiting_approval");

  // 3. 患者が承認 → ダッシュボード
  await expect(p.getByRole("button", { name: "許可する" })).toBeVisible({ timeout: 10_000 });
  await shot(p, "05_patient_approve_dialog");
  await p.getByRole("button", { name: "許可する" }).click();
  await expect(p.getByText(/共有中/)).toBeVisible();
  await shot(p, "06_patient_sharing");
  await s.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });
  const consultUrl1 = s.url();
  await expect(s.getByText(/鈴木 美咲 さん/)).toBeVisible({ timeout: 20_000 });
  await shot(s, "07_staff_dashboard_first_visit");

  // 4. サイドパネルから処方（テンプレート + 検索）
  await s.getByRole("button", { name: "開く" }).click();
  await s.getByRole("button", { name: "まとめて追加" }).first().click();
  await s.getByRole("button", { name: "検索" }).click();
  await s.getByLabel("キーワード検索").fill("副作用");
  await s.getByRole("button", { name: "追加", exact: true }).first().click();
  await shot(s, "08_staff_prescription_panel");
  await s.getByRole("button", { name: /処方を確定する/ }).click();
  await expect(s.getByText(/件を処方しました/)).toBeVisible();
  await shot(s, "09_staff_after_prescribe");

  // 5. 患者ホームに届く
  await p.goto("/home");
  await expect(p.getByText(/医療者から届いた教材/).first()).toBeVisible();
  await shot(p, "10_patient_home_homework");

  // 6. 説明を読む・音声再生
  await p.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
  await p.waitForURL(/\/learn\//);
  const learnUrl = p.url();
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await p.getByRole("button", { name: /説明を聞く|読み上げる/ }).click();
  await shot(p, "11_patient_learn_slide1");
  await p.getByRole("button", { name: "目次" }).click();
  await shot(p, "12_patient_learn_toc");
  await p.getByRole("button", { name: "目次" }).click();
  while (!(await p.getByRole("button", { name: /確認問題へ/ }).isVisible())) {
    await p.getByRole("button", { name: /次のページへ|次へ/ }).click();
  }
  await shot(p, "13_patient_learn_last");
  await p.getByRole("button", { name: /確認問題へ/ }).click();
  await p.waitForURL(/\/quiz\//);
  const quizUrl = p.url();

  // 7. クイズ: 選択 → 回答を確認 → 中断 → 再開 → 完了 → 再挑戦
  const confirmAnswer = async () => {
    await p.getByRole("button", { name: /回答を確認する/ }).click();
    await expect(p.getByText(/確認できました|一緒に振り返りましょう|を記録しました/).first()).toBeVisible({ timeout: 10_000 });
  };
  await expect(p.getByText(/QUESTION 01/)).toBeVisible();
  await shot(p, "14_patient_quiz_q1");
  await p.getByRole("radio", { name: /^ア/ }).click();
  await confirmAnswer();
  await shot(p, "15_patient_quiz_feedback");
  await p.getByRole("button", { name: /次の問題へ/ }).click();
  await p.getByRole("radio", { name: "わからない" }).click();
  await confirmAnswer();
  await shot(p, "16_patient_quiz_unknown");
  // 中断: ホームへ戻って再開
  await p.goto("/home");
  await expect(p.getByRole("link", { name: /確認問題の続きから/ })).toBeVisible();
  await shot(p, "17_patient_home_resume");
  await p.goto(quizUrl);
  await expect(p.getByText(/QUESTION 03/)).toBeVisible();
  await p.getByRole("radio", { name: /^イ/ }).click();
  await confirmAnswer();
  await p.getByRole("button", { name: /学びの結果を見る/ }).click();
  await expect(p.getByText(/ここまで学べました/)).toBeVisible();
  await expect(p.getByText(/もう一度確認したいこと/)).toBeVisible();
  await shot(p, "18_patient_quiz_result");
  // 復習に戻る導線 → 再挑戦
  await p.getByRole("button", { name: /もう一度挑戦する/ }).click();
  await expect(p.getByText(/QUESTION 01/)).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await p.getByRole("radio", { name: /^ア/ }).click();
    await confirmAnswer();
    await p.getByRole("button", { name: /次の問題へ|学びの結果を見る/ }).click();
  }
  await expect(p.getByText(/ここまで学べました/)).toBeVisible();
  // 質問の明示的な保存: テーマを選ぶ → 自分の言葉に直す → 気持ち（任意）→ 「次の診察に残す」
  await p.getByTestId("ask-theme-free").click();
  await p.getByLabel("次の診察で聞きたいこと").fill("再発の心配について次に聞きたいです");
  await p.getByRole("button", { name: "質問がある" }).click();
  await p.getByRole("button", { name: /次の診察に残す/ }).click();
  await expect(p.getByText(/次の診察に残しました/)).toBeVisible();
  await shot(p, "19_patient_feedback_sent");
  await p.goto("/scores");
  await shot(p, "20_patient_scores");

  // 医療者が終了 → 患者が再度 QR → 次回診察
  await s.goto(consultUrl1);
  await s.getByRole("button", { name: "終了", exact: true }).click();
  await expect(s.getByText(/診察セッションは終了しました/)).toBeVisible({ timeout: 15_000 });
  const code2 = await showQrCode(p);
  await s.goto("/staff/scan");
  await s.getByLabel("6桁の番号").fill(code2);
  await s.getByRole("button", { name: /共有を要求する/ }).click();
  await p.getByRole("button", { name: "許可する" }).click({ timeout: 10_000 });
  await s.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });

  // 8. 次回診察: 宿題結果（スナップショット）と質問を確認
  await expect(s.getByText(/未確認の質問 1/)).toBeVisible({ timeout: 15_000 });
  await expect(s.getByText(/前回の宿題/)).toBeVisible();
  await shot(s, "21_staff_dashboard_second_visit");
  await s.getByRole("button", { name: "対応を記録" }).first().click();
  await shot(s, "21b_staff_question_record_form");
  await s.getByRole("button", { name: /対応済みとして記録する/ }).click();
  await expect(s.getByText(/未確認の質問 0/)).toBeVisible({ timeout: 15_000 });

  // 9. 誤答・未完了から再処方
  await s.getByRole("button", { name: "再処方" }).first().click();
  await expect(s.getByText(/候補（1）/)).toBeVisible();
  await shot(s, "22_staff_represcribe_basket");
  await s.getByRole("button", { name: /処方を確定する/ }).click();
  await expect(s.getByText(/件を処方しました/)).toBeVisible();
  await shot(s, "23_staff_after_represcribe");
  await p.goto("/home");
  await shot(p, "24_patient_home_after_second_visit");
  await p.goto(learnUrl);
  await shot(p, "25_patient_learn_revisit");

  // 後片付け: セッションを終了して次のテストに影響させない
  await s.goto(s.url());
  await s.getByRole("button", { name: "終了", exact: true }).click();

  await patient.ctx.close();
  await staff.ctx.close();
});
