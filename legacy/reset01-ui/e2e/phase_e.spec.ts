import { test } from "@playwright/test";
import { demoLogin, expect, layoutAudit, newPage, showQrCode } from "./helpers";

/**
 * Phase E（2026-11-03）: 患者 4 タブ・今回の処方・教材一覧（未処方も自主学習可）・理解の地図、医療者の要約帯と領域の絞り込み。
 * 架空データのみ。佐藤 花子 はデモ履歴あり（2 回の処方＋放射線の自主学習）。
 */
test("患者: 今回の処方・まなぶ（未処方の自主学習）・きろく（理解の地図）", async ({ browser }) => {
  const { ctx, page: p } = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p, "patient", "佐藤 花子");

  // 4 タブ
  const nav = p.getByRole("navigation", { name: "メインメニュー" });
  for (const t of ["ホーム", "まなぶ", "きろく", "共有"]) await expect(nav.getByRole("link", { name: t })).toBeVisible();

  // ホーム: 今回の処方（教材ごとの状態）と、次にやることのボタン 1 つ
  const rx = p.getByTestId("current-rx");
  await expect(rx.getByText("今回の処方")).toBeVisible();
  await expect(rx.getByRole("list", { name: "今回の処方の教材" }).getByRole("listitem")).not.toHaveCount(0);
  await expect(rx.getByText(/完了/).first()).toBeVisible();
  expect((await layoutAudit(p)).overflowX).toBe(0);

  // まなぶ: 6 領域の見出し、未処方の教材も並ぶ。開くと学習できる（自主学習）
  await nav.getByRole("link", { name: "まなぶ" }).click();
  await p.waitForURL(/\/library/);
  for (const h of ["診断と病期", "手術", "薬物療法", "放射線", "副作用と生活", "心のケア・制度"]) await expect(p.getByRole("heading", { name: new RegExp(h) })).toBeVisible();
  await expect(p.getByText("自分で学習").first()).toBeVisible();
  await p.getByRole("button", { name: /処方された/ }).click();
  await expect(p.getByRole("link", { name: /乳房の手術の種類と選び方/ })).toHaveCount(0);
  await p.getByRole("button", { name: "すべて" }).click();
  await p.getByRole("link", { name: /乳房の手術の種類と選び方/ }).click();
  await p.waitForURL(/\/learn\//);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  await p.getByRole("button", { name: /次のページへ/ }).click(); // 進捗が保存される
  await p.waitForTimeout(500);
  await p.goto("/home");
  await expect(p.getByRole("list", { name: "自分で学んでいる教材" }).getByText(/乳房の手術の種類と選び方/)).toBeVisible();

  // きろく: 理解の地図（6 領域）。点数は折りたたみ
  await p.goto("/scores");
  const map = p.getByTestId("understanding-map");
  await expect(map.getByRole("link")).toHaveCount(6);
  await expect(map.getByText("もう一度").first()).toBeVisible();
  await expect(p.getByTestId("score-details")).not.toHaveAttribute("open", "");
  expect((await layoutAudit(p)).overflowX).toBe(0);
  await ctx.close();
});

test("医療者: 要約帯と理解の地図、領域で絞り込み", async ({ browser }) => {
  const patient = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(patient.page, "patient", "佐藤 花子");
  const code = await showQrCode(patient.page);
  const staff = await newPage(browser, { width: 1180, height: 820 });
  const s = staff.page;
  await demoLogin(s, "staff", "山田 太郎");
  await s.getByRole("button", { name: /患者さんの QR を読み取る/ }).click();
  await s.getByLabel("6桁の番号").fill(code);
  await s.getByRole("button", { name: /共有を要求する/ }).click();
  await patient.page.getByRole("button", { name: "許可する" }).click({ timeout: 15_000 });
  await s.waitForURL(/\/staff\/consult\//, { timeout: 15_000 });

  await expect(s.getByRole("group", { name: "この患者さんの要約" }).or(s.getByLabel("この患者さんの要約"))).toBeVisible({ timeout: 20_000 });
  const map = s.getByTestId("domain-map");
  await expect(map.getByRole("button")).toHaveCount(6);
  // 処方も自主学習もない領域は押せない（他のテストの自主学習で変わるため、押せない領域があればその表示を確かめる）
  const cells = map.getByRole("button");
  for (let i = 0; i < 6; i++) {
    const c = cells.nth(i);
    if (await c.isDisabled()) await expect(c).toContainText("処方・学習なし");
  }
  await map.getByRole("button", { name: /^薬物療法/ }).click();
  await expect(s.getByText(/「薬物療法」に絞り込み中/)).toBeVisible();
  await s.getByRole("button", { name: "すべて表示" }).click();
  await expect(s.getByText(/絞り込み中/)).toHaveCount(0);
  for (const w of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await s.setViewportSize(w);
    await s.waitForTimeout(300);
    expect((await layoutAudit(s)).overflowX, `consult ${w.width}`).toBe(0);
  }
  await s.setViewportSize({ width: 1180, height: 820 });
  await s.getByRole("button", { name: "共有を終了" }).click();
  await staff.ctx.close();
  await patient.ctx.close();
});
