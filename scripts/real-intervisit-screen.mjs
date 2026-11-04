/**
 * 外来間要約の実画面検証（Claude 実 API・1 回）。隔離した一時 DB のサーバーを実 API・再試行なし・呼び出し上限 1 で起動してから実行する:
 *   E2E_CLAUDE=real CLAUDE_MAX_RETRIES=0 INTERVISIT_AI_MAX_CALLS=1 E2E_PORT=3500 E2E_DB_PORT=5480 NEXT_DIST_DIR=.next-e2e-real node scripts/e2e-server.mjs
 *   node scripts/real-intervisit-screen.mjs
 * 架空のアカウント（@example.com）だけであることを確認してから、患者A と山田医師で共有し、医療者画面の要約と根拠を撮影する。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const B = process.env.BASE ?? "http://localhost:3500", OUT = process.env.OUT ?? "docs/design/phase2/step4/real_screen";
mkdirSync(OUT, { recursive: true });
// 安全確認: この環境のアカウントがすべて架空（@example.com）であること
const acc = await (await fetch(B + "/api/v1/demo/accounts")).json();
if (!acc.accounts.every((a) => a.email.endsWith("@example.com"))) throw new Error("架空以外のアカウントがあるため中止");
console.log("accounts ok:", acc.accounts.length);
const b = await chromium.launch();
async function login(kind, name, vp) {
  const ctx = await b.newContext({ viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"));
  return p;
}
const shot = async (p, n, el) => { await p.waitForTimeout(700); el ? await p.locator(el).screenshot({ path: `${OUT}/${n}.png` }) : await p.screenshot({ path: `${OUT}/${n}.png` }); };
const p = await login("patient", "佐藤 花子", { width: 390, height: 844 });
const s = await login("staff", "山田 太郎", { width: 1440, height: 900 });
let summaryCount = 0;
s.on("response", async (r) => {
  if (r.url().includes("/intervisit/summary") && r.request().method() === "POST") {
    summaryCount++;
    try { writeFileSync(`${OUT}/summary_response_${summaryCount}.json`, JSON.stringify(await r.json(), null, 2)); } catch {}
  }
});
const res = s.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
await s.getByRole("button", { name: "患者との接続を開始" }).click();
const u = new URL((await (await res).json()).qrUrl);
await shot(s, "00_staff_qr");
await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await p.goto(B + u.pathname + u.search);
await p.locator(".d-consent input").check();
await shot(p, "00_patient_approve");
await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 20000 });
// 実 API の応答を待つ（最大 3 分）。成功なら kind=claude、失敗ならルールベース（追加の呼び出しはしない）
// 最初の要約の応答（Claude の生成を含む）を待つ。サーバーは同時の要求を 1 回の生成にまとめる
await s.waitForResponse((r) => r.url().includes("/intervisit/summary") && r.request().method() === "POST", { timeout: 180000 });
await s.waitForTimeout(1500);
await s.locator('.cd-summary-narrative[data-summary-kind="claude"], .cd-summary-narrative[data-summary-kind="replay"], [data-ai-status="fallback"]').first().waitFor({ timeout: 180000 });
const kind = await s.locator(".cd-summary-narrative").getAttribute("data-summary-kind");
console.log("kind:", kind, "summary POSTs:", summaryCount);
await shot(s, "01_summary_top");
await s.locator("[data-intervisit]").scrollIntoViewIfNeeded();
await shot(s, "02_ai_summary", "[data-intervisit]");
const items = s.locator("[data-summary-item]");
const n = await items.count();
const picks = [];
for (const want of ["手足のしびれ", "わからない", "戻りますか"]) {
  const i = (await items.allTextContents()).findIndex((t) => t.includes(want));
  if (i >= 0) picks.push(i);
}
let k = 3;
const sourcesLog = [];
for (const i of picks) {
  await items.nth(i).click();
  sourcesLog.push({ item: i, text: await items.nth(i).innerText(), sources: await s.locator("[data-summary-sources] [data-source-id]").allInnerTexts() });
  await shot(s, `0${k++}_sources_${i}`, "[data-intervisit]");
}
writeFileSync(`${OUT}/sources_clicked.json`, JSON.stringify(sourcesLog, null, 2));
console.log("items:", n, "picked:", picks);
await s.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
await shot(s, "06_course_table");
await s.getByRole("button", { name: "バイタル統合" }).click();
await s.locator(".cd-vital-plot rect.hover-zone").nth(4).hover();
await shot(s, "07_vitals");
await s.locator(".cd-sidebar").getByRole("button", { name: "診察" }).click();
await s.locator("[data-summary-item]").first().waitFor();
await s.waitForTimeout(1500);
console.log("summary POSTs after revisit:", summaryCount);
writeFileSync(`${OUT}/narrative.txt`, await s.locator(".cd-summary-narrative").innerText());
// 共有を終了する前に、画面に表示された要約と根拠を保存
const sid = new URL(s.url()).searchParams.get("s");
writeFileSync(`${OUT}/request_count.txt`, `summary POST (画面からの要求): ${summaryCount}\n`);
await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
await s.getByText("患者一覧はありません").waitFor();
const cleared = {
  intervisitOnScreen: await s.locator("[data-intervisit]").count(),
  narrativeOnScreen: await s.locator(".cd-summary-narrative").count(),
  apiAfterEnd: {
    intervisit: (await s.request.get(`${B}/api/v1/consultations/${sid}/intervisit`)).status(),
    summary: (await s.request.post(`${B}/api/v1/consultations/${sid}/intervisit/summary`, { data: {} })).status(),
    patient: (await s.request.get(`${B}/api/v1/consultations/${sid}/patient`)).status(),
  },
};
writeFileSync(`${OUT}/after_end.json`, JSON.stringify(cleared, null, 2));
console.log("after end:", JSON.stringify(cleared));
await shot(s, "08_after_end");
await b.close();
