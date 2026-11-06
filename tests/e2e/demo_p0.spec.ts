import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { demoLogin, expect, expectShareEnded, newPage, shareByPatientCode } from "./helpers";

/**
 * デモ撮影直前の P0 修正の確認（架空データ。Claude は呼ばない）。
 * 1. 理解確認の結果画面の「学んだ教材」が DB の記録と一致する（正解・不正解・「わからない」、再読み込み後も。確認中・失敗の表示）
 * 2. 医療費シミュレーターの結果が、390px・430px の初期表示で見える（架空の例・手入力の両方）
 * 3. 医療者が共有を終了すると終了完了の画面になり、失敗の通知を出さない。終了後の患者情報は 403。終了に失敗したときは成功の表示を出さない
 * 4. 診断時セットを処方したあとに別の教材を処方しても、ホームにセットが残り、新しい教材は別に案内される
 */
const OUT = process.env.P0_SHOT_DIR ?? "test-results/p0_shots";
mkdirSync(OUT, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: `${OUT}/${name}.png` });

const MATERIAL = "乳がんの診断と病期の考え方";
const SET_TITLES = ["乳がんの診断と病期の考え方", "サブタイプと治療方針のつながり", "こころのケアと相談先"];
const OTHER_MATERIAL = "乳房の手術の種類と選び方";

async function call(p: Page, method: "GET" | "POST", path: string, data?: unknown) {
  const r = method === "GET" ? await p.request.get(path) : await p.request.post(path, { data: data ?? {} });
  expect(r.ok(), `${method} ${path} → ${r.status()}`).toBeTruthy();
  const body = await r.json();
  return body.data ?? body;
}

/** 学習を始めた教材の数（画面の「学んだ教材」と同じ定義: 学習状態が「未学習」以外） */
async function learnedFromDb(p: Page) {
  const lib = await call(p, "GET", "/api/v1/library");
  return (lib.items as { phase: string }[]).filter((i) => i.phase !== "not_started").length;
}

/** API で共有 → 教材を処方 → 終了（画面の操作は別のテストで確認済み。ここは処方の履歴を作るだけ） */
async function prescribeViaApi(patient: Page, staff: Page, titles: string[]) {
  const grant = await call(patient, "POST", "/api/v1/qr");
  const me = await call(staff, "GET", "/api/v1/me");
  const org = me.memberships.find((m: { orgName?: string; name?: string }) => /さくら/.test(m.orgName ?? m.name ?? "")) ?? me.memberships[0];
  await call(staff, "POST", "/api/v1/qr/claim", { orgId: org.orgId ?? org.id, code: grant.code });
  const { consultationSessionId: sid } = await call(patient, "POST", `/api/v1/qr/${grant.grantId}/approve`);
  const { items } = await call(staff, "GET", `/api/v1/consultations/${sid}/materials`);
  const ids = titles.map((t) => {
    const m = items.find((x: { title: string }) => x.title === t);
    return m?.materialId ?? m?.id;
  });
  expect(ids.every(Boolean)).toBeTruthy();
  await call(staff, "POST", `/api/v1/consultations/${sid}/prescriptions`, { materialIds: ids });
  await call(staff, "POST", `/api/v1/consultations/${sid}/end`);
}

