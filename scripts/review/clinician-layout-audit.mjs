/**
 * 医療者画面のレイアウト監査（2026-11）。審査用デモ（.judge-demo/dist を配信した URL）を開き、架空患者と接続した状態で
 * 診察サマリー・在宅経過・教材ライブラリ・教材スタジオを 1180×820（PC）と 820×1180（タブレット縦）で点検する。
 * 調べる内容は患者側の監査と同じ: はみ出し（横スクロール領域の中を除く）、実際にタップできる操作要素どうしの重なり、
 * 高さ 32px 未満のボタン、1 行表示の見切れ、囲いの入れ子の最大の深さ、説明文（24 文字以上）の文字数。
 * 使い方: (cd .judge-demo/dist && python3 -m http.server 8787) を起動してから
 *   node scripts/review/clinician-layout-audit.mjs http://localhost:8787
 * 結果は標準出力（JSON 行）と docs/review/ux_redesign_20261108/clinician_layout_audit.md に書く。架空データのみ。
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8787";
const SIZES = [
  { name: "1180x820", width: 1180, height: 820 },
  { name: "820x1180", width: 820, height: 1180 },
];
const VIEWS = ["診察", "在宅経過", "教材ライブラリ", "教材スタジオ"];

const AUDIT = `(() => {
  const root = document.querySelector('.cd-device') || document.body;
  const main = document.querySelector('.cd-main') || root;
  const dev = root.getBoundingClientRect();
  const out = { hscroll: main.scrollWidth > main.clientWidth + 1, overflow: [], overlaps: [], small: [], clipped: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).toString().trim().replace(/\\\\s+/g, ' ').slice(0, 40);
  const inHScroll = (e) => { for (let p = e.parentElement; p && p !== root; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const hit = (e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return !!t && (t === e || e.contains(t)); };
  const overlay = (e) => !!e.closest('.cd-sidebar, .cd-app-header, .j-topbar, .cd-toast, .cd-wizard-sticky, .cd-select-tray');
  const all = [...root.querySelectorAll('*')].filter(vis);
  for (const e of all) {
    if (inHScroll(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > dev.right + 1 || r.left < dev.left - 1) out.overflow.push({ el: label(e), left: Math.round(r.left), right: Math.round(r.right) });
  }
  const inter = [...root.querySelectorAll('button, input, select, textarea, a, summary')].filter(vis).filter(hit).filter((e) => !overlay(e));
  const box = (e) => {
    let r = e.getBoundingClientRect(); let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let p = e.parentElement; p && p !== root; p = p.parentElement) {
      const cs = getComputedStyle(p); if (!/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) continue;
      const pr = p.getBoundingClientRect(); x1 = Math.max(x1, pr.left); y1 = Math.max(y1, pr.top); x2 = Math.min(x2, pr.right); y2 = Math.min(y2, pr.bottom);
    }
    return { left: x1, top: y1, right: x2, bottom: y2, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
  };
  for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) {
    const a = inter[i], b = inter[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = box(a), rb = box(b);
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x > 2 && y > 2) out.overlaps.push({ a: label(a), b: label(b), x: Math.round(x), y: Math.round(y) });
  }
  for (const e of inter) {
    if (e.tagName !== 'BUTTON') continue;
    const r = e.getBoundingClientRect();
    if (r.height < 32 && r.height > 0 && r.width > 0) out.small.push({ el: label(e), h: Math.round(r.height) });
  }
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (cs.whiteSpace === 'nowrap' && cs.overflow !== 'hidden' && e.scrollWidth > e.clientWidth + 2 && e.children.length === 0 && !inHScroll(e)) out.clipped.push({ el: label(e), sw: e.scrollWidth, cw: e.clientWidth });
  }
  const isBox = (e) => {
    if (/^(BUTTON|INPUT|SELECT|TEXTAREA|SVG|IMG|A|SUMMARY|TABLE|TR|TD|TH)$/.test(e.tagName)) return false;
    const rr = e.getBoundingClientRect(); if (rr.width < 14 && rr.height < 14) return false; // 小さな点・印は囲いとして数えない
    const cs = getComputedStyle(e);
    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth);
    const bg = cs.backgroundColor; const pbg = e.parentElement ? getComputedStyle(e.parentElement).backgroundColor : '';
    const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== pbg;
    return bw > 0 || hasBg;
  };
  let maxDepth = 0; let deepest = '';
  for (const e of [...main.querySelectorAll('*')].filter(vis)) {
    let d = 0; let path = [];
    for (let p = e; p && p !== main; p = p.parentElement) if (isBox(p)) { d++; path.push(p.className.toString().split(' ')[0] || p.tagName); }
    if (d > maxDepth) { maxDepth = d; deepest = path.reverse().join(' > '); }
  }
  out.boxDepth = maxDepth; out.deepest = deepest;
  out.helpChars = [...main.querySelectorAll('p, small, li')].filter(vis).filter((e) => !e.closest('button, summary, table')).map((e) => e.textContent.trim()).filter((t) => t.length >= 24).reduce((n, t) => n + t.length, 0);
  out.overflow = out.overflow.slice(0, 8); out.overlaps = out.overlaps.slice(0, 8); out.small = out.small.slice(0, 8); out.clipped = out.clipped.slice(0, 8);
  return out;
})()`;

/** 架空患者がコードを発行 → 医療者の入口 → デモの近道（患者の承認まで自動）で接続した状態にする */
async function connect(page) {
  await page.goto(`${BASE}/#patient`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(`${BASE}/?fresh=${Date.now()}#patient`);
  await page.getByRole("button", { name: "共有する" }).click();
  await page.getByRole("button", { name: "QRコードと6桁コードを表示する" }).click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/?fresh=${Date.now()}#doctor`);
  // 2026-11: 最初は共有前。デモ用の開始ボタンで架空患者の共有を始める
  { const start = page.locator("[data-demo-start]"); if (await start.count()) await start.first().click(); }
  await page.getByRole("button", { name: /患者の承認まで自動で進める/ }).click();
  await page.getByRole("heading", { name: "診察サマリー" }).waitFor({ timeout: 15_000 });
}

const browser = await chromium.launch();
const lines = [];
const md = [`# 医療者画面のレイアウト監査（${new Date().toISOString().slice(0, 10)}）`, "", `対象: ${BASE}（審査用デモ・架空患者と接続した状態）。${SIZES.map((s) => s.name).join("・")} で、はみ出し（横スクロール領域の中を除く）・実際にタップできる操作要素どうしの重なり・高さ 32px 未満のボタン・1 行表示の見切れを数え、囲いの入れ子の最大の深さと説明文（24 文字以上）の文字数を記録した。サイドバー・ヘッダーは重なりの相手から除く。`, ""];
let total = 0;
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const page = await ctx.newPage();
  await connect(page);
  md.push(`## ${size.name}`, "", "| 画面 | 横スクロール | はみ出し | 重なり | 小さいボタン | 見切れ | 囲いの入れ子（最大） | 説明文の文字数 |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const name of VIEWS) {
    await page.locator(".cd-sidebar").getByRole("button", { name }).click();
    await page.waitForTimeout(800);
    const checks = [["初期表示", async () => {}]];
    if (name === "診察") checks.push(["AI 外来間サマリーを開く", async () => { const t = page.locator("[data-ai-fold] .cd-ai-fold-toggle"); if ((await t.getAttribute("aria-expanded")) !== "true") await t.click(); }]);
    if (name === "在宅経過") checks.push(["症状のグラフ", async () => { const b = page.getByRole("button", { name: /グラフ/ }).first(); if (await b.isVisible().catch(() => false)) await b.click(); }]);
    for (const [state, act] of checks) {
      await act();
      await page.waitForTimeout(500);
      const r = await page.evaluate(AUDIT);
      const n = (r.hscroll ? 1 : 0) + r.overflow.length + r.overlaps.length + r.small.length + r.clipped.length;
      total += n;
      lines.push(JSON.stringify({ size: size.name, view: name, state, ...r }));
      md.push(`| ${name}（${state}） | ${r.hscroll ? "あり" : "なし"} | ${r.overflow.length} | ${r.overlaps.length} | ${r.small.length} | ${r.clipped.length} | ${r.boxDepth}（${r.deepest}） | ${r.helpChars} |`);
    }
  }
  md.push("");
  await ctx.close();
}
await browser.close();
md.push(`問題の合計: ${total}`);
for (const l of lines) console.log(l);
writeFileSync("docs/review/ux_redesign_20261108/clinician_layout_audit.md", md.join("\n") + "\n");
console.log(`TOTAL ${total}`);
