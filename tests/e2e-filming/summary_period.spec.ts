import { expect, test, type Page, type Route } from "@playwright/test";
import { demoLogin, newPage, shareByPatientCode } from "../e2e/helpers";

/**
 * 診察サマリーの期間（撮影と同じ条件: 佐藤 花子・観察期間 10/22〜11/4・10/31 の診察ノート「手のしびれは…」）。
 * 1. 期間を素早く変え、古い期間（A）の応答を新しい期間（B）より後に返しても、B のまま（A の質問・根拠を出さない）
 * 2. 要約（AI）の読み込み中と読み込み後で、患者の質問の位置が変わらない
 * 3. サマリー → 在宅経過表・グラフ → サマリーで同じ期間。共有を終えると期間は消える（次の共有に持ち越さない）
 */
const A = { from: "2026-10-29", to: "2026-10-31" };
const B = { from: "2026-10-25", to: "2026-10-26" };
const NOTE = "手のしびれは、治療が終わったら戻りますか？";

async function setPeriod(s: Page, p: { from: string; to: string }) {
  await openAi(s);
  // 2026-11: 期間の変更は診察サマリーの見出し（観察期間）から
  await s.locator("[data-summary-v2]").getByRole("button", { name: "期間を変更" }).click();
  await s.locator(".cd-period-editor input").first().fill(p.from);
  await s.locator(".cd-period-editor input").nth(1).fill(p.to);
  await s.locator(".cd-period-editor").getByRole("button", { name: "この期間で表示" }).click();
}
const isPeriod = (route: Route, p: { from: string }) =>
  route.request().url().includes(`from=${p.from}`) || (route.request().postData() ?? "").includes(p.from);

/** 2026-11: AI 外来間サマリー（要約・根拠・タイムライン）は診察サマリーの折りたたみの中。開いてから確認する */
async function openAi(page: import("@playwright/test").Page) {
  const t = page.locator("[data-ai-fold] .cd-ai-fold-toggle");
  await t.waitFor({ timeout: 15_000 });
  if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
}

test("期間を素早く変えても、遅れて返った古い期間の質問・根拠を出さない（構造化データ・AI 要約）", async ({ browser }) => {
  const pt = await newPage(browser, { width: 393, height: 852 });
  const st = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(pt.page, "patient", "佐藤 花子");
  await demoLogin(st.page, "staff", "佐藤 一郎");
  const s = st.page;
  await shareByPatientCode(s, pt.page);
  await openAi(s);
  const iv = s.locator("[data-intervisit]");
  await expect(iv.locator('[data-summary-kind="replay"]')).toBeVisible({ timeout: 30_000 }); // 記録済みの Claude 出力の再生
  await expect(iv.locator("[data-key-question]").first()).toContainText(NOTE);

  // A（10/29〜10/31）の応答（構造化データ・AI 要約）を保留する
  const held: Route[] = [];
  await s.route(/\/api\/v1\/consultations\/[^/]+\/intervisit(\/summary)?(\?.*)?$/, async (route) => {
    if (isPeriod(route, A)) held.push(route);
    else await route.continue();
  });
  await setPeriod(s, A);
  await expect.poll(() => held.length).toBeGreaterThanOrEqual(2); // 構造化データと AI 要約
  await setPeriod(s, B);
  await expect(iv).toContainText("10月25日〜10月26日（2日間）", { timeout: 15_000 });
  await expect(iv.locator("[data-no-questions]")).toBeVisible();

  // A の応答を、B の表示のあとに返す（逆順）
  let doneA = 0;
  s.on("requestfinished", (r) => {
    if (r.url().includes(`from=${A.from}`) || (r.postData() ?? "").includes(A.from)) doneA++;
  });
  for (const r of held) await r.continue();
  await expect.poll(() => doneA, { timeout: 15_000 }).toBe(held.length);
  await s.waitForTimeout(800);
  // 古い応答の完了後も B のまま。10/31 の原文・根拠は出ない
  await expect(iv).toContainText("10月25日〜10月26日（2日間）");
  await expect(iv).not.toContainText("10月29日〜10月31日");
  await expect(iv.locator("[data-no-questions]")).toHaveText("この期間に患者さんが残した質問はありません");
  await expect(iv).not.toContainText(NOTE);
  await expect(iv.locator("[data-source-id^='vn:']")).toHaveCount(0);
  await iv.locator("[data-summary-all-toggle]").click();
  await expect(iv).not.toContainText(NOTE);
  await expect(iv).not.toContainText("10月31日");
  await s.unroute(/\/api\/v1\/consultations\/[^/]+\/intervisit(\/summary)?(\?.*)?$/);

  // 同じ期間（既定）で AI 要約を読み込み中にし、応答の前後で質問の位置が変わらない
  const sid = new URL(s.url()).searchParams.get("s") ?? (await (await s.request.get("/api/v1/staff/live")).json()).activeSessionId;
  const heldAi: Route[] = [];
  await s.route(/\/intervisit\/summary$/, async (route) => void heldAi.push(route));
  await s.goto(`/staff?s=${sid}`);
  await openAi(s);
  const q = s.locator("[data-intervisit] [data-key-question]").first();
  await expect(q).toContainText(NOTE, { timeout: 15_000 });
  await expect(s.locator("[data-ai-status='loading']")).toBeVisible();
  const y1 = (await q.boundingBox())!.y;
  for (const r of heldAi) await r.continue();
  await s.unroute(/\/intervisit\/summary$/);
  await expect(s.locator('[data-intervisit] [data-summary-kind="replay"]')).toBeVisible({ timeout: 30_000 });
  await expect(s.locator("[data-ai-status='loading']")).toHaveCount(0);
  expect(Math.abs((await q.boundingBox())!.y - y1)).toBeLessThan(2);

  await s.request.post(`/api/v1/consultations/${sid}/end`, { data: {} });
  await st.ctx.close();
  await pt.ctx.close();
});

