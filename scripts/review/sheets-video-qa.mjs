/**
 * 撮影品質の最終確認: 変更前後の比較シート（左: 変更前／右: 変更後）。
 * 変更前: docs/review/video_rehearsal/before（リハーサル 1 回目・p0_fixes・final_ui_review から複製した画像）
 * 変更後: docs/review/video_rehearsal/shots（scripts/review/rehearsal-video.mjs）
 * 出力: docs/review/video_rehearsal/sheets/*.jpg
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const ROOT = "docs/review/video_rehearsal";
mkdirSync(`${ROOT}/sheets`, { recursive: true });
const PAIRS = [
  { id: "V1_remaining_390", title: "共有の残り時間（患者 390px）", before: "before/11_sharing_390.png", after: "shots/11_sharing_390.png", note: "変更前は承認直後に「61分」（医療者は「60分」）。変更後は患者・医療者とも同じ計算で「60分」" },
  { id: "V2_severity_legend_1180", title: "Claude外来間サマリーの「1/4」の説明（1180px）", before: "before/C04_summary_1180_prev.png", after: "shots/12_summary_1180.png", note: "要約の文は変えずに、「1/4」が自覚症状の程度（0〜4・CTCAE Grade ではない）であることを要点の上に表示。再生の表示も読める大きさに" },
  { id: "V3_sources_1180", title: "元記録（根拠の記録）の文字（1180px）", before: "before/13_sources_1180.png", after: "shots/13_sources_1180.png", note: "根拠の記録 9〜10px → 12〜13px。要点の見出し・根拠の件数も少し大きく" },
  { id: "V4_course_1180", title: "在宅経過表の文字（1180px）", before: "before/13b_course_1180.png", after: "shots/13b_course_1180.png", note: "数値・日付・項目名を読める大きさに。14 日分の表は 1 画面に収まるまま" },
  { id: "V5_datetime_390", title: "体調記録の測定日時の表記", before: "shots/08_health_datetime_default_browser.png", after: "shots/08_health_datetime_ja_browser.png", note: "コードの変更なし。左は英語 UI のブラウザ（レビュー用のヘッドレス）、右は日本語 UI のブラウザ（撮影に使う設定）で「2026/11/06 09:57」", labels: ["英語のブラウザ", "日本語のブラウザ"] },
];
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const url = (f) => `data:image/png;base64,${readFileSync(`${ROOT}/${f}`).toString("base64")}`;
for (const p of PAIRS) {
  if (!existsSync(`${ROOT}/${p.before}`) || !existsSync(`${ROOT}/${p.after}`)) {
    console.warn("skip", p.id);
    continue;
  }
  const [lb, la] = p.labels ?? ["変更前", "変更後"];
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;font-family:'Hiragino Sans','Noto Sans JP',sans-serif;background:#f4f6f6;color:#1f3237}
    h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;font-size:14px;color:#4a5b60}
    .row{display:flex;gap:20px;align-items:flex-start}figure{margin:0;flex:1}figcaption{font-weight:700;margin-bottom:6px}
    img{width:100%;border:1px solid #cfd8da;background:#fff}</style>
    <h1>${p.title}</h1><p>${p.note}</p><div class="row" style="${p.id.endsWith("1180") ? "flex-direction:column" : ""}"><figure style="${p.id.endsWith("1180") ? "width:100%" : ""}"><figcaption>${lb}</figcaption><img src="${url(p.before)}"></figure><figure style="${p.id.endsWith("1180") ? "width:100%" : ""}"><figcaption>${la}</figcaption><img src="${url(p.after)}"></figure></div>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${ROOT}/sheets/${p.id}.jpg`, fullPage: true, type: "jpeg", quality: 80 });
}
await b.close();
console.log("sheets done");
