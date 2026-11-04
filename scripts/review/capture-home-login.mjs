#!/usr/bin/env node
/**
 * 患者ホーム・入口・ログイン・一時共有（QR／6 桁コード）・ロゴの変更前後の撮影。Claude は呼ばない。
 *   BASE: 撮影するサーバー（scripts/review/serve.sh の新しい一時 DB）
 *   OUT : 出力先（例 docs/review/patient_home_logo_a/before）
 *   AFTER=1: 変更後だけにある操作（次回診察日の登録・ホームからの質問の追加・患者の QR）も撮る
 * 患者ホームは、最初の画面（スクロール前）に主要な 3 要素が収まっているかを metrics.json の firstView に記録する。
 * 患者・入口: 390×844 / 430×844 / 768×1024（入口とログインは 1440×900 も）、医療者: 820×800 / 1180×800 / 1440×900。
 * QR コードと 6 桁コードは撮影時に塗りつぶす（トークン・コードを画像に残さない）。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const B = process.env.BASE ?? "http://localhost:3810";
const OUT = process.env.OUT ?? "docs/review/patient_home_logo_a/before";
const AFTER = process.env.AFTER === "1";
mkdirSync(OUT, { recursive: true });
const acc = await (await fetch(B + "/api/v1/demo/accounts")).json();
if (!acc.accounts.every((a) => a.email.endsWith("@example.com"))) throw new Error("架空以外のアカウントがあるため中止");

const PATIENT_VP = { 390: { width: 390, height: 844 }, 430: { width: 430, height: 844 }, 768: { width: 768, height: 1024 } };
const ENTRY_VP = { ...PATIENT_VP, 1440: { width: 1440, height: 900 } };
const STAFF_VP = { 820: { width: 820, height: 800 }, 1180: { width: 1180, height: 800 }, 1440: { width: 1440, height: 900 } };
const metrics = {};
const errors = {};
const b = await chromium.launch();
const ctxOpts = (vp) => ({ viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2, reducedMotion: "reduce" });

async function login(kind, name, vp) {
  const ctx = await b.newContext(ctxOpts(vp));
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 });
  return p;
}

/** QR 画像と 6 桁コード（撮影で塗りつぶす） */
const secrets = (p) => [p.locator('img[src^="data:image"]'), p.locator("[data-share-code] b"), p.locator("[data-secret]")];

const audit = (p) =>
  p.evaluate(() => {
    const out = { hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, clipped: [], logos: [] };
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,b,span,small,button,label,li,a")) {
      const cs = getComputedStyle(el);
      if (!el.textContent?.trim() || cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const hidden = /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY);
      if (hidden && cs.textOverflow !== "ellipsis" && cs.webkitLineClamp === "none" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2))
        out.clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 40) });
      if (r.right > window.innerWidth + 1 && cs.position !== "fixed") out.clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 40), offRight: Math.round(r.right - window.innerWidth) });
    }
    for (const img of document.querySelectorAll("img[data-logo-mark]")) {
      const r = img.getBoundingClientRect();
      out.logos.push({ box: [Math.round(r.width), Math.round(r.height)], loaded: img.complete && img.naturalWidth > 0 });
    }
    // 患者ホーム: 最初の画面（スクロール前）に「次の診察」「次に学ぶ教材」「診察で聞きたいこと」の入力欄と追加ボタンが収まっているか（下部ナビの上まで）
    const nav = document.querySelector(".d-nav");
    const limit = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const fits = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= limit + 0.5;
    };
    if (document.querySelector(".d-home")) {
      out.firstView = { visit: fits(".d-visit-card"), lesson: fits("[data-home-lesson] .primary-button") ?? fits(".d-home-empty, .d-complete-hero"), askInput: fits("[data-home-note-input]"), askAdd: fits("[data-home-note-add]") };
      const ask = document.querySelector("[data-home-note-add]");
      if (ask) {
        out.firstView.askBottomPx = Math.round(ask.getBoundingClientRect().bottom);
        out.firstView.navTopPx = Math.round(limit);
      }
    }
    // 画面に生のトークン（QR の URL）が文字として出ていないか
    out.tokenInText = /[?&]t=[A-Za-z0-9_-]{20,}/.test(document.body.innerText);
    return out;
  });

const scroller = (p) =>
  p.evaluateHandle(() => {
    const cands = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 200;
    });
    return cands.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] ?? document.scrollingElement;
  });
