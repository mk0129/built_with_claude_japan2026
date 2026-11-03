import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, newPage } from "./helpers";

/** MED-001（3 枚・監修待ち）の管理者プレビューと、患者画面に出ないことの確認 */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "1180", width: 1180, height: 820 },
];

test("MED-001 管理者プレビュー（切り替え / 縦並び）と患者画面", async ({ browser }) => {
  const report: Record<string, unknown>[] = [];
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "staff", "運営 承認担当");
    await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
    await page.waitForURL(/\/preview/);
    const base = page.url().split("?")[0];
    for (const layout of ["tabs", "stack"] as const) {
      await page.goto(`${base}?layout=${layout}`);
      await page.waitForLoadState("networkidle");
      const imgs = page.locator('section[aria-label="1 画面目"] figure img');
      await expect(imgs.first()).toBeVisible();
      await page.waitForTimeout(300);
      // 画像が実際に読み込まれている（認証付きルート）
      const loaded = await imgs.evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth));
      expect(loaded.every((w) => w > 0)).toBe(true);
      // ラベルが画像の外にはみ出していない
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll('section[aria-label="1 画面目"] figure')].flatMap((fig) => {
          const box = fig.querySelector("div.relative")!.getBoundingClientRect();
          return [...fig.querySelectorAll(".fig-label")].map((l) => {
            const r = l.getBoundingClientRect();
            return { text: l.textContent, out: r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1 };
          });
        }),
      );
      const sec = await page.locator('section[aria-label="1 画面目"]').boundingBox();
      report.push({ viewport: vp.name, layout, images: loaded.length, slide1Height: Math.round(sec!.height), labelsOutside: overflow.filter((o) => o.out).map((o) => o.text) });
      await page.locator('section[aria-label="1 画面目"]').screenshot({ path: `${SHOT_DIR}/med001_preview_${layout}_${vp.name}.png` });
    }
    await ctx.close();
  }
  // 監修前の画像 URL に患者・一般医療者はアクセスできない
  const p = await newPage(browser, { width: 390, height: 844 });
  await demoLogin(p.page, "patient", "佐藤 花子");
  const res = await p.page.request.get("/api/v1/admin/figures/MED-001-01/image");
  expect(res.status()).toBe(403);
  const pub = await p.page.request.get("/assets/medical/med_001_01_primary_lesion.png");
  const approved = pub.status() === 200; // 監修記録を適用したシードでは承認済み（公開）
  // 患者の教材 1 画面目
  await p.page.goto("/library"); // Phase E: 前回までの処方はホームでは折りたたみ。教材は「まなぶ」から開く
  await p.page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
  await p.page.waitForURL(/\/(learn|quiz)\//);
  await p.page.goto(p.page.url().replace("/quiz/", "/learn/").split("?")[0] + "?slide=1");
  await p.page.waitForLoadState("networkidle");
  if (approved) {
    // 承認済み: 1 枚ずつ切り替え、順序ではない旨と監修範囲の表示
    await expect(p.page.locator("figure")).toHaveCount(1);
    await expect(p.page.getByText(/病気がこの順番に進むという意味ではありません/)).toBeVisible();
    // 監修情報・出典は「図について（監修・出典）」に折りたたまれている（学習上の注意 caption は常時表示）
    await expect(p.page.getByText(/病院の公式な承認・推奨を受けたものではありません/).first()).toBeHidden();
    await p.page.getByText(/くわしい説明・監修情報を確認する/).first().click();
    await expect(p.page.getByText(/病院の公式な承認・推奨を受けたものではありません/).first()).toBeVisible();
    await p.page.getByText(/くわしい説明・監修情報を確認する/).first().click();
    await p.page.screenshot({ path: `${SHOT_DIR}/med001_patient_learn_390.png`, fullPage: true });
    for (const tab of ["リンパ節", "ほかの臓器"]) {
      await p.page.getByRole("tab", { name: tab }).click();
      await p.page.screenshot({ path: `${SHOT_DIR}/med001_patient_learn_390_${tab}.png`, fullPage: true });
    }
  } else {
    expect(await p.page.locator("figure").count()).toBe(0);
    await p.page.screenshot({ path: `${SHOT_DIR}/med001_patient_learn_390.png`, fullPage: true });
  }
  await p.ctx.close();
  const s = await newPage(browser, { width: 1180, height: 820 });
  await demoLogin(s.page, "staff", "山田 太郎");
  expect((await s.page.request.get("/api/v1/admin/figures/MED-001-01/image")).status()).toBe(403);
  await s.ctx.close();
  report.push({ patientImageRoute: 403, publicPath: pub.status(), approved, clinicianImageRoute: 403 });
  writeFileSync(`${SHOT_DIR}/med001_audit.json`, JSON.stringify(report, null, 2));
});
