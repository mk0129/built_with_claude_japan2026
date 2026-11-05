#!/usr/bin/env node
/**
 * capture-ui.mjs の変更前（before）と変更後（after）を画面ごとに比べ、差分画像・差分の数値・比較シート（HTML と JPEG）を作る。
 *   DIR: docs/review/materials_v1_1（before/ after/ を含む）
 * 差分: 各画素の RGB の差がしきい値（既定 24）を超えた画素を赤で示す。差分のある範囲（外接矩形）も記録する。
 * 時刻・残り時間など、撮影のたびに変わる表示による差分は、画面ごとの範囲で人が確認して分類する。
 */
import sharp from "sharp";
import { PNG } from "pngjs";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.DIR ?? "docs/review/materials_v1_1";
const TH = Number(process.env.THRESHOLD ?? 24);
const before = join(DIR, "before"), after = join(DIR, "after"), diffDir = join(DIR, "diff"), sheetDir = join(DIR, "sheets");
mkdirSync(diffDir, { recursive: true });
mkdirSync(sheetDir, { recursive: true });
const mb = JSON.parse(readFileSync(join(before, "metrics.json"), "utf8"));
const ma = JSON.parse(readFileSync(join(after, "metrics.json"), "utf8"));

const names = readdirSync(after).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
const rows = [];
for (const n of names) {
  const a = PNG.sync.read(readFileSync(join(after, `${n}.png`)));
  const row = { name: n, onlyAfter: !existsSync(join(before, `${n}.png`)), size: [a.width, a.height], metricsAfter: ma[n] };
  if (!row.onlyAfter) {
    const b = PNG.sync.read(readFileSync(join(before, `${n}.png`)));
    row.sizeBefore = [b.width, b.height];
    const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
    const out = new PNG({ width: w, height: h });
    let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const inA = x < a.width && y < a.height, inB = x < b.width && y < b.height;
        const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4;
        let differs = inA !== inB;
        if (inA && inB) differs = Math.abs(a.data[ia] - b.data[ib]) > TH || Math.abs(a.data[ia + 1] - b.data[ib + 1]) > TH || Math.abs(a.data[ia + 2] - b.data[ib + 2]) > TH;
        if (differs) {
          count++;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          out.data.set([230, 40, 40, 255], o);
        } else {
          const g = inA ? Math.round((a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3) : 255;
          const v = Math.round(255 - (255 - g) * 0.25);
          out.data.set([v, v, v, 255], o);
        }
      }
    writeFileSync(join(diffDir, `${n}.png`), PNG.sync.write(out));
    row.diffPixels = count;
    row.diffRatio = +(count / (w * h)).toFixed(5);
    // 画面は deviceScaleFactor 2 で撮影。CSS px に直して記録する
    row.diffBoxCss = count ? [x0, y0, x1, y1].map((v) => Math.round(v / 2)) : null;
    row.metricsBefore = mb[n];
  }
  rows.push(row);
}
writeFileSync(join(DIR, "diff.json"), JSON.stringify(rows, null, 2));

