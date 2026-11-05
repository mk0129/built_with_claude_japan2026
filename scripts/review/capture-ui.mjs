#!/usr/bin/env node
/**
 * UI 全体レビュー用の撮影（変更前後を同じ架空データ・同じ手順で撮る）。Claude は呼ばない。
 *   BASE: 撮影するサーバー（新しい一時 DB。scripts/e2e-server.mjs を DEMO_ANCHOR 固定で起動）
 *   OUT : 出力先（例 docs/review/materials_v1_1/before）
 *   DRAFTS=1: 教材 v1.1 の下書き（scripts/review/import-materials-draft.ts で取り込んだもの）を教材スタジオで開いて撮る（変更後のみ）
 * 患者: 390×844 / 430×844 / 768×1024、医療者: 820×800 / 1180×800 / 1440×900。
 * 各画面で、横スクロール・はみ出した文字・サムネイル画像の表示寸法と切れ方を metrics.json に記録する。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const B = process.env.BASE ?? "http://localhost:3800";
const OUT = process.env.OUT ?? "docs/review/materials_v1_1/before";
const DRAFTS = process.env.DRAFTS === "1";
mkdirSync(OUT, { recursive: true });
const acc = await (await fetch(B + "/api/v1/demo/accounts")).json();
if (!acc.accounts.every((a) => a.email.endsWith("@example.com"))) throw new Error("架空以外のアカウントがあるため中止");

const PATIENT_VP = { 390: { width: 390, height: 844 }, 430: { width: 430, height: 844 }, 768: { width: 768, height: 1024 } };
const STAFF_VP = { 820: { width: 820, height: 800 }, 1180: { width: 1180, height: 800 }, 1440: { width: 1440, height: 900 } };
const metrics = {};
const errors = {};
const b = await chromium.launch();

async function login(kind, name, vp) {
  const ctx = await b.newContext({ viewport: vp, locale: "ja-JP", timezoneId: "Asia/Tokyo", deviceScaleFactor: 2, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(B + (kind === "patient" ? "/login" : "/staff/login"));
  await p.getByRole("button", { name: new RegExp(name) }).first().click();
  await p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60000 });
  return p;
}

/** 横スクロール・文字の切れ・サムネイルの表示寸法 */
const audit = (p) =>
  p.evaluate(() => {
    const out = { hScroll: document.documentElement.scrollWidth > window.innerWidth + 1, clipped: [], images: [] };
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,b,span,small,button,label,li")) {
      const cs = getComputedStyle(el);
      if (!el.textContent?.trim() || cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const hidden = /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY);
      if (hidden && cs.textOverflow !== "ellipsis" && cs.webkitLineClamp === "none" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2))
        out.clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 40) });
      if (r.right > window.innerWidth + 1 && cs.position !== "fixed") out.clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 40), offRight: Math.round(r.right - window.innerWidth) });
    }
    for (const img of document.querySelectorAll("img")) {
      if (!img.src.includes("/thumbnails/")) continue;
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const inView = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      out.images.push({ file: img.src.split("/").pop(), alt: img.alt, box: [Math.round(r.width), Math.round(r.height)], at: [Math.round(r.left), Math.round(r.top)], inView, natural: [img.naturalWidth, img.naturalHeight], fit: cs.objectFit, pos: cs.objectPosition, loaded: img.complete && img.naturalWidth > 0 });
    }
    return out;
  });

