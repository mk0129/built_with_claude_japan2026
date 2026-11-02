import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { SHOT_DIR, demoLogin, expect, layoutAudit, newPage } from "./helpers";

/** EDI-001 組み込み後の患者ホーム（390 / 430 / 820 / 1180）: 挿絵が見出し・主ボタンと重ならず、横スクロールがないこと */
const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "820", width: 820, height: 1180 },
  { name: "1180", width: 1180, height: 820 },
];

test("EDI-001 患者ホーム", async ({ browser }) => {
  const report: Record<string, unknown>[] = [];
  for (const vp of WIDTHS) {
    const { ctx, page } = await newPage(browser, { width: vp.width, height: vp.height });
    await demoLogin(page, "patient", "佐藤 花子");
    await page.waitForLoadState("networkidle");
    const img = page.locator('img[alt="窓辺で静かに過ごす女性のイラスト"]');
    await expect(img).toBeVisible();
    const r = await page.evaluate(() => {
      const img = document.querySelector('img[alt="窓辺で静かに過ごす女性のイラスト"]')!.getBoundingClientRect();
      const h1 = document.querySelector("h1")!.getBoundingClientRect();
      const cta = document.querySelector("main a.btn-primary")!.getBoundingClientRect();
      const inter = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { img: { w: Math.round(img.width), h: Math.round(img.height), top: Math.round(img.top), right: Math.round(window.innerWidth - img.right) }, overlapsH1: inter(img, h1), overlapsCta: inter(img, cta), ctaTop: Math.round(cta.top), vh: window.innerHeight };
    });
    const audit = await layoutAudit(page);
    report.push({ viewport: vp.name, ...r, overflowX: audit.overflowX });
    expect(r.overlapsH1, `${vp.name}: 挿絵が見出しと重なる`).toBe(false);
    expect(r.overlapsCta, `${vp.name}: 挿絵が主ボタンと重なる`).toBe(false);
    expect(audit.overflowX, `${vp.name}: 横スクロール`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOT_DIR}/after_home_${vp.name}.png`, fullPage: false });
    await page.screenshot({ path: `${SHOT_DIR}/after_home_${vp.name}_full.png`, fullPage: true });
    await ctx.close();
  }
  writeFileSync(`${SHOT_DIR}/edi_audit.json`, JSON.stringify(report, null, 2));
});
