import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage, shareByPatientCode, expectShareEnded } from "./helpers";

/**
 * Phase 2 Step 4: 在宅経過表・バイタル統合グラフ・外来間の構造化サマリー・AI 要約（E2E は開発用の擬似生成。実 API は別スクリプト）。
 * 患者C（架空・履歴なし）が複数日に記録（未記録日あり・同じ日に 2 回）→ 理解確認で「わからない」→ 質問を保存 →
 * QR 共有 → 医療者が経過表・グラフ・サマリーを確認し根拠をたどる → 元データの変更が再生成に反映 → AI 失敗時の代替表示 → 終了後は拒否。
 */
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (daysAgo: number, hh: number, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hh)}:${pad(mm)}`;
};
const md = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
const vital = (p: Page, label: string) => p.locator(".d-vital-card").filter({ hasText: label }).locator("input").first();
const severity = (p: Page, name: string, value: number) =>
  p.locator(".d-symptom-records article").filter({ hasText: name }).locator(".d-severity-scale button").nth(value).click();

async function record(p: Page, daysAgo: number, hh: number, mm: number, v: Partial<Record<"体温" | "脈拍" | "SpO₂", string>> & { bp?: [string, string] }, numbness: number) {
  await p.locator(".d-measured-at input").fill(localInput(daysAgo, hh, mm));
  for (const [k, val] of Object.entries(v)) if (k !== "bp") await vital(p, k).fill(val as string);
  if (v.bp) {
    await p.getByLabel("収縮期血圧").fill(v.bp[0]);
    await p.getByLabel("拡張期血圧").fill(v.bp[1]);
  }
  await severity(p, "手足のしびれ", numbness);
  await p.getByRole("button", { name: "この記録を保存" }).click();
  await expect(p.locator(".toast")).toContainText("体調を記録しました");
  await p.locator(".d-feedback-close").click();
}

test("在宅経過表・バイタル統合グラフ・外来間サマリー（構造化・AI）・根拠・再生成・代替表示・終了後の拒否", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "高橋 由美");
  const p = patient.page;

  // 1〜3. 複数日の記録（5 日前・4 日前・2 日前は未記録）。3 日前は 2 回測定
  await p.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
  await record(p, 6, 8, 0, { 体温: "36.4", 脈拍: "70" }, 1);
  await record(p, 3, 8, 0, { 体温: "37.4" }, 3);
  await record(p, 3, 20, 30, { bp: ["128", "82"] }, 2);
  await record(p, 1, 9, 0, { 体温: "36.6", "SpO₂": "97" }, 2);

  // 4. 教材で「わからない」と回答
  await p.locator(".d-nav").getByRole("button", { name: "教材を探す" }).click();
  await p.locator(".d-category-cards button").filter({ hasText: "検査・診断" }).click();
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
  await expect(p.getByRole("heading", { name: "「わからない」を記録しました" })).toBeVisible();

  // 4-2. 教材への反応で、自由記述をせずに「もう一度説明してほしい」を選ぶ（いちばん古い質問になる）
  const lib = await (await p.request.get("/api/v1/library")).json();
  const versionId = (lib.data ?? lib).items[0].versionId;
  expect((await p.request.post("/api/v1/feedback", { data: { versionId, selection: "explain_again", freeText: null } })).ok()).toBeTruthy();

  // 5. 診察ノートに質問を保存
  await p.goto("/home?view=notes");
  await p.locator(".d-add-question textarea").fill("しびれは治療終了後に戻りますか？");
  await p.getByRole("button", { name: "質問を保存" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText("しびれは治療終了後に戻りますか？");
  // 2 件目（新しいほうが先頭に出る）
  await p.locator(".d-add-question textarea").fill("仕事に戻る時期の目安を相談したいです。");
  await p.getByRole("button", { name: "質問を保存" }).click();
  await expect(p.locator(".d-saved-notes")).toContainText("仕事に戻る時期の目安を相談したいです。");

  // 6・7. 医療者が QR 接続を申請 → 患者が承認
  const staff = await newPage(browser, { width: 1440, height: 900 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  const s = staff.page;
  await shareByPatientCode(s, p);
  const sid = new URL(s.url()).searchParams.get("s")!;

  // 10. 外来間の構造化サマリー（実データから）。前回外来日ではなく期間と前回共有日を明記
  const iv = s.locator("[data-intervisit]");
  await expect(iv.locator("[data-period-line]")).toContainText("直近14日間");
  await expect(iv).toContainText("前回の共有記録なし");
  // 10-2. 患者が今日聞きたいこと: 先頭に新しい質問の原文 1 件、ほかは「ほか1件」で開く。要約の読み込みで位置が動かない
  const qRow = iv.locator('[data-key-row="questions"]');
  const firstQ = qRow.locator("[data-key-question]").first();
  await expect(firstQ).toContainText("「仕事に戻る時期の目安を相談したいです。」");
  await expect(firstQ).toContainText("患者原文");
  const y1 = (await firstQ.boundingBox())!.y;
  // 11. AI 要約（E2E は開発用の擬似生成。見出しで Claude ではないことを明示）
  await expect(s.locator('.cd-summary-narrative[data-summary-kind="fake"]')).toBeVisible({ timeout: 15_000 });
  expect(Math.abs((await firstQ.boundingBox())!.y - y1)).toBeLessThan(2);
  // 部分的な除外はその場で件数を示す（擬似生成はルールベースの文を使うため、選択のみの回答を「」で引用した 1 項目は照合で除外される）
  await expect(iv.locator("[data-ai-status='partial']")).toHaveText("照合できなかった1項目を除外");
  await expect(qRow).not.toContainText("しびれは治療終了後に戻りますか？");
  await expect(qRow.locator('[data-row-more="questions"]')).toHaveText("ほか2件");
  await qRow.locator('[data-row-more="questions"]').click();
  await expect(qRow.locator("[data-key-question]").nth(1)).toContainText("「しびれは治療終了後に戻りますか？」");
  // 選択のみの反応は「患者が選んだ回答」と表示し、原文の引用に見せない（入力の種類で区別）
  const sel = qRow.locator("[data-key-question][data-question-input='selection']");
  await expect(sel).toHaveCount(1);
  await expect(sel).toContainText("患者が選んだ回答：もう一度説明してほしい");
  await expect(sel).toContainText("選択のみ（自由記述なし）");
  await expect(sel).not.toContainText("患者原文");
  await expect(sel).not.toContainText("「");
  await sel.locator("button.cd-key-sentence").click();
  const selSrc = sel.locator("[data-summary-sources] [data-source-id^='fb:']");
  await expect(selSrc).toHaveCount(1);
  await expect(selSrc).toContainText("患者が選んだ回答「もう一度説明してほしい」（自由記述なし）");
  const d1 = new Date();
  await expect(selSrc).toContainText(`${d1.getMonth() + 1}/${d1.getDate()}`);
  await sel.locator("button.cd-key-sentence").click();
  await expect(qRow.locator("[data-key-question][data-question-input='free_text']")).toHaveCount(2);
  // 質問から 1 操作で、根拠の元の記録（日付・原文）
  await qRow.locator("[data-key-question]").nth(1).locator("button.cd-key-sentence").click();
  const qSrc = qRow.locator("[data-summary-sources]");
  await expect(qSrc).toBeVisible();
  await expect(qSrc.locator("[data-source-id^='vn:']")).toHaveCount(1);
  await expect(qSrc.locator("[data-source-id^='vn:']")).toContainText("「しびれは治療終了後に戻りますか？」（患者原文）");
  const d0 = new Date();
  await expect(qSrc.locator("[data-source-id^='vn:']")).toContainText(`${d0.getMonth() + 1}/${d0.getDate()}`);
  await expect(qSrc).not.toContainText("仕事に戻る時期");
  // 閉じると根拠は消え、押した行はそのまま見える
  await qRow.locator("[data-key-question]").nth(1).locator("button.cd-key-sentence").click();
  await expect(qRow.locator("[data-summary-sources]")).toHaveCount(0);
  await expect(qRow.locator("[data-key-question]").nth(1)).toBeInViewport();
  // 症状のそばに「患者評価 0〜4」を 1 回。細かい尺度の説明は「作成情報」を開いて読む
  await expect(iv.locator('[data-key-row="symptom"] [data-severity-scale]')).toHaveText("患者評価 0〜4");
  await expect(iv.locator("[data-severity-legend]")).toHaveCount(0);
  // 症状は記録された値を日付つきで（言い換えない）。元の記録を 1 操作で開ける
  const numb = iv.locator('[data-key-row="symptom"] [data-symptom="numbness"]');
  await expect(numb).toContainText(`${md(3)} 3/4`);
  await expect(numb).toContainText(`直近の記録は${md(1)} 2/4`);
  await numb.locator("button.cd-key-sentence").click();
  await expect(numb.locator("[data-summary-sources] [data-source-id^='hs:']")).toHaveCount(4);
  await numb.locator("button.cd-key-sentence").click();
  // 生成元は 1 回だけ短く示し、作成情報を開くと生成元・照合方法・尺度の説明
  await expect(iv.locator("[data-ai-kind]")).toHaveCount(1);
  await expect(iv.locator("[data-ai-kind]")).toHaveText("開発用の擬似要約（AIではありません）");
  await iv.locator("[data-ai-info-toggle]").click();
  await expect(iv.locator("[data-ai-info]")).toContainText("開発用の擬似生成です。Claude ではありません。");
  await expect(iv.locator("[data-severity-legend]")).toContainText("患者本人が記録した");
  await iv.locator("[data-ai-info-toggle]").click();
  // 全項目は必要なときに開く（開く前は表示しない → 開いて内容を確認）
  await expect(iv.locator("[data-summary-item]")).toHaveCount(0);
  await iv.locator("[data-summary-all-toggle]").click();
  await expect(iv).toContainText("体調記録は14日中3日、4件です。");
  await expect(iv).toContainText(`手足のしびれは${md(6)}に1/4、${md(1)}に2/4と記録されました（期間内の最大は${md(3)}の3/4、4回記録）。`);
  await expect(iv).toContainText("「しびれは治療終了後に戻りますか？」");
  await expect(iv).toContainText("「わからない」");
  // 12. 各文から元データをたどれる
  await iv.locator("[data-summary-item]").filter({ hasText: "手足のしびれは" }).first().click();
  const src = s.locator("[data-summary-sources]");
  await expect(src).toContainText("根拠の記録");
  await expect(src.locator("[data-source-id^='hs:']").first()).toContainText("手足のしびれ 1/4（軽い）");
  await expect(src.locator("[data-source-id^='hs:']").filter({ hasText: "3/4" })).toHaveCount(1);
  await expect(src.locator("[data-source-id^='hs:']").filter({ hasText: "3/4" })).toContainText("08:00");

  // 8. 在宅経過表に記録（同じ日の 2 回は件数つき、未記録は —）
  await s.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await expect(s.getByRole("heading", { name: "在宅経過表" })).toBeVisible();
  await expect(s.locator(".cd-course-controls")).toContainText("記録日 3日 / 14日 · 4件");
  const numbRow = s.locator(".cd-course-table tr").filter({ hasText: "手足のしびれ" });
  await expect(numbRow).toContainText("2×2");
  await numbRow.getByRole("button", { name: /2×2/ }).click();
  await expect(s.locator("[data-day-entries]")).toContainText("08:00 3 / 4（強い）");
  await expect(s.locator("[data-day-entries]")).toContainText("20:30 2 / 4（中くらい）");
  await s.locator(".cd-course-detail").getByRole("button", { name: "閉じる" }).click();
  // 9. 5 系列のバイタル統合グラフ（1 つの描画領域、凡例で表示切替、カーソルで実測値・単位・日時）
  await s.getByRole("button", { name: "バイタル統合" }).click();
  await expect(s.locator(".cd-vital-plot svg")).toHaveCount(1);
  await expect(s.locator(".cd-vital-legend button")).toHaveCount(5);
  await expect(s.locator(".cd-vital-plot g.metric")).toHaveCount(5);
  await s.locator(".cd-vital-legend button").filter({ hasText: "脈拍" }).click();
  await expect(s.locator(".cd-vital-plot g.metric")).toHaveCount(4);
  await s.locator(".cd-vital-legend button").filter({ hasText: "脈拍" }).click();
  await s.locator(".cd-vital-plot rect.hover-zone").nth(1).hover();
  await expect(s.locator(".cd-vital-tooltip")).toContainText("37.4 ℃");
  await expect(s.locator(".cd-vital-tooltip")).toContainText("未測定");
  // 欠測期間（4・5 日前）を線で結ばない: 体温の線は 6 日前と 3 日前を結ばない
  const tempPath = await s.locator(".cd-vital-plot g.metric.temperature path").getAttribute("d");
  expect(tempPath?.match(/M /g)?.length).toBeGreaterThanOrEqual(2);

  // 13. 元データを変更すると、再生成した要約に反映される
  await p.goto("/home?view=health");
  await p.getByRole("button", { name: "履歴・グラフ" }).click();
  const target = p.locator(".d-health-list details").filter({ hasText: "37.4" });
  await target.locator("summary").click();
  await target.getByRole("button", { name: "この記録を編集" }).click();
  await severity(p, "手足のしびれ", 1);
  await p.getByRole("button", { name: "この記録を更新" }).click();
  await expect(p.locator(".toast")).toContainText("記録を更新しました");
  await s.locator(".cd-sidebar").getByRole("button", { name: "診察" }).click();
  await s.locator("[data-intervisit] [data-summary-all-toggle]").click();
  await s.getByRole("button", { name: "外来間サマリーを再生成" }).click();
  await expect(s.locator("[data-intervisit]")).toContainText(`手足のしびれは${md(6)}に1/4、${md(1)}に2/4と記録されました（期間内の最大は${md(3)}の2/4、4回記録）。`, { timeout: 15_000 });

  // 14. AI 生成エラー・検証不合格時は安全な代替表示（ルールベース）。元データは閲覧できる
  await s.goto(`/staff?s=${sid}&aisim=invalid`);
  await expect(s.locator('.cd-summary-narrative[data-summary-kind="rule"]')).toBeVisible({ timeout: 15_000 });
  await expect(s.locator("[data-ai-status='fallback']")).toContainText("AI要約は表示していません");
  // 擬似生成の不正な出力（「改善」「39.9℃」「理解力」）は表示されない
  await expect(s.locator(".cd-summary-narrative")).not.toContainText("改善しています");
  await expect(s.locator(".cd-summary-narrative")).not.toContainText("39.9");
  await expect(s.locator(".cd-summary-narrative")).not.toContainText("理解力");
  await s.locator("[data-intervisit] [data-summary-all-toggle]").click();
  await expect(s.locator("[data-intervisit]")).toContainText("体調記録は14日中3日、4件です。");
  await s.goto(`/staff?s=${sid}&aisim=error`);
  await expect(s.locator("[data-ai-status='fallback']")).toContainText("AI 要約を生成できませんでした", { timeout: 15_000 });
  // 代替表示でも、患者の質問は原文のまま先頭に出る（AI の文に置き換えない）
  await expect(s.locator('[data-key-row="questions"] [data-key-question]').first()).toContainText("「仕事に戻る時期の目安を相談したいです。」");

  // 14-2. 期間を変える（質問を保存する前の 6〜5 日前だけ）: 質問がない状態を区別し、前の期間の質問を出さない
  await s.goto(`/staff?s=${sid}`);
  const iv2 = s.locator("[data-intervisit]");
  await expect(iv2.locator('[data-key-row="questions"] [data-key-question]').first()).toBeVisible({ timeout: 15_000 });
  await iv2.getByRole("button", { name: "期間を確認・変更" }).click();
  const dIn = (n: number) => localInput(n, 0).slice(0, 10);
  await s.locator(".cd-period-editor input").first().fill(dIn(6));
  await s.locator(".cd-period-editor input").nth(1).fill(dIn(5));
  await s.locator(".cd-period-editor").getByRole("button", { name: "この期間で表示" }).click();
  await expect(iv2.locator("[data-no-questions]")).toHaveText("この期間に患者さんが残した質問はありません", { timeout: 15_000 });
  await expect(iv2.locator('[data-key-row="questions"]')).not.toContainText("仕事に戻る時期");
  await expect(iv2.locator('[data-key-row="questions"]')).not.toContainText("しびれは治療終了後");
  await expect(iv2.locator('[data-key-row="unknown"]')).toContainText("「わからない」と回答した設問はありません");

  // 15. 共有を終了すると、医療者の患者データアクセスは拒否され、画面から患者情報が消える
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expectShareEnded(s);
  await expect(s.locator("[data-intervisit]")).toHaveCount(0);
  for (const path of ["intervisit", "health", "patient"]) expect((await s.request.get(`/api/v1/consultations/${sid}/${path}`)).status()).toBe(403);
  expect((await s.request.post(`/api/v1/consultations/${sid}/intervisit/summary`, { data: {} })).status()).toBe(403);

  await staff.ctx.close();
  await patient.ctx.close();
});
