import { test, type Page } from "@playwright/test";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage } from "./helpers";

/**
 * クイズ結果画面（2026-11-03 改訂）の回帰:
 * - 回答直後に押した選択肢が「選択中…」（data-state=pending）になる（UX-08）
 * - 結果画面: 理解できた／もう一度確認／わからない のタイル、「次の診察に残す」が最上段
 * - 質問候補は設問文そのままではなく、患者が選び・編集し、明示的に保存したときだけ POST される（自動送信なし）
 * 採点・履歴・スナップショットのロジックは対象外（既存テストで担保）。
 */
const MED001 = /乳がんの診断と病期の考え方/;

async function openFreshQuiz(page: Page) {
  await page.goto("/home");
  const href = await page.getByRole("link", { name: MED001 }).first().getAttribute("href");
  const quizUrl = href!.replace("/learn/", "/quiz/").split("?")[0];
  await page.goto(quizUrl);
  const retry = page.getByRole("button", { name: /もう一度挑戦する/ });
  await expect(retry.or(page.getByText(/確認問題 \d+ \//))).toBeVisible({ timeout: 10_000 });
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByText(/確認問題 1 \/ 3/)).toBeVisible({ timeout: 10_000 });
  return quizUrl;
}

for (const vp of [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
]) {
  test(`クイズ結果画面 ${vp.name}: 選択中の表示、タイル、次の診察に残す（明示保存のみ）`, async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await openFreshQuiz(page);

    // 回答直後（保存中）: /answers を遅らせて pending 状態を観察する
    let delay = 800;
    await page.route("**/api/v1/attempts/*/answers", async (route) => {
      await new Promise((r) => setTimeout(r, delay));
      await route.continue();
    });
    const first = page.getByRole("button", { name: /^ウ/ });
    await first.click();
    await expect(first).toHaveAttribute("data-state", "pending");
    await expect(first.getByText("選択中…")).toBeVisible();
    await expect(page.getByRole("button", { name: /^ア/ })).toHaveAttribute("data-state", "dim");
    await expect(page.getByText("記録しています…")).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/question_pending_after_${vp.name}.png`, fullPage: false });
    await expect(page.getByText("正解です")).toBeVisible({ timeout: 10_000 });
    await expect(first).toHaveAttribute("data-state", "correct");
    delay = 0;
    await page.getByRole("button", { name: "次の問題へ" }).click();
    await page.getByRole("button", { name: /^ア/ }).click();
    await expect(page.getByText("こちらが正解です")).toBeVisible();
    await page.getByRole("button", { name: "次の問題へ" }).click();
    const unknown = page.getByRole("button", { name: /^わからない/ });
    delay = 800;
    await unknown.click();
    await expect(unknown).toHaveAttribute("data-state", "pending");
    await expect(page.getByText(/を記録しました/)).toBeVisible({ timeout: 10_000 });
    await page.unroute("**/api/v1/attempts/*/answers");
    await page.getByRole("button", { name: "結果を見る" }).click();
    await expect(page.getByText(/確認を終えました/)).toBeVisible();

    // タイル 3 つ（理解できた 1／もう一度確認 1／わからない 1）
    await expect(page.getByTestId("tile-correct")).toContainText("1");
    await expect(page.getByTestId("tile-wrong")).toContainText("1");
    await expect(page.getByTestId("tile-unknown")).toContainText("1");
    // 「次の診察に残す」が見出しの次の最初のセクション
    const firstSection = page.locator("main > section").first();
    await expect(firstSection.getByRole("heading", { name: "次の診察に残す" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "もう一度確認したいこと" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "今回理解できたこと" })).toBeVisible();
    await expect(page.getByText("点数を見る（先生と確認する材料です）")).toBeVisible();
    await expect(page.getByText(/^点数:/)).toBeHidden(); // 点数は折りたたみ内（既定で閉じている）
    await page.screenshot({ path: `${SHOT_DIR}/result_after_${vp.name}_first.png`, fullPage: false });
    await page.screenshot({ path: `${SHOT_DIR}/result_after_${vp.name}_full.png`, fullPage: true });
    const audit = await layoutAudit(page);
    expect(audit.overflowX, "横スクロール").toBe(0);

    // 候補 2 件は設問文そのままではない
    const candidates = page.getByTestId("ask-candidate");
    await expect(candidates).toHaveCount(2);
    const stems = ["同じ病期の人は、必ず同じ治療を受けますか。", "検査結果でわからない言葉があったとき、おすすめの対応はどれですか。"];
    for (let i = 0; i < 2; i++) {
      const t = (await candidates.nth(i).innerText()).trim();
      for (const s of stems) expect(t).not.toBe(s);
      expect(t).toMatch(/説明してほしいです/);
    }
    // 4 択未選択では保存できない。候補を選ぶだけでは送信されない
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/v1/feedback")) posts++;
    });
    const save = page.getByRole("button", { name: /次の診察に残す/ });
    await expect(save).toBeDisabled();
    await candidates.nth(0).click();
    await expect(save).toBeDisabled();
    expect(posts).toBe(0);
    // 候補の文を編集 → 4 択を選ぶ → 明示的に保存
    const edit = page.getByLabel("質問 1 の文を直す");
    await edit.fill("治療が人によって変わる理由を、次の診察で教えてほしいです。");
    await page.getByRole("button", { name: "質問がある" }).click();
    await expect(save).toBeEnabled();
    await expect(save).toHaveText(/質問 1 件とあわせて次の診察に残す/);
    const req = page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/api/v1/feedback"));
    await save.click();
    const body = (await req).postDataJSON() as { selection: string; freeText: string };
    expect(body.selection).toBe("have_question");
    expect(body.freeText).toContain("治療が人によって変わる理由を、次の診察で教えてほしいです。");
    expect(body.freeText).not.toContain(stems[1]);
    await expect(page.getByText(/次の診察で先生が確認します。すぐの返信はありません。緊急のときは病院の連絡先へ/)).toBeVisible();
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