test("サマリー → 在宅経過表・グラフ → サマリーで同じ期間（既定・指定）。共有を終えると期間は消える", async ({ browser }) => {
  const pt = await newPage(browser, { width: 393, height: 852 });
  const st = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(pt.page, "patient", "佐藤 花子");
  await demoLogin(st.page, "staff", "佐藤 一郎");
  const s = st.page;
  await shareByPatientCode(s, pt.page);
  await openAi(s);
  const iv = s.locator("[data-intervisit]");
  await expect(iv).toContainText("10月22日〜11月4日（14日間）", { timeout: 30_000 });
  const heads = s.locator(".cd-course-table thead th span");

  // 既定の 14 日間
  await iv.getByRole("button", { name: "在宅経過表・症状のグラフで確認" }).click();
  await expect(s.getByRole("heading", { name: "在宅経過表" })).toBeVisible();
  await expect(heads.first()).toHaveText("10/22");
  await expect(heads.last()).toHaveText("11/4");
  await expect(s.locator(".cd-course-controls")).toContainText("/ 14日");
  await s.locator(".cd-sidebar").getByRole("button", { name: "診察" }).click();
  await openAi(s);
  await expect(iv).toContainText("10月22日〜11月4日（14日間）");

  // 指定期間（10/25〜10/26）: 経過表は 2 日だけ（範囲外の記録を含めない）→ サマリーに戻っても同じ期間
  await setPeriod(s, B);
  await expect(iv).toContainText("10月25日〜10月26日（2日間）", { timeout: 15_000 });
  await iv.getByRole("button", { name: "在宅経過表・症状のグラフで確認" }).click();
  await expect(s.getByRole("heading", { name: "在宅経過表" })).toBeVisible();
  await expect(heads).toHaveCount(2);
  await expect(heads.first()).toHaveText("10/25");
  await expect(heads.last()).toHaveText("10/26");
  await expect(s.locator(".cd-course-controls")).toContainText("/ 2日");
  await expect(s.locator(".cd-course-controls")).not.toContainText("/ 14日");
  await s.locator(".cd-sidebar").getByRole("button", { name: "診察" }).click();
  await openAi(s);
  await expect(iv).toContainText("10月25日〜10月26日（2日間）", { timeout: 15_000 });
  await expect(iv).not.toContainText("直近14日間");

  // 共有終了 → 次の共有では既定の 14 日間（期間を持ち越さない）
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expect(s.locator("[data-share-ended]")).toBeVisible();
  await s.goto("/staff");
  // 患者側は「共有は終了しました（閉じる）」の状態から、もう一度共有する
  await pt.page.goto("/home?view=share");
  const close = pt.page.getByRole("button", { name: /^閉じる$/ });
  if (await close.isVisible({ timeout: 3_000 }).catch(() => false)) await close.click();
  await shareByPatientCode(s, pt.page);
  await openAi(s);
  await expect(s.locator("[data-intervisit]")).toContainText("10月22日〜11月4日（14日間）", { timeout: 30_000 });
  await s.locator("[data-intervisit]").getByRole("button", { name: "在宅経過表・症状のグラフで確認" }).click();
  await expect(heads.first()).toHaveText("10/22");
  await expect(heads.last()).toHaveText("11/4");

  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await st.ctx.close();
  await pt.ctx.close();
});
