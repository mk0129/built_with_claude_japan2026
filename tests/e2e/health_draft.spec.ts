import { test, type Page } from "@playwright/test";
import { demoLogin, expect, newPage } from "./helpers";

/**
 * しんどい日に、症状を一件だけ残して休めるか（体調記録の保存前の入力 = 下書き）。架空患者・架空医療者のみ。
 * - 程度を選んだまま別の画面へ移っても、同じ患者が戻れば入力が残る（このタブの sessionStorage だけ。サーバーへは送らない）
 * - 明示的に保存したときだけ一度だけ記録され、保存後は下書きが消える
 * - 下書きは医療者側（一時共有中の体調記録・診察サマリー）に出ない
 * - 患者を切り替えると下書きを持ち越さない
 * - 「未入力」と「程度 0（なし）」を区別する
 * 他の E2E の件数に影響しないよう、このテストで保存した記録は最後に削除する。
 */
const DRAFT_KEY = "shiori.healthDraft.v1";
const symptom = (p: Page, name: string) => p.locator(".d-symptom-records article").filter({ hasText: name });
const level = (p: Page, name: string, value: number) => symptom(p, name).locator(".d-severity-scale button").nth(value);
const nav = (p: Page, name: string) => p.locator(".d-nav").getByRole("button", { name }).click();
const records = async (p: Page) => (await (await p.request.get("/api/v1/health/records")).json()).records as {
  id: string;
  symptoms: { key: string; severity: number; location: string | null }[];
}[];
const storedDraft = (p: Page) => p.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY);
const restored = (p: Page) => p.locator("[data-health-draft-restored]");

test("症状を一つ選んで別画面へ → 戻ると残る → 一度だけ保存（0 と未入力を区別）", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "佐藤 花子");
  const before = (await records(p)).map((r) => r.id);

  // 1. 体調記録を開き、しびれの程度を一つ選ぶ（タップ 2 回）。保存ボタンはスクロールせずに見える
  await nav(p, "体調記録");
  await expect(restored(p)).toHaveCount(0);
  await level(p, "手足のしびれ", 2).click();
  const save = p.getByRole("button", { name: "この記録を保存" });
  await expect(save).toBeInViewport();
  await expect(p.locator(".d-save-summary")).toContainText("手足のしびれ 2・中くらい");
  // 0（なし）も入力として扱う
  await level(p, "だるさ・倦怠感", 0).click();
  await expect(p.locator(".d-save-summary")).toContainText("ほか1件");

  // 2. 保存前に別の画面へ → 戻る: 入力が戻り、そのことが分かる
  await nav(p, "ホーム");
  await nav(p, "体調記録");
  await expect(restored(p)).toContainText("保存前の入力を戻しました");
  await expect(level(p, "手足のしびれ", 2)).toHaveAttribute("aria-pressed", "true");
  await expect(level(p, "だるさ・倦怠感", 0)).toHaveAttribute("aria-pressed", "true");
  await expect(symptom(p, "だるさ・倦怠感")).not.toContainText("未回答");
  await expect(symptom(p, "吐き気")).toContainText("未回答（欠測として保存）");
  await p.screenshot({ path: `${process.env.E2E_SHOT_DIR ?? "test-results"}/health-draft-restored.png` });
  // 再読み込みしても同じタブなら残る。まだ記録にはなっていない（サーバーへ送らない）
  await p.reload();
  await expect(level(p, "手足のしびれ", 2)).toHaveAttribute("aria-pressed", "true");
  expect((await records(p)).length).toBe(before.length);
  // 「履歴・グラフ」に切り替えて戻っても残る
  await p.getByRole("button", { name: "履歴・グラフ" }).click();
  await p.getByRole("button", { name: "今日の記録" }).click();
  await expect(level(p, "手足のしびれ", 2)).toHaveAttribute("aria-pressed", "true");

  // 3. 明示的に保存（連続タップでも一度だけ）
  await save.dblclick();
  await expect(p.locator(".toast")).toContainText("体調を記録しました");
  await expect(save).toBeEnabled();
  const after = await records(p);
  const added = after.filter((r) => !before.includes(r.id));
  expect(added).toHaveLength(1);
  const saved = Object.fromEntries(added[0].symptoms.map((s) => [s.key, s.severity]));
  // 0 は 0 として、未入力（吐き気など）は保存しない
  expect(saved).toEqual({ numbness: 2, fatigue: 0 });

  // 4. 保存後は下書きが消える（戻っても再読み込みしても同じ入力は出てこない）
  await expect(restored(p)).toHaveCount(0);
  await expect(symptom(p, "手足のしびれ")).toContainText("未回答");
  expect(await storedDraft(p)).toBeNull();
  await nav(p, "ホーム");
  await nav(p, "体調記録");
  await expect(restored(p)).toHaveCount(0);
  await expect(level(p, "手足のしびれ", 2)).toHaveAttribute("aria-pressed", "false");
  await p.reload();
  await expect(restored(p)).toHaveCount(0);
  expect((await records(p)).length).toBe(before.length + 1);

  // 5. 「入力を消す」で下書きを捨てられる（何も保存しない）
  await level(p, "吐き気", 1).click();
  await nav(p, "ホーム");
  await nav(p, "体調記録");
  await restored(p).getByRole("button", { name: "入力を消す" }).click();
  await expect(restored(p)).toHaveCount(0);
  await expect(symptom(p, "吐き気")).toContainText("未回答");
  expect(await storedDraft(p)).toBeNull();
  expect((await records(p)).length).toBe(before.length + 1);

  // 後片付け（他の E2E の件数に影響させない）
  for (const r of added) expect((await p.request.delete(`/api/v1/health/records/${r.id}`)).ok()).toBe(true);
  await ctx.close();
});

