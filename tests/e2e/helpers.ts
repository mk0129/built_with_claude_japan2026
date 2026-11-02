import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

export const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "docs/screenshots/day3";
mkdirSync(SHOT_DIR, { recursive: true });

export const VIEWPORTS = {
  phone390: { width: 390, height: 844 },
  phone430: { width: 430, height: 932 },
  ipadPortrait: { width: 820, height: 1180 },
  ipadLandscape: { width: 1180, height: 820 },
  pc: { width: 1440, height: 900 },
};

export async function newPage(browser: Browser, viewport: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  return { ctx, page };
}

export async function demoLogin(page: Page, kind: "patient" | "staff", name: string) {
  await page.goto(kind === "patient" ? "/login" : "/staff/login");
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.waitForURL(kind === "patient" ? /\/home/ : /\/staff(\?.*)?$/);
}

export async function shot(page: Page, name: string, fullPage = true) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
}

/** 横スクロールの有無と、44px 未満の操作要素を数える */
export async function layoutAudit(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const small: string[] = [];
    const els = Array.from(document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role=button]"));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44 || r.width < 44) small.push(`${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)}@${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const clipped: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("h1,h2,p,span,button"))) {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== "visible") clipped.push((el.textContent || "").trim().slice(0, 20));
    }
    return { overflowX, small, clipped, fontSize: getComputedStyle(document.body).fontSize };
  });
}

export { expect };

/** 共有画面で QR を出し、6 桁コードを返す。共有中のセッションが残っていれば終了する */
export async function showQrCode(page: Page): Promise<string> {
  await page.goto("/share");
  const endBtn = page.getByRole("button", { name: /共有を終了する/ });
  const qrBtn = page.getByRole("button", { name: /QR コードを表示する/ });
  await expect(endBtn.or(qrBtn)).toBeVisible({ timeout: 10_000 });
  if (await endBtn.isVisible()) {
    await endBtn.click();
    await expect(qrBtn).toBeVisible({ timeout: 10_000 });
  }
  await qrBtn.click();
  const codeEl = page.locator(".code-display");
  await expect(codeEl).toBeVisible();
  return (await codeEl.textContent())!.replace(/\D/g, "");
}