/** 画面の内側でスクロールする領域（アプリの枠内）。fullPage では写らないため、スクロールして続きを _s1, _s2… として撮る */
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
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? true });
  metrics[name] = await audit(p);
  if (opts.scroll === false) return;
  for (let i = 1; i <= 6; i++) {
    const moved = await el.evaluate((e) => {
      if (e.scrollTop + e.clientHeight >= e.scrollHeight - 2) return false;
      e.scrollTop = Math.min(e.scrollTop + Math.round(e.clientHeight * 0.8), e.scrollHeight - e.clientHeight);
      return true;
    });
    if (!moved) break;
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/${name}_s${i}.png` });
    metrics[`${name}_s${i}`] = await audit(p);
  }
  await el.evaluate((e) => (e.scrollTop = 0));
}
/** 教材スタジオの下書きプレビュー: 端末（患者画面と同じ 390px）を画面の上端に合わせて撮り、端末の中のスクロールも追う */
async function pshot(p, name) {
  await p.waitForTimeout(400);
  await p.evaluate(() => document.fonts.ready);
  const dev = p.locator("[data-studio-preview]");
  await dev.evaluate((el) => {
    const main = el.closest(".cd-main");
    const header = document.querySelector(".cd-app-header");
    const topLine = Math.max(main ? main.getBoundingClientRect().top : 0, header ? header.getBoundingClientRect().bottom : 0);
    if (main) main.scrollTop += el.getBoundingClientRect().top - topLine - 10;
    el.querySelector(".d-main").scrollTop = 0;
  });
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  metrics[name] = await audit(p);
  for (let i = 1; i <= 4; i++) {
    const moved = await dev.evaluate((el) => {
      const m = el.querySelector(".d-main");
      if (m.scrollTop + m.clientHeight >= m.scrollHeight - 2) return false;
      m.scrollTop = Math.min(m.scrollTop + Math.round(m.clientHeight * 0.8), m.scrollHeight - m.clientHeight);
      return true;
    });
    if (!moved) break;
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}/${name}_s${i}.png` });
    metrics[`${name}_s${i}`] = await audit(p);
  }
  await dev.evaluate((el) => (el.querySelector(".d-main").scrollTop = 0));
}
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    errors[name] = String(e).split("\n")[0];
    console.log("ERR", name, errors[name]);
  }
}

// ---------- 患者 ----------
for (const [w, vp] of Object.entries(PATIENT_VP)) {
  // 佐藤 花子: 履歴のある患者のホーム・処方・一覧・詳細（閲覧のみ。記録を変えない）
  const a = await login("patient", "佐藤 花子", vp);
  await step(`P01_home_${w}`, async () => { await a.locator(".d-main, main").first().waitFor(); await shot(a, `P01_home_${w}`); });
  await step(`P02_library_${w}`, async () => { await a.goto(B + "/home?view=library"); await a.waitForLoadState("networkidle"); await shot(a, `P02_library_${w}`); });
  const lib = await (await a.request.get(B + "/api/v1/library")).json();
  const items = lib.items ?? lib.materials ?? [];
  const pick = (t) => items.find((i) => i.title === t);
  for (const [key, title] of [["chemo", "化学療法中の副作用とセルフケア"], ["drug", "薬物療法の種類（化学療法・ホルモン療法・分子標的）"], ["other", items.find((i) => !/化学療法中の副作用|薬物療法の種類/.test(i.title))?.title]]) {
    const it = title && pick(title);
    if (!it) { errors[`P03_detail_${key}_${w}`] = `教材が見つからない: ${title}`; continue; }
    await step(`P03_detail_${key}_${w}`, async () => { await a.goto(`${B}/home?view=detail&lesson=${it.materialId}`); await a.locator(".d-detail").waitFor(); await shot(a, `P03_detail_${key}_${w}`); });
  }
  await a.context().close();

  // 学習・詳説・理解確認（書き込みは佐藤 花子以外。表示幅ごとに別の架空患者にして、毎回 1 画面目・1 問目から撮る）
  const d = await login("patient", { 390: "伊藤 涼子", 430: "鈴木 美咲", 768: "高橋 由美" }[w], vp);
  const lib2 = await (await d.request.get(B + "/api/v1/library")).json();
  const chemo = (lib2.items ?? lib2.materials ?? []).find((i) => i.title === "化学療法中の副作用とセルフケア");
  await step(`P04_learn_${w}`, async () => {
    await d.goto(`${B}/home?view=detail&lesson=${chemo.materialId}`);
    await d.locator(".d-detail .d-bottom-action").click();
    await d.locator(".d-learning h1").waitFor();
    // 前の表示幅の撮影で進んだ位置から再開するため、1 画面目まで戻してから撮る
    for (let i = 0; i < 10 && !/^1 \//.test((await d.locator(".d-learning-head span").first().textContent()) ?? ""); i++) {
      await d.locator(".d-learning-actions button").first().click();
      await d.waitForTimeout(150);
    }
    await shot(d, `P04_learn_${w}`);
  });
  await step(`P05_detail_open_${w}`, async () => {
    for (let i = 0; i < 6 && !(await d.locator(".d-disclosure").count()); i++) await d.locator(".d-learning-actions .primary-button").click();
    await d.locator(".d-disclosure").first().click();
    await d.locator(".d-detail-copy").waitFor();
    await shot(d, `P05_detail_open_${w}`);
  });
  await step(`P06_quiz_${w}`, async () => {
    for (let i = 0; i < 8; i++) {
      const t = await d.locator(".d-learning-actions .primary-button").textContent();
      await d.locator(".d-learning-actions .primary-button").click();
      if (/理解を確認する/.test(t)) break;
    }
    await d.locator(".d-answer-list button").first().waitFor();
    await shot(d, `P06_quiz_${w}`);
    await d.locator(".d-answer-list button").last().click(); // 「わからない」
    await d.getByRole("button", { name: "この回答で確定する" }).click();
    await d.getByRole("button", { name: /次の問題へ|振り返りへ/ }).waitFor();
    await shot(d, `P07_explanation_${w}`);
  });
  await step(`P08_history_${w}`, async () => { await d.goto(B + "/home?view=history"); await d.waitForLoadState("networkidle"); await shot(d, `P08_history_${w}`); });
  await step(`P09_health_${w}`, async () => { await d.goto(B + "/home?view=health"); await d.waitForLoadState("networkidle"); await shot(d, `P09_health_${w}`); });
  await step(`P10_notes_${w}`, async () => { await d.goto(B + "/home?view=notes"); await d.waitForLoadState("networkidle"); await shot(d, `P10_notes_${w}`); });
  await step(`P11_share_${w}`, async () => { await d.goto(B + "/home?view=share"); await d.waitForLoadState("networkidle"); await shot(d, `P11_share_${w}`); });
  await d.context().close();
}

