#!/usr/bin/env node
/**
 * 正式イラストの画面レビュー用の撮影（画像の登録前／登録後で同じ画面を撮る。Claude は呼ばない）。
 *   BASE: 隔離サーバー（sh scripts/review/serve.sh <port> <dbPort>）。3900 には接続しない
 *   OUT : 出力先（例 docs/review/final_images/before または after）
 * 伊藤 涼子（診断時セットを処方済みにする）で患者の画面、佐藤 一郎で医療者の教材ライブラリ。佐藤 花子の記録は使わない・変えない。
 * 画面ごとに、主要なボタンが画面内にあるか・画像と文字が重なっていないかを checks.json に記録する。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { prepIto } from "../demo/prep-filming.mjs";

const B = process.env.BASE ?? "http://localhost:3370";
if (/:3900\b/.test(B)) throw new Error("3900 の撮影環境には接続しません");
const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT を指定してください");
mkdirSync(OUT, { recursive: true });
const VP = { 390: { width: 390, height: 844 }, 430: { width: 430, height: 932 } };
const checks = [];

const b = await chromium.launch({ args: ["--lang=ja-JP"] });
await prepIto(b, B);
const ctxOpts = (vp) => ({ baseURL: B, viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2, reducedMotion: "reduce" });
async function login(kind, name, vp) {
  const ctx = await b.newContext(ctxOpts(vp));
  const p = await ctx.newPage();
  await p.goto(kind === "patient" ? "/login" : "/staff/login");
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 });
  return p;
}
const secrets = (p) => [p.locator('img[src^="data:image"]'), p.locator("[data-share-code] b"), p.locator(".cd-code-panel input")];
async function shot(p, id, fullPage = false) {
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${id}.png`, fullPage, mask: secrets(p), maskColor: "#c9d6d8" });
}
const inView = (loc) =>
  loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0;
  });
/** 画面内の画像（img）と文字の要素が重なっていないか・画像の読み込み失敗・表示サイズ */
const imageAudit = (p) =>
  p.evaluate(() => {
    const imgs = [...document.images].filter((i) => i.getBoundingClientRect().width > 0 && !i.src.startsWith("data:"));
    const texts = [...document.querySelectorAll("h1,h2,h3,b,p,small,span,button")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const overlaps = [];
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      for (const t of texts) {
        if (img.contains(t) || t.contains(img)) continue;
        const q = t.getBoundingClientRect();
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (w > 4 && h > 4) overlaps.push(`${img.src.split("/").pop()} × 「${t.textContent.trim().slice(0, 16)}」`);
      }
    }
    return {
      images: imgs.map((i) => `${i.src.split("/").pop()} ${Math.round(i.getBoundingClientRect().width)}×${Math.round(i.getBoundingClientRect().height)}`),
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      overlaps: [...new Set(overlaps)].slice(0, 6),
    };
  });
async function record(p, id, scene, buttons = []) {
  const a = await imageAudit(p);
  const btn = [];
  for (const [label, loc] of buttons) btn.push(`${label}: ${(await loc.count()) ? ((await inView(loc)) ? "画面内" : "画面外") : "なし"}`);
  checks.push({ id, scene, ...a, buttons: btn });
}