async function shot(p, name, opts = {}) {
  await p.waitForTimeout(500);
  await p.evaluate(() => document.fonts.ready);
  const el = await scroller(p);
  await el.evaluate((e) => (e.scrollTop = 0));
  await p.waitForTimeout(150);
  const mask = secrets(p);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? true, mask, maskColor: "#c9d6d8" });
  metrics[name] = await audit(p);
  if (opts.scroll === false) return;
  for (let i = 1; i <= 4; i++) {
    const moved = await el.evaluate((e) => {
      if (e.scrollTop + e.clientHeight >= e.scrollHeight - 2) return false;
      e.scrollTop = Math.min(e.scrollTop + Math.round(e.clientHeight * 0.8), e.scrollHeight - e.clientHeight);
      return true;
    });
    if (!moved) break;
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/${name}_s${i}.png`, mask, maskColor: "#c9d6d8" });
    metrics[`${name}_s${i}`] = await audit(p);
  }
  await el.evaluate((e) => (e.scrollTop = 0));
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    errors[name] = String(e).split("\n")[0];
    console.log("ERR", name, errors[name]);
  }
}

// ---------- 入口・ログイン（未ログイン） ----------
for (const [w, vp] of Object.entries(ENTRY_VP)) {
  const ctx = await b.newContext(ctxOpts(vp));
  const p = await ctx.newPage();
  await step(`E01_entry_${w}`, async () => { await p.goto(B + "/"); await p.waitForLoadState("networkidle"); await shot(p, `E01_entry_${w}`); });
  await step(`E02_login_${w}`, async () => { await p.goto(B + "/login"); await p.getByRole("button", { name: /佐藤 花子/ }).waitFor(); await shot(p, `E02_login_${w}`); });
  await step(`E03_staff_login_${w}`, async () => { await p.goto(B + "/staff/login"); await p.getByRole("button", { name: /佐藤 一郎/ }).waitFor(); await shot(p, `E03_staff_login_${w}`); });
  await ctx.close();
}

// ---------- 患者（佐藤 花子） ----------
for (const [w, vp] of Object.entries(PATIENT_VP)) {
  const a = await login("patient", "佐藤 花子", vp);
  await step(`P01_home_${w}`, async () => { await a.locator(".d-home").waitFor(); await a.waitForLoadState("networkidle"); await shot(a, `P01_home_${w}`); });
  if (AFTER) {
    // 次回診察日の登録（14 日後）→ 再読み込みで残る
    await step(`P01b_home_visit_${w}`, async () => {
      await a.locator("[data-visit-edit]").click();
      const d = new Date(Date.now() + 14 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      await a.locator("[data-visit-input]").fill(d);
      await a.locator("[data-visit-save]").click();
      await a.locator("[data-visit-days]").waitFor();
      await a.reload();
      await a.locator("[data-visit-days]").waitFor();
      await shot(a, `P01b_home_visit_${w}`);
    });
    await step(`P01c_home_note_${w}`, async () => {
      await a.locator("[data-home-note-input]").fill(`副作用が出たときの連絡先を確認したい（${w}）`);
      await a.locator("[data-home-note-add]").click();
      await a.getByText(`副作用が出たときの連絡先を確認したい（${w}）`).waitFor();
      await shot(a, `P01c_home_note_${w}`);
    });
  }
  await step(`P02_library_${w}`, async () => { await a.goto(B + "/home?view=library"); await a.waitForLoadState("networkidle"); await shot(a, `P02_library_${w}`, { scroll: false }); });
  await step(`P03_share_${w}`, async () => { await a.goto(B + "/home?view=share"); await a.locator(".d-share-page").waitFor(); await shot(a, `P03_share_${w}`); });
  await step(`P04_share_code_${w}`, async () => {
    const btn = AFTER ? a.locator("[data-share-issue]") : a.getByRole("button", { name: /6桁コードで共有する/ });
    await btn.click();
    await a.locator("[data-share-code]").waitFor();
    await shot(a, `P04_share_code_${w}`);
    await a.getByRole("button", { name: /取り消す/ }).click();
  });
  await a.context().close();
}

// ---------- 医療者（佐藤 一郎） ----------
for (const [w, vp] of Object.entries(STAFF_VP)) {
  const s = await login("staff", "佐藤 一郎", vp);
  await step(`C01_start_${w}`, async () => { await s.getByRole("button", { name: "患者との接続を開始" }).waitFor(); await shot(s, `C01_start_${w}`, { fullPage: false }); });
  await step(`C02_request_${w}`, async () => {
    await s.getByRole("button", { name: "患者との接続を開始" }).click();
    await s.getByRole("button", { name: "患者へ承認を依頼する" }).waitFor();
    await shot(s, `C02_request_${w}`, { fullPage: false });
    await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
    await s.waitForTimeout(600);
    await shot(s, `C03_waiting_${w}`, { fullPage: false });
  });
  await s.context().close();
}

writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
console.log("screens:", Object.keys(metrics).length, "errors:", Object.keys(errors).length);
await b.close();
