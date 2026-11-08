/**
 * 患者画面のレイアウト監査（2026-11）。スマートフォンの実機サイズで各画面を開き、機械的に次を調べる。
 * - 横方向のはみ出し（.d-main の scrollWidth、端末枠の右端を越える要素）
 * - 操作要素どうしの重なり（ボタン・入力欄・リンクの矩形が交差）
 * - 小さすぎるタップ対象（高さ 32px 未満の可視ボタン）
 * - 文字の見切れ（1 行表示の要素で scrollWidth > clientWidth）
 * 使い方: 開発サーバー（例: E2E_PORT=3400 の scripts/e2e-server.mjs）を起動してから
 *   node scripts/review/patient-layout-audit.mjs http://localhost:3400
 * 結果は標準出力（JSON 行）と docs/review/ux_redesign_20261108/layout_audit.md に書く。架空データのみ。
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3400";
const SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];
const VIEWS = [
  ["ホーム", "/home"],
  ["教材を探す", "/home?view=library"],
  ["領域", "/home?view=category&area=%E6%A4%9C%E6%9F%BB%E3%83%BB%E8%A8%BA%E6%96%AD"],
  ["学習記録", "/home?view=history"],
  ["体調記録", "/home?view=health"],
  ["聞きたいこと", "/home?view=notes"],
  ["共有", "/home?view=share"],
  ["仕事とお金のこと", "/home?view=money"],
  ["医療費シミュレーター", "/home?view=simulator"],
];

const AUDIT = `(() => {
  const main = document.querySelector('.d-main');
  const device = document.querySelector('.d-device');
  const dev = device.getBoundingClientRect();
  const out = { hscroll: main.scrollWidth > main.clientWidth + 1, overflow: [], overlaps: [], small: [], clipped: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).toString().trim().replace(/\\s+/g, ' ').slice(0, 40);
  // 横スクロールできる箱（表・チップの列）の中は、画面の外にあっても正常
  const inHScroll = (e) => { for (let p = e.parentElement; p && p !== device; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  // 実際にタップできる（中心点で最前面にある）要素だけを重なり・大きさの対象にする（下部ナビの下や、固定バーの下に隠れた要素は除く）
  const hit = (e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)); return !!t && (t === e || e.contains(t)); };
  const all = [...document.querySelectorAll('.d-device *')].filter(vis);
  for (const e of all) {
    if (inHScroll(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > dev.right + 1 || r.left < dev.left - 1) out.overflow.push({ el: label(e), left: Math.round(r.left), right: Math.round(r.right) });
  }
  // 下部ナビと保存バーは内容の上に重なる前提の部品なので、重なりの相手から除く。スクロールする箱の中の要素は、箱で切り取った矩形で比べる
  const overlay = (e) => !!e.closest('.d-nav, .d-save-bar');
  const inter = [...document.querySelectorAll('.d-device button, .d-device input, .d-device select, .d-device textarea, .d-device a, .d-device summary')].filter(vis).filter(hit).filter((e) => !overlay(e));
  const box = (e) => {
    let r = e.getBoundingClientRect(); let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let p = e.parentElement; p && p !== device; p = p.parentElement) {
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
    const r = box(e);
    if (r.height < 32 && r.height > 0 && r.width > 0 && e.getBoundingClientRect().height < 32) out.small.push({ el: label(e), h: Math.round(r.height) });
  }
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (cs.whiteSpace === 'nowrap' && cs.overflow !== 'hidden' && e.scrollWidth > e.clientWidth + 2 && e.children.length === 0 && !inHScroll(e)) out.clipped.push({ el: label(e), sw: e.scrollWidth, cw: e.clientWidth });
  }
  // 認知負荷の目安: 囲い（枠線か背景色のある箱。ボタン・入力欄・画像は除く）の入れ子の最大の深さと、説明文（p/small/li で 24 文字以上）の文字数
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

const browser = await chromium.launch();
const lines = [];
const md = [`# 患者画面のレイアウト監査（${new Date().toISOString().slice(0, 10)}）`, "", `対象: ${BASE}（架空患者 佐藤 花子）。各画面を ${SIZES.map((s) => s.name).join("・")} で開き、はみ出し（横スクロール領域の中を除く）・実際にタップできる操作要素どうしの重なり・高さ 32px 未満のボタン・1 行表示の見切れを機械的に数えた。下部ナビや固定バーの下に隠れた要素は対象外。あわせて、囲い（枠線か背景色のある箱）の入れ子の最大の深さと、説明文（24 文字以上の p/small/li）の文字数を認知負荷の目安として記録する。`, ""];
let total = 0;
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /佐藤 花子/ }).first().click();
  await page.waitForURL(/\/home/);
  md.push(`## ${size.name}`, "", "| 画面 | 横スクロール | はみ出し | 重なり | 小さいボタン | 見切れ | 囲いの入れ子（最大） | 説明文の文字数 |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [name, path] of VIEWS) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    const checks = [["初期表示", async () => {}]];
    if (name === "体調記録") {
      checks.push(["履歴（表）", async () => page.getByRole("button", { name: "履歴" }).click()]);
      checks.push(["履歴（グラフ）", async () => page.locator("[data-history-mode='chart']").click()]);
      checks.push(["症状の追加", async () => { await page.getByRole("button", { name: "今日の記録" }).click(); await page.locator("[data-manage-symptoms]").click(); }]);
    }
    if (name === "医療費シミュレーター") checks.push(["結果", async () => page.locator("[data-sim-demo]").click()]);
    if (name === "ホーム") checks.push(["日付の変更", async () => page.locator("[data-visit-edit]").click()]);
    for (const [state, act] of checks) {
      await act();
      await page.waitForTimeout(400);
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
writeFileSync("docs/review/ux_redesign_20261108/layout_audit.md", md.join("\n") + "\n");
console.log(`TOTAL ${total}`);
