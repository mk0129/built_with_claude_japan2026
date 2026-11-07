#!/usr/bin/env node
/**
 * デモ撮影で映す画面の変更前後の撮影。Claude は呼ばない（撮影用サーバー scripts/review/serve.sh の新しい一時 DB に対して実行）。
 *   BASE: 撮影するサーバー  OUT: 出力先（例 docs/review/demo_finalization/after）
 * 準備: scripts/demo/prep-filming.mjs と同じ手順で、伊藤 涼子に初回診断時セットを処方してから撮る。
 * 患者 390×844 / 430×932、医療者 1180×820。QR 画像・6 桁コード・コード入力欄は塗りつぶす。
 * 佐藤 花子は閲覧と共有だけ（記録は変えない）。伊藤 涼子は学習・理解確認・質問で記録が増える（撮影用の一時 DB のみ）。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { prepIto } from "../demo/prep-filming.mjs";

const B = process.env.BASE ?? "http://localhost:3150";
const OUT = process.env.OUT ?? "docs/review/demo_finalization/after";
mkdirSync(OUT, { recursive: true });

const PATIENT_VP = { 390: { width: 390, height: 844 }, 430: { width: 430, height: 932 } };
const STAFF_VP = { width: 1180, height: 820 };
const metrics = {};
const errors = {};
const b = await chromium.launch();
await prepIto(b, B);

async function login(kind, name, vp) {
  const ctx = await b.newContext({ baseURL: B, viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  return p;
}
const secrets = (p) => [p.locator('img[src^="data:image"]'), p.locator("[data-share-code] b"), p.locator("[data-secret]"), p.locator(".cd-code-panel input")];

const audit = (p) =>
  p.evaluate(() => {
    const out = { hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, clipped: [], brokenImages: 0, placeholderText: false };
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,b,span,small,button,label,li,a,strong")) {
      const cs = getComputedStyle(el);
      if (!el.textContent?.trim() || cs.display === "none" || cs.visibility === "hidden" || el.closest(".sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const hidden = /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY);
      if (hidden && cs.textOverflow !== "ellipsis" && cs.webkitLineClamp === "none" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2))
        out.clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 40) });
    }
    for (const img of document.querySelectorAll("img")) if (img.complete && img.naturalWidth === 0 && !img.src.startsWith("data:")) out.brokenImages++;
    out.placeholderText = /画像準備中|MEDICAL ILLUSTRATION|Concept D|Must-cover|LINE でログイン/.test(document.body.innerText);
    out.tokenInText = /[?&]t=[A-Za-z0-9_-]{20,}/.test(document.body.innerText);
    return out;
  });

async function shot(p, name, opts = {}) {
  await p.waitForTimeout(600);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? false, mask: secrets(p), maskColor: "#c9d6d8" });
  metrics[name] = await audit(p);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    errors[name] = String(e).split("\n")[0];
    console.log("ERR", name, errors[name]);
  }
}

// ---------- 伊藤 涼子（診断時セット・学習・理解確認・質問） ----------
for (const [w, vp] of Object.entries(PATIENT_VP)) {
  const a = await login("patient", "伊藤 涼子", vp);
  await step(`F_P01_home_${w}`, async () => { await a.locator(".d-home").waitFor(); await a.waitForLoadState("networkidle"); await shot(a, `F_P01_home_${w}`); await shot(a, `F_P01_home_full_${w}`, { fullPage: true }); });
  await step(`F_P02_set_${w}`, async () => { await a.locator("[data-set-open]").click({ timeout: 5000 }); await a.locator("[data-set-detail]").waitFor(); await shot(a, `F_P02_set_${w}`); await shot(a, `F_P02_set_full_${w}`, { fullPage: true }); });
  await step(`F_P03_detail_${w}`, async () => {
    if (await a.locator("[data-set-lesson]").count()) await a.locator("[data-set-lesson]").first().click();
    else { await a.goto(B + "/home"); await a.locator("[data-home-lesson] .primary-button, .d-next-card .primary-button").first().click(); }
    await a.locator(".d-detail").waitFor();
    await shot(a, `F_P03_detail_${w}`);
  });
  await step(`F_P04_learn_${w}`, async () => {
    await a.locator(".d-detail .d-bottom-action").click();
    await a.locator(".d-learning-actions").waitFor();
    await shot(a, `F_P04_learn1_${w}`);
    await a.getByRole("button", { name: "次へ" }).click();
    await shot(a, `F_P04_learn2_${w}`);
  });
  await step(`F_P05_quiz_${w}`, async () => {
    for (let i = 0; i < 8; i++) {
      const t = await a.locator(".d-learning-actions .primary-button").textContent();
      if (t?.includes("理解を確認する")) break;
      await a.getByRole("button", { name: "次へ" }).click();
    }
    await a.getByRole("button", { name: "理解を確認する" }).click();
    await a.locator(".d-answer-list").waitFor();
    await shot(a, `F_P05_quiz_${w}`);
    await a.locator(".d-answer-list button").filter({ hasText: "わからない" }).click();
    await a.getByRole("button", { name: "この回答で確定する" }).click();
    await a.getByRole("heading", { name: "「わからない」を記録しました" }).waitFor();
    await shot(a, `F_P06_unknown_${w}`);
  });
  // 仕事とお金のこと → 医療費シミュレーター（架空の例）
  await step(`F_P20_money_${w}`, async () => {
    await a.goto(B + "/home");
    await a.locator("[data-money-card]").click({ timeout: 5000 });
    await a.locator("[data-money-theme]").waitFor();
    await shot(a, `F_P20_money_${w}`);
    await a.locator("[data-simulator-open]").click();
    await a.locator("[data-sim-step]").waitFor();
    await shot(a, `F_P21_sim_step1_${w}`);
    await a.locator("[data-sim-demo]").click();
    await a.locator("[data-sim-result]").waitFor();
    await shot(a, `F_P22_sim_result_${w}`);
    await shot(a, `F_P22_sim_result_full_${w}`, { fullPage: true });
    await a.getByRole("button", { name: "最初から選び直す" }).click();
    for (const sel of ["[data-sim-choice='entry-known']", "[data-sim-step='1'] button >> text=2026年11月", "[data-sim-choice='under70']", "[data-sim-choice='employee']"]) await a.locator(sel).first().click();
    await shot(a, `F_P23_sim_bracket_${w}`);
    await a.locator("[data-sim-choice='bracket-c']").click();
    await a.locator("[data-sim-choice='many-no']").click();
    await shot(a, `F_P24_sim_cost_${w}`);
    await a.goto(B + "/home?view=simulator");
    await a.locator("[data-sim-choice='entry-known']").click();
    await a.locator("[data-sim-step='1'] button >> text=2026年11月").first().click();
    await a.locator("[data-sim-choice='over70']").click();
    await a.locator("[data-sim-unsupported]").waitFor();
    await shot(a, `F_P25_sim_unsupported_${w}`);
  });
  await step(`F_P07_notes_${w}`, async () => { await a.goto(B + "/home?view=notes"); await a.waitForLoadState("networkidle"); await shot(a, `F_P07_notes_${w}`); });
  await a.context().close();
}

// ---------- 佐藤 花子（経過グラフ・共有・承認）＋ 医療者（接続・サマリー・在宅経過・処方） ----------
const s = await login("staff", "佐藤 一郎", STAFF_VP);
await step("F_C01_idle_1180", async () => { await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|患者との接続を開始/ }).waitFor(); await shot(s, "F_C01_idle_1180"); });
for (const [w, vp] of Object.entries(PATIENT_VP)) {
  const h = await login("patient", "佐藤 花子", vp);
  await step(`F_P10_chart_${w}`, async () => {
    await h.locator(".d-nav").getByRole("button", { name: "体調記録" }).click();
    await h.getByRole("button", { name: "履歴・グラフ" }).click();
    await h.waitForTimeout(500);
    await shot(h, `F_P10_chart_${w}`);
    await shot(h, `F_P10_chart_full_${w}`, { fullPage: true });
  });
  await step(`F_P11_share_${w}`, async () => { await h.goto(B + "/home?view=share"); await h.locator("[data-share-issue]").click(); await h.locator("[data-share-code]").waitFor(); await shot(h, `F_P11_share_${w}`); await h.getByRole("button", { name: /取り消す/ }).click(); });
  await h.context().close();
}
const h = await login("patient", "佐藤 花子", PATIENT_VP[390]);
await step("F_S_share_flow", async () => {
  await h.goto(B + "/home?view=share");
  await h.locator("[data-share-issue]").click();
  const code = ((await h.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
  await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|新しく接続を申請/ }).click();
  await shot(s, "F_C02_connect_1180");
  await s.locator(".cd-code-panel input").fill(code);
  await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
  await s.getByRole("heading", { name: "患者の承認を待っています" }).waitFor();
  await shot(s, "F_C03_waiting_1180");
  await h.locator("[data-share-request]").waitFor({ timeout: 10_000 });
  await shot(h, "F_P12_approve_390", { fullPage: true });
  await h.locator(".d-consent input").check();
  await h.getByRole("button", { name: "この医療者に共有を許可する" }).click();
  await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
  await h.waitForTimeout(800);
  await shot(h, "F_P13_sharing_390");
});
await step("F_C04_summary_1180", async () => {
  await s.locator('[data-intervisit] [data-summary-kind=\"replay\"]').waitFor({ timeout: 30_000 });
  await shot(s, "F_C04_summary_1180");
  await shot(s, "F_C04_summary_full_1180", { fullPage: true });
});
await step("F_C05_sources_1180", async () => {
  const key = s.locator("[data-summary-key-item]");
  if (await key.count()) await key.first().click();
  else await s.locator("[data-summary-item]").filter({ hasText: "手足のしびれは" }).first().click();
  await s.locator("[data-summary-sources]").waitFor();
  await s.locator("[data-summary-sources]").scrollIntoViewIfNeeded();
  await shot(s, "F_C05_sources_1180");
});
await step("F_C06_course_1180", async () => {
  await s.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click();
  await s.getByRole("heading", { name: "在宅経過表" }).waitFor();
  await s.waitForTimeout(800);
  await shot(s, "F_C06_course_1180");
});
await step("F_C07_library_1180", async () => {
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
  await s.locator(".cd-library-grid").waitFor();
  await shot(s, "F_C07_library_1180");
});
await step("F_C08_studio_1180", async () => {
  await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click();
  await s.waitForTimeout(800);
  await shot(s, "F_C08_studio_1180");
});
await step("F_C09_end_1180", async () => {
  await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
  await s.waitForTimeout(800);
  await shot(s, "F_C09_end_1180");
});

writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
console.log("screens:", Object.keys(metrics).length, "errors:", Object.keys(errors).length);
await b.close();