test("下書きは医療者側に出ず、患者を切り替えると持ち越さない", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  const p = patient.page;
  await demoLogin(p, "patient", "佐藤 花子");
  const savedBefore = await records(p);
  await nav(p, "体調記録");
  await level(p, "手足のしびれ", 3).click();
  await symptom(p, "手足のしびれ").getByRole("button", { name: "詳細（任意）" }).click();
  await symptom(p, "手足のしびれ").getByPlaceholder("例：両手の指").fill("下書きだけの部位");
  await expect.poll(() => storedDraft(p)).toContain("下書きだけの部位");

  // 1. 一時共有を承認しても、医療者は保存済みの記録しか読めない
  const staff = await newPage(browser, { width: 1440, height: 900 });
  const s = staff.page;
  await demoLogin(s, "staff", "山田 太郎");
  await p.goto("/home?view=share");
  await p.locator("[data-share-issue]").click();
  const code = ((await p.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: "患者のQRを読み取る／6桁コードを入力" }).click();
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(p.locator("[data-share-request]")).toBeVisible({ timeout: 10_000 });
  await p.locator(".d-consent input").check();
  await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await expect(s.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 10_000 });
  const sid = new URL(s.url()).searchParams.get("s")!;
  const shared = await (await s.request.get(`/api/v1/consultations/${sid}/health`)).json();
  expect(shared.records).toHaveLength(savedBefore.length);
  expect(JSON.stringify(shared)).not.toContain("下書きだけの部位");
  await expect(s.locator("body")).not.toContainText("下書きだけの部位");
  await p.getByRole("button", { name: "一時共有を終了する" }).click();
  await expect(p.locator(".d-share-chip")).toContainText("共有する");
  await staff.ctx.close();

  // 共有の画面を行き来しても、同じ患者の下書きは残っている
  await p.goto("/home?view=health");
  await expect(restored(p)).toBeVisible();
  await expect(level(p, "手足のしびれ", 3)).toHaveAttribute("aria-pressed", "true");
  expect((await records(p)).length).toBe(savedBefore.length);

  // 2. 同じタブで別の患者に切り替えると、前の患者の下書きは出ない（読んだ時点で消える）
  await p.goto("/logout");
  await p.waitForURL((url) => url.pathname === "/");
  await demoLogin(p, "patient", "高橋 由美");
  expect(await storedDraft(p)).toBeNull();
  await p.goto("/home?view=health");
  await expect(symptom(p, "手足のしびれ")).toBeVisible();
  await expect(restored(p)).toHaveCount(0);
  await expect(level(p, "手足のしびれ", 3)).toHaveAttribute("aria-pressed", "false");
  await expect(p.locator(".d-save-summary")).toHaveCount(0);

  // 3. 元の患者に戻っても、切り替えで捨てた下書きは戻らない（共用端末に残さない）
  await p.goto("/logout");
  await p.waitForURL((url) => url.pathname === "/");
  await demoLogin(p, "patient", "佐藤 花子");
  await p.goto("/home?view=health");
  await expect(symptom(p, "手足のしびれ")).toBeVisible();
  await expect(restored(p)).toHaveCount(0);
  expect((await records(p)).length).toBe(savedBefore.length);
  await patient.ctx.close();
});
