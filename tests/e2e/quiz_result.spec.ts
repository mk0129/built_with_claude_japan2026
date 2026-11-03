import { test, type Page } from "@playwright/test";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage } from "./helpers";

/**
 * クイズ・結果画面（Experience Reset 01、Phase B）:
 * - 1 問 1 画面、3 択＋「わからない」。選択だけでは送信されず、「回答を確認する」で確定（POST は確定時だけ）
 * - 確定後の保存中は押した選択肢が data-state=pending、確定後は correct / wrong / dim
 * - 結果: 点数は主役にしない（折りたたみ）。確認できた／もう一度確認／わからない のタイル
 * - 「次の診察につながる」: テーマを選ぶと候補文（設問文ではない）が入り、患者が編集して明示的に保存する。自動送信なし
 */
const MED001 = /乳がんの診断と病期の考え方/;

async function openFreshQuiz(page: Page) {
  await page.goto("/home");
  const href = await page.getByRole("link", { name: MED001 }).first().getAttribute("href");
  const quizUrl = href!.replace("/learn/", "/quiz/").split("?")[0];
  await page.goto(quizUrl);
  const retry = page.getByRole("button", { name: /もう一度挑戦する/ });
  await expect(retry.or(page.getByText(/QUESTION \d+/))).toBeVisible({ timeout: 10_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByText(/QUESTION 01/)).toBeVisible({ timeout: 10_000 });
  return quizUrl;
}

for (const vp of [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
]) {
  test(`クイズ・結果画面 ${vp.name}: 選択→確定、保存中の表示、タイル、次の診察に残す（明示保存のみ）`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await openFreshQuiz(page);

    let answerPosts = 0;
    let delay = 0;
    await page.route("**/api/v1/attempts/*/answers", async (route) => {
      answerPosts++;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      await route.continue();
    });
    const confirmBtn = page.getByRole("button", { name: /回答を確認する/ });
    await expect(confirmBtn).toBeDisabled();
    await page.screenshot({ path: `${SHOT_DIR}/quiz_after_${vp.name}.png`, fullPage: false });

    // 1 問目: 選択（送信されない）→ 確定（保存中 pending）→ 正解
    const first = page.getByRole("radio", { name: /^ウ/ });
    await first.click();
    await expect(first).toHaveAttribute("data-state", "selected");
    await expect(first).toHaveAttribute("aria-checked", "true");
    expect(answerPosts, "選択だけでは送信しない").toBe(0);
    await page.screenshot({ path: `${SHOT_DIR}/quiz_after_${vp.name}_selected.png`, fullPage: false });
    delay = 800;
    await confirmBtn.click();
    await expect(first).toHaveAttribute("data-state", "pending");
    await expect(first.getByText("記録中…")).toBeVisible();
    await expect(page.getByRole("radio", { name: /^ア/ })).toHaveAttribute("data-state", "dim");
    await expect(page.getByRole("button", { name: /記録しています…/ })).toBeVisible();
    await expect(page.getByText("確認できました。")).toBeVisible({ timeout: 10_000 });
    await expect(first).toHaveAttribute("data-state", "correct");
    expect(answerPosts).toBe(1);
    await page.screenshot({ path: `${SHOT_DIR}/quiz_after_${vp.name}_answered.png`, fullPage: false });
    delay = 0;

    // 2 問目: 誤答 → 穏やかな説明と正解
    await page.getByRole("button", { name: "次の問題へ" }).click();
    await page.getByRole("radio", { name: /^ア/ }).click();
    await confirmBtn.click();
    await expect(page.getByText("一緒に振り返りましょう。")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/正解は「/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /^ア/ })).toHaveAttribute("data-state", "wrong");
    // 3 問目: わからない
    await page.getByRole("button", { name: "次の問題へ" }).click();
    const unknown = page.getByRole("radio", { name: /^わからない/ });
    await unknown.click();
    await expect(unknown).toHaveAttribute("data-state", "selected");
    await confirmBtn.click();
    await expect(page.getByText(/を記録しました/)).toBeVisible({ timeout: 10_000 });
    expect(answerPosts).toBe(3);
    await page.unroute("**/api/v1/attempts/*/answers");
    await page.getByRole("button", { name: "学びの結果を見る" }).click();
    await expect(page.getByText(/ここまで学べました/)).toBeVisible();

    // タイル 3 つ（確認できた 1／もう一度確認 1／わからない 1）
    await expect(page.getByTestId("tile-correct")).toContainText("1");
    await expect(page.getByTestId("tile-wrong")).toContainText("1");
    await expect(page.getByTestId("tile-unknown")).toContainText("1");
    // 「次の診察につながる」がタイルの直後の最初のセクション
    await expect(page.locator("main > section").first().getByRole("heading", { name: "先生に聞いておきたいことはありますか？" })).toBeVisible();
    await expect(page.getByText("もう一度確認したいこと")).toBeVisible();
    await expect(page.getByTestId("to-review")).toHaveCount(2);
    await expect(page.getByText("点数を見る（先生と確認する材料です）")).toBeVisible();
    await expect(page.getByText(/^点数:/)).toBeHidden(); // 点数は折りたたみ内
    await page.screenshot({ path: `${SHOT_DIR}/result_after_${vp.name}_first.png`, fullPage: false });
    await page.screenshot({ path: `${SHOT_DIR}/result_after_${vp.name}_full.png`, fullPage: true });
    const audit = await layoutAudit(page);
    expect(audit.overflowX, "横スクロール").toBe(0);

    // テーマは関連画面のタイトル（設問文ではない）。選んだだけでは送信されない
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/v1/feedback")) posts++;
    });
    const themes = page.getByTestId("ask-theme");
    await expect(themes).toHaveCount(2);
    const stems = ["同じ病期の人は、必ず同じ治療を受けますか。", "検査結果でわからない言葉があったとき、おすすめの対応はどれですか。"];
    for (let i = 0; i < 2; i++) expect(stems).not.toContain((await themes.nth(i).innerText()).trim());
    await expect(page.getByRole("button", { name: /次の診察に残す/ })).toHaveCount(0);
    await themes.nth(0).click();
    const input = page.getByLabel("次の診察で聞きたいこと");
    await expect(input).toBeVisible();
    const draft = await input.inputValue();
    expect(draft).toMatch(/説明してほしいです/);
    for (const s of stems) expect(draft).not.toBe(s);
    expect(posts).toBe(0);
    await page.screenshot({ path: `${SHOT_DIR}/result_after_${vp.name}_theme.png`, fullPage: false });
    // 自分の言葉に直す → 気持ち（任意）→ 明示的に保存
    await input.fill("治療が人によって変わる理由を、次の診察で教えてほしいです。");
    await page.getByRole("button", { name: "質問がある" }).click();
    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/api/v1/feedback"));
    await page.getByRole("button", { name: /次の診察に残す/ }).click();
    const body = (await req).postDataJSON() as { selection: string; freeText: string };
    expect(body.selection).toBe("have_question");
    expect(body.freeText).toBe("治療が人によって変わる理由を、次の診察で教えてほしいです。");
    await expect(page.getByText(/次の診察に残しました/)).toBeVisible();
    await expect(page.getByText(/すぐの返信はありません。緊急のときは病院の連絡先へ/)).toBeVisible();
    await page.waitForTimeout(300);
    expect(posts, "feedback POST は 1 回だけ").toBe(1);

    if (vp.name === "390") {
      await page.evaluate(() => {
        document.documentElement.dataset.textsize = "large";
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SHOT_DIR}/result_after_390_large_full.png`, fullPage: true });
      const large = await layoutAudit(page);
      expect(large.overflowX, "文字拡大時の横スクロール").toBe(0);
    }
    await ctx.close();
  });
}
