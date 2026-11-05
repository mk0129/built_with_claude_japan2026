import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

export const SHOT_DIR = process.env.E2E_SHOT_DIR ?? "docs/screenshots/day3";
mkdirSync(SHOT_DIR, { recursive: true });

export const VIEWPORTS = {
  phone375: { width: 375, height: 667 },
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

/** スタジオホームの「原資料を登録する」が折りたたまれていれば開く */
export async function openRegisterForm(page: Page) {
  const toggle = page.locator("#register").getByRole("button", { name: /原資料の登録フォームを/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

/**
 * 共有画面で QR を出し、6 桁コードを返す。共有中のセッションが残っていれば終了する。
 * 医療者側が直前に終了していると、患者画面は「共有中」→「共有は終了しました（閉じる）」へ切り替わるため、その状態も扱う（UX-10）。
 */
export async function showQrCode(page: Page): Promise<string> {
  await page.goto("/share");
  const endBtn = page.getByRole("button", { name: /共有を終了する/ });
  const closeBtn = page.getByRole("button", { name: /^閉じる$/ });
  const qrBtn = page.getByRole("button", { name: /QR コードを表示する/ });
  await expect(endBtn.or(qrBtn).or(closeBtn)).toBeVisible({ timeout: 10_000 });
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else if (await endBtn.isVisible()) {
    // 押す直前に医療者側が終了した場合、ボタンは「閉じる」に変わる
    await endBtn.click({ timeout: 5_000 }).catch(() => {});
    if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
  }
  await expect(qrBtn).toBeVisible({ timeout: 10_000 });
  await qrBtn.click();
  const codeEl = page.locator(".code-display");
  await expect(codeEl).toBeVisible();
  return (await codeEl.textContent())!.replace(/\D/g, "");
}

/**
 * 一時共有の正式な方式（6 桁コード）: 患者が共有画面で QR と 6 桁コードを表示 → 医療者が PC でコードを入力 → 患者が申請者を確認して承認 → 医療者の診察サマリー。
 * 医療者は /staff の接続前の画面（または共有終了後の画面）にいること。
 */
export async function shareByPatientCode(staff: Page, patient: Page) {
  await patient.goto("/home?view=share");
  await patient.locator("[data-share-issue]").click();
  const code = ((await patient.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);
  await staff.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|新しく接続を申請/ }).click();
  await staff.locator(".cd-code-panel input").fill(code);
  await staff.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await expect(staff.getByRole("heading", { name: "患者の承認を待っています" })).toBeVisible();
  await expect(patient.locator("[data-share-request]")).toBeVisible({ timeout: 10_000 });
  await patient.locator(".d-consent input").check();
  await patient.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await expect(staff.getByRole("heading", { name: "診察サマリー" })).toBeVisible({ timeout: 15_000 });
  return code;
}
