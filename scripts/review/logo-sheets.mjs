#!/usr/bin/env node
/**
 * ロゴ A の可読性確認シート（16/24/32/48/80/128px、2 倍密度・白とポーセリン地。最下段は 16・24px 用の簡略版 SVG）と、
 * ファビコンの変更前後（各サイズ、実寸と 4 倍拡大）。
 *   node scripts/review/logo-sheets.mjs <変更前の favicon.ico> <出力フォルダ>
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const [beforeIco, out] = process.argv.slice(2);
const MARK = "public/brand/shiori_mark.png";
const label = (text, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28"><text x="0" y="20" font-family="sans-serif" font-size="16" fill="#243a3d">${text}</text></svg>`);

// 1. マークの大きさ別
const hs = [16, 24, 32, 48, 80, 128];
const comps = [];
let x = 24;
for (const [bg, top] of [["#ffffff", 0], ["#e8f2f3", 330]]) {
  comps.push({ input: { create: { width: 1000, height: 330, channels: 4, background: bg } }, left: 0, top });
  x = 24;
  for (const h of hs) {
    const m = await sharp(MARK).resize({ height: h * 2, kernel: "lanczos3" }).png().toBuffer({ resolveWithObject: true });
    comps.push({ input: m.data, left: x, top: top + 40 + (256 - h * 2) });
    comps.push({ input: label(`${h}px`, 80), left: x, top: top + 300 });
    x += Math.max(m.info.width, 60) + 60;
  }
}
// 小サイズ用（16・24px で使う簡略版 SVG）
comps.push({ input: label("小サイズ用 SVG（16・24px で使用）", 400), left: 24, top: 672 });
x = 24;
for (const h of [16, 24]) {
  const m = await sharp("public/brand/shiori_mark_small.svg", { density: 600 }).resize({ height: h * 2, kernel: "lanczos3" }).png().toBuffer({ resolveWithObject: true });
  comps.push({ input: m.data, left: x, top: 700 + (64 - h * 2) });
  const z = await sharp(m.data).resize({ height: h * 8, kernel: "nearest" }).png().toBuffer({ resolveWithObject: true });
  comps.push({ input: z.data, left: x + 60, top: 700 + (200 - h * 8) + 20 });
  comps.push({ input: label(`${h}px（2倍密度・拡大）`, 220), left: x, top: 930 });
  x += z.info.width + 200;
}
await sharp({ create: { width: 1000, height: 970, channels: 4, background: "#ffffff" } }).composite(comps).jpeg({ quality: 90 }).toFile(`${out}/logo_sizes.jpg`);

// 2. ファビコン（ICO の PNG/BMP をそのまま読む代わりに、ブラウザと同じく各サイズを描画）
const icoImages = (buf) => {
  const n = buf.readUInt16LE(4);
  const list = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    const size = buf.readUInt8(e) || 256;
    const len = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    list.push({ size, data: buf.subarray(off, off + len) });
  }
  return list;
};
const decode = async ({ size, data }) => {
  if (data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return sharp(data).png().toBuffer();
  // BMP（DIB）: 32bit BGRA・下から上
  const hdr = data.readUInt32LE(0);
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x2 = 0; x2 < size; x2++) {
      const s = hdr + ((size - 1 - y) * size + x2) * 4;
      const d = (y * size + x2) * 4;
      px[d] = data[s + 2]; px[d + 1] = data[s + 1]; px[d + 2] = data[s]; px[d + 3] = data[s + 3];
    }
  return sharp(px, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
};
const rows = [["変更前", icoImages(readFileSync(beforeIco))], ["変更後", icoImages(readFileSync("src/app/favicon.ico"))]];
const fc = [];
let top = 10;
for (const [name, imgs] of rows) {
  fc.push({ input: label(name, 100), left: 16, top: top + 70 });
  let left = 120;
  for (const img of imgs.sort((a, b) => a.size - b.size)) {
    const png = await decode(img);
    fc.push({ input: png, left, top: top + 80 - img.size / 2 });
    fc.push({ input: await sharp(png).resize(img.size * 4, img.size * 4, { kernel: "nearest" }).png().toBuffer(), left: left + 60, top: top + 80 - img.size * 2 });
    fc.push({ input: label(`${img.size}px（実寸・4倍）`, 200), left, top: top + 190 });
    left += img.size * 4 + 160;
  }
  top += 240;
}
await sharp({ create: { width: 1400, height: top + 10, channels: 4, background: "#ffffff" } }).composite(fc).png().toFile(`${out}/favicon_before_after.png`);
console.log("logo_sizes.jpg, favicon_before_after.png");