// ---------- 医療者（佐藤 一郎。佐藤 花子と一時共有して閲覧のみ） ----------
let draftIds = [];
for (const [w, vp] of Object.entries(STAFF_VP)) {
  const s = await login("staff", "佐藤 一郎", vp);
  const p = await login("patient", "佐藤 花子", { width: 390, height: 844 });
  await step(`C01_start_${w}`, async () => { await s.getByRole("button", { name: "患者との接続を開始" }).waitFor(); await shot(s, `C01_start_${w}`, { fullPage: false }); });
  await step(`C02_summary_${w}`, async () => {
    const res = s.waitForResponse((r) => r.url().endsWith("/api/v1/connect") && r.request().method() === "POST");
    await s.getByRole("button", { name: "患者との接続を開始" }).click();
    const u = new URL((await (await res).json()).qrUrl);
    await s.getByRole("button", { name: "患者へ承認を依頼する" }).click();
    await p.goto(B + u.pathname + u.search);
    await p.locator(".d-consent input").check();
    await p.getByRole("button", { name: "この医療者に共有を許可する" }).click();
    await s.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 30000 });
    await s.locator("[data-summary-item], [data-ai-status]").first().waitFor({ timeout: 30000 });
    await shot(s, `C02_summary_${w}`);
  });
  await step(`C03_sources_${w}`, async () => {
    await s.locator("[data-summary-item]").first().click();
    await s.locator("[data-summary-sources]").waitFor();
    await shot(s, `C03_sources_${w}`);
  });
  await step(`C04_course_${w}`, async () => { await s.locator(".cd-sidebar").getByRole("button", { name: "在宅経過" }).click(); await s.waitForTimeout(800); await shot(s, `C04_course_${w}`); });
  await step(`C05_library_${w}`, async () => { await s.locator(".cd-sidebar").getByRole("button", { name: "教材ライブラリ" }).click(); await s.locator(".cd-library-grid article").first().waitFor(); await shot(s, `C05_library_${w}`); });
  await step(`C06_prescribe_${w}`, async () => {
    await s.locator(".cd-library-grid article").filter({ hasText: "化学療法中の副作用とセルフケア" }).getByRole("button", { name: "処方に追加" }).click();
    await s.getByRole("button", { name: /選択中 1件/ }).click();
    await s.getByRole("button", { name: "1件の情報処方を確定" }).waitFor();
    await shot(s, `C06_prescribe_${w}`);
    await s.keyboard.press("Escape");
  });
  await step(`C07_studio_${w}`, async () => { await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click(); await s.locator(".cd-studio-body").waitFor(); await shot(s, `C07_studio_${w}`); });
  if (DRAFTS) {
    if (!draftIds.length) {
      const list = await (await s.request.get(B + "/api/v1/studio/materials")).json();
      draftIds = list.materials.filter((m) => m.status === "draft" && m.versionNo === 1 && /v1\.1/.test(m.changeNote ?? "") ).map((m) => ({ id: m.versionId, title: m.title }));
      if (!draftIds.length) draftIds = list.materials.filter((m) => m.status === "draft").map((m) => ({ id: m.versionId, title: m.title }));
    }
    for (const [i, dr] of draftIds.entries()) {
      await step(`C08_draft${i + 1}_edit_${w}`, async () => {
        const url = new URL(s.url());
        url.searchParams.set("draft", dr.id);
        await s.goto(url.toString());
        await s.locator(".cd-sidebar").getByRole("button", { name: "教材スタジオ" }).click().catch(() => {});
        await s.locator("[data-studio-editor]").waitFor({ timeout: 30000 });
        await shot(s, `C08_draft${i + 1}_edit_${w}`);
        await s.locator(".cd-editor aside button.quiz").click();
        await shot(s, `C09_draft${i + 1}_quiz_${w}`);
        await s.locator(".cd-editor aside button").first().click();
        await s.locator("[data-studio-detail]").evaluate((el) => el.scrollIntoView({ block: "center" }));
        await s.waitForTimeout(400);
        await s.screenshot({ path: `${OUT}/C08b_draft${i + 1}_detail_field_${w}.png` });
        metrics[`C08b_draft${i + 1}_detail_field_${w}`] = await audit(s);
        await s.getByRole("button", { name: "次へ進む" }).click();
        await s.locator("[data-studio-preview]").waitFor();
        // 下書きプレビュー: 学習・回答 API への書き込みがないことを記録する
        const writes = [];
        const onReq = (r) => { if (r.method() !== "GET" && /\/api\/v1\/(learn|attempts)\b/.test(r.url())) writes.push(r.url()); };
        s.on("request", onReq);
        const pv = s.locator("[data-studio-preview]");
        await pshot(s, `C10_draft${i + 1}_preview_${w}`);
        await pv.locator(".d-disclosure").click();
        await pv.locator(".d-detail-copy").waitFor();
        await pshot(s, `C11_draft${i + 1}_preview_detail_${w}`);
        await pv.locator(".d-disclosure").click();
        // 全画面（1180 のみ全問。820・1440 は 1 画面目と詳説のみ）
        if (w === "1180") {
          for (let k = 2; k <= 5; k++) {
            await pv.getByRole("button", { name: "次へ" }).click();
            await pshot(s, `C12_draft${i + 1}_preview_slide${k}_${w}`);
          }
          await pv.getByRole("button", { name: "理解を確認する" }).click();
          const picks = ["correct", "wrong", "unknown"];
          for (let qn = 0; qn < 3; qn++) {
            await pv.locator(".d-answer-list button").first().waitFor();
            await pshot(s, `C13_draft${i + 1}_preview_q${qn + 1}_${w}`);
            const stem = await pv.locator(".d-quiz h1").textContent();
            const dq = (await (await s.request.get(`${B}/api/v1/studio/materials/${dr.id}`)).json()).questions.find((x) => x.stem === stem);
            const btns = pv.locator(".d-answer-list button");
            if (picks[qn] === "unknown") await btns.last().click();
            else await btns.nth(picks[qn] === "correct" ? dq.correctIndex : (dq.correctIndex + 1) % 3).click();
            await pv.getByRole("button", { name: "この回答で確定する" }).click();
            await pv.locator(".d-explanation-copy").waitFor();
            await pshot(s, `C14_draft${i + 1}_preview_a${qn + 1}_${picks[qn]}_${w}`);
            await pv.getByRole("button", { name: /次の問題へ|振り返りへ/ }).click();
          }
          await pv.getByRole("heading", { name: "プレビューを最後まで確認しました" }).waitFor();
          await pshot(s, `C15_draft${i + 1}_preview_done_${w}`);
        }
        s.off("request", onReq);
        metrics[`C10_draft${i + 1}_preview_${w}`].previewWrites = writes;
        if (writes.length) errors[`C10_draft${i + 1}_preview_${w}`] = `プレビュー中の書き込み: ${writes.join(", ")}`;
      });
    }
  }
  await step(`C19_end_${w}`, async () => {
    await s.locator(".cd-app-header").getByRole("button", { name: "共有終了" }).click();
    await s.getByText("患者一覧はありません").waitFor();
  });
  await s.context().close();
  await p.context().close();
}
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
console.log("screens:", Object.keys(metrics).length, "errors:", Object.keys(errors).length);
await b.close();