test("P0-1: 理解確認の結果の「学んだ教材」が DB と一致（正解・不正解・わからない、再読み込み後も）。確認できないときは成功を表示しない", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "伊藤 涼子");
  const lib = await call(p, "GET", "/api/v1/library");
  const id = lib.items.find((i: { title: string }) => i.title === MATERIAL).materialId;

  await p.goto(`/home?view=learn&lesson=${id}`);
  await expect(p.locator(".d-learning h1")).toHaveText("病期（ステージ）とは");
  for (let i = 0; i < 8 && !(await p.getByRole("button", { name: "理解を確認する" }).count()); i++) await p.getByRole("button", { name: "次へ" }).click();
  await p.getByRole("button", { name: "理解を確認する" }).click();

  // 1 問目: 正解、2 問目: 不正解、3 問目: 「わからない」
  await p.locator(".d-answer-list button").filter({ hasText: "患者さんの年齢" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: "この内容で確認できています" })).toBeVisible();
  await p.getByRole("button", { name: "次の問題へ" }).click();
  await p.locator(".d-answer-list button").filter({ hasText: "必ず同じ治療になる" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: "いっしょに確認しましょう" })).toBeVisible();
  await p.getByRole("button", { name: "次の問題へ" }).click();
  await p.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
  await p.getByRole("button", { name: "この回答で確定する" }).click();
  await expect(p.getByRole("heading", { name: /「わからない」を\s*記録しました/ })).toBeVisible();
  await shot(p, "P07_quiz_unknown_390");

  // 一覧の読み込みに失敗 → 成功の表示（チェック・「学習を記録しました」）を出さない
  await p.route("**/api/v1/library", (r) => r.abort());
  await p.getByRole("button", { name: "振り返りへ" }).click();
  const result = p.locator(".d-result-page");
  await expect(result).toHaveAttribute("data-result-state", "error");
  await expect(result).toContainText("学習の記録を確認できませんでした");
  await expect(result).not.toContainText("学習を記録しました");
  await expect(result.locator(".d-result-mark")).toHaveCount(0);
  await shot(p, "P08_result_error_390");

  // 再試行 → DB と同じ件数で「学習を記録しました」
  await p.unroute("**/api/v1/library");
  await result.getByRole("button", { name: "もう一度確認する" }).click();
  await expect(result).toHaveAttribute("data-result-state", "saved");
  const expected = await learnedFromDb(p);
  expect(expected).toBeGreaterThan(0);
  await expect(result.locator(".eyebrow")).toHaveText("学習を記録しました");
  await expect(result.locator("[data-learned-count]")).toHaveText(String(expected));
  // 振り返りの内容: 3 問のうち「不正解」と「わからない」の 2 件
  await expect(result).toContainText("振り返りたい内容 2件");
  await shot(p, "P08_result_390");

  // 再読み込みしても同じ件数
  await p.reload();
  await expect(p.locator(".d-result-page")).toHaveAttribute("data-result-state", "saved");
  await expect(p.locator("[data-learned-count]")).toHaveText(String(expected));
  // 直後の学習記録とも一致（この教材は学習済み）
  const after = await call(p, "GET", "/api/v1/library");
  expect(after.items.find((i: { title: string }) => i.title === MATERIAL)).toMatchObject({ phase: "completed", nCorrect: 1, nWrong: 1, nUnknown: 1 });
  await ctx.close();
});

for (const vp of [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
]) {
  test(`P0-2: シミュレーターの結果が ${vp.name}px の初期表示で見える（架空の例・手入力）`, async ({ browser }) => {
    const { ctx, page: p } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(p, "patient", "伊藤 涼子");
    await p.goto("/home?view=simulator");
    const main = p.locator("main.d-main");
    const resultTop = async () => {
      await expect(p.locator("[data-sim-result]")).toBeVisible();
      // 内側のスクロール領域・ページ全体とも先頭
      await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0);
      expect(await p.evaluate(() => window.scrollY)).toBe(0);
      // 金額・意味・適用条件が初期表示で読める
      for (const sel of ["[data-sim-amount]", ".d-sim-amount-card > span", ".d-sim-disclaimer"]) await expect(p.locator(sel)).toBeInViewport();
      await expect(p.locator(".d-sim-conditions dt").first()).toBeInViewport();
    };

    // 架空の例: 入力画面を下までスクロールしてから押しても、結果は先頭から
    await main.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await p.locator("[data-sim-demo]").click();
    await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
    await resultTop();
    await shot(p, `P12_sim_result_demo_${vp.name}`);

    // 手入力: 手順どおりに選び、総医療費の画面を下までスクロールして計算
    await p.getByRole("button", { name: "最初から選び直す" }).click();
    await p.locator("[data-sim-step='1']").getByRole("button", { name: "2026年11月" }).click();
    await p.locator("[data-sim-choice='under70']").click();
    await p.locator("[data-sim-choice='employee']").click();
    await p.locator("[data-sim-choice='bracket-c']").click();
    await p.locator("[data-sim-cost-input]").fill("1000000");
    await main.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await p.locator("[data-sim-calc]").click();
    await expect(p.locator("[data-sim-amount]")).toHaveText("92,940円");
    await resultTop();
    await shot(p, `P12_sim_result_manual_${vp.name}`);
    await ctx.close();
  });
}