for (const [w, vp] of Object.entries(VP)) {
  const a = await login("patient", "伊藤 涼子", vp);
  await a.locator("[data-set-card]").waitFor({ timeout: 15_000 });
  await shot(a, `P01_home_${w}`);
  await record(a, `P01_home_${w}`, "患者ホーム（最初の画面）", [["セットの内容を見る", a.locator("[data-set-open]")], ["続きから／学び始める", a.locator("[data-set-card] .d-set-resume .primary-button")]]);
  await shot(a, `P01_home_full_${w}`, true);
  await a.locator("[data-set-open]").click();
  await a.locator("[data-set-detail]").waitFor();
  await shot(a, `P02_set_detail_${w}`);
  await record(a, `P02_set_detail_${w}`, "診断時セットの内容（カバー・教材 3 件）", [["1 件目の教材", a.locator("[data-set-lesson]")]]);
  await shot(a, `P02_set_detail_full_${w}`, true);
  await a.locator("[data-set-lesson]").filter({ hasText: "乳がんの診断と病期の考え方" }).click();
  await a.locator(".d-detail").waitFor();
  await shot(a, `P03_lesson_detail_${w}`);
  await record(a, `P03_lesson_detail_${w}`, "教材の詳細", [["学習を始める", a.locator(".d-detail .d-bottom-action")]]);
  // 個別教材の一覧（教材を探す → 検査・診断の領域）
  await a.goto("/home?view=library");
  await a.locator(".d-category-cards button").first().waitFor();
  await shot(a, `P04_library_${w}`);
  const all = a.locator(".d-lesson-card").first();
  await all.scrollIntoViewIfNeeded();
  await shot(a, `P04_library_all_${w}`);
  await record(a, `P04_library_all_${w}`, "すべての公開教材（個別教材の一覧）");
  await a.locator(".d-category-cards button").filter({ hasText: "検査" }).first().click();
  await a.locator(".d-lesson-card").first().waitFor();
  await shot(a, `P05_category_${w}`);
  await record(a, `P05_category_${w}`, "個別教材の一覧（検査・診断）");
  await a.goto("/home?view=library");
  await a.locator(".d-category-cards button").filter({ hasText: /相談/ }).first().click();
  await a.locator(".d-lesson-card").first().waitFor();
  await shot(a, `P05_category_mind_${w}`);
  await record(a, `P05_category_mind_${w}`, "個別教材の一覧（日常生活・相談支援）");
  // 仕事とお金のこと → 医療費シミュレーターの入口
  await a.goto("/home");
  const money = a.locator("[data-money-card]");
  await money.scrollIntoViewIfNeeded();
  await shot(a, `P06_home_money_card_${w}`);
  await record(a, `P06_home_money_card_${w}`, "患者ホームの「仕事とお金のこと」のカード", [["仕事とお金のこと", money]]);
  await money.click();
  await a.locator("[data-money-theme]").waitFor();
  await shot(a, `P07_money_${w}`);
  await record(a, `P07_money_${w}`, "仕事とお金のこと（教材は準備中）", [["医療費シミュレーター", a.locator("[data-simulator-open]")]]);
  await a.locator("[data-simulator-open]").click();
  await a.locator("[data-sim]").waitFor();
  await shot(a, `P08_sim_start_${w}`);
  await record(a, `P08_sim_start_${w}`, "医療費シミュレーター（入口の次）", [["架空の例で試す", a.locator("[data-sim-demo]")]]);
  await a.context().close();
}

// 医療者: 教材ライブラリ（共有中にだけ開ける）。伊藤 涼子と共有
const s = await login("staff", "佐藤 一郎", { width: 1180, height: 820 });
const it = await login("patient", "伊藤 涼子", VP[390]);
await it.goto("/home?view=share");
await it.locator("[data-share-issue]").click();
const code = ((await it.locator("[data-share-code] b").first().textContent()) ?? "").replace(/\D/g, "");
await s.getByRole("button", { name: /患者のQRを読み取る／6桁コードを入力|新しく接続を申請/ }).click();
await s.locator(".cd-code-panel input").fill(code);
await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
await it.locator("[data-share-request]").waitFor({ timeout: 15_000 });
await it.locator(".d-consent input").check();
await it.getByRole("button", { name: "この医療者に共有を許可する" }).click();
await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click();
await s.locator(".cd-library-grid").waitFor();
await shot(s, "C01_library_1180");
await record(s, "C01_library_1180", "医療者の教材ライブラリ（最初の画面）", [["処方に追加（1 件目）", s.locator(".cd-library-grid article button").filter({ hasText: "処方に追加" })]]);
await shot(s, "C01_library_full_1180", true);
const search = s.getByPlaceholder(/検索|教材名/).first();
if (await search.count()) {
  await search.fill("こころ");
  await s.waitForTimeout(500);
  await shot(s, "C02_library_search_1180");
  await record(s, "C02_library_search_1180", "医療者の教材検索（こころ）");
}
await s.locator(".cd-app-header, [data-header-compact]").getByRole("button", { name: /共有終了/ }).first().click();
await s.locator("[data-share-ended]").waitFor();
await b.close();
writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
console.log(`shots done: ${OUT}（${checks.length} 画面の確認）`);
for (const c of checks) console.log(c.id, "| 画像", c.images.length, "| 失敗", c.broken, "| 重なり", c.overlaps.length ? c.overlaps.join(" / ") : "なし", "|", c.buttons.join(" / "));