// ---------- 比較シート（HTML）----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const group = (n) => (n.startsWith("P") ? `患者 ${n.split("_").pop()}px` : `医療者 ${n.split("_").pop()}px`);
const groups = [...new Set(rows.map((r) => group(r.name)))];
const imgs = (r) => (r.metricsAfter?.images ?? []).map((i) => `${i.file} ${i.box.join("×")}（${i.fit}）`).join("<br>");
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>教材 v1.1 UI 比較</title>
<style>
:root{--bg:#f6f8f8;--fg:#1d2b2f;--muted:#5d6f74;--line:#d6e0e2;--accent:#315e68;--warn:#b5462f}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 "Hiragino Sans","Noto Sans JP",sans-serif}
header{padding:20px 16px;border-bottom:1px solid var(--line);background:#fff}
h1{margin:0 0 4px;font-size:20px}h2{margin:28px 16px 8px;font-size:17px;color:var(--accent)}
nav a{margin-right:12px;color:var(--accent)}
.row{margin:0 16px 18px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:10px}
.row h3{margin:0 0 6px;font-size:14px}.meta{color:var(--muted);font-size:12px;margin-bottom:8px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.grid figure{margin:0}.grid figcaption{font-size:12px;color:var(--muted)}
.grid img{width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}
.tag{display:inline-block;padding:0 6px;border-radius:4px;font-size:12px;background:#e7f0f1;color:var(--accent);margin-right:6px}
.tag.diff{background:#fbe9e5;color:var(--warn)}
@media (max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body>
<header><h1>教材 v1.1・線画サムネイル UI 比較（変更前｜変更後｜差分）</h1>
<div class="meta">同じ架空データ（新しい一時 DB・基準日 2026-11-04）で撮影。差分は RGB しきい値 ${TH}。赤が変化した画素。</div>
<nav>${groups.map((g, i) => `<a href="#g${i}">${esc(g)}</a>`).join("")}</nav></header>
${groups
  .map(
    (g, gi) => `<h2 id="g${gi}">${esc(g)}</h2>` +
      rows
        .filter((r) => group(r.name) === g)
        .map((r) => {
          const tags = r.onlyAfter ? `<span class="tag">変更後のみ（下書きの確認画面）</span>` : r.diffPixels ? `<span class="tag diff">差分 ${r.diffPixels.toLocaleString()} 画素（${(r.diffRatio * 100).toFixed(2)}%）範囲 ${r.diffBoxCss.join(",")}</span>` : `<span class="tag">差分なし</span>`;
          const issues = [r.metricsAfter?.hScroll ? "横スクロールあり" : "", r.metricsAfter?.clipped?.length ? `はみ出し・切れ ${r.metricsAfter.clipped.length} 件` : ""].filter(Boolean).join(" / ");
          return `<div class="row"><h3>${esc(r.name)}</h3><div class="meta">${tags}${issues ? `<span class="tag diff">${esc(issues)}</span>` : ""}${imgs(r) ? `<br>サムネイル: ${imgs(r)}` : ""}</div>
<div class="grid">${r.onlyAfter ? `<figure><figcaption>変更前</figcaption><div class="meta">（なし）</div></figure>` : `<figure><figcaption>変更前</figcaption><img loading="lazy" src="before/${r.name}.png" alt=""></figure>`}
<figure><figcaption>変更後</figcaption><img loading="lazy" src="after/${r.name}.png" alt=""></figure>
${r.onlyAfter ? `<figure><figcaption>差分</figcaption><div class="meta">—</div></figure>` : `<figure><figcaption>差分</figcaption><img loading="lazy" src="diff/${r.name}.png" alt=""></figure>`}</div></div>`;
        })
        .join(""),
  )
  .join("")}
</body></html>`;
writeFileSync(join(DIR, "index.html"), html);

// ---------- 変化のあった画面だけの JPEG シート（変更前｜変更後、先頭 1 画面分）----------
const changed = rows.filter((r) => !r.onlyAfter && r.diffPixels);
for (const r of changed) {
  const vpH = r.name.startsWith("P") ? (r.name.endsWith("_768") ? 2048 : 1688) : r.name.endsWith("_1440") ? 1800 : 1600;
  const crop = async (f) => {
    const m = await sharp(f).metadata();
    return sharp(f).extract({ left: 0, top: 0, width: m.width, height: Math.min(m.height, Math.max(vpH, (r.diffBoxCss?.[3] ?? 0) * 2 + 40)) }).resize({ width: 600 }).toBuffer();
  };
  const [b, a, d] = await Promise.all([crop(join(before, `${r.name}.png`)), crop(join(after, `${r.name}.png`)), crop(join(diffDir, `${r.name}.png`))]);
  const hs = await Promise.all([b, a, d].map(async (x) => (await sharp(x).metadata()).height));
  const H = Math.max(...hs);
  await sharp({ create: { width: 1840, height: H + 40, channels: 3, background: "#ffffff" } })
    .composite([
      { input: Buffer.from(`<svg width="1840" height="36"><text x="10" y="24" font-size="20" font-family="sans-serif">${r.name}: 変更前 ｜ 変更後 ｜ 差分（赤）</text></svg>`), left: 0, top: 0 },
      { input: b, left: 0, top: 40 },
      { input: a, left: 620, top: 40 },
      { input: d, left: 1240, top: 40 },
    ])
    .jpeg({ quality: 80 })
    .toFile(join(sheetDir, `${r.name}.jpg`));
}
const summary = {
  screens: rows.length,
  compared: rows.filter((r) => !r.onlyAfter).length,
  unchanged: rows.filter((r) => !r.onlyAfter && !r.diffPixels).map((r) => r.name).length,
  changed: changed.map((r) => ({ name: r.name, pixels: r.diffPixels, ratio: r.diffRatio, boxCss: r.diffBoxCss })),
  onlyAfter: rows.filter((r) => r.onlyAfter).length,
};
writeFileSync(join(DIR, "diff_summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1));