test("P0-3: 医療者の共有終了 → 終了完了の画面（失敗の通知なし）→ 患者情報は 403。終了に失敗したときは成功を表示しない", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(staff.page, "staff", "山田 太郎");
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "伊藤 涼子");
  const s = staff.page;
  await shareByPatientCode(s, patient.page);
  const sid = new URL(s.url()).searchParams.get("s")!;

  // 通信エラーで終了できない → 共有中のまま、失敗の通知（成功の印・終了完了の画面は出さない）
  await s.route(`**/api/v1/consultations/${sid}/end`, (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "UNAVAILABLE" }) }));
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  const err = s.locator("[data-toast-tone='error']");
  await expect(err).toContainText("共有を終了できませんでした");
  await expect(s.locator("[data-share-ended]")).toHaveCount(0);
  await expect(s.locator(".cd-app")).toBeVisible();
  await shot(s, "C13_end_failed_1180");
  expect((await s.request.get(`/api/v1/consultations/${sid}/patient`)).status()).toBe(200);
  await s.unroute(`**/api/v1/consultations/${sid}/end`);

  // 終了できた → 終了完了の画面（追加入力なし）
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await expect(s.locator("[data-share-ended]")).toContainText("伊藤 涼子さんとの一時共有を終了しました");
  await shot(s, "C13_share_ended_1180");
  for (const path of ["patient", "materials", "health", "intervisit"]) expect((await s.request.get(`/api/v1/consultations/${sid}/${path}`)).status()).toBe(403);
  await expectShareEnded(s);
  // 患者側も共有なしに戻る
  await patient.page.goto("/home");
  await expect(patient.page.locator(".d-share-chip")).toContainText("共有する", { timeout: 10_000 });
  await staff.ctx.close();
  await patient.ctx.close();
});

test("P0-4: 診断時セットのあとに別の教材を処方しても、ホームにセットが残り、新しい教材は別に確認できる", async ({ browser }) => {
  const staff = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(staff.page, "staff", "佐藤 一郎");
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "伊藤 涼子");
  const p = patient.page;

  // 1 回目: 診断時セットの 3 件（教材の一致で「セット」と判定。セットを使ったとは断定しない）
  await prescribeViaApi(p, staff.page, SET_TITLES);
  await p.goto("/home");
  const card = p.locator("[data-set-card]");
  await expect(card).toContainText("診断時セット");
  await expect(card).toHaveAttribute("data-set-in-latest", "true");
  await expect(card).toContainText("今回の情報処方セット");
  const firstSender = (await card.locator(".d-set-sender").textContent()) ?? "";

  // 2 回目: 別の教材を 1 件だけ処方
  await prescribeViaApi(p, staff.page, [OTHER_MATERIAL]);
  for (const vp of [
    { name: "390", width: 390, height: 844 },
    { name: "430", width: 430, height: 932 },
  ]) {
    await p.setViewportSize({ width: vp.width, height: vp.height });
    await p.goto("/home");
    await expect(card).toContainText("診断時セット");
    await expect(card).toHaveAttribute("data-set-in-latest", "false");
    // 今回の処方ではないので「今回の」と書かない。送り元・日付はセットを含む処方の記録
    await expect(card.locator(".pill, [class*='pill']").first()).toHaveText("情報処方セット");
    await expect(card.locator(".d-set-sender")).toHaveText(firstSender);
    await expect(card).toContainText(/学習済み\s*\d+ \/ 3/);
    const fresh = p.locator("[data-new-rx]");
    await expect(fresh).toContainText("新しく届いた教材 1件");
    await shot(p, `P01_home_set_kept_${vp.name}`);
  }

  // セットの内容から続きを読める
  await card.locator("[data-set-open]").click();
  await expect(p.locator("[data-set-detail]")).toBeVisible();
  for (const t of SET_TITLES) await expect(p.locator("[data-set-detail]")).toContainText(t);
  await shot(p, "P02_set_detail_after_new_rx_430");
  await p.goto("/home");
  // 新しく届いた教材は「今回の情報処方」から
  await p.locator("[data-new-rx]").click();
  await expect(p.locator(".d-lesson-card").filter({ hasText: OTHER_MATERIAL })).toBeVisible();
  await staff.ctx.close();
  await patient.ctx.close();
});
