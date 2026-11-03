import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage } from "./helpers";

/**
 * 学習画面の折衷レイアウト（2026-11-03 決定）: 見出し → 要点 → 読み上げ → 本文 1 文 → 医学図解 → くわしく読む。
 * MED-001「乳がんの診断と病期の考え方」の画面 1（承認済み図解 3 枚）を 4 幅 × 文字サイズ 2 種で撮影・検証する。
 */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];

async function setLarge(page: Page, large: boolean) {
  await page.evaluate((l) => {
    document.documentElement.dataset.textsize = l ? "large" : "";
    try {
      localStorage.setItem("shiori.textsize", l ? "large" : "normal");
    } catch {}
  }, large);
  await page.waitForTimeout(150);
}

/** DOM 順序と位置を計測 */
async function metrics(page: Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const h1 = q("article h1");
    const prop = q("article .rs-prop") ?? q("article h1 + p");
    const speak = Array.from(document.querySelectorAll<HTMLElement>("article button")).find((b) => /説明を聞く|読み上げ/.test(b.textContent ?? "")) ?? null;
    const body = q("article [data-learn-body]");
    const fig = q("article figure");
    const note = q("article [data-figure-note]");
    const about = q("article [data-figure-about]") as HTMLDetailsElement | null;
    const caption = q("article figcaption");
    const top = (el: HTMLElement | null) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
    const order = [h1, prop, speak, body, fig].map((el) => (el ? Array.from(document.querySelectorAll("article *")).indexOf(el) : -1));
    return {
      vh,
      h1: top(h1),
      prop: top(prop),
      speak: top(speak),
      speakH: speak ? Math.round(speak.getBoundingClientRect().height) : null,
      body: top(body),
      bodyBottom: body ? Math.round(body.getBoundingClientRect().bottom + window.scrollY) : null,
      fig: top(fig),
      domOrder: order,
      noteText: note?.textContent?.trim() ?? null,
      aboutExists: !!about,
      aboutOpen: about?.open ?? null,
      captionVisible: !!caption && caption.getBoundingClientRect().height > 0,
      docH: document.documentElement.scrollHeight,
    };
  });
}

test("学習画面: 折衷レイアウトの順序・初期表示・図の注記（4 幅 × 文字サイズ）", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOT_DIR, { recursive: true });
  const report: Record<string, unknown>[] = [];
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await page.getByRole("link", { name: /乳がんの診断と病期の考え方/ }).first().click();
    await page.waitForURL(/\/(learn|quiz)\//);
    const learnUrl = page.url().replace("/quiz/", "/learn/").split("?")[0] + "?slide=1";
    for (const large of [false, true]) {
      await page.goto(learnUrl);
      await setLarge(page, large);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1, name: "病期（ステージ）とは" })).toBeVisible();
      const m = await metrics(page);
      const audit = await layoutAudit(page);
      report.push({ width: vp.width, large, ...m, overflowX: audit.overflowX });
      const suffix = `${vp.name}${large ? "_large" : ""}`;
      await page.screenshot({ path: `${SHOT_DIR}/learn_after_${suffix}_first.png`, fullPage: false });
      await page.screenshot({ path: `${SHOT_DIR}/learn_after_${suffix}_full.png`, fullPage: true });

      // DOM 順序: 見出し → 要点 → 読み上げ → 本文 1 文 → 図
      expect(m.domOrder.every((x) => x >= 0), `要素が揃っている (${suffix})`).toBe(true);
      for (let i = 1; i < m.domOrder.length; i++) expect(m.domOrder[i], `順序 ${i} (${suffix})`).toBeGreaterThan(m.domOrder[i - 1]);
      expect(m.fig!, `図は本文 1 文より下 (${suffix})`).toBeGreaterThan(m.body!);
      // 読み上げの操作領域
      expect(m.speakH!, `読み上げの高さ (${suffix})`).toBeGreaterThanOrEqual(56);
      // 本文 1 文目は標準文字なら 4 幅とも初期表示に入る（390 を含む）
      if (!large) expect(m.bodyBottom!, `本文 1 文の下端が画面内 (${suffix})`).toBeLessThanOrEqual(m.vh);
      // 図の注記（常時表示）と監修・出典の折りたたみ（閉）
      expect(m.noteText, suffix).toMatch(/3つの図は別々の情報です。病気がこの順番に進むという意味ではありません。/);
      expect(m.aboutExists, suffix).toBe(true);
      expect(m.aboutOpen, suffix).toBe(false);
      expect(m.captionVisible, `caption は隠さない (${suffix})`).toBe(true);
      await expect(page.getByText(/くわしい説明・監修情報を確認する/).first()).toBeVisible();
      expect(audit.overflowX, `横スクロール (${suffix})`).toBe(0);
    }
    await setLarge(page, false);

    // 最後の画面で「確認問題へ」が固定バーに見える（390 のみ）
    if (vp.width === 390) {
      while (!(await page.getByRole("button", { name: /確認問題へ/ }).isVisible())) await page.getByRole("button", { name: /次のページへ|^次へ/ }).click();
      const btn = page.getByRole("button", { name: /確認問題へ/ });
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box!.y + box!.height, "確認問題へボタンが画面内").toBeLessThanOrEqual(vp.height);
      await page.screenshot({ path: `${SHOT_DIR}/learn_after_390_last.png`, fullPage: false });
    }
    await ctx.close();
  }
  writeFileSync(`${SHOT_DIR}/learn_after_metrics.json`, JSON.stringify(report, null, 2));
});
